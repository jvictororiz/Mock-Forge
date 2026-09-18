import { describe, it, expect } from 'vitest';
import { findDuplicateEnabledRouteIds } from '../src/utils/routeActions';
import type { Route } from '../shared/types';

function makeResponseRoute(id: string, path: string): Route {
  return {
    id,
    name: `Response ${id}`,
    method: 'GET',
    path,
    action: 'mock',
    mockResponseEnabled: true,
    mockRequestEnabled: false,
    responses: [{
      id: `resp-${id}`,
      name: 'Default',
      statusCode: 200,
      headers: {},
      body: '{}',
    }],
    defaultResponseId: `resp-${id}`,
  };
}

function makeRequestRoute(id: string, path: string): Route {
  return {
    id,
    name: `Request ${id}`,
    method: 'GET',
    path,
    action: 'forward_with_override',
    mockResponseEnabled: false,
    mockRequestEnabled: true,
    requestOverrides: [{
      id: `req-${id}`,
      name: 'Default',
      body: '{}',
      bodyMode: 'replace',
    }],
    defaultRequestOverrideId: `req-${id}`,
  };
}

describe('findDuplicateEnabledRouteIds', () => {
  it('does not flag complementary request and response routes on the same endpoint', () => {
    const routes = [
      makeRequestRoute('req-1', '/api/items'),
      makeResponseRoute('resp-1', '/api/items'),
    ];

    expect(findDuplicateEnabledRouteIds(routes).size).toBe(0);
  });

  it('flags duplicate response mocks on the same endpoint', () => {
    const routes = [
      makeResponseRoute('resp-1', '/api/items'),
      makeResponseRoute('resp-2', '/api/items'),
    ];

    const duplicates = findDuplicateEnabledRouteIds(routes);
    expect(duplicates.has('resp-1')).toBe(true);
    expect(duplicates.has('resp-2')).toBe(true);
  });

  it('flags duplicate request mocks on the same endpoint', () => {
    const routes = [
      makeRequestRoute('req-1', '/api/items'),
      makeRequestRoute('req-2', '/api/items'),
    ];

    const duplicates = findDuplicateEnabledRouteIds(routes);
    expect(duplicates.has('req-1')).toBe(true);
    expect(duplicates.has('req-2')).toBe(true);
  });

  it('ignores disabled routes', () => {
    const routes = [
      { ...makeResponseRoute('resp-1', '/api/items'), enabled: false },
      makeResponseRoute('resp-2', '/api/items'),
    ];

    expect(findDuplicateEnabledRouteIds(routes).size).toBe(0);
  });
});
