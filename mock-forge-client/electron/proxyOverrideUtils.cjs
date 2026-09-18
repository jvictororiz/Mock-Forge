'use strict';

const { matchesRoutePath } = require('./routePathMatch.cjs');

function parseJsonBody(body) {
  if (!body?.trim()) return {};
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function parsePathSegments(path) {
  const segments = [];
  const pattern = /([^.\[\]]+)|\[(\d+)\]/g;
  let match;

  while ((match = pattern.exec(path)) !== null) {
    if (match[1] !== undefined) {
      segments.push(match[1]);
    } else if (match[2] !== undefined) {
      segments.push(Number(match[2]));
    }
  }

  return segments;
}

function setValueAtPath(value, path, nextValue) {
  const segments = parsePathSegments(path);
  if (segments.length === 0) return nextValue;

  const clone = JSON.parse(JSON.stringify(value));
  let current = clone;

  for (let i = 0; i < segments.length - 1; i += 1) {
    const segment = segments[i];
    const nextSegment = segments[i + 1];

    if (typeof segment === 'number') {
      if (!Array.isArray(current)) return clone;
      if (current[segment] === undefined) {
        current[segment] = typeof nextSegment === 'number' ? [] : {};
      }
      current = current[segment];
    } else {
      if (current[segment] === undefined) {
        current[segment] = typeof nextSegment === 'number' ? [] : {};
      }
      current = current[segment];
    }
  }

  const last = segments[segments.length - 1];
  if (typeof last === 'number') {
    if (!Array.isArray(current)) return clone;
    current[last] = nextValue;
  } else {
    current[last] = nextValue;
  }

  return clone;
}

function isAncestorPath(ancestor, descendant) {
  if (!ancestor || !descendant || ancestor === descendant) return false;
  if (descendant.startsWith(`${ancestor}.`)) return true;
  if (descendant.startsWith(`${ancestor}[`)) return true;
  return false;
}

function getEffectiveMergePaths(paths) {
  return paths.filter((path) => (
    !paths.some((other) => other !== path && isAncestorPath(other, path))
  ));
}

function pickPaths(value, paths) {
  const effectivePaths = getEffectiveMergePaths(paths);
  let result = {};
  for (const path of effectivePaths) {
    const leafValue = getValueAtPath(value, path);
    if (leafValue !== undefined) {
      result = setValueAtPath(result, path, leafValue);
    }
  }
  return result;
}

function applyMergeFields(incoming, override, mergeFields) {
  const effectivePaths = getEffectiveMergePaths(mergeFields);
  let result = JSON.parse(JSON.stringify(incoming));

  for (const path of effectivePaths) {
    const value = getValueAtPath(override, path);
    if (value !== undefined) {
      result = setValueAtPath(result, path, value);
    }
  }

  return result;
}

function getValueAtPath(value, path) {
  if (!path) return value;

  let current = value;
  for (const segment of parsePathSegments(path)) {
    if (current === null || current === undefined) return undefined;
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) return undefined;
      current = current[segment];
    } else if (typeof current === 'object') {
      current = current[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function mergeValues(base, patch) {
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return patch;
  }

  const result = { ...base };
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

function listLeafPaths(value, prefix = '') {
  if (value === null || typeof value !== 'object') {
    return prefix ? [prefix] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => {
      const nextPath = prefix ? `${prefix}[${index}]` : `[${index}]`;
      return listLeafPaths(item, nextPath);
    });
  }

  const paths = [];
  for (const [key, child] of Object.entries(value)) {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    if (child !== null && typeof child === 'object') {
      paths.push(...listLeafPaths(child, nextPath));
    } else {
      paths.push(nextPath);
    }
  }
  return paths;
}

function getMockedRequestPathsFromOverride(requestOverride) {
  if (!requestOverride) return {};

  const result = {};

  if (requestOverride.bodyMode === 'merge') {
    const mergeFields = requestOverride.mergeFields ?? [];
    if (mergeFields.length > 0) {
      result.mockedRequestBodyPaths = getEffectiveMergePaths(mergeFields);
    }
  } else if (requestOverride.body?.trim()) {
    const parsed = parseJsonBody(requestOverride.body);
    if (parsed !== null) {
      const leafPaths = listLeafPaths(parsed);
      if (leafPaths.length > 0) {
        result.mockedRequestBodyPaths = leafPaths;
      }
    }
  }

  if (requestOverride.headersMode === 'merge') {
    const mergeHeaderFields = requestOverride.mergeHeaderFields ?? [];
    if (mergeHeaderFields.length > 0) {
      result.mockedRequestHeaderFields = [...mergeHeaderFields];
    }
  } else if (requestOverride.headers && Object.keys(requestOverride.headers).length > 0) {
    result.mockedRequestHeaderFields = Object.keys(requestOverride.headers).filter(
      (key) => key.toLowerCase() !== 'host',
    );
  }

  return result;
}

function applyBodyMerge(incomingBody, requestOverride) {
  if (!requestOverride || requestOverride.bodyMode !== 'merge') {
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

function applyBodyOverride(incomingBody, requestOverride) {
  if (!requestOverride?.body?.trim()) {
    return incomingBody;
  }

  if (requestOverride.bodyMode === 'merge') {
    return applyBodyMerge(incomingBody, requestOverride);
  }

  return requestOverride.body;
}

function applyHeadersOverride(incomingHeaders, requestOverride, upstreamHost) {
  const source = requestOverride?.headers || {};
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

function shouldProxyApplyBodyMerge(requestOverride) {
  if (!requestOverride || requestOverride.bodyMode !== 'merge') return false;
  return (requestOverride.mergeFields?.length ?? 0) > 0;
}

function shouldProxyApplyBodyOverride(requestOverride) {
  if (!requestOverride?.body?.trim()) return false;
  if (requestOverride.bodyMode === 'merge') {
    return shouldProxyApplyBodyMerge(requestOverride);
  }
  return true;
}

function shouldProxyApplyHeadersOverride(requestOverride) {
  const source = requestOverride?.headers || {};
  if (Object.keys(source).length === 0) return false;
  if (requestOverride?.headersMode === 'merge') {
    return (requestOverride.mergeHeaderFields?.length ?? 0) > 0;
  }
  return true;
}

function shouldProxyApplyRequestOverride(requestOverride) {
  return shouldProxyApplyBodyOverride(requestOverride)
    || shouldProxyApplyHeadersOverride(requestOverride);
}

function findRequestMockRoute(method, url, routes) {
  const requestPath = (url || '/').split('?')[0] || '/';
  const normalizedMethod = (method || 'GET').toUpperCase();

  return routes.find((route) => {
    const routeMethod = (route.method || 'GET').toUpperCase();
    if (routeMethod !== normalizedMethod) return false;

    return matchesRoutePath(route.path, requestPath);
  });
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

module.exports = {
  applyBodyMerge,
  applyBodyOverride,
  applyHeadersOverride,
  getMockedRequestPathsFromOverride,
  shouldProxyApplyBodyMerge,
  shouldProxyApplyBodyOverride,
  shouldProxyApplyHeadersOverride,
  shouldProxyApplyRequestOverride,
  findRequestMockRoute,
  readRequestBody,
};
