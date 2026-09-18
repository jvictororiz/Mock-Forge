import { describe, expect, it } from 'vitest';
import {
  clamp,
  readStoredBoolean,
  readStoredNumber,
  readUserSizedWidth,
} from '../src/utils/layoutPreferences';

describe('layoutPreferences', () => {
  it('clamps values', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(20, 0, 10)).toBe(10);
  });

  it('reads stored booleans with fallback', () => {
    expect(readStoredBoolean('mockforge.missing.boolean', true)).toBe(true);
    expect(readStoredBoolean('mockforge.missing.boolean', false)).toBe(false);
  });

  it('reads stored numbers with fallback', () => {
    expect(readStoredNumber('mockforge.missing.number', 42)).toBe(42);
  });

  it('reads user-sized width bundle', () => {
    const result = readUserSizedWidth(
      'mockforge.missing.width',
      'mockforge.missing.userSized',
      380,
      300,
      560,
    );
    expect(result.width).toBe(380);
    expect(result.hasUserSized).toBe(false);
  });
});
