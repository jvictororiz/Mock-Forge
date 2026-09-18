import type { CapturedRequest, Route } from './types';
import { isInternalMockForgeHeader } from './mockforgeHeaders';
import { getActiveRequestOverride, normalizeRoute } from './routeUtils';

const HOP_BY_HOP_HEADERS = new Set([
  'host',
  'connection',
  'content-length',
  'transfer-encoding',
  'keep-alive',
  'proxy-connection',
]);

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

export function resolveRequestUrl(
  path: string,
  headers: Record<string, string>,
  baseUrl?: string,
): string {
  if (/^https?:\/\//i.test(path)) return path;

  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const host = headers.Host || headers.host;

  if (host) {
    const hostOnly = host.split(':')[0];
    const scheme = hostOnly === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(hostOnly)
      ? 'http'
      : 'https';
    return `${scheme}://${host}${normalizedPath}`;
  }

  if (baseUrl) {
    return `${baseUrl.replace(/\/$/, '')}${normalizedPath}`;
  }

  return normalizedPath;
}

export function buildCurlCommand(options: {
  method: string;
  path: string;
  headers?: Record<string, string>;
  body?: string;
  baseUrl?: string;
}): string {
  const headers = options.headers ?? {};
  const method = options.method.toUpperCase();
  const url = resolveRequestUrl(options.path, headers, options.baseUrl);
  const parts = ['curl', '-X', method, shellQuote(url)];

  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(lower) || isInternalMockForgeHeader(key)) continue;
    parts.push('-H', shellQuote(`${key}: ${value}`));
  }

  if (options.body !== undefined && options.body !== '' && METHODS_WITH_BODY.has(method)) {
    parts.push('-d', shellQuote(options.body));
  }

  return parts.join(' ');
}

export function capturedRequestToCurl(
  captured: CapturedRequest,
  baseUrl?: string,
): string {
  return buildCurlCommand({
    method: captured.method,
    path: captured.path,
    headers: captured.headers,
    body: captured.body,
    baseUrl,
  });
}

export function routeToCurl(route: Route, baseUrl?: string): string {
  const normalized = normalizeRoute(route);
  const activeRequest = getActiveRequestOverride(normalized);
  const headers = { ...(activeRequest?.headers ?? {}) };

  let body: string | undefined;
  if (
    activeRequest?.body !== undefined
    && METHODS_WITH_BODY.has(normalized.method)
  ) {
    body = activeRequest.body;
  }

  return buildCurlCommand({
    method: normalized.method,
    path: normalized.path,
    headers,
    body,
    baseUrl,
  });
}
