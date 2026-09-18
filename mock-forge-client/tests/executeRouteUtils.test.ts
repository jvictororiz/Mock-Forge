import { describe, expect, it } from 'vitest';
import {
  buildExecuteRequestPayload,
  environmentForRouteExecution,
} from '../shared/executeRouteUtils';
import type { Environment, Route } from '../shared/types';
import {
  MOCKFORGE_FORCED_EXECUTION_HEADER,
  MOCKFORGE_REQUEST_ID_HEADER,
} from '../shared/mockforgeHeaders';

const baseRoute: Route = {
  id: 'route-1',
  name: 'Example',
  method: 'POST',
  path: '/api/example',
  action: 'mock',
  mockResponseEnabled: true,
  mockRequestEnabled: true,
  requestOverrides: [{
    id: 'req-1',
    name: 'Default',
    headers: { 'X-Custom': 'test' },
    headersMode: 'replace',
    body: '{"foo":"bar"}',
    bodyMode: 'replace',
    mergeFields: [],
    mergeHeaderFields: [],
    rules: [],
  }],
  defaultRequestOverrideId: 'req-1',
  responses: [{
    id: 'res-1',
    name: 'Default',
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    rules: [],
  }],
  defaultResponseId: 'res-1',
};

describe('buildExecuteRequestPayload', () => {
  it('uses exact mock request headers and body', () => {
    const payload = buildExecuteRequestPayload(baseRoute, 'trace-123');

    expect(payload.method).toBe('POST');
    expect(payload.path).toBe('/api/example');
    expect(payload.headers[MOCKFORGE_FORCED_EXECUTION_HEADER]).toBe('1');
    expect(payload.headers[MOCKFORGE_REQUEST_ID_HEADER]).toBe('trace-123');
    expect(payload.headers['X-Custom']).toBe('test');
    expect(payload.headers['User-Agent']).toBeUndefined();
    expect(payload.headers.Accept).toBeUndefined();
    expect(payload.body).toBe('{"foo":"bar"}');
    expect(payload.headers['Content-Type']).toBeUndefined();
  });

  it('omits body for GET routes without request override body', () => {
    const route: Route = {
      ...baseRoute,
      method: 'GET',
      mockRequestEnabled: false,
      requestOverrides: [{
        ...baseRoute.requestOverrides![0],
        body: '',
      }],
    };

    const payload = buildExecuteRequestPayload(route, 'trace-456');
    expect(payload.body).toBeUndefined();
  });

  it('uses request variant even when mock request toggle is off', () => {
    const route: Route = {
      ...baseRoute,
      mockRequestEnabled: false,
      mockResponseEnabled: true,
    };

    const payload = buildExecuteRequestPayload(route, 'trace-789');
    expect(payload.headers['X-Custom']).toBe('test');
    expect(payload.body).toBe('{"foo":"bar"}');
  });
});

describe('environmentForRouteExecution', () => {
  it('temporarily enables the target route', () => {
    const env: Environment = {
      id: 'env-1',
      name: 'Default',
      port: 1080,
      routes: [
        { ...baseRoute, enabled: false },
        {
          ...baseRoute,
          id: 'route-2',
          enabled: true,
        },
      ],
    };

    const executionEnv = environmentForRouteExecution(env, 'route-1');
    expect(executionEnv.routes[0].enabled).toBe(true);
    expect(executionEnv.routes[1].enabled).toBe(true);
  });
});
