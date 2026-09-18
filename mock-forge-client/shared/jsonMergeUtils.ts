export function parsePathSegments(path: string): Array<string | number> {
  const segments: Array<string | number> = [];
  const pattern = /([^.\[\]]+)|\[(\d+)\]/g;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(path)) !== null) {
    if (match[1] !== undefined) {
      segments.push(match[1]);
    } else if (match[2] !== undefined) {
      segments.push(Number(match[2]));
    }
  }

  return segments;
}

export function getValueAtPath(value: unknown, path: string): unknown {
  if (!path) return value;

  let current = value;
  for (const segment of parsePathSegments(path)) {
    if (current === null || current === undefined) return undefined;
    if (typeof segment === 'number') {
      if (!Array.isArray(current)) return undefined;
      current = current[segment];
    } else if (typeof current === 'object') {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return undefined;
    }
  }
  return current;
}

export function setValueAtPath(value: unknown, path: string, nextValue: unknown): unknown {
  const segments = parsePathSegments(path);
  if (segments.length === 0) return nextValue;

  const clone = deepClone(value);
  let current: unknown = clone;

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
      const record = current as Record<string, unknown>;
      if (record[segment] === undefined) {
        record[segment] = typeof nextSegment === 'number' ? [] : {};
      }
      current = record[segment];
    }
  }

  const last = segments[segments.length - 1];
  if (typeof last === 'number') {
    if (!Array.isArray(current)) return clone;
    current[last] = nextValue;
  } else {
    (current as Record<string, unknown>)[last] = nextValue;
  }

  return clone;
}

export function isAncestorPath(ancestor: string, descendant: string): boolean {
  if (!ancestor || !descendant || ancestor === descendant) return false;
  if (descendant.startsWith(`${ancestor}.`)) return true;
  if (descendant.startsWith(`${ancestor}[`)) return true;
  return false;
}

export function getEffectiveMergePaths(paths: string[]): string[] {
  return paths.filter((path) => (
    !paths.some((other) => other !== path && isAncestorPath(other, path))
  ));
}

export function getCoveringAncestor(path: string, paths: string[]): string | null {
  const ancestors = paths.filter((candidate) => isAncestorPath(candidate, path));
  if (ancestors.length === 0) return null;
  return ancestors.sort((a, b) => b.length - a.length)[0];
}

export function listLeafPaths(value: unknown, prefix = ''): string[] {
  if (value === null || typeof value !== 'object') {
    return prefix ? [prefix] : [];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item, index) => {
      const nextPath = prefix ? `${prefix}[${index}]` : `[${index}]`;
      return listLeafPaths(item, nextPath);
    });
  }

  const paths: string[] = [];
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const nextPath = prefix ? `${prefix}.${key}` : key;
    if (child !== null && typeof child === 'object') {
      paths.push(...listLeafPaths(child, nextPath));
    } else {
      paths.push(nextPath);
    }
  }
  return paths;
}

export function listRootMergeablePaths(value: unknown): string[] {
  if (value === null || typeof value !== 'object') {
    return [''];
  }

  if (Array.isArray(value)) {
    return value.map((_, index) => `[${index}]`);
  }

  return Object.keys(value as Record<string, unknown>);
}

export function pickPaths(value: unknown, paths: string[]): Record<string, unknown> {
  const effectivePaths = getEffectiveMergePaths(paths);
  let result: Record<string, unknown> = {};
  for (const path of effectivePaths) {
    const leafValue = getValueAtPath(value, path);
    if (leafValue !== undefined) {
      result = setValueAtPath(result, path, leafValue) as Record<string, unknown>;
    }
  }
  return result;
}

export function applyMergeFields(
  incoming: unknown,
  override: unknown,
  mergeFields: string[],
): unknown {
  const effectivePaths = getEffectiveMergePaths(mergeFields);
  let result = deepClone(incoming);

  for (const path of effectivePaths) {
    const value = getValueAtPath(override, path);
    if (value !== undefined) {
      result = setValueAtPath(result, path, value);
    }
  }

  return result;
}

