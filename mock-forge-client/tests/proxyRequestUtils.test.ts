import { describe, expect, it } from 'vitest';
import {
  rewriteProxyRequest,
  sanitizeForwardHeaders,
  shouldForwardRequestBody,
  joinUpstreamPath,
} from '../shared/proxyRequestUtils';

describe('sanitizeForwardHeaders', () => {
  it('removes content-length and transfer-encoding from GET', () => {
    const headers = {
      host: 'localhost:1080',
      'content-length': '0',
      'transfer-encoding': 'chunked',
      token: 'abc',
    };

    sanitizeForwardHeaders('GET', headers);

    expect(headers['content-length']).toBeUndefined();
    expect(headers['transfer-encoding']).toBeUndefined();
    expect(headers.token).toBe('abc');
  });

  it('keeps content-length on POST', () => {
    const headers = { 'content-length': '42' };
    sanitizeForwardHeaders('POST', headers);
    expect(headers['content-length']).toBe('42');
  });
});

describe('rewriteProxyRequest', () => {
  it('rewrites host and strips bodyless headers', () => {
    const { headers, path } = rewriteProxyRequest(
      {
        method: 'GET',
        url: '/home-bff/v2/home',
        headers: {
          host: 'localhost:1080',
          'content-length': '0',
        },
      },
      'gateway.svc.ppay.me',
      '',
    );

    expect(path).toBe('/home-bff/v2/home');
    expect(headers.host).toBe('gateway.svc.ppay.me');
    expect(headers['content-length']).toBeUndefined();
    expect(headers['accept-encoding']).toBeUndefined();
  });

  it('does not rewrite mockserver control paths', () => {
    const { headers, path } = rewriteProxyRequest(
      {
        method: 'PUT',
        url: '/mockserver/expectation',
        headers: { host: 'localhost:1080' },
      },
      'gateway.svc.ppay.me',
      '',
    );

    expect(path).toBe('/mockserver/expectation');
    expect(headers.host).toBe('localhost:1080');
  });

  it('strips internal mockforge headers before upstream rewrite', () => {
    const { headers, path } = rewriteProxyRequest(
      {
        method: 'GET',
        url: '/payment-methods/v1/methods',
        headers: {
          host: 'localhost:1080',
          token: 'abc',
          'x-mockforge-request-id': 'trace-1',
          'x-mockforge-forced-execution': '1',
        },
      },
      'gateway.svc.ppay.me',
      '',
    );

    expect(path).toBe('/payment-methods/v1/methods');
    expect(headers.host).toBe('gateway.svc.ppay.me');
    expect(headers.token).toBe('abc');
    expect(headers['x-mockforge-request-id']).toBeUndefined();
    expect(headers['x-mockforge-forced-execution']).toBeUndefined();
  });
});

describe('shouldForwardRequestBody', () => {
  it('returns false for GET and HEAD', () => {
    expect(shouldForwardRequestBody('GET')).toBe(false);
    expect(shouldForwardRequestBody('HEAD')).toBe(false);
  });

  it('returns true for POST', () => {
    expect(shouldForwardRequestBody('POST')).toBe(true);
  });
});
