'use strict';

const REGEX_PATH_HINTS = [
  /\(\?:/,
  /\(\?[=!:<]/,
  /\[[^[\]]*\]/,
  /\\\d/,
  /\\\w/,
  /\\\s/,
  /\.\*/,
  /\.\+/,
  /\|/,
];

function escapeRegexLiteral(value) {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

function unescapeRegexLiteral(value) {
  return value.replace(/\\([\\^$.*+?()[\]{}|])/g, '$1');
}

function isRegexRoutePath(path) {
  if (path.startsWith('^') || path.endsWith('$')) return true;
  return REGEX_PATH_HINTS.some((pattern) => pattern.test(path));
}

function toMockServerPathPattern(path) {
  if (isRegexRoutePath(path)) return path;
  return `^${escapeRegexLiteral(path)}$`;
}

function fromMockServerPathPattern(path) {
  const anchoredLiteral = path.match(/^\^([\s\S]+)\$$/);
  if (anchoredLiteral) {
    const inner = anchoredLiteral[1];
    if (!REGEX_PATH_HINTS.some((pattern) => pattern.test(inner))) {
      return unescapeRegexLiteral(inner);
    }
  }

  return path;
}

function matchesRoutePath(routePath, requestPath) {
  if (isRegexRoutePath(routePath)) {
    try {
      return new RegExp(routePath).test(requestPath);
    } catch {
      return routePath === requestPath;
    }
  }

  return routePath === requestPath;
}

module.exports = {
  escapeRegexLiteral,
  unescapeRegexLiteral,
  isRegexRoutePath,
  toMockServerPathPattern,
  fromMockServerPathPattern,
  matchesRoutePath,
};
