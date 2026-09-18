import { describe, expect, it } from 'vitest';
import type { CapturedRequest, Route } from '../shared/types';
import {
  buildCurlCommand,
  capturedRequestToCurl,
  resolveRequestUrl,
  routeToCurl,
} from '../shared/curlUtils';

describe('resolveRequestUrl', () => {
  it('keeps absolute URLs unchanged', () => {
    expect(resolveRequestUrl('https://api.example.com/v1', {})).toBe('https://api.example.com/v1');
  });

  it('builds URL from Host header', () => {
    expect(resolveRequestUrl('/api/items', { Host: 'api.example.com' }))
      .toBe('https://api.example.com/api/items');
  });

  it('uses baseUrl when Host is missing', () => {
    expect(resolveRequestUrl('/api/items', {}, 'http://localhost:1080'))
      .toBe('http://localhost:1080/api/items');
  });
});

describe('buildCurlCommand', () => {
  it('builds a POST curl with headers and body', () => {
    const command = buildCurlCommand({
      method: 'POST',
      path: '/api/pay',
      headers: {
        Host: 'localhost:1080',
        'Content-Type': 'application/json',
        Authorization: 'Bearer token',
      },
      body: '{"amount":10}',
      baseUrl: 'http://localhost:1080',
    });

    expect(command).toContain("curl -X POST");
    expect(command).toContain("'http://localhost:1080/api/pay'");
    expect(command).toContain("'Content-Type: application/json'");
    expect(command).toContain("'Authorization: Bearer token'");
    expect(command).toContain("-d '{\"amount\":10}'");
    expect(command).not.toContain('Host:');
  });

  it('skips internal mockforge headers', () => {
    const command = buildCurlCommand({
      method: 'GET',
      path: '/api/items',
      headers: {
        'x-mockforge-request-id': 'abc',
        'X-Test': '1',
      },
      baseUrl: 'http://localhost:1080',
    });

    expect(command).not.toContain('x-mockforge');
    expect(command).toContain("'X-Test: 1'");
  });
});

describe('capturedRequestToCurl', () => {
  it('converts captured request to curl', () => {
    const captured: CapturedRequest = {
      id: '1',
      timestamp: '2026-01-01T00:00:00Z',
      method: 'GET',
      path: '/api/balance',
      headers: { Authorization: 'Bearer x' },
    };

    const command = capturedRequestToCurl(captured, 'http://localhost:1080');
    expect(command).toContain("curl -X GET 'http://localhost:1080/api/balance'");
  });
});

describe('routeToCurl', () => {
  it('converts route request override to curl', () => {
    const route: Route = {
      id: 'route-1',
      name: 'Pay',
      method: 'POST',
      path: '/api/pay',
      action: 'forward_with_override',
      mockRequestEnabled: true,
      requestOverrides: [{
        id: 'req-1',
        name: 'Default',
        headers: { 'Content-Type': 'application/json' },
        headersMode: 'merge',
        body: '{"amount": 50}',
        bodyMode: 'replace',
        mergeFields: [],
        mergeHeaderFields: [],
      }],
      defaultRequestOverrideId: 'req-1',
    };

    const command = routeToCurl(route, 'http://localhost:1080');
    expect(command).toContain("curl -X POST 'http://localhost:1080/api/pay'");
    expect(command).toContain("'Content-Type: application/json'");
    expect(command).toContain('{"amount": 50}');
  });
});
