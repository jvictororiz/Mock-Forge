import { describe, expect, it } from 'vitest';
import {
  buildFoldedView,
  getFoldRanges,
} from '../src/utils/jsonFold';
import {
  collapseTrailingBlankLines,
  getVisibleLineCount,
} from '../src/utils/jsonDisplay';

const sample = `{
  "name": "Alice",
  "address": {
    "city": "SP",
    "zip": "01000"
  }
}`;

describe('jsonDisplay line helpers', () => {
  it('ignores multiple trailing blank lines in visible count', () => {
    const text = `${sample}\n\n\n\n`;
    expect(getVisibleLineCount(text)).toBe(sample.split('\n').length + 1);
  });

  it('collapses multiple trailing blank lines', () => {
    expect(collapseTrailingBlankLines('{\n}\n\n\n')).toBe('{\n}\n');
  });
});

describe('jsonFold visible lines', () => {
  it('does not render fold controls on trailing blank lines', () => {
    const text = `${sample}\n\n\n`;
    const view = buildFoldedView(text, new Set());

    expect(view.length).toBe(getVisibleLineCount(text));
    expect(view.some((line) => line.isFoldStart && line.text.trim() === '')).toBe(false);
  });

  it('keeps fold arrows only on non-empty foldable lines', () => {
    const view = buildFoldedView(sample, new Set());
    const foldStarts = view.filter((line) => line.isFoldStart);

    expect(foldStarts.every((line) => line.text.trim().length > 0)).toBe(true);
    expect(foldStarts.map((line) => line.sourceLine)).toEqual([0, 2]);
  });

  it('still detects fold ranges from full text', () => {
    const ranges = getFoldRanges(`${sample}\n\n\n`);
    expect(ranges.length).toBeGreaterThan(0);
  });
});
