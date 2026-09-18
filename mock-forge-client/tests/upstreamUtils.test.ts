import { describe, it, expect } from 'vitest';
import {
  parseUpstreamUrl,
  upstreamToUrl,
  resolveUpstream,
  prepareEnvironment,
  getUpstreamUrl,
  isUpstreamUrlValid,
  areUpstreamUrlsEqual,
  isUpstreamDirty,
} from '../shared/upstreamUtils';
import type { Environment } from '../shared/types';

describe('upstreamUtils', () => {
  it('parses host and preserves trailing slash', () => {
    const upstream = parseUpstreamUrl('https://api.example.com/');
    expect(upstream).toEqual({
      host: 'api.example.com',
      port: 443,
      scheme: 'HTTPS',
      trailingSlash: true,
    });
    expect(upstreamToUrl(upstream!)).toBe('https://api.example.com/');
  });

  it('parses base path without trailing slash', () => {
    const upstream = parseUpstreamUrl('https://api.example.com/v1');
    expect(upstream).toEqual({
      host: 'api.example.com',
      port: 443,
      scheme: 'HTTPS',
      basePath: '/v1',
    });
    expect(upstreamToUrl(upstream!)).toBe('https://api.example.com/v1');
  });

  it('preserves trailing slash on base path', () => {
    const upstream = parseUpstreamUrl('https://api.example.com/v1/');
    expect(upstream).toEqual({
      host: 'api.example.com',
      port: 443,
      scheme: 'HTTPS',
      basePath: '/v1/',
    });
    expect(upstreamToUrl(upstream!)).toBe('https://api.example.com/v1/');
    expect(areUpstreamUrlsEqual('https://api.example.com/v1/', 'https://api.example.com/v1')).toBe(false);
  });

  it('resolves upstream from stored upstreamUrl after restart', () => {
    const env: Environment = {
      id: 'test',
      name: 'Test',
      port: 1080,
      routes: [],
      upstreamUrl: 'https://api.example.com/',
      upstream: {
        host: 'api.example.com',
        port: 443,
        scheme: 'HTTPS',
      },
    };

    const prepared = prepareEnvironment(env);
    expect(prepared.upstreamUrl).toBe('https://api.example.com/');
    expect(prepared.upstream?.trailingSlash).toBe(true);
    expect(getUpstreamUrl(prepared)).toBe('https://api.example.com/');
    expect(resolveUpstream(prepared)?.trailingSlash).toBe(true);
  });

  it('migrates legacy env without upstreamUrl', () => {
    const env: Environment = {
      id: 'test',
      name: 'Test',
      port: 1080,
      routes: [],
      upstream: {
        host: 'api.example.com',
        port: 443,
        scheme: 'HTTPS',
        trailingSlash: true,
      },
    };

    const prepared = prepareEnvironment(env);
    expect(prepared.upstreamUrl).toBe('https://api.example.com/');
    expect(resolveUpstream(prepared)?.trailingSlash).toBe(true);
  });

  it('treats trailing slash URLs as valid and distinct', () => {
    expect(isUpstreamUrlValid('https://api.example.com/')).toBe(true);
    expect(areUpstreamUrlsEqual('https://api.example.com/', 'https://api.example.com/')).toBe(true);
    expect(areUpstreamUrlsEqual('https://api.example.com/', 'https://api.example.com')).toBe(false);
    expect(isUpstreamDirty('https://api.example.com/', {
      upstreamUrl: 'https://api.example.com',
    })).toBe(true);
    expect(isUpstreamDirty('https://api.example.com/', {
      upstreamUrl: 'https://api.example.com/',
    })).toBe(false);
  });
});
