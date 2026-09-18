import { describe, expect, it } from 'vitest';
import { computeJsonFloatingPlacement } from '../src/utils/jsonFloatingPosition';

function rect(x: number, y: number, width: number, height: number) {
  return {
    top: y,
    left: x,
    right: x + width,
    bottom: y + height,
  };
}

describe('computeJsonFloatingPlacement', () => {
  it('sticks to the visible scroll viewport when the container top is scrolled away', () => {
    const style = computeJsonFloatingPlacement(
      rect(40, -120, 400, 800),
      rect(40, 0, 400, 600),
      'top',
      12,
      1200,
      800,
    );

    expect(style.visible).toBe(true);
    expect(style.top).toBe(12);
    expect(style.right).toBeGreaterThan(0);
  });

  it('uses the container top when it is fully visible inside the scroll viewport', () => {
    const style = computeJsonFloatingPlacement(
      rect(40, 80, 400, 300),
      rect(40, 0, 400, 600),
      'top',
      12,
      1200,
      800,
    );

    expect(style.visible).toBe(true);
    expect(style.top).toBe(92);
  });

  it('hides when the container is outside the scroll viewport', () => {
    const style = computeJsonFloatingPlacement(
      rect(40, 700, 400, 200),
      rect(40, 0, 400, 600),
      'top',
      12,
      1200,
      800,
    );

    expect(style.visible).toBe(false);
  });
});
