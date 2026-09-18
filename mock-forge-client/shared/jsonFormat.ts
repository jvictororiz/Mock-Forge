export function sanitizeJsonText(input: string): string {
  return input
    .replace(/^\uFEFF/, '')
    .replace(/^\u0000+/, '')
    .trim();
}

export function isValidJson(input: string): boolean {
  const sanitized = sanitizeJsonText(input);
  if (!sanitized) return false;

  try {
    JSON.parse(sanitized);
    return true;
  } catch {
    return false;
  }
}

export type JsonEditorStatus = 'valid' | 'invalid';

export function getJsonEditorStatus(value: string): JsonEditorStatus | undefined {
  if (!value.trim()) return undefined;
  return isValidJson(value) ? 'valid' : 'invalid';
}

export function sortJsonKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJsonKeysDeep);
  }

  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortJsonKeysDeep(record[key]);
    }
    return sorted;
  }

  return value;
}

export function normalizeJsonForSmartCompare(input: string): string {
  if (!input.trim()) return input;

  const sanitized = sanitizeJsonText(input);
  if (!sanitized) return input;

  try {
    const parsed = JSON.parse(sanitized);
    return JSON.stringify(sortJsonKeysDeep(parsed), null, 2);
  } catch {
    return input;
  }
}

export function prettifyJsonIfPossible(input: string): string {
  if (!input) return '';

  const sanitized = sanitizeJsonText(input);
  if (!sanitized) return input;

  try {
    const parsed = JSON.parse(sanitized);
    if (typeof parsed === 'string') {
      const inner = sanitizeJsonText(parsed);
      if (inner) {
        try {
          return JSON.stringify(JSON.parse(inner), null, 2);
        } catch {
          // keep outer parsed value
        }
      }
    }
    return JSON.stringify(parsed, null, 2);
  } catch {
    return input;
  }
}
