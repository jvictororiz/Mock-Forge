import { stripAcceptEncoding } from './httpBodyEncoding';
import { stripInternalMockForgeHeaders } from './mockforgeHeaders';

export type ProxyRequestHeaders = Record<string, string | string[] | undefined>;

const BODYLESS_METHODS = new Set(['GET', 'HEAD', 'OPTIONS', 'TRACE']);

export function sanitizeForwardHeaders(
  method: string,
  headers: ProxyRequestHeaders,
): void {
  const normalized = (method || 'GET').toUpperCase();
  if (!BODYLESS_METHODS.has(normalized)) return;

  delete headers['content-length'];
  delete headers['Content-Length'];
  delete headers['transfer-encoding'];
  delete headers['Transfer-Encoding'];
}

export function joinUpstreamPath(basePath: string, requestPath: string): string {
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

export function rewriteProxyRequest(
  clientReq: { method?: string; url?: string | null; headers: ProxyRequestHeaders },
  upstreamHost: string | null,
  upstreamBasePath: string,
): { headers: ProxyRequestHeaders; path: string } {
  const headers = { ...clientReq.headers };
  delete headers['proxy-connection'];

  let path = clientReq.url || '/';
  const isControlPath = path.startsWith('/mockserver');

  if (!isControlPath && upstreamHost) {
    headers.host = upstreamHost;
    stripAcceptEncoding(headers);
    stripInternalMockForgeHeaders(headers);
    if (upstreamBasePath) {
      path = joinUpstreamPath(upstreamBasePath, path);
    }
  }

  sanitizeForwardHeaders(clientReq.method || 'GET', headers);

  return { headers, path };
}

export function shouldForwardRequestBody(method: string): boolean {
  return !BODYLESS_METHODS.has((method || 'GET').toUpperCase());
}
