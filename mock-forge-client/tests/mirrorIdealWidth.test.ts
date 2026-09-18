import { describe, expect, it } from 'vitest';
import { computeMirrorIdealWidth } from '../src/utils/mirrorIdealWidth';

describe('computeMirrorIdealWidth', () => {
  it('computes width from video aspect ratio and viewport height', () => {
    expect(computeMirrorIdealWidth(472, 1024, 700, 300, 520)).toBe(323);
  });

  it('clamps to minimum width', () => {
    expect(computeMirrorIdealWidth(472, 1024, 200, 300, 520)).toBe(300);
  });

  it('clamps to maximum width', () => {
    expect(computeMirrorIdealWidth(472, 1024, 1200, 300, 520)).toBe(520);
  });

  it('returns minimum for invalid dimensions', () => {
    expect(computeMirrorIdealWidth(0, 1024, 700, 300, 520)).toBe(300);
  });
});
