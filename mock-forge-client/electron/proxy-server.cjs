#!/usr/bin/env node
'use strict';

const http = require('http');
const { randomUUID } = require('crypto');
const {
  rewriteProxyRequest,
  shouldForwardRequestBody,
} = require('./proxyRequestUtils.cjs');
const {
  applyBodyOverride,
  applyHeadersOverride,
  findRequestMockRoute,
  getMockedRequestPathsFromOverride,
  readRequestBody,
  shouldProxyApplyBodyOverride,
  shouldProxyApplyRequestOverride,
} = require('./proxyOverrideUtils.cjs');
const { forwardDirectUpstream, headersToRecord, TRAFFIC_BODY_CAPTURE_LIMIT } = require('./proxyUpstream.cjs');
const { normalizeCapturedBody } = require('./proxyBodyUtils.cjs');
const { attachClientDisconnectMonitor } = require('./proxyClientMonitor.cjs');
const { matchesRoutePath } = require('./routePathMatch.cjs');

const MOCKFORGE_CLIENT_IP_HEADER = 'x-mockforge-client-ip';
const MOCKFORGE_CLIENT_UA_HEADER = 'x-mockforge-client-ua';
const MOCKFORGE_RESPONSE_MARKER_HEADER = 'x-mockforge-mock-response';
const MOCKFORGE_REQUEST_MARKER_HEADER = 'x-mockforge-mock-request';
const MOCKFORGE_REQUEST_BODY_PATHS_HEADER = 'x-mockforge-mock-request-body-paths';
const MOCKFORGE_REQUEST_HEADER_FIELDS_HEADER = 'x-mockforge-mock-request-header-fields';
const MOCKFORGE_FORCED_EXECUTION_HEADER = 'x-mockforge-forced-execution';
const MOCKFORGE_REQUEST_ID_HEADER = 'x-mockforge-request-id';
const SHUTDOWN_GRACE_MS = 5000;
const MOCKSERVER_RETRY_ATTEMPTS = 3;
const MOCKSERVER_RETRY_DELAY_MS = 50;
let adbReverseActive = true;

function applyClientMetadataHeaders(headers, clientIp, userAgent) {
  headers[MOCKFORGE_CLIENT_IP_HEADER] = clientIp;
  if (userAgent) {
    headers[MOCKFORGE_CLIENT_UA_HEADER] = userAgent;
  }
}

const publicPort = Number(process.argv[2]);
const targetPort = Number(process.argv[3]);
const bindHost = process.argv[4] || '0.0.0.0';
const bindHosts = [bindHost];

let upstreamConfig = null;
let interceptRoutes = [];
let requestMockRoutes = [];
let shuttingDown = false;
let activeConnections = 0;

function applyUpstreamConfig(config) {
  upstreamConfig = config || null;
}

function applyInterceptRoutes(routes) {
  interceptRoutes = Array.isArray(routes) ? routes : [];
}

function applyRequestMockRoutes(routes) {
  requestMockRoutes = Array.isArray(routes) ? routes : [];
}

function shouldInterceptForMock(method, url, routes) {
  const requestPath = (url || '/').split('?')[0] || '/';
  const normalizedMethod = (method || 'GET').toUpperCase();

  return routes.some((route) => {
    const routeMethod = (route.method || 'GET').toUpperCase();
    if (routeMethod !== normalizedMethod) return false;

    return matchesRoutePath(route.path, requestPath);
  });
}

try {
  const rawConfig = process.argv[5];
  if (rawConfig) {
    applyUpstreamConfig(JSON.parse(rawConfig));
  }
} catch {
  // ignore invalid startup config
}

let requestCount = 0;
const servers = [];

function sendTrafficRecord(record) {
  if (process.send) {
    process.send({ type: 'traffic', record });
  }
}

function sendInstabilityLog(entry) {
  if (process.send) {
    process.send({
      type: 'instability-log',
      entry: {
        timestamp: new Date().toISOString(),
        ...entry,
      },
    });
  }
  console.warn(`[MockForge proxy][instability] ${JSON.stringify(entry)}`);
}

function sendFailedTrafficRecord(meta, reason, instabilityKind = 'connection_failed') {
  sendInstabilityLog({
    category: 'request',
    kind: instabilityKind,
    message: reason,
    correlationId: meta.requestId,
    details: {
      method: meta.method,
      path: meta.path,
      clientIp: meta.clientIp,
      userAgent: meta.userAgent,
    },
  });
  sendTrafficRecord({
    id: meta.requestId,
    timestamp: meta.timestamp || new Date().toISOString(),
    method: meta.method,
    path: meta.path,
    headers: meta.requestHeaders || {},
    body: meta.requestBody || '',
    clientIp: meta.clientIp,
    userAgent: meta.userAgent,
    durationMs: Date.now() - (meta.startedAt || Date.now()),
    recordType: 'request',
    connectionFailed: true,
    instabilityKind,
    instabilityMessage: reason,
  });
}

