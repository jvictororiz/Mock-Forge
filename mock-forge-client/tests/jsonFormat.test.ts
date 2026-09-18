import { describe, expect, it } from 'vitest';
import {
  normalizeJsonForSmartCompare,
  prettifyJsonIfPossible,
  sanitizeJsonText,
  isValidJson,
  sortJsonKeysDeep,
} from '../shared/jsonFormat';
import { diffTextLines } from '../src/utils/jsonLineDiff';

describe('sanitizeJsonText', () => {
  it('removes BOM and null bytes', () => {
    expect(sanitizeJsonText('\uFEFF{"ok":true}')).toBe('{"ok":true}');
    expect(sanitizeJsonText('\u0000{"ok":true}')).toBe('{"ok":true}');
  });
});

describe('prettifyJsonIfPossible', () => {
  it('formats minified JSON', () => {
    expect(prettifyJsonIfPossible('{"items":[1,2]}')).toBe(
      '{\n  "items": [\n    1,\n    2\n  ]\n}',
    );
  });

  it('formats JSON with BOM', () => {
    expect(prettifyJsonIfPossible('\uFEFF{"ok":true}')).toBe('{\n  "ok": true\n}');
  });

  it('formats double-encoded JSON strings', () => {
    const inner = JSON.stringify({ screen: 'sof', items: [1, 2] });
    const wrapped = JSON.stringify(inner);
    expect(prettifyJsonIfPossible(wrapped)).toBe(JSON.stringify(JSON.parse(inner), null, 2));
  });

  it('returns original text when input is not JSON', () => {
    expect(prettifyJsonIfPossible('plain text')).toBe('plain text');
  });
});

describe('isValidJson', () => {
  it('accepts valid JSON', () => {
    expect(isValidJson('{"ok":true}')).toBe(true);
  });

  it('rejects invalid JSON', () => {
    expect(isValidJson('{ok:true}')).toBe(false);
  });
});

describe('normalizeJsonForSmartCompare', () => {
  it('sorts object keys recursively before formatting', () => {
    const left = JSON.stringify({
      account_number: '50590324',
      account_type: 'PAYMENT_ACCOUNT',
      branch_number: '1',
    }, null, 2);
    const right = JSON.stringify({
      branch_number: '1',
      account_type: 'PAYMENT_ACCOUNT',
      account_number: '50590324',
    }, null, 2);

    const normalizedLeft = normalizeJsonForSmartCompare(left);
    const normalizedRight = normalizeJsonForSmartCompare(right);

    expect(normalizedLeft).toBe(normalizedRight);
    expect(diffTextLines(normalizedLeft, normalizedRight).every((row) => row.type === 'equal')).toBe(true);
  });

  it('preserves array order while sorting nested object keys', () => {
    const input = '[{"b":2,"a":1},{"z":9,"y":8}]';
    expect(normalizeJsonForSmartCompare(input)).toBe(
      JSON.stringify(sortJsonKeysDeep(JSON.parse(input)), null, 2),
    );
  });

  it('returns original text for non-JSON input', () => {
    expect(normalizeJsonForSmartCompare('plain text')).toBe('plain text');
  });
});

describe('getJsonEditorStatus', () => {
  it('returns undefined for empty values', async () => {
    const { getJsonEditorStatus } = await import('../shared/jsonFormat');
    expect(getJsonEditorStatus('')).toBeUndefined();
    expect(getJsonEditorStatus('   ')).toBeUndefined();
  });

  it('returns valid for parseable JSON', async () => {
    const { getJsonEditorStatus } = await import('../shared/jsonFormat');
    expect(getJsonEditorStatus('{"ok":true}')).toBe('valid');
  });

  it('returns invalid for broken JSON', async () => {
    const { getJsonEditorStatus } = await import('../shared/jsonFormat');
    expect(getJsonEditorStatus('{bad')).toBe('invalid');
  });
});
