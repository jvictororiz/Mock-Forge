'use strict';

const http = require('http');
const https = require('https');
const {
  rewriteProxyRequest,
  shouldForwardRequestBody,
} = require('./proxyRequestUtils.cjs');
const { normalizeCapturedBody } = require('./proxyBodyUtils.cjs');

const TRAFFIC_BODY_CAPTURE_LIMIT = 2 * 1024 * 1024;

function headersToRecord(headers) {
  const result = {};
  for (const [key, value] of Object.entries(headers || {})) {
    if (value === undefined) continue;
    result[key] = Array.isArray(value) ? value.join(', ') : String(value);
  }
  return result;
}

function readStream(stream, onData, onEnd) {
  stream.on('data', onData);
  stream.on('end', onEnd);
  stream.on('error', onEnd);
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

function forwardDirectUpstream(clientReq, clientRes, upstreamConfig, onComplete, monitor) {
  const upstreamHost = upstreamConfig.host;
  const upstreamBasePath = upstreamConfig.basePath || '';
  const useHttps = upstreamConfig.scheme === 'HTTPS';
  const port = upstreamConfig.port || (useHttps ? 443 : 80);

  const { headers, path } = rewriteProxyRequest(
    clientReq,
    upstreamHost,
    upstreamBasePath,
  );

  const requestModule = useHttps ? https : http;
  const startedAt = Date.now();
  const requestBodyChunks = [];
  let requestBody = '';

  const proxyReq = requestModule.request(
    {
      hostname: upstreamHost,
      port,
      path,
      method: clientReq.method,
      headers,
    },
    (proxyRes) => {
      const responseHeaders = headersToRecord(proxyRes.headers);
      const responseBodyChunks = [];
      const responseBodySize = { value: 0 };
      let responseBodyTruncated = false;

      monitor?.markHeadersSent(proxyRes.statusCode ?? 502);
      clientRes.writeHead(proxyRes.statusCode ?? 502, proxyRes.headers);

      readStream(
        proxyRes,
        (chunk) => {
          const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
          monitor?.markUpstreamChunk(buffer.length);
          if (monitor) {
            monitor.writeToClient(buffer);
          } else {
            clientRes.write(buffer);
          }
          if (captureBodyChunk(
            responseBodyChunks,
            responseBodySize,
            TRAFFIC_BODY_CAPTURE_LIMIT,
            chunk,
          )) {
            responseBodyTruncated = true;
          }
        },
        () => {
          const complete = () => {
            if (!clientRes.writableEnded && !clientRes.destroyed) {
              clientRes.end();
            }
            const rawBody = Buffer.concat(responseBodyChunks);
            const normalized = normalizeCapturedBody(rawBody, responseHeaders);
            onComplete?.({
              durationMs: Date.now() - startedAt,
              responseStatus: proxyRes.statusCode,
              responseHeaders: normalized.headers,
              responseBody: normalized.body,
              responseBodyTruncated,
              responseReason: proxyRes.statusMessage,
              requestBody,
            });
          };

          monitor?.markUpstreamComplete(proxyRes.statusCode ?? 502);
          if (monitor?.finishWhenDrained) {
            monitor.finishWhenDrained(complete);
          } else {
            complete();
          }
        },
      );
    },
  );

  proxyReq.on('error', (err) => {
    const headersAlreadySent = clientRes.headersSent;
    if (!headersAlreadySent) {
      clientRes.writeHead(502, { 'Content-Type': 'text/plain' });
      clientRes.end('MockForge proxy could not reach upstream');
    } else {
      clientRes.end();
    }
    onComplete?.({
      durationMs: Date.now() - startedAt,
      responseStatus: headersAlreadySent ? undefined : 502,
      responseBody: err.message,
      requestBody,
      connectionFailed: true,
      errorMessage: err.message,
    });
  });

  if (shouldForwardRequestBody(clientReq.method)) {
    const requestBodySize = { value: 0 };
    readStream(
      clientReq,
      (chunk) => {
        captureBodyChunk(
          requestBodyChunks,
          requestBodySize,
          TRAFFIC_BODY_CAPTURE_LIMIT,
          chunk,
        );
        proxyReq.write(chunk);
      },
      () => {
        requestBody = Buffer.concat(requestBodyChunks).toString('utf8');
        proxyReq.end();
      },
    );
  } else {
    proxyReq.end();
  }
}

module.exports = {
  forwardDirectUpstream,
  headersToRecord,
  TRAFFIC_BODY_CAPTURE_LIMIT,
};
