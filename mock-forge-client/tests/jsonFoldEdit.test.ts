import { describe, expect, it } from 'vitest';
import {
  applyFoldedDisplayEdit,
  tryDeleteCollapsedBlockSelection,
} from '../src/utils/jsonFoldEdit';

const sample = `{
  "name": "Alice",
  "address": {
    "city": "SP",
    "zip": "01000"
  },
  "tags": [
    "a",
    "b"
  ]
}`;

describe('jsonFoldEdit', () => {
  it('keeps unchanged collapsed blocks when editing another line', () => {
    const collapsed = new Set([2]);
    const display = [
      '{',
      '  "name": "Alice",',
      '  "address": { ... },',
      '  "tags": [',
      '    "a",',
      '    "b"',
      '  ]',
      '}',
    ].join('\n');

    const nextDisplay = [
      '{',
      '  "name": "Bob",',
      '  "address": { ... },',
      '  "tags": [',
      '    "a",',
      '    "b"',
      '  ]',
      '}',
    ].join('\n');

    const result = applyFoldedDisplayEdit(sample, collapsed, display, nextDisplay);

    expect(result).toContain('"name": "Bob"');
    expect(result).toContain('"city": "SP"');
    expect(result).toContain('"zip": "01000"');
  });

  it('removes a collapsed block when its summary line is deleted', () => {
    const collapsed = new Set([2]);
    const display = [
      '{',
      '  "name": "Alice",',
      '  "address": { ... },',
      '  "tags": [',
      '    "a",',
      '    "b"',
      '  ]',
      '}',
    ].join('\n');

    const nextDisplay = [
      '{',
      '  "name": "Alice",',
      '  "tags": [',
      '    "a",',
      '    "b"',
      '  ]',
      '}',
    ].join('\n');

    const result = applyFoldedDisplayEdit(sample, collapsed, display, nextDisplay);

    expect(result).not.toContain('"address"');
    expect(result).not.toContain('"city": "SP"');
    expect(result).toContain('"name": "Alice"');
    expect(result).toContain('"tags"');
  });

  it('deletes the full source block when the collapsed marker is selected', () => {
    const collapsed = new Set([2]);
    const display = [
      '{',
      '  "name": "Alice",',
      '  "address": { ... },',
      '  "tags": [',
      '    "a",',
      '    "b"',
      '  ]',
      '}',
    ].join('\n');

    const markerStart = display.indexOf('{ ... }');
    const markerEnd = markerStart + '{ ... }'.length;
    const deletion = tryDeleteCollapsedBlockSelection(
      sample,
      collapsed,
      display,
      markerStart,
      markerEnd,
    );

    expect(deletion).not.toBeNull();
    expect(deletion?.text).not.toContain('"address"');
    expect(deletion?.text).toContain('"name": "Alice"');
    expect(deletion?.sourceLines).toEqual([2]);
  });

  it('deletes two non-adjacent collapsed blocks in one selection', () => {
    const multiBlock = `{
  "a": {
    "x": 1
  },
  "b": {
    "y": 2
  },
  "c": {
    "z": 3
  }
}`;
    const collapsed = new Set([1, 7]);
    const display = [
      '{',
      '  "a": { ... },',
      '  "b": {',
      '    "y": 2',
      '  },',
      '  "c": { ... },',
      '}',
    ].join('\n');

    const firstMarker = display.indexOf('{ ... }');
    const lastMarker = display.lastIndexOf('{ ... }');
    const deletion = tryDeleteCollapsedBlockSelection(
      multiBlock,
      collapsed,
      display,
      firstMarker,
      lastMarker + '{ ... }'.length,
    );

    expect(deletion).not.toBeNull();
    expect(deletion?.text).not.toContain('"a"');
    expect(deletion?.text).not.toContain('"c"');
    expect(deletion?.text).toContain('"b"');
    expect(deletion?.text).toContain('"y": 2');
    expect(deletion?.sourceLines).toEqual([7, 1]);
  });

  it('deletes two adjacent collapsed blocks in one selection', () => {
    const adjacentBlocks = `{
  "a": {
    "x": 1
  },
  "b": {
    "y": 2
  }
}`;
    const collapsed = new Set([1, 4]);
    const display = [
      '{',
      '  "a": { ... },',
      '  "b": { ... },',
      '}',
    ].join('\n');

    const selectionStart = display.indexOf('{ ... }');
    const selectionEnd = display.lastIndexOf('{ ... }') + '{ ... }'.length;
    const deletion = tryDeleteCollapsedBlockSelection(
      adjacentBlocks,
      collapsed,
      display,
      selectionStart,
      selectionEnd,
    );

    expect(deletion).not.toBeNull();
    expect(deletion?.text).not.toContain('"a"');
    expect(deletion?.text).not.toContain('"b"');
    expect(deletion?.text).toBe('{\n}');
    expect(deletion?.sourceLines).toEqual([4, 1]);
  });
});
