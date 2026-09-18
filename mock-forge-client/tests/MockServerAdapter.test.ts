import { describe, it, expect } from 'vitest';
import {
  routeToExpectation,
  expectationToRoute,
  environmentToExpectations,
  createRouteFromCapturedRequest,
  upsertRouteFromCapturedRequest,
  createFullMockRoutesFromCaptured,
  routeToExpectations,
} from '../electron/services/MockServerAdapter';
import { MOCKFORGE_REQUEST_MARKER_HEADER, MOCKFORGE_RESPONSE_MARKER_HEADER, MOCKFORGE_REQUEST_BODY_PATHS_HEADER, MOCKFORGE_REQUEST_HEADER_FIELDS_HEADER } from '../shared/mockforgeHeaders';
import { getMockedRequestPathsFromOverride } from '../shared/trafficMockPaths';
import { toMockServerPathPattern } from '../shared/routePathMatch';
import type { Environment, Route, CapturedRequest, RequestOverride } from '../shared/types';

function buildExpectedRequestMockResponseModifier(requestOverride?: RequestOverride) {
  const paths = getMockedRequestPathsFromOverride(requestOverride);
  const add: Record<string, string[]> = {
    [MOCKFORGE_REQUEST_MARKER_HEADER]: ['1'],
  };

  if (paths.mockedRequestBodyPaths?.length) {
    add[MOCKFORGE_REQUEST_BODY_PATHS_HEADER] = [JSON.stringify(paths.mockedRequestBodyPaths)];
  }
  if (paths.mockedRequestHeaderFields?.length) {
    add[MOCKFORGE_REQUEST_HEADER_FIELDS_HEADER] = [JSON.stringify(paths.mockedRequestHeaderFields)];
  }

  return {
    responseModifier: {
      headers: {
        add,
      },
    },
  };
}

describe('routeToExpectation', () => {
  it('converts mock response route', () => {
    const route: Route = {
      id: 'wallet-balance',
      name: 'Wallet Balance',
      method: 'GET',
      path: '/api/wallet/balance',
      action: 'mock',
      priority: 10,
      responses: [{
        id: 'resp-1',
        name: 'Default',
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '{"balance": 1500.00, "currency": "BRL"}',
      }],
      defaultResponseId: 'resp-1',
    };

    const exp = routeToExpectation(route);

    expect(exp.id).toBe('wallet-balance');
    expect(exp.priority).toBe(10);
    expect(exp.httpRequest).toEqual({
      method: 'GET',
      path: toMockServerPathPattern('/api/wallet/balance'),
    });
    expect(exp.httpResponse?.statusCode).toBe(200);
    expect(exp.httpResponse?.body).toEqual({ balance: 1500.0, currency: 'BRL' });
    expect(exp.httpForward).toBeUndefined();
  });

  it('uses Mustache template when response body has MockForge placeholders', () => {
    const route: Route = {
      id: 'echo',
      name: 'Echo',
      method: 'POST',
      path: '/api/echo',
      action: 'mock',
      responses: [{
        id: 'resp-1',
        name: 'Default',
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: '{"echo": "{{request.body.message}}"}',
      }],
      defaultResponseId: 'resp-1',
    };

    const exp = routeToExpectation(route);

    expect(exp.httpResponse).toBeUndefined();
    expect(exp.httpResponseTemplate?.templateType).toBe('MUSTACHE');
    const template = JSON.parse(String(exp.httpResponseTemplate?.template));
    expect(template.body.echo).toBe("{{{jsonPath request.body '$.message'}}}");
  });

  it('converts forward with override route', () => {
    const route: Route = {
      id: 'payment-override',
      name: 'Payment Override',
      method: 'POST',
      path: '/api/payment',
      action: 'forward_with_override',
      upstream: { host: 'api.example.com', port: 443, scheme: 'HTTPS' },
      requestOverride: {
        body: '{"amount": 100, "currency": "BRL"}',
        bodyMode: 'replace',
      },
    };

    const exp = routeToExpectation(route);

    expect(exp.httpForward).toBeUndefined();
    expect(exp.httpOverrideForwardedRequest).toEqual({
      requestOverride: {
        headers: { Host: ['api.example.com'] },
        socketAddress: {
          host: 'api.example.com',
          port: 443,
          scheme: 'HTTPS',
        },
        body: { amount: 100, currency: 'BRL' },
      },
      ...buildExpectedRequestMockResponseModifier(route.requestOverride),
    });
    expect(exp.httpResponse).toBeUndefined();
  });

  it('converts passthrough route', () => {
    const route: Route = {
      id: 'passthrough',
      name: 'Passthrough',
      method: 'GET',
      path: '/api/users',
      action: 'forward',
      upstream: { host: 'api.example.com', port: 80, scheme: 'HTTP' },
    };

    const exp = routeToExpectation(route);

    expect(exp.httpForward).toEqual({
      host: 'api.example.com',
      port: 80,
      scheme: 'HTTP',
    });
    expect(exp.httpResponse).toBeUndefined();
    expect(exp.httpOverrideForwardedRequest).toBeUndefined();
  });

  it('includes match rules in httpRequest', () => {
    const route: Route = {
      id: 'with-rules',
      name: 'With Rules',
      method: 'POST',
      path: '/api/test',
      action: 'mock',
      responses: [{
        id: 'r1',
        name: 'Default',
        statusCode: 200,
        headers: {},
        body: '{}',
        rules: [
          { type: 'header_equals', key: 'X-Api-Key', value: 'secret' },
          { type: 'body_field_equals', key: 'type', value: 'premium' },
        ],
      }],
      defaultResponseId: 'r1',
    };

    const exp = routeToExpectation(route);
    expect(exp.httpRequest?.headers).toEqual({ 'X-Api-Key': ['secret'] });
    expect(exp.httpRequest?.body).toEqual({
      type: 'JSON',
      json: { type: 'premium' },
      matchType: 'ONLY_MATCHING_FIELDS',
    });
  });
});