function getClientInstabilityFields(monitor) {
  const snapshot = monitor?.getDisconnectSnapshot?.();
  if (!snapshot?.clientDisconnected) {
    return {};
  }

  const message = snapshot.disconnectReason
    ? `Client disconnected: ${snapshot.disconnectReason}`
    : 'Client disconnected during response';

  return {
    clientInstability: true,
    instabilityKind: 'client_disconnect',
    instabilityMessage: snapshot.bytesNotDelivered > 0
      ? `${message} (${snapshot.bytesNotDelivered} bytes not delivered)`
      : message,
  };
}

function headerValue(headers, name) {
  if (!headers || !name) return undefined;
  const entry = Object.entries(headers).find(([key]) => key.toLowerCase() === name.toLowerCase());
  return entry?.[1];
}

function isValidUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function isForcedExecution(headers) {
  return headerValue(headers, MOCKFORGE_FORCED_EXECUTION_HEADER) === '1';
}

function inferTrafficMockStatus(responseHeaders) {
  return {
    mockedRequest: headerValue(responseHeaders, MOCKFORGE_REQUEST_MARKER_HEADER) === '1',
    mockedResponse: headerValue(responseHeaders, MOCKFORGE_RESPONSE_MARKER_HEADER) === '1',
  };
}

function parseStringArrayHeader(value) {
  if (!value?.trim()) return undefined;
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return undefined;
    const items = parsed.filter((item) => typeof item === 'string' && item.length > 0);
    return items.length > 0 ? items : undefined;
  } catch {
    return undefined;
  }
}

function inferTrafficMockPaths(responseHeaders) {
  return {
    mockedRequestBodyPaths: parseStringArrayHeader(
      headerValue(responseHeaders, MOCKFORGE_REQUEST_BODY_PATHS_HEADER),
    ),
    mockedRequestHeaderFields: parseStringArrayHeader(
      headerValue(responseHeaders, MOCKFORGE_REQUEST_HEADER_FIELDS_HEADER),
    ),
  };
}

function mergeMockedRequestPaths(primary, secondary) {
  const mockedRequestBodyPaths = [
    ...(primary?.mockedRequestBodyPaths ?? []),
    ...(secondary?.mockedRequestBodyPaths ?? []),
  ];
  const mockedRequestHeaderFields = [
    ...(primary?.mockedRequestHeaderFields ?? []),
    ...(secondary?.mockedRequestHeaderFields ?? []),
  ];

  return {
    mockedRequestBodyPaths: mockedRequestBodyPaths.length > 0
      ? [...new Set(mockedRequestBodyPaths)]
      : undefined,
    mockedRequestHeaderFields: mockedRequestHeaderFields.length > 0
      ? [...new Set(mockedRequestHeaderFields)]
      : undefined,
  };
}

function captureBodyChunk(chunks, sizeRef, limit, chunk) {
  if (sizeRef.value >= limit) {
    return true;
  }

  const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
  const remaining = limit - sizeRef.value;

  if (buffer.length > remaining) {
    chunks.push(buffer.subarray(0, remaining));
    sizeRef.value = limit;
    return true;
  }

  chunks.push(buffer);
  sizeRef.value += buffer.length;
  return false;
}

function releaseConnection() {
  activeConnections = Math.max(0, activeConnections - 1);
  if (process.send) {
    process.send({ type: 'active-connections', count: activeConnections });
  }
}

