import { describe, it, expect } from 'vitest';
import {
  normalizeRoute,
  getActiveResponse,
  getActiveRequestOverride,
  hasActiveRouteMocks,
  findComplementaryRouteForMock,
  findRouteForTrafficMock,
  disableRouteWithMocks,
  setRouteMockEnabled,
  syncRouteEnabledWithMocks,
  toRequestOverrideFields,
} from '../shared/routeUtils';
import type { Route } from '../shared/types';

describe('normalizeRoute', () => {
  it('migrates legacy requestOverride to requestOverrides', () => {
    const route: Route = {
      id: 'r1',
      name: 'Test',
      method: 'POST',
      path: '/api/test',
      action: 'forward_with_override',
      requestOverride: {
        body: '{"ok": true}',
        bodyMode: 'replace',
      },
    };

    const normalized = normalizeRoute(route);

    expect(normalized.requestOverride).toBeUndefined();
    expect(normalized.requestOverrides).toHaveLength(1);
    expect(normalized.requestOverrides?.[0].body).toBe('{"ok": true}');
    expect(normalized.defaultRequestOverrideId).toBe(normalized.requestOverrides?.[0].id);
  });

  it('migrates route-level matchRules to default variants', () => {
    const route: Route = {
      id: 'r1',
      name: 'Test',
      method: 'POST',
      path: '/api/test',
      action: 'mock',
      matchRules: [{ type: 'header_equals', key: 'X-Test', value: '1' }],
      responses: [{
        id: 'resp-1',
        name: 'Default',
        statusCode: 200,
        headers: {},
        body: '{}',
      }],
      defaultResponseId: 'resp-1',
      requestOverride: {
        body: '{}',
        bodyMode: 'replace',
      },
    };

    const normalized = normalizeRoute(route);

    expect(normalized.matchRules).toBeUndefined();
    expect(normalized.responses?.[0].rules).toEqual([
      { type: 'header_equals', key: 'X-Test', value: '1' },
    ]);
    expect(normalized.requestOverrides?.[0].rules).toEqual([
      { type: 'header_equals', key: 'X-Test', value: '1' },
    ]);
  });
});

describe('getActiveResponse', () => {
  it('returns default response by id', () => {
    const route: Route = {
      id: 'r1',
      name: 'Test',
      method: 'GET',
      path: '/a',
      action: 'mock',
      responses: [
        { id: 'a', name: 'A', statusCode: 200, headers: {}, body: '{}' },
        { id: 'b', name: 'B', statusCode: 404, headers: {}, body: '{}' },
      ],
      defaultResponseId: 'b',
    };

    expect(getActiveResponse(route)?.statusCode).toBe(404);
  });
});

describe('getActiveRequestOverride', () => {
  it('returns default request override by id', () => {
    const route: Route = {
      id: 'r1',
      name: 'Test',
      method: 'POST',
      path: '/a',
      action: 'forward_with_override',
      requestOverrides: [
        { id: 'a', name: 'A', body: '{"a":1}', bodyMode: 'replace' },
        { id: 'b', name: 'B', body: '{"b":1}', bodyMode: 'replace' },
      ],
      defaultRequestOverrideId: 'b',
    };

    expect(getActiveRequestOverride(route)?.body).toBe('{"b":1}');
  });
});

describe('hasActiveRouteMocks', () => {
  it('returns true when request mock is enabled', () => {
    const route: Route = {
      id: 'r1',
      name: 'Test',
      method: 'GET',
      path: '/a',
      action: 'forward_with_override',
      mockRequestEnabled: true,
      mockResponseEnabled: false,
      requestOverrides: [{
        id: 'req-1',
        name: 'Default',
        body: '{}',
        bodyMode: 'replace',
      }],
      defaultRequestOverrideId: 'req-1',
    };

    expect(hasActiveRouteMocks(route)).toBe(true);
  });

  it('returns false when both mocks are disabled', () => {
    const route: Route = {
      id: 'r1',
      name: 'Test',
      method: 'POST',
      path: '/a',
      action: 'mock',
      mockRequestEnabled: false,
      mockResponseEnabled: false,
      responses: [{
        id: 'resp-1',
        name: 'Default',
        statusCode: 200,
        headers: {},
        body: '{}',
      }],
      defaultResponseId: 'resp-1',
    };

    expect(hasActiveRouteMocks(route)).toBe(false);
  });
});

describe('syncRouteEnabledWithMocks', () => {
  const baseRoute: Route = {
    id: 'r1',
    name: 'Test',
    method: 'POST',
    path: '/a',
    action: 'mock',
    responses: [{
      id: 'resp-1',
      name: 'Default',
      statusCode: 200,
      headers: {},
      body: '{}',
    }],
    defaultResponseId: 'resp-1',
  };

  it('disables route when no mocks are active', () => {
    const route: Route = {
      ...baseRoute,
      enabled: true,
      mockRequestEnabled: false,
      mockResponseEnabled: false,
    };

    expect(syncRouteEnabledWithMocks(route).enabled).toBe(false);
  });

  it('enables route when a mock becomes active', () => {
    const route: Route = {
      ...baseRoute,
      enabled: false,
      mockResponseEnabled: true,
    };

    expect(syncRouteEnabledWithMocks(route).enabled).toBe(true);
  });
});