describe('expectationToRoute', () => {
  it('round-trips mock response', () => {
    const original: Route = {
      id: 'test-route',
      name: 'Test',
      method: 'GET',
      path: '/api/test',
      action: 'mock',
      responses: [{
        id: 'r1',
        name: 'Default',
        statusCode: 201,
        headers: { 'Content-Type': 'application/json' },
        body: '{"ok": true}',
      }],
      defaultResponseId: 'r1',
    };

    const exp = routeToExpectation(original);
    const converted = expectationToRoute(exp);

    expect(converted.method).toBe('GET');
    expect(converted.path).toBe('/api/test');
    expect(converted.action).toBe('mock');
    expect(converted.responses?.[0].statusCode).toBe(201);
    expect(converted.responses?.[0].body).toBe('{\n  "ok": true\n}');
  });
});

describe('environmentToExpectations', () => {
  it('converts only routes with active mocks', () => {
    const env: Environment = {
      id: 'env-1',
      name: 'Test Env',
      port: 1080,
      routes: [
        {
          id: 'r1',
          name: 'Route 1',
          method: 'GET',
          path: '/a',
          action: 'mock',
          responses: [{ id: 'resp', name: 'D', statusCode: 200, headers: {}, body: '{}' }],
          defaultResponseId: 'resp',
        },
        {
          id: 'r2',
          name: 'Route 2',
          method: 'POST',
          path: '/b',
          action: 'forward',
          upstream: { host: 'example.com', port: 443, scheme: 'HTTPS' },
        },
      ],
    };

    const expectations = environmentToExpectations(env);
    expect(expectations).toHaveLength(1);
    expect(expectations[0].httpResponse).toBeDefined();
  });

  it('does not add catch-all forward when environment upstream is set', () => {
    const env: Environment = {
      id: 'env-1',
      name: 'Test Env',
      port: 1080,
      upstream: { host: 'api.example.com', port: 443, scheme: 'HTTPS' },
      routes: [{
        id: 'r1',
        name: 'Route 1',
        method: 'GET',
        path: '/api/wallet/balance',
        action: 'mock',
        responses: [{ id: 'resp', name: 'D', statusCode: 200, headers: {}, body: '{}' }],
        defaultResponseId: 'resp',
      }],
    };

    const expectations = environmentToExpectations(env);
    expect(expectations).toHaveLength(1);
    expect(expectations.some((exp) => exp.id === 'mockforge-catch-all-forward')).toBe(false);
  });

  it('skips routes without active mocks even when enabled', () => {
    const env: Environment = {
      id: 'env-1',
      name: 'Test Env',
      port: 1080,
      upstream: { host: 'api.example.com', port: 443, scheme: 'HTTPS' },
      routes: [
        {
          id: 'broken',
          name: 'Broken forward_with_override',
          method: 'POST',
          path: '/auth/login',
          action: 'forward_with_override',
          enabled: true,
        },
        {
          id: 'valid',
          name: 'Valid mock',
          method: 'POST',
          path: '/auth/login',
          action: 'mock',
          responses: [{ id: 'resp', name: 'D', statusCode: 200, headers: {}, body: '{}' }],
          defaultResponseId: 'resp',
        },
      ],
    };

    const expectations = environmentToExpectations(env);
    expect(expectations).toHaveLength(1);
    expect(expectations.find((exp) => exp.id === 'broken-forward')).toBeUndefined();
    expect(expectations.find((exp) => exp.id === 'valid-response')?.httpResponse).toBeDefined();
  });

  it('skips disabled routes', () => {
    const env: Environment = {
      id: 'env-1',
      name: 'Test Env',
      port: 1080,
      routes: [{
        id: 'r1',
        name: 'Disabled',
        method: 'GET',
        path: '/disabled',
        action: 'mock',
        enabled: false,
        responses: [{ id: 'resp', name: 'D', statusCode: 200, headers: {}, body: '{}' }],
        defaultResponseId: 'resp',
      }],
    };

    expect(environmentToExpectations(env)).toHaveLength(0);
  });
});

