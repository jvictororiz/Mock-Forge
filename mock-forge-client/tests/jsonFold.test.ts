import { describe, expect, it } from 'vitest';
import {
  buildFoldedText,
  buildFoldedView,
  getFoldRanges,
  pruneCollapsedLines,
} from '../src/utils/jsonFold';

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

describe('jsonFold', () => {
  it('detects fold ranges for nested objects and arrays', () => {
    const ranges = getFoldRanges(sample);
    expect(ranges).toEqual(expect.arrayContaining([
      { startLine: 0, endLine: 10, opener: '{' },
      { startLine: 2, endLine: 5, opener: '{' },
      { startLine: 6, endLine: 9, opener: '[' },
    ]));
    expect(ranges).toHaveLength(3);
  });

  it('collapses multi-line blocks into a summary line', () => {
    const collapsed = new Set([2]);
    const folded = buildFoldedText(sample, collapsed);

    expect(folded).toContain('"address": { ... },');
    expect(folded).not.toContain('"city": "SP"');
    expect(folded).not.toContain('"zip": "01000"');
  });

  it('keeps fold arrows on foldable source lines', () => {
    const view = buildFoldedView(sample, new Set());
    const foldStarts = view.filter((line) => line.isFoldStart).map((line) => line.sourceLine);

    expect(foldStarts).toEqual([0, 2, 6]);
  });

  it('drops invalid collapsed lines after edits', () => {
    const collapsed = new Set([2, 99]);
    const pruned = pruneCollapsedLines(sample, collapsed);

    expect(pruned).toEqual(new Set([2]));
  });
});
