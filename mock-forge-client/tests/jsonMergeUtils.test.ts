import { describe, expect, it } from 'vitest';
import {
  applyMergeFields,
  buildJsonDisplayLines,
  formatLeafValueForEdit,
  getCoveringAncestor,
  getEffectiveMergePaths,
  getValueAtPath,
  isAncestorPath,
  listLeafPaths,
  listRootMergeablePaths,
  parseLeafValueInput,
  pickPaths,
  setValueAtPath,
} from '../shared/jsonMergeUtils';

describe('jsonMergeUtils', () => {
  const sample = {
    session_id: '',
    product_type: 'P2P',
    receiver: {
      id: '123',
      name: 'Alice',
    },
    tags: ['a', 'b'],
  };

  it('lists leaf paths for nested objects and arrays', () => {
    expect(listLeafPaths(sample)).toEqual([
      'session_id',
      'product_type',
      'receiver.id',
      'receiver.name',
      'tags[0]',
      'tags[1]',
    ]);
  });

  it('picks only selected paths for merge', () => {
    expect(pickPaths(sample, ['product_type', 'receiver.id'])).toEqual({
      product_type: 'P2P',
      receiver: { id: '123' },
    });
  });

  it('updates values by path', () => {
    const updated = setValueAtPath(sample, 'receiver.id', '999');
    expect(getValueAtPath(updated, 'receiver.id')).toBe('999');
    expect(getValueAtPath(sample, 'receiver.id')).toBe('123');
  });

  it('builds display lines with leaf and container paths', () => {
    const lines = buildJsonDisplayLines(JSON.stringify(sample, null, 2));
    const leafLines = lines.filter((line) => line.path && line.nodeKind === 'leaf');
    const containerLines = lines.filter((line) => line.path && line.nodeKind !== 'leaf');
    expect(leafLines.some((line) => line.path === 'receiver.id')).toBe(true);
    expect(leafLines.some((line) => line.path === 'tags[0]')).toBe(true);
    expect(containerLines.some((line) => line.path === 'receiver' && line.nodeKind === 'object')).toBe(true);
    expect(containerLines.some((line) => line.path === 'tags' && line.nodeKind === 'array')).toBe(true);
    expect(leafLines.find((line) => line.path === 'tags[0]')?.trailingComma).toBe(true);
    expect(leafLines.find((line) => line.path === 'tags[1]')?.trailingComma).toBe(false);
  });

  it('keeps empty arrays and objects on a single line to match JSON.stringify', () => {
    const formatted = JSON.stringify({
      persisted_state: '',
      feature_updates: [],
      metadata: {},
    }, null, 2);
    const displayText = buildJsonDisplayLines(formatted).map((line) => line.text).join('\n');

    expect(displayText).toBe(formatted);
    expect(buildJsonDisplayLines(formatted).length).toBe(formatted.split('\n').length);
  });

  it('marks trailing commas on array primitive items', () => {
    const lines = buildJsonDisplayLines(JSON.stringify({
      available_payment_methods: ['WALLET', 'BNPL'],
    }, null, 2));
    expect(lines.find((line) => line.path === 'available_payment_methods[0]')?.trailingComma).toBe(true);
    expect(lines.find((line) => line.path === 'available_payment_methods[1]')?.trailingComma).toBe(false);
  });

  it('applies container paths by replacing the whole block', () => {
    const incoming = { range: { min: '1.00', max: '10.00', extra: true } };
    const override = { range: { min: '18.00', max: '560.00' } };
    expect(applyMergeFields(incoming, override, ['range'])).toEqual({
      range: { min: '18.00', max: '560.00' },
    });
    expect(getEffectiveMergePaths(['range', 'range.min'])).toEqual(['range']);
    expect(getCoveringAncestor('range.min', ['range'])).toBe('range');
    expect(isAncestorPath('range', 'range.min')).toBe(true);
  });

  it('lists root mergeable paths for select all', () => {
    expect(listRootMergeablePaths(sample)).toEqual([
      'session_id',
      'product_type',
      'receiver',
      'tags',
    ]);
  });

  it('formats leaf values for free-text editing without JSON string quotes', () => {
    expect(formatLeafValueForEdit('')).toBe('');
    expect(formatLeafValueForEdit('hello')).toBe('hello');
    expect(formatLeafValueForEdit(true)).toBe('true');
    expect(formatLeafValueForEdit(42)).toBe('42');
    expect(formatLeafValueForEdit(null)).toBe('null');
  });

  it('parses leaf input as JSON when valid, otherwise keeps raw text', () => {
    expect(parseLeafValueInput('true')).toBe(true);
    expect(parseLeafValueInput('42')).toBe(42);
    expect(parseLeafValueInput('"hello"')).toBe('hello');
    expect(parseLeafValueInput('hello')).toBe('hello');
    expect(parseLeafValueInput('')).toBe('');
    expect(parseLeafValueInput('""')).toBe('');
  });
});
