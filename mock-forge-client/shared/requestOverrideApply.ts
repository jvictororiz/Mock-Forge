import type { RequestOverride } from './types';
import { parseJsonBody, applyMergeFields } from './jsonMergeUtils';

export interface ProxyRequestMockRoute {
  method: string;
  path: string;
  requestOverride: RequestOverride;
}

const MERGE_HEADER_CANDIDATES = [
  'authorization',
  'token',
  'sessionid',
  'session-id',
  'x-auth-token',
  'x-access-token',
  'x-session-id',
];

export function defaultMergeHeaderFields(headers: Record<string, string>): string[] {
  const byLowerCase = new Map(
    Object.keys(headers).map((key) => [key.toLowerCase(), key]),
  );

  return MERGE_HEADER_CANDIDATES
    .map((candidate) => byLowerCase.get(candidate))
    .filter((key): key is string => !!key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function mergeValues(base: unknown, patch: unknown): unknown {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return patch;
  }

  const result: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    const current = result[key];
    if (isPlainObject(current) && isPlainObject(value)) {
      result[key] = mergeValues(current, value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

export function applyBodyMerge(
  incomingBody: string,
  requestOverride: RequestOverride,
): string {
  if (requestOverride.bodyMode !== 'merge') {
    return incomingBody;
  }

  const mergeFields = requestOverride.mergeFields ?? [];
  if (mergeFields.length === 0) {
    return incomingBody;
  }

  const incoming = parseJsonBody(incomingBody);
  if (incoming === null || typeof incoming !== 'object') {
    return incomingBody;
  }

  const override = parseJsonBody(requestOverride.body);
  if (override === null || typeof override !== 'object') {
    return incomingBody;
  }

  const merged = applyMergeFields(incoming, override, mergeFields);
  return JSON.stringify(merged);
}

export function applyBodyOverride(
  incomingBody: string,
  requestOverride: RequestOverride,
): string {
  if (!requestOverride.body?.trim()) {
    return incomingBody;
  }

  if (requestOverride.bodyMode === 'merge') {
    return applyBodyMerge(incomingBody, requestOverride);
  }

  return requestOverride.body;
}

export function applyHeadersOverride(
  incomingHeaders: Record<string, string>,
  requestOverride: RequestOverride,
  upstreamHost?: string | null,
): Record<string, string> {
  const source = requestOverride.headers || {};
  if (Object.keys(source).length === 0) {
    return incomingHeaders;
  }

  if (requestOverride.headersMode === 'merge') {
    const fields = requestOverride.mergeHeaderFields ?? [];
    if (fields.length === 0) {
      return incomingHeaders;
    }

    const next = { ...incomingHeaders };
    for (const field of fields) {
      if (source[field] !== undefined) {
        next[field] = source[field];
      }
    }
    return next;
  }

  const next = { ...source };
  if (upstreamHost) {
    next.Host = upstreamHost;
    next.host = upstreamHost;
  }
  return next;
}

export function shouldProxyApplyBodyMerge(requestOverride?: RequestOverride): boolean {
  if (!requestOverride || requestOverride.bodyMode !== 'merge') return false;
  return (requestOverride.mergeFields?.length ?? 0) > 0;
}

export function shouldProxyApplyBodyOverride(requestOverride?: RequestOverride): boolean {
  if (!requestOverride?.body?.trim()) return false;
  if (requestOverride.bodyMode === 'merge') {
    return shouldProxyApplyBodyMerge(requestOverride);
  }
  return true;
}

export function shouldProxyApplyHeadersOverride(requestOverride?: RequestOverride): boolean {
  const source = requestOverride?.headers || {};
  if (Object.keys(source).length === 0) return false;
  if (requestOverride?.headersMode === 'merge') {
    return (requestOverride.mergeHeaderFields?.length ?? 0) > 0;
  }
  return true;
}

export function shouldProxyApplyRequestOverride(requestOverride?: RequestOverride): boolean {
  return shouldProxyApplyBodyOverride(requestOverride)
    || shouldProxyApplyHeadersOverride(requestOverride);
}
