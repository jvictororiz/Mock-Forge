import { sanitizeJsonText } from '../../shared/jsonFormat';
import type { AlignedDiffRow, LineDiffType } from './jsonLineDiff';

function indentStr(level: number): string {
  return '  '.repeat(level);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isComposite(value: unknown): boolean {
  return value !== null && typeof value === 'object';
}

function valuesEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function sortedKeys(left: Record<string, unknown>, right: Record<string, unknown>): string[] {
  return [...new Set([...Object.keys(left), ...Object.keys(right)])].sort();
}

function makeRow(
  leftLine: string | null,
  rightLine: string | null,
  type: LineDiffType,
): AlignedDiffRow {
  return { leftLine, rightLine, type };
}

function formatKeyValueLine(
  key: string | null,
  value: unknown,
  indent: number,
  trailingComma: boolean,
): string {
  const pad = indentStr(indent);
  const suffix = trailingComma ? ',' : '';
  if (key !== null) {
    return `${pad}"${key}": ${JSON.stringify(value)}${suffix}`;
  }
  return `${pad}${JSON.stringify(value)}${suffix}`;
}

function expandValueToLines(
  value: unknown,
  indent: number,
  key: string | null,
  trailingComma: boolean,
): string[] {
  if (!isComposite(value)) {
    return [formatKeyValueLine(key, value, indent, trailingComma)];
  }

  const pad = indentStr(indent);
  const lines: string[] = [];

  if (isPlainObject(value)) {
    lines.push(key !== null ? `${pad}"${key}": {` : `${pad}{`);
    const keys = Object.keys(value).sort();
    keys.forEach((childKey, index) => {
      lines.push(...expandValueToLines(value[childKey], indent + 1, childKey, index < keys.length - 1));
    });
    lines.push(`${pad}}${trailingComma ? ',' : ''}`);
    return lines;
  }

  if (Array.isArray(value)) {
    lines.push(key !== null ? `${pad}"${key}": [` : `${pad}[`);
    value.forEach((item, index) => {
      lines.push(...expandValueToLines(item, indent + 1, null, index < value.length - 1));
    });
    lines.push(`${pad}]${trailingComma ? ',' : ''}`);
    return lines;
  }

  return [formatKeyValueLine(key, value, indent, trailingComma)];
}

function emitSideOnly(
  value: unknown,
  indent: number,
  key: string | null,
  trailingComma: boolean,
  side: 'left' | 'right',
): AlignedDiffRow[] {
  return expandValueToLines(value, indent, key, trailingComma).map((line) => (
    side === 'left'
      ? makeRow(line, null, 'left')
      : makeRow(null, line, 'right')
  ));
}

function zipMismatchedBlocks(
  left: unknown,
  right: unknown,
  indent: number,
  key: string | null,
  trailingComma: boolean,
): AlignedDiffRow[] {
  const leftLines = expandValueToLines(left, indent, key, trailingComma);
  const rightLines = expandValueToLines(right, indent, key, trailingComma);
  const maxLength = Math.max(leftLines.length, rightLines.length);
  const rows: AlignedDiffRow[] = [];

  for (let index = 0; index < maxLength; index += 1) {
    const leftLine = leftLines[index] ?? null;
    const rightLine = rightLines[index] ?? null;

    if (leftLine !== null && rightLine !== null) {
      rows.push(makeRow(leftLine, rightLine, leftLine === rightLine ? 'equal' : 'both'));
    } else if (leftLine !== null) {
      rows.push(makeRow(leftLine, null, 'left'));
    } else {
      rows.push(makeRow(null, rightLine, 'right'));
    }
  }

  return rows;
}

function alignJsonValues(
  left: unknown,
  right: unknown,
  indent: number,
  key: string | null,
  trailingComma: boolean,
): AlignedDiffRow[] {
  const leftComposite = isComposite(left);
  const rightComposite = isComposite(right);

  if (!leftComposite && !rightComposite) {
    const leftLine = formatKeyValueLine(key, left, indent, trailingComma);
    const rightLine = formatKeyValueLine(key, right, indent, trailingComma);
    return [makeRow(leftLine, rightLine, valuesEqual(left, right) ? 'equal' : 'both')];
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    return alignObjectPair(left, right, indent, key, trailingComma);
  }

  if (Array.isArray(left) && Array.isArray(right)) {
    return alignArrayPair(left, right, indent, key, trailingComma);
  }

  return zipMismatchedBlocks(left, right, indent, key, trailingComma);
}

function alignObjectPair(
  left: Record<string, unknown>,
  right: Record<string, unknown>,
  indent: number,
  key: string | null,
  trailingComma: boolean,
): AlignedDiffRow[] {
  const rows: AlignedDiffRow[] = [];
  const pad = indentStr(indent);
  const childIndent = indent + 1;

  rows.push(makeRow(
    key !== null ? `${pad}"${key}": {` : `${pad}{`,
    key !== null ? `${pad}"${key}": {` : `${pad}{`,
    'equal',
  ));

  const keys = sortedKeys(left, right);
  keys.forEach((childKey, index) => {
    const childComma = index < keys.length - 1;
    const inLeft = Object.prototype.hasOwnProperty.call(left, childKey);
    const inRight = Object.prototype.hasOwnProperty.call(right, childKey);

    if (inLeft && inRight) {
      rows.push(...alignJsonValues(left[childKey], right[childKey], childIndent, childKey, childComma));
      return;
    }

    if (inLeft) {
      rows.push(...emitSideOnly(left[childKey], childIndent, childKey, childComma, 'left'));
      return;
    }

    rows.push(...emitSideOnly(right[childKey], childIndent, childKey, childComma, 'right'));
  });

  const closeLine = `${pad}}${trailingComma ? ',' : ''}`;
  rows.push(makeRow(closeLine, closeLine, 'equal'));
  return rows;
}

function alignArrayPair(
  left: unknown[],
  right: unknown[],
  indent: number,
  key: string | null,
  trailingComma: boolean,
): AlignedDiffRow[] {
  const rows: AlignedDiffRow[] = [];
  const pad = indentStr(indent);
  const childIndent = indent + 1;
  const pairs = isPrimitiveArray(left) && isPrimitiveArray(right)
    ? alignArrayElementsByValue(left, right)
    : alignArrayElementsByIndex(left, right);

  rows.push(makeRow(
    key !== null ? `${pad}"${key}": [` : `${pad}[`,
    key !== null ? `${pad}"${key}": [` : `${pad}[`,
    'equal',
  ));

  pairs.forEach((pair, index) => {
    const childComma = index < pairs.length - 1;

    if (pair.left !== undefined && pair.right !== undefined) {
      rows.push(...alignJsonValues(pair.left, pair.right, childIndent, null, childComma));
      return;
    }

    if (pair.left !== undefined) {
      rows.push(...emitSideOnly(pair.left, childIndent, null, childComma, 'left'));
      return;
    }

    rows.push(...emitSideOnly(pair.right, childIndent, null, childComma, 'right'));
  });

  const closeLine = `${pad}]${trailingComma ? ',' : ''}`;
  rows.push(makeRow(closeLine, closeLine, 'equal'));
  return rows;
}

function isPrimitive(value: unknown): boolean {
  return value === null || typeof value !== 'object';
}

function isPrimitiveArray(values: unknown[]): boolean {
  return values.every(isPrimitive);
}

interface ArrayElementPair {
  left?: unknown;
  right?: unknown;
}

function alignArrayElementsByValue(left: unknown[], right: unknown[]): ArrayElementPair[] {
  const toKey = (value: unknown) => JSON.stringify(value);
  const rightPool = new Map<string, unknown[]>();

  for (const value of right) {
    const key = toKey(value);
    const bucket = rightPool.get(key);
    if (bucket) {
      bucket.push(value);
    } else {
      rightPool.set(key, [value]);
    }
  }

  const matched: ArrayElementPair[] = [];
  const unmatchedLeft: unknown[] = [];

  for (const value of left) {
    const key = toKey(value);
    const bucket = rightPool.get(key);
    if (bucket && bucket.length > 0) {
      matched.push({ left: value, right: bucket.shift() });
      if (bucket.length === 0) {
        rightPool.delete(key);
      }
    } else {
      unmatchedLeft.push(value);
    }
  }

  const unmatchedRight: unknown[] = [];
  for (const bucket of rightPool.values()) {
    unmatchedRight.push(...bucket);
  }

  return [
    ...matched,
    ...unmatchedLeft.map((value) => ({ left: value })),
    ...unmatchedRight.map((value) => ({ right: value })),
  ];
}

function alignArrayElementsByIndex(left: unknown[], right: unknown[]): ArrayElementPair[] {
  const maxLength = Math.max(left.length, right.length);
  const pairs: ArrayElementPair[] = [];

  for (let index = 0; index < maxLength; index += 1) {
    const hasLeft = index < left.length;
    const hasRight = index < right.length;

    if (hasLeft && hasRight) {
      pairs.push({ left: left[index], right: right[index] });
    } else if (hasLeft) {
      pairs.push({ left: left[index] });
    } else {
      pairs.push({ right: right[index] });
    }
  }

  return pairs;
}

function tryParseJson(text: string): unknown | null {
  const sanitized = sanitizeJsonText(text);
  if (!sanitized) return null;

  try {
    return JSON.parse(sanitized);
  } catch {
    return null;
  }
}

export function diffJsonStructures(leftText: string, rightText: string): AlignedDiffRow[] | null {
  const left = tryParseJson(leftText);
  const right = tryParseJson(rightText);
  if (left === null || right === null) return null;

  return alignJsonValues(left, right, 0, null, false);
}
