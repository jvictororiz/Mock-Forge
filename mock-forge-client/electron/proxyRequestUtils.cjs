'use strict';

function isInternalMockForgeHeader(name) {
  return name.toLowerCase().startsWith('x-mockforge-');
}

function stripInternalMockForgeHeaders(headers) {
  for (const key of Object.keys(headers)) {
    if (isInternalMockForgeHeader(key)) {
      delete headers[key];
    }
  }
}

const BODYLESS_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

function sanitizeForwardHeaders(method, headers) {
  const normalized = (method || 'GET').toUpperCase();
  if (!BODYLESS_METHODS.has(normalized)) return;

  delete headers['content-length'];
  delete headers['Content-Length'];
  delete headers['transfer-encoding'];
  delete headers['Transfer-Encoding'];
}

function joinUpstreamPath(basePath, requestPath) {
  const queryIndex = requestPath.indexOf('?');
  const pathname = queryIndex >= 0 ? requestPath.slice(0, queryIndex) : requestPath;
  const query = queryIndex >= 0 ? requestPath.slice(queryIndex) : '';

  if (!basePath) {
    return `${pathname}${query}`;
  }

  const baseForComparison = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
  if (
    pathname === baseForComparison
    || pathname === basePath
    || pathname.startsWith(`${baseForComparison}/`)
  ) {
    return `${pathname}${query}`;
  }

  const normalizedBase = basePath.endsWith('/') ? basePath : `${basePath}/`;
  const suffix = pathname.startsWith('/') ? pathname.slice(1) : pathname;
  return `${normalizedBase}${suffix}${query}`;
}

function rewriteProxyRequest(clientReq, upstreamHost, upstreamBasePath) {
  const headers = { ...clientReq.headers };
  delete headers['proxy-connection'];

  let path = clientReq.url || '/';
  const isControlPath = path.startsWith('/mockserver');

  if (!isControlPath && upstreamHost) {
    headers.host = upstreamHost;
    delete headers['accept-encoding'];
    delete headers['Accept-Encoding'];
    stripInternalMockForgeHeaders(headers);
    if (upstreamBasePath) {
      path = joinUpstreamPath(upstreamBasePath, path);
    }
  }

  sanitizeForwardHeaders(clientReq.method || 'GET', headers);

  return { headers, path };
}

function shouldForwardRequestBody(method) {
  return !BODYLESS_METHODS.has((method || 'GET').toUpperCase());
}

module.exports = {
  sanitizeForwardHeaders,
  joinUpstreamPath,
  rewriteProxyRequest,
  shouldForwardRequestBody,
};