describe('setRouteMockEnabled', () => {
  it('enables request mock and activates the route', () => {
    const route: Route = {
      id: 'r1',
      name: 'Test',
      method: 'POST',
      path: '/a',
      action: 'mock',
      enabled: false,
      mockRequestEnabled: false,
      mockResponseEnabled: false,
    };

    const updated = setRouteMockEnabled(route, 'request', true);

    expect(updated.mockRequestEnabled).toBe(true);
    expect(updated.requestOverrides).toHaveLength(1);
    expect(updated.enabled).toBe(true);
  });

  it('enables response mock and activates the route', () => {
    const route: Route = {
      id: 'r1',
      name: 'Test',
      method: 'GET',
      path: '/a',
      action: 'mock',
      enabled: false,
      mockRequestEnabled: false,
      mockResponseEnabled: false,
    };

    const updated = setRouteMockEnabled(route, 'response', true);

    expect(updated.mockResponseEnabled).toBe(true);
    expect(updated.responses).toHaveLength(1);
    expect(updated.enabled).toBe(true);
  });

  it('disables the route when the last active mock is turned off', () => {
    const route: Route = {
      id: 'r1',
      name: 'Test',
      method: 'GET',
      path: '/a',
      action: 'mock',
      enabled: true,
      mockResponseEnabled: true,
      mockRequestEnabled: false,
      responses: [{
        id: 'resp-1',
        name: 'Default',
        statusCode: 200,
        headers: {},
        body: '{}',
      }],
      defaultResponseId: 'resp-1',
    };

    const updated = setRouteMockEnabled(route, 'response', false);

    expect(updated.mockResponseEnabled).toBe(false);
    expect(updated.enabled).toBe(false);
  });
});

describe('disableRouteWithMocks', () => {
  it('disables route and both mock toggles', () => {
    const route: Route = {
      id: 'r1',
      name: 'Test',
      method: 'GET',
      path: '/a',
      action: 'mock',
      enabled: true,
      mockRequestEnabled: true,
      mockResponseEnabled: true,
      requestOverrides: [{
        id: 'req-1',
        name: 'Default',
        body: '{}',
        bodyMode: 'replace',
      }],
      defaultRequestOverrideId: 'req-1',
      responses: [{
        id: 'resp-1',
        name: 'Default',
        statusCode: 200,
        headers: {},
        body: '{}',
      }],
      defaultResponseId: 'resp-1',
    };

    const disabled = disableRouteWithMocks(route);

    expect(disabled.enabled).toBe(false);
    expect(disabled.mockRequestEnabled).toBe(false);
    expect(disabled.mockResponseEnabled).toBe(false);
  });
});

describe('findComplementaryRouteForMock', () => {
  const responseOnly: Route = {
    id: 'resp-route',
    name: 'Items response',
    method: 'GET',
    path: '/api/items',
    action: 'mock',
    mockResponseEnabled: true,
    mockRequestEnabled: false,
    responses: [{
      id: 'resp-1',
      name: 'Default',
      statusCode: 200,
      headers: {},
      body: '{}',
    }],
    defaultResponseId: 'resp-1',
  };

  const requestOnly: Route = {
    id: 'req-route',
    name: 'Items request',
    method: 'GET',
    path: '/api/items',
    action: 'forward_with_override',
    mockResponseEnabled: false,
    mockRequestEnabled: true,
    requestOverrides: [{
      id: 'req-1',
      name: 'Default',
      body: '{"x":1}',
      bodyMode: 'merge',
      mergeFields: ['x'],
    }],
    defaultRequestOverrideId: 'req-1',
  };

  it('finds response-only route when adding request mock', () => {
    expect(findComplementaryRouteForMock([responseOnly], 'GET', '/api/items', 'request')?.id)
      .toBe('resp-route');
  });

  it('finds request-only route when adding response mock', () => {
    expect(findComplementaryRouteForMock([requestOnly], 'GET', '/api/items', 'response')?.id)
      .toBe('req-route');
  });

  it('does not treat dual-mock route as complementary', () => {
    const dual: Route = {
      ...responseOnly,
      id: 'dual',
      mockRequestEnabled: true,
      requestOverrides: requestOnly.requestOverrides,
      defaultRequestOverrideId: 'req-1',
    };
    expect(findComplementaryRouteForMock([dual], 'GET', '/api/items', 'request')).toBeUndefined();
  });
});

describe('findRouteForTrafficMock', () => {
  it('returns the route with the matching active mock kind', () => {
    const routes: Route[] = [
      {
        id: 'req-route',
        name: 'Request',
        method: 'GET',
        path: '/api/items',
        action: 'forward_with_override',
        mockResponseEnabled: false,
        mockRequestEnabled: true,
        requestOverrides: [{
          id: 'req-1',
          name: 'Default',
          body: '{}',
          bodyMode: 'replace',
        }],
        defaultRequestOverrideId: 'req-1',
      },
      {
        id: 'resp-route',
        name: 'Response',
        method: 'GET',
        path: '/api/items',
        action: 'mock',
        mockResponseEnabled: true,
        mockRequestEnabled: false,
        responses: [{
          id: 'resp-1',
          name: 'Default',
          statusCode: 200,
          headers: {},
          body: '{}',
        }],
        defaultResponseId: 'resp-1',
      },
    ];

    expect(findRouteForTrafficMock(routes, 'GET', '/api/items', 'request')?.id).toBe('req-route');
    expect(findRouteForTrafficMock(routes, 'GET', '/api/items', 'response')?.id).toBe('resp-route');
  });
});

describe('toRequestOverrideFields', () => {
  it('strips variant metadata', () => {
    const fields = toRequestOverrideFields({
      id: 'x',
      name: 'Variant',
      rules: [{ type: 'header_equals', key: 'a', value: 'b' }],
      body: '{}',
      bodyMode: 'replace',
    });

    expect(fields).toEqual({
      headers: undefined,
      body: '{}',
      headersMode: undefined,
      bodyMode: 'replace',
      mergeHeaderFields: undefined,
      mergeFields: undefined,
    });
  });
});