function handleMockServerProxyResponse(proxyRes, clientRes, meta, monitor, releaseOnce) {
  const responseBodyChunks = [];
  const responseBodySize = { value: 0 };
  let responseBodyTruncated = false;
  const responseHeaders = headersToRecord(proxyRes.headers);

  monitor.markHeadersSent(proxyRes.statusCode ?? 502);
  clientRes.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);

  proxyRes.on('data', (chunk) => {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    monitor.markUpstreamChunk(buffer.length);
    monitor.writeToClient(buffer);
    if (captureBodyChunk(
      responseBodyChunks,
      responseBodySize,
      TRAFFIC_BODY_CAPTURE_LIMIT,
      chunk,
    )) {
      responseBodyTruncated = true;
    }
  });

  const finalizeResponse = () => {
    releaseOnce();
    const durationMs = Date.now() - meta.startedAt;
    const rawBody = Buffer.concat(responseBodyChunks);
    const normalized = normalizeCapturedBody(rawBody, responseHeaders);
    const mockStatus = inferTrafficMockStatus(normalized.headers);
    const mockPaths = mergeMockedRequestPaths(
      meta.mockPaths,
      inferTrafficMockPaths(normalized.headers),
    );
    const instabilityFields = getClientInstabilityFields(monitor);

    if (process.send) {
      process.send({
        type: 'timing',
        id: meta.requestId,
        durationMs,
      });
    }

    sendTrafficRecord({
      id: meta.requestId,
      timestamp: meta.timestamp,
      method: meta.method,
      path: meta.path,
      headers: meta.requestHeaders,
      body: meta.requestBody || '',
      clientIp: meta.clientIp,
      userAgent: meta.userAgent,
      responseStatus: proxyRes.statusCode,
      responseHeaders: normalized.headers,
      responseBody: normalized.body,
      responseBodyTruncated,
      responseReason: proxyRes.statusMessage,
      durationMs,
      mockedRequest: mockStatus.mockedRequest || !!meta.requestMockApplied,
      mockedResponse: mockStatus.mockedResponse,
      mockedRequestBodyPaths: mockPaths.mockedRequestBodyPaths,
      mockedRequestHeaderFields: mockPaths.mockedRequestHeaderFields,
      forcedExecution: isForcedExecution(meta.requestHeaders),
      ...instabilityFields,
    });

    if (instabilityFields.clientInstability) {
      sendInstabilityLog({
        category: 'proxy',
        kind: 'client_disconnect',
        message: instabilityFields.instabilityMessage || 'Client disconnected during response stream',
        correlationId: meta.requestId,
        details: monitor.getFullSnapshot?.() || monitor.getDisconnectSnapshot(),
      });
    }
  };

  proxyRes.on('end', () => {
    monitor.markUpstreamComplete(proxyRes.statusCode ?? 502);
    monitor.finishWhenDrained(() => {
      if (!clientRes.writableEnded && !clientRes.destroyed) {
        clientRes.end();
      }
      finalizeResponse();
    });
  });

  proxyRes.on('error', (err) => {
    releaseOnce();
    if (!clientRes.headersSent) {
      clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
      clientRes.end('MockForge proxy could not read MockServer response');
      sendFailedTrafficRecord(
        meta,
        err?.message || 'MockServer response stream error',
        'mockserver_unreachable',
      );
    } else {
      clientRes.end();
      sendFailedTrafficRecord(
        meta,
        err?.message || 'MockServer response stream closed unexpectedly',
        'mockserver_unreachable',
      );
    }
  });
}

function getClientIp(clientReq) {
  const addr = clientReq.socket?.remoteAddress;
  if (!addr) return 'unknown';
  if (addr.startsWith('::ffff:')) return addr.slice(7);
  if (addr === '::1') return '127.0.0.1';
  return addr;
}

