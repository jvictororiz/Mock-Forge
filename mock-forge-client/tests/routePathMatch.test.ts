import { describe, expect, it } from 'vitest';
import {
  fromMockServerPathPattern,
  isRegexRoutePath,
  matchesRoutePath,
  toMockServerPathPattern,
} from '../shared/routePathMatch';

describe('isRegexRoutePath', () => {
  it('treats plain API paths as exact', () => {
    expect(isRegexRoutePath('/smart-checkout/v2/screen/sof')).toBe(false);
    expect(isRegexRoutePath('/auth/login')).toBe(false);
  });

  it('detects intentional regex paths', () => {
    expect(isRegexRoutePath('/home-bff/.*')).toBe(true);
    expect(isRegexRoutePath('^/api/exact$')).toBe(true);
    expect(isRegexRoutePath('/teste/[^/]+/algumacoisa')).toBe(true);
  });
});

describe('matchesRoutePath', () => {
  it('matches exact paths only', () => {
    expect(matchesRoutePath('/smart-checkout/v2/screen/sof', '/smart-checkout/v2/screen/sof')).toBe(true);
    expect(matchesRoutePath('/smart-checkout/v2/screen/sof', '/smart-checkout/v2/screen/sof/validate')).toBe(false);
  });

  it('does not treat sibling endpoints as the same mock', () => {
    expect(matchesRoutePath('/teste/param1/algumacoisa', '/teste/param2/algumacoisa')).toBe(false);
  });

  it('still supports regex route paths', () => {
    expect(matchesRoutePath('/home-bff/.*', '/home-bff/v2/home')).toBe(true);
    expect(matchesRoutePath('/teste/[^/]+/algumacoisa', '/teste/param1/algumacoisa')).toBe(true);
    expect(matchesRoutePath('/teste/[^/]+/algumacoisa', '/teste/param1/outra')).toBe(false);
  });
});

describe('toMockServerPathPattern', () => {
  it('anchors literal paths for MockServer', () => {
    expect(toMockServerPathPattern('/api/wallet/balance')).toBe('^/api/wallet/balance$');
  });

  it('preserves regex paths', () => {
    expect(toMockServerPathPattern('/home-bff/.*')).toBe('/home-bff/.*');
  });
});

describe('fromMockServerPathPattern', () => {
  it('restores anchored literal paths', () => {
    expect(fromMockServerPathPattern('^/api/wallet/balance$')).toBe('/api/wallet/balance');
  });

  it('preserves regex paths', () => {
    expect(fromMockServerPathPattern('/home-bff/.*')).toBe('/home-bff/.*');
    expect(fromMockServerPathPattern('^/home-bff/.*/sub$')).toBe('^/home-bff/.*/sub$');
  });
});