export function parseJsonBody(body?: string): unknown {
  if (!body?.trim()) return {};
  try {
    return JSON.parse(body);
  } catch {
    return null;
  }
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function isLeafValue(value: unknown): boolean {
  return value === null || typeof value !== 'object';
}

function formatPrimitive(value: unknown): string {
  return JSON.stringify(value);
}

export interface JsonDisplayLine {
  text: string;
  path: string | null;
  depth: number;
  key?: string;
  value?: unknown;
  nodeKind?: 'leaf' | 'object' | 'array';
  trailingComma?: boolean;
}

function buildArrayLines(value: unknown[], path: string, depth: number): JsonDisplayLine[] {
  const pad = '  '.repeat(depth);
  if (value.length === 0) {
    return [{
      text: `${pad}[]`,
      path: path || null,
      depth,
      value,
      nodeKind: 'array',
    }];
  }

  const lines: JsonDisplayLine[] = [{ text: `${pad}[`, path: null, depth }];

  value.forEach((item, index) => {
    const itemPath = path ? `${path}[${index}]` : `[${index}]`;
    const comma = index < value.length - 1 ? ',' : '';

    if (isLeafValue(item)) {
      lines.push({
        text: `${'  '.repeat(depth + 1)}${formatPrimitive(item)}${comma}`,
        path: itemPath,
        depth: depth + 1,
        value: item,
        nodeKind: 'leaf',
        trailingComma: comma === ',',
      });
      return;
    }

    if (Array.isArray(item)) {
      if (item.length === 0) {
        lines.push({
          text: `${'  '.repeat(depth + 1)}[]${comma}`,
          path: itemPath,
          depth: depth + 1,
          value: item,
          nodeKind: 'array',
          trailingComma: comma === ',',
        });
        return;
      }

      lines.push({
        text: `${'  '.repeat(depth + 1)}[`,
        path: itemPath,
        depth: depth + 1,
        value: item,
        nodeKind: 'array',
      });
      lines.push(...buildArrayLines(item, itemPath, depth + 1).slice(1, -1));
      lines.push({ text: `${'  '.repeat(depth + 1)}]${comma}`, path: null, depth: depth + 1 });
      return;
    }

    const objectItem = item as Record<string, unknown>;
    if (Object.keys(objectItem).length === 0) {
      lines.push({
        text: `${'  '.repeat(depth + 1)}{}${comma}`,
        path: itemPath,
        depth: depth + 1,
        value: item,
        nodeKind: 'object',
        trailingComma: comma === ',',
      });
      return;
    }

    lines.push({
      text: `${'  '.repeat(depth + 1)}{`,
      path: itemPath,
      depth: depth + 1,
      value: item,
      nodeKind: 'object',
    });
    lines.push(...buildObjectLines(objectItem, itemPath, depth + 2));
    lines.push({ text: `${'  '.repeat(depth + 1)}}${comma}`, path: null, depth: depth + 1 });
  });

  lines.push({ text: `${pad}]`, path: null, depth });
  return lines;
}

function buildObjectLines(value: Record<string, unknown>, path: string, depth: number): JsonDisplayLine[] {
  const entries = Object.entries(value);
  const lines: JsonDisplayLine[] = [];

  entries.forEach(([key, child], index) => {
    const keyPath = path ? `${path}.${key}` : key;
    const comma = index < entries.length - 1;
    const childPad = '  '.repeat(depth);

    if (isLeafValue(child)) {
      lines.push({
        text: `${childPad}"${key}": ${formatPrimitive(child)}${comma ? ',' : ''}`,
        path: keyPath,
        depth,
        key,
        value: child,
        nodeKind: 'leaf',
        trailingComma: comma,
      });
      return;
    }

    if (Array.isArray(child)) {
      if (child.length === 0) {
        lines.push({
          text: `${childPad}"${key}": []${comma ? ',' : ''}`,
          path: keyPath,
          depth,
          key,
          value: child,
          nodeKind: 'array',
          trailingComma: comma,
        });
        return;
      }

      lines.push({
        text: `${childPad}"${key}": [`,
        path: keyPath,
        depth,
        key,
        value: child,
        nodeKind: 'array',
      });
      lines.push(...buildArrayLines(child, keyPath, depth + 1).slice(1, -1));
      lines.push({ text: `${childPad}]${comma ? ',' : ''}`, path: null, depth });
      return;
    }

    const childObject = child as Record<string, unknown>;
    if (Object.keys(childObject).length === 0) {
      lines.push({
        text: `${childPad}"${key}": {}${comma ? ',' : ''}`,
        path: keyPath,
        depth,
        key,
        value: child,
        nodeKind: 'object',
        trailingComma: comma,
      });
      return;
    }

    lines.push({
      text: `${childPad}"${key}": {`,
      path: keyPath,
      depth,
      key,
      value: child,
      nodeKind: 'object',
    });
    lines.push(...buildObjectLines(childObject, keyPath, depth + 1));
    lines.push({ text: `${childPad}}${comma ? ',' : ''}`, path: null, depth });
  });

  return lines;
}

export function buildJsonDisplayLines(body?: string): JsonDisplayLine[] {
  const parsed = parseJsonBody(body);
  if (parsed === null) {
    return [{ text: body || '', path: null, depth: 0 }];
  }

  if (isLeafValue(parsed)) {
    return [{
      text: formatPrimitive(parsed),
      path: '',
      depth: 0,
      value: parsed,
      nodeKind: 'leaf',
    }];
  }

  if (Array.isArray(parsed)) {
    return buildArrayLines(parsed, '', 0);
  }

  return [
    { text: '{', path: null, depth: 0 },
    ...buildObjectLines(parsed as Record<string, unknown>, '', 1),
    { text: '}', path: null, depth: 0 },
  ];
}

export function formatLeafValueForEdit(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') return String(value);
  return JSON.stringify(value);
}

export function parseLeafValueInput(raw: string): unknown {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    return JSON.parse(trimmed);
  } catch {
    return raw;
  }
}

export function formatBody(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
