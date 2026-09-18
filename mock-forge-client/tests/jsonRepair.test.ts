import { describe, expect, it } from 'vitest';
import { canRepairJson, repairJsonIfPossible } from '../shared/jsonRepair';

describe('jsonRepair', () => {
  it('returns null for valid JSON', () => {
    expect(repairJsonIfPossible('{"ok":true}')).toBeNull();
    expect(canRepairJson('{"ok":true}')).toBe(false);
  });

  it('adds missing closing braces', () => {
    const input = '{"name":"Alice","items":[1,2';
    const repaired = repairJsonIfPossible(input);

    expect(repaired).toContain('"name": "Alice"');
    expect(repaired).toContain('"items"');
    expect(canRepairJson(input)).toBe(true);
  });

  it('adds missing opening brace', () => {
    const repaired = repairJsonIfPossible('"name":"Alice"}');

    expect(repaired).toBe('{\n  "name": "Alice"\n}');
  });

  it('wraps bare object properties', () => {
    const repaired = repairJsonIfPossible('"name":"Alice","age":30');

    expect(repaired).toBe('{\n  "name": "Alice",\n  "age": 30\n}');
  });

  it('quotes unquoted keys', () => {
    const repaired = repairJsonIfPossible('{name: "Alice"}');

    expect(repaired).toBe('{\n  "name": "Alice"\n}');
  });

  it('removes trailing commas', () => {
    const repaired = repairJsonIfPossible('{"name":"Alice",}');

    expect(repaired).toBe('{\n  "name": "Alice"\n}');
  });

  it('converts single quotes to double quotes', () => {
    const repaired = repairJsonIfPossible("{'name': 'Alice'}");

    expect(repaired).toBe('{\n  "name": "Alice"\n}');
  });

  it('inserts missing commas between properties', () => {
    const repaired = repairJsonIfPossible('{"a":1 "b":2}');

    expect(repaired).toBe('{\n  "a": 1,\n  "b": 2\n}');
  });

  it('inserts missing commas after string values', () => {
    const repaired = repairJsonIfPossible('{"a":"one" "b":"two"}');

    expect(repaired).toBe('{\n  "a": "one",\n  "b": "two"\n}');
  });

  it('inserts missing commas after nested objects', () => {
    const repaired = repairJsonIfPossible('{"nested":{"x":1} "y":2}');

    expect(repaired).toBe('{\n  "nested": {\n    "x": 1\n  },\n  "y": 2\n}');
  });

  it('inserts missing commas after arrays', () => {
    const repaired = repairJsonIfPossible('{"items":[1,2] "next":true}');

    expect(repaired).toBe('{\n  "items": [\n    1,\n    2\n  ],\n  "next": true\n}');
  });

  it('fixes mismatched closing brace for arrays when possible', () => {
    const repaired = repairJsonIfPossible('{"items":[1,2}');

    expect(repaired).toBe('{\n  "items": [\n    1,\n    2\n  ]\n}');
  });
});