function forwardToMockServer(clientReq, clientRes, requestId, startedAt, clientIp, userAgent, releaseOnce) {
  const upstreamHost = upstreamConfig?.host || null;
  const upstreamBasePath = upstreamConfig?.basePath || '';
  const method = clientReq.method || 'GET';
  const url = clientReq.url || '/';
  const requestPath = url.split('?')[0] || '/';
  const monitor = attachClientDisconnectMonitor(clientReq, clientRes, {
    requestId,
    method,
    path: requestPath,
    clientIp,
    userAgent,
    route: 'mockserver',
  });
  const incomingHeaders = headersToRecord(clientReq.headers);
  const mockRoute = findRequestMockRoute(method, url, requestMockRoutes);
  const requestOverride = mockRoute?.requestOverride;

  const buildTrafficMeta = (
    requestBody = '',
    capturedHeaders = incomingHeaders,
    mockPaths = {},
    requestMockApplied = false,
  ) => ({
    requestId,
    startedAt,
    timestamp: new Date().toISOString(),
    method,
    path: requestPath,
    requestHeaders: {
      ...capturedHeaders,
      'x-mockforge-request-id': requestId,
    },
    requestBody,
    clientIp,
    userAgent,
    mockPaths,
    requestMockApplied,
  });

  const startForward = (bodyBuffer) => {
    const { headers, path } = rewriteProxyRequest(
      clientReq,
      upstreamHost,
      upstreamBasePath,
    );

    let finalHeaders = headers;
    let finalBody = bodyBuffer ?? Buffer.alloc(0);

    if (requestOverride) {
      if (shouldProxyApplyBodyOverride(requestOverride)) {
        finalBody = Buffer.from(
          applyBodyOverride(finalBody.toString('utf8'), requestOverride),
          'utf8',
        );
      }
      finalHeaders = applyHeadersOverride(finalHeaders, requestOverride, upstreamHost);
    }

    finalHeaders['x-mockforge-request-id'] = requestId;
    applyClientMetadataHeaders(finalHeaders, clientIp, userAgent);

    if (finalBody.length > 0) {
      finalHeaders['content-length'] = String(finalBody.length);
      delete finalHeaders['transfer-encoding'];
      delete finalHeaders['Transfer-Encoding'];
    }

    const mockPaths = requestOverride
      ? getMockedRequestPathsFromOverride(requestOverride)
      : {};
    const requestMockApplied = !!requestOverride
      && shouldProxyApplyRequestOverride(requestOverride);

    const trafficMeta = buildTrafficMeta(
      finalBody.length > 0 ? finalBody.toString('utf8') : '',
      headersToRecord(finalHeaders),
      mockPaths,
      requestMockApplied,
    );

    const requestOptions = {
      hostname: '127.0.0.1',
      port: targetPort,
      path,
      method,
      headers: finalHeaders,
    };

    let attempt = 0;

    const handleProxyError = (err) => {
      releaseOnce();
      if (!clientRes.headersSent) {
        clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
        clientRes.end('MockForge proxy could not reach MockServer');
        sendFailedTrafficRecord(
          trafficMeta,
          err?.message || 'Could not reach MockServer',
          'mockserver_unreachable',
        );
      } else {
        clientRes.end();
        sendFailedTrafficRecord(
          trafficMeta,
          err?.message || 'MockServer connection lost during request',
          'mockserver_unreachable',
        );
      }
    };

    const dispatch = () => {
      attempt += 1;
      const proxyReq = http.request(
        requestOptions,
        (proxyRes) => {
          handleMockServerProxyResponse(proxyRes, clientRes, trafficMeta, monitor, releaseOnce);
        },
      );

      proxyReq.on('error', (err) => {
        if (!clientRes.headersSent && attempt < MOCKSERVER_RETRY_ATTEMPTS) {
          setTimeout(dispatch, MOCKSERVER_RETRY_DELAY_MS);
          return;
        }
        handleProxyError(err);
      });

      if (finalBody.length > 0) {
        proxyReq.end(finalBody);
      } else {
        proxyReq.end();
      }
    };

    dispatch();
  };

  if (shouldForwardRequestBody(method)) {
    readRequestBody(clientReq)
      .then((bodyBuffer) => {
        startForward(bodyBuffer);
      })
      .catch((err) => {
        releaseOnce();
        const trafficMeta = buildTrafficMeta();
        if (!clientRes.headersSent) {
          clientRes.writeHead(400, { 'Content-Type': 'text/plain' });
          clientRes.end('MockForge proxy could not read request body');
          sendFailedTrafficRecord(
            trafficMeta,
            err?.message || 'Could not read request body',
          );
        } else {
          clientRes.end();
          sendFailedTrafficRecord(
            trafficMeta,
            err?.message || 'Request body stream closed unexpectedly',
          );
        }
      });
    return;
  }

  startForward(Buffer.alloc(0));
}

