import { describe, expect, it } from 'vitest';
import { findJsonErrorLocations } from '../src/utils/jsonErrors';

describe('jsonErrors', () => {
  it('returns no errors for valid JSON', () => {
    expect(findJsonErrorLocations('{"ok":true}')).toEqual([]);
  });

  it('returns empty list for blank input', () => {
    expect(findJsonErrorLocations('   ')).toEqual([]);
  });

  it('locates parse errors from JSON.parse position', () => {
    const errors = findJsonErrorLocations('{"name": Alice}');

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0].line).toBeGreaterThanOrEqual(0);
    expect(errors[0].message).toBeTruthy();
  });

  it('detects unclosed brackets', () => {
    const errors = findJsonErrorLocations('{"items":[1,2}');

    expect(errors.some((error) => error.message.includes('não fechado'))).toBe(true);
  });

  it('detects unexpected closing brackets', () => {
    const errors = findJsonErrorLocations('{"items":[]}}');

    expect(errors.length).toBeGreaterThan(0);
  });
});
