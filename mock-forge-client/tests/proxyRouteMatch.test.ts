import { describe, expect, it } from 'vitest';
import { shouldInterceptForMock } from '../shared/proxyRouteMatch';

describe('shouldInterceptForMock', () => {
  const routes = [
    { method: 'POST', path: '/auth/login' },
    { method: 'GET', path: '/home-bff/.*' },
  ];

  it('matches exact route method and path', () => {
    expect(shouldInterceptForMock('POST', '/auth/login', routes)).toBe(true);
  });

  it('matches regex route paths', () => {
    expect(shouldInterceptForMock('GET', '/home-bff/v2/home', routes)).toBe(true);
  });

  it('ignores non-matching methods', () => {
    expect(shouldInterceptForMock('GET', '/auth/login', routes)).toBe(false);
  });

  it('returns false when no routes are configured', () => {
    expect(shouldInterceptForMock('GET', '/home-bff/v2/home', [])).toBe(false);
  });

  it('does not intercept child paths for exact route paths', () => {
    const exactRoutes = [{ method: 'POST', path: '/smart-checkout/v2/screen/sof' }];
    expect(shouldInterceptForMock('POST', '/smart-checkout/v2/screen/sof/validate', exactRoutes)).toBe(false);
  });
});