function forward(clientReq, clientRes) {
  if (shuttingDown) {
    clientRes.writeHead(503, { 'Content-Type': 'text/plain' });
    clientRes.end('MockForge proxy is shutting down');
    return;
  }

  activeConnections += 1;
  if (process.send) {
    process.send({ type: 'active-connections', count: activeConnections });
  }

  let released = false;
  const releaseOnce = () => {
    if (released) return;
    released = true;
    releaseConnection();
  };

  requestCount += 1;
  const url = clientReq.url || '/';
  const method = clientReq.method || 'GET';
  const requestHeaders = headersToRecord(clientReq.headers);
  const clientTraceId = headerValue(requestHeaders, MOCKFORGE_REQUEST_ID_HEADER);
  const requestId = clientTraceId && isValidUuid(clientTraceId) ? clientTraceId : randomUUID();
  const startedAt = Date.now();
  const clientIp = getClientIp(clientReq);
  const userAgent = requestHeaders['user-agent'] || requestHeaders['User-Agent'];
  const requestPath = url.split('?')[0] || '/';

  if (process.send) {
    process.send({ type: 'request', count: requestCount });
  }

  const isControlPath = url.startsWith('/mockserver');
  const shouldUseMockServer = isControlPath || shouldInterceptForMock(method, url, interceptRoutes);
  const canPassthrough = upstreamConfig?.host && upstreamConfig?.scheme;

  if (!shouldUseMockServer && canPassthrough) {
    const monitor = attachClientDisconnectMonitor(clientReq, clientRes, {
      requestId,
      method,
      path: requestPath,
      clientIp,
      userAgent,
      route: 'passthrough',
    });

    forwardDirectUpstream(clientReq, clientRes, upstreamConfig, (result) => {
      releaseOnce();
      const instabilityFields = getClientInstabilityFields(monitor);
      const connectionFailed = result.connectionFailed === true;

      if (process.send) {
        process.send({
          type: 'timing',
          id: requestId,
          durationMs: result.durationMs,
        });
      }

      sendTrafficRecord({
        id: requestId,
        timestamp: new Date().toISOString(),
        method,
        path: requestPath,
        headers: requestHeaders,
        body: result.requestBody,
        clientIp,
        userAgent,
        responseStatus: result.responseStatus,
        responseHeaders: result.responseHeaders,
        responseBody: result.responseBody,
        responseBodyTruncated: result.responseBodyTruncated,
        responseReason: result.responseReason,
        durationMs: result.durationMs,
        mockedRequest: false,
        mockedResponse: false,
        forcedExecution: isForcedExecution(requestHeaders),
        connectionFailed,
        instabilityKind: connectionFailed ? 'upstream_error' : instabilityFields.instabilityKind,
        instabilityMessage: connectionFailed
          ? (result.errorMessage || 'Upstream connection failed')
          : instabilityFields.instabilityMessage,
        clientInstability: instabilityFields.clientInstability,
      });
    }, monitor);
    return;
  }

  forwardToMockServer(clientReq, clientRes, requestId, startedAt, clientIp, userAgent, releaseOnce);
}

function listenOn(host) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(forward);

    server.on('connect', (_req, clientSocket) => {
      clientSocket.write(
        'HTTP/1.1 502 HTTPS Not Supported\r\n' +
        'Content-Type: text/plain\r\n' +
        'Connection: close\r\n\r\n' +
        'MockForge only supports HTTP, not HTTPS.',
      );
      clientSocket.destroy();
    });

    server.on('error', reject);
    server.listen(publicPort, host, () => {
      servers.push(server);
      resolve(host);
    });
  });
}

async function main() {
  const bound = [];
  for (const host of bindHosts) {
    try {
      bound.push(await listenOn(host));
    } catch (err) {
      console.error(`[proxy] failed to bind ${host}:${publicPort}:`, err.message);
    }
  }

  if (bound.length === 0) {
    process.exit(1);
  }

  console.log(`[proxy] listening on ${bound.map((h) => `${h}:${publicPort}`).join(', ')} -> 127.0.0.1:${targetPort}`);
  if (upstreamConfig?.host) {
    console.log(
      `[proxy] upstream passthrough: ${upstreamConfig.scheme}://${upstreamConfig.host}:${upstreamConfig.port || ''}${upstreamConfig.basePath || ''}`,
    );
  }
  if (process.send) {
    process.send({ type: 'ready', hosts: bound });
  }
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const server of servers) {
    server.close();
  }

  const exitWhenDrained = () => {
    if (process.send) {
      process.send({ type: 'shutdown-complete', activeConnections });
    }
    process.exit(0);
  };

  if (activeConnections <= 0) {
    exitWhenDrained();
    return;
  }

  setTimeout(exitWhenDrained, SHUTDOWN_GRACE_MS);
}

process.on('message', (msg) => {
  if (msg?.type === 'upstream') {
    applyUpstreamConfig(msg.config ?? null);
    if (process.send) {
      process.send({ type: 'upstream-updated' });
    }
  }
  if (msg?.type === 'intercept-routes') {
    applyInterceptRoutes(msg.routes);
    if (process.send) {
      process.send({ type: 'intercept-routes-updated' });
    }
  }
  if (msg?.type === 'request-mock-routes') {
    applyRequestMockRoutes(msg.routes);
    if (process.send) {
      process.send({ type: 'request-mock-routes-updated' });
    }
  }
  if (msg?.type === 'shutdown') {
    shutdown();
  }
  if (msg?.type === 'adb-status') {
    adbReverseActive = msg.active !== false;
  }
});

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

main().catch((err) => {
  console.error('[proxy] fatal:', err);
  process.exit(1);
});
