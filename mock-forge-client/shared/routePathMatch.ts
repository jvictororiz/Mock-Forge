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

export function escapeRegexLiteral(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

export function unescapeRegexLiteral(value: string): string {
  return value.replace(/\\([\\^$.*+?()[\]{}|])/g, '$1');
}

/** True when the route path is meant to be interpreted as a regex pattern. */
export function isRegexRoutePath(path: string): boolean {
  if (path.startsWith('^') || path.endsWith('$')) return true;
  return REGEX_PATH_HINTS.some((pattern) => pattern.test(path));
}

/** Converts a route path to a MockServer path matcher (regex string). */
export function toMockServerPathPattern(path: string): string {
  if (isRegexRoutePath(path)) return path;
  return `^${escapeRegexLiteral(path)}$`;
}

/** Restores a user-facing route path from a MockServer matcher when possible. */
export function fromMockServerPathPattern(path: string): string {
  const anchoredLiteral = path.match(/^\^([\s\S]+)\$$/);
  if (anchoredLiteral) {
    const inner = anchoredLiteral[1];
    if (!REGEX_PATH_HINTS.some((pattern) => pattern.test(inner))) {
      return unescapeRegexLiteral(inner);
    }
  }

  return path;
}

export function matchesRoutePath(routePath: string, requestPath: string): boolean {
  if (isRegexRoutePath(routePath)) {
    try {
      return new RegExp(routePath).test(requestPath);
    } catch {
      return routePath === requestPath;
    }
  }

  return routePath === requestPath;
}