describe('createRouteFromCapturedRequest', () => {
  it('creates mock response route from captured request', () => {
    const captured: CapturedRequest = {
      id: 'req-1',
      timestamp: '2026-01-01T00:00:00Z',
      method: 'GET',
      path: '/api/wallet/balance',
      headers: { 'Content-Type': 'application/json' },
      responseStatus: 200,
      responseHeaders: { 'Content-Type': 'application/json' },
      responseBody: '{"balance": 1500}',
    };

    const route = createRouteFromCapturedRequest(captured, 'response');

    expect(route.method).toBe('GET');
    expect(route.path).toBe('/api/wallet/balance');
    expect(route.mockResponseEnabled).toBe(true);
    expect(route.mockRequestEnabled).toBe(false);
    expect(route.requestOverrides?.[0].headers?.['Content-Type']).toBe('application/json');
  });

  it('creates request override route from captured request', () => {
    const captured: CapturedRequest = {
      id: 'req-1',
      timestamp: '2026-01-01T00:00:00Z',
      method: 'POST',
      path: '/api/payment',
      headers: { 'Content-Type': 'application/json', token: 'abc', 'X-Test': '1' },
      body: '{"amount": 50}',
      responseStatus: 200,
    };

    const route = createRouteFromCapturedRequest(captured, 'request');

    expect(route.mockRequestEnabled).toBe(true);
    expect(route.mockResponseEnabled).toBe(false);
    expect(route.responses?.[0].statusCode).toBe(200);
    expect(route.requestOverrides?.[0].headersMode).toBe('merge');
    expect(route.requestOverrides?.[0].mergeHeaderFields).toEqual([]);
    expect(route.requestOverrides?.[0].bodyMode).toBe('merge');
    expect(route.requestOverrides?.[0].mergeFields).toEqual([]);
    expect(route.requestOverrides?.[0].body).toContain('amount');
    expect(route.requestOverrides?.[0].headers?.['X-Test']).toBe('1');
  });

  it('merges request and response mocks on the same route', () => {
    const captured: CapturedRequest = {
      id: 'req-1',
      timestamp: '2026-01-01T00:00:00Z',
      method: 'GET',
      path: '/api/items',
      headers: { Authorization: 'Bearer token' },
      body: '',
      responseStatus: 200,
      responseBody: '{"items":[]}',
    };

    const responseRoute = createRouteFromCapturedRequest(captured, 'response');
    const merged = upsertRouteFromCapturedRequest([responseRoute], captured, 'request', responseRoute.id);

    expect(merged.id).toBe(responseRoute.id);
    expect(merged.mockResponseEnabled).toBe(true);
    expect(merged.mockRequestEnabled).toBe(true);
    expect(merged.responses?.length).toBe(1);
    expect(merged.requestOverrides?.[0].headers?.Authorization).toBe('Bearer token');
  });

  it('auto-merges complementary mocks on the same endpoint without mergeRouteId', () => {
    const captured: CapturedRequest = {
      id: 'req-1',
      timestamp: '2026-01-01T00:00:00Z',
      method: 'GET',
      path: '/api/items',
      headers: { Authorization: 'Bearer token' },
      body: '',
      responseStatus: 200,
      responseBody: '{"items":[]}',
    };

    const responseRoute = createRouteFromCapturedRequest(captured, 'response');
    const merged = upsertRouteFromCapturedRequest([responseRoute], captured, 'request');

    expect(merged.id).toBe(responseRoute.id);
    expect(merged.mockResponseEnabled).toBe(true);
    expect(merged.mockRequestEnabled).toBe(true);
  });

  it('strips internal mock marker headers from captured response headers', () => {
    const captured: CapturedRequest = {
      id: 'req-1',
      timestamp: '2026-01-01T00:00:00Z',
      method: 'GET',
      path: '/api/items',
      headers: { Authorization: 'Bearer token' },
      responseStatus: 200,
      responseHeaders: {
        'Content-Type': 'application/json',
        [MOCKFORGE_REQUEST_MARKER_HEADER]: '1',
        [MOCKFORGE_RESPONSE_MARKER_HEADER]: '1',
      },
      responseBody: '{"items":[]}',
    };

    const route = createRouteFromCapturedRequest(captured, 'response');
    const headers = route.responses?.[0].headers ?? {};

    expect(headers['Content-Type']).toBe('application/json');
    expect(headers[MOCKFORGE_REQUEST_MARKER_HEADER]).toBeUndefined();
    expect(headers[MOCKFORGE_RESPONSE_MARKER_HEADER]).toBeUndefined();
  });

  it('does not leak stored request mock markers when serving response mocks', () => {
    const route: Route = {
      id: 'route-1',
      name: 'Items',
      method: 'GET',
      path: '/api/items',
      action: 'mock',
      mockResponseEnabled: true,
      mockRequestEnabled: false,
      responses: [{
        id: 'resp-1',
        name: 'OK',
        statusCode: 200,
        headers: {
          'Content-Type': 'application/json',
          [MOCKFORGE_REQUEST_MARKER_HEADER]: '1',
        },
        body: '{"items":[]}',
      }],
      defaultResponseId: 'resp-1',
    };

    const expectations = routeToExpectations(route);
    const responseHeaders = expectations[0].httpResponse?.headers as Record<string, string[]> | undefined;

    expect(responseHeaders?.[MOCKFORGE_RESPONSE_MARKER_HEADER]).toEqual(['1']);
    expect(responseHeaders?.[MOCKFORGE_REQUEST_MARKER_HEADER]).toBeUndefined();
  });

  it('creates full mock routes for an entire recording', () => {
    const records: CapturedRequest[] = [
      {
        id: 'req-1',
        timestamp: '2026-01-01T00:00:00Z',
        method: 'GET',
        path: '/api/a',
        headers: { Authorization: 'Bearer a' },
        responseStatus: 200,
        responseBody: '{"a":1}',
      },
      {
        id: 'req-2',
        timestamp: '2026-01-01T00:00:01Z',
        method: 'POST',
        path: '/api/b',
        headers: { 'Content-Type': 'application/json' },
        body: '{"b":2}',
        responseStatus: 201,
        responseBody: '{"ok":true}',
      },
    ];

    const { added, routes } = createFullMockRoutesFromCaptured([], records);

    expect(added).toHaveLength(2);
    expect(routes).toHaveLength(2);
    for (const route of added) {
      expect(route.mockRequestEnabled).toBe(true);
      expect(route.mockResponseEnabled).toBe(true);
      expect(route.requestOverrides?.[0].headersMode).toBe('merge');
      expect(route.requestOverrides?.[0].bodyMode).toBe('merge');
    }
  });

  it('uses only the active response variant', () => {
    const route: Route = {
      id: 'route-1',
      name: 'Items',
      method: 'GET',
      path: '/api/items',
      action: 'mock',
      mockResponseEnabled: true,
      responses: [
        {
          id: 'resp-1',
          name: 'OK',
          statusCode: 200,
          headers: {},
          body: '{"status":"ok"}',
        },
        {
          id: 'resp-2',
          name: 'Error',
          statusCode: 500,
          headers: {},
          body: '{"status":"error"}',
        },
      ],
      defaultResponseId: 'resp-2',
    };

    const expectations = routeToExpectations(route);
    expect(expectations).toHaveLength(1);
    expect(expectations[0].httpResponse?.statusCode).toBe(500);
    expect(expectations[0].httpResponse?.body).toEqual({ status: 'error' });
  });

  it('uses only response expectation when route has both mocks enabled', () => {
    const route: Route = {
      id: 'route-1',
      name: 'Items',
      method: 'GET',
      path: '/api/items',
      action: 'mock',
      mockResponseEnabled: true,
      mockRequestEnabled: true,
      responses: [{
        id: 'resp-1',
        name: 'Default',
        statusCode: 200,
        headers: {},
        body: '{}',
      }],
      defaultResponseId: 'resp-1',
      requestOverrides: [{
        id: 'req-1',
        name: 'Default',
        headers: { 'X-Test': '1' },
        body: '{}',
        bodyMode: 'replace',
      }],
      defaultRequestOverrideId: 'req-1',
    };

    const expectations = routeToExpectations(route, {
      host: 'api.example.com',
      port: 443,
      scheme: 'HTTPS',
    });

    expect(expectations).toHaveLength(1);
    expect(expectations[0].httpResponse).toBeDefined();
    expect(expectations[0].httpOverrideForwardedRequest).toBeUndefined();
  });

  it('skips request forward when a sibling route mocks the response', () => {
    const requestRoute: Route = {
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
        headers: { 'X-Test': '1' },
        body: '{}',
        bodyMode: 'replace',
      }],
      defaultRequestOverrideId: 'req-1',
    };
    const responseRoute: Route = {
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
        body: '{"items":[]}',
      }],
      defaultResponseId: 'resp-1',
    };
    const upstream = { host: 'api.example.com', port: 443, scheme: 'HTTPS' as const };
    const routes = [requestRoute, responseRoute];

    const requestExpectations = routeToExpectations(requestRoute, upstream, routes);
    const responseExpectations = routeToExpectations(responseRoute, upstream, routes);
    const allExpectations = environmentToExpectations({
      id: 'env-1',
      name: 'Test',
      port: 1080,
      upstream,
      routes,
    });

    expect(requestExpectations).toHaveLength(0);
    expect(responseExpectations).toHaveLength(1);
    expect(responseExpectations[0].httpResponse?.body).toEqual({ items: [] });
    expect(allExpectations).toHaveLength(1);
    expect(allExpectations[0].id).toBe('resp-route-response');
  });

  it('builds request override expectation for captured traffic route', () => {
    const env: Environment = {
      id: 'env-1',
      name: 'Test Env',
      port: 1080,
      upstream: { host: 'gateway.svc.ppay.me', port: 443, scheme: 'HTTPS', trailingSlash: true },
      routes: [{
        id: 'route-1',
        name: 'Checkout',
        method: 'POST',
        path: '/smart-checkout/v2/screen/sof',
        action: 'forward_with_override',
        mockRequestEnabled: true,
        requestOverrides: [{
          id: 'req-1',
          name: 'Checkout',
          headers: { 'content-type': 'application/json; charset=UTF-8' },
          body: '{"session_id":"","product_type":"P2P"}',
          bodyMode: 'merge',
          mergeFields: ['session_id', 'product_type'],
          rules: [{
            type: 'header_equals',
            key: 'Content-Type',
            value: 'application/json; charset=UTF-8',
          }],
        }],
        defaultRequestOverrideId: 'req-1',
      }],
    };

    const expectations = environmentToExpectations(env);
    const requestExp = expectations.find((exp) => exp.id === 'route-1-request');
    expect(requestExp).toBeDefined();
    expect(requestExp?.httpForward).toBeUndefined();
    expect(requestExp?.httpOverrideForwardedRequest).toEqual({
      requestOverride: {
        headers: {
          Host: ['gateway.svc.ppay.me'],
          'content-type': ['application/json; charset=UTF-8'],
        },
        socketAddress: {
          host: 'gateway.svc.ppay.me',
          port: 443,
          scheme: 'HTTPS',
        },
      },
      ...buildExpectedRequestMockResponseModifier(env.routes[0].requestOverrides?.[0]),
    });
  });

  it('forwards to upstream when response mock is disabled but responses are saved', () => {
    const route: Route = {
      id: 'route-1',
      name: 'Checkout',
      method: 'POST',
      path: '/smart-checkout/v2/screen/sof',
      action: 'mock',
      mockResponseEnabled: false,
      mockRequestEnabled: false,
      responses: [{
        id: 'resp-1',
        name: 'Default',
        statusCode: 200,
        headers: {},
        body: '{"mocked":true}',
      }],
      defaultResponseId: 'resp-1',
    };

    const expectations = routeToExpectations(route, {
      host: 'gateway.svc.ppay.me',
      port: 443,
      scheme: 'HTTPS',
    });

    expect(expectations).toHaveLength(1);
    expect(expectations[0].id).toBe('route-1-forward');
    expect(expectations[0].httpResponse).toBeUndefined();
    expect(expectations[0].httpForward).toEqual({
      host: 'gateway.svc.ppay.me',
      port: 443,
      scheme: 'HTTPS',
    });
  });

  it('merges only selected request headers when headersMode is merge', () => {
    const env: Environment = {
      id: 'env-1',
      name: 'Test Env',
      port: 1080,
      upstream: { host: 'gateway.svc.ppay.me', port: 443, scheme: 'HTTPS' },
      routes: [{
        id: 'route-1',
        name: 'Auth',
        method: 'POST',
        path: '/auth/login',
        action: 'forward_with_override',
        mockRequestEnabled: true,
        requestOverrides: [{
          id: 'req-1',
          name: 'Auth',
          headersMode: 'merge',
          mergeHeaderFields: ['token'],
          headers: {
            token: 'override-token',
            'user-agent': 'okhttp/4.11.0',
          },
          body: '',
          bodyMode: 'replace',
        }],
        defaultRequestOverrideId: 'req-1',
      }],
    };

    const expectations = environmentToExpectations(env);
    const requestExp = expectations.find((exp) => exp.id === 'route-1-request');
    expect(requestExp?.httpOverrideForwardedRequest).toEqual({
      requestOverride: {
        headers: {
          Host: ['gateway.svc.ppay.me'],
          token: ['override-token'],
        },
        socketAddress: {
          host: 'gateway.svc.ppay.me',
          port: 443,
          scheme: 'HTTPS',
        },
      },
      ...buildExpectedRequestMockResponseModifier(env.routes[0].requestOverrides?.[0]),
    });
  });
});
