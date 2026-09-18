import { describe, expect, it } from 'vitest';
import {
  buildConsumerId,
  buildConsumerLabel,
  deriveConsumersFromTraffic,
  filterTrafficByConsumer,
  incrementTrafficConsumers,
  inferPlatformFromUserAgent,
  normalizeClientIp,
  registerTrafficConsumers,
  resolveRequestConsumer,
} from '../shared/consumerUtils';
import type { CapturedRequest } from '../shared/types';

describe('consumerUtils', () => {
  it('normalizes IPv6-mapped and localhost addresses', () => {
    expect(normalizeClientIp('::ffff:192.168.1.10')).toBe('192.168.1.10');
    expect(normalizeClientIp('::1')).toBe('127.0.0.1');
  });

  it('infers platform from user agent', () => {
    expect(inferPlatformFromUserAgent('okhttp/4.11.0')).toBe('android');
    expect(inferPlatformFromUserAgent('MyApp/1.0 CFNetwork/1408 Darwin/22.0.0')).toBe('ios');
    expect(inferPlatformFromUserAgent('Mozilla/5.0 Macintosh')).toBe('mac');
  });

  it('builds stable consumer ids with platform segment', () => {
    expect(buildConsumerId('127.0.0.1', 'okhttp/4.11.0', undefined, 'android')).toBe('127.0.0.1|android|okhttp');
    expect(buildConsumerId('127.0.0.1', 'okhttp/4.11.0', 'payments-app')).toBe('client:payments-app');
  });

  it('builds readable labels', () => {
    expect(buildConsumerLabel({
      clientIp: '127.0.0.1',
      userAgent: 'okhttp/4.11.0',
      platform: 'android',
    })).toBe('Android · okhttp (localhost)');

    expect(buildConsumerLabel({
      clientIp: '192.168.1.20',
      userAgent: 'MyApp/1.0 CFNetwork/1408 Darwin/22.0.0',
      platform: 'ios',
    })).toContain('iOS');
  });

  it('resolves MockForge execute requests as MockForge consumer', () => {
    const consumer = resolveRequestConsumer(
      {
        'x-mockforge-forced-execution': '1',
        'x-mockforge-request-id': 'req-123',
      },
      '127.0.0.1',
    );

    expect(consumer.consumerId).toBe('client:MockForge');
    expect(consumer.label).toBe('MockForge');
    expect(consumer.platform).toBe('mockforge');
  });

  it('resolves consumer from headers and client ip', () => {
    const consumer = resolveRequestConsumer(
      {
        'user-agent': 'okhttp/4.11.0',
        'x-mockforge-client-ip': '127.0.0.1',
      },
      '127.0.0.1',
    );

    expect(consumer.platform).toBe('android');
    expect(consumer.consumerId).toBe('127.0.0.1|android|okhttp');
    expect(consumer.label).toContain('Android');
  });

  it('keeps known consumers in session registry', () => {
    const androidReq: CapturedRequest = {
      id: '1',
      timestamp: '2026-01-01T00:00:00Z',
      method: 'GET',
      path: '/a',
      headers: {},
      consumerId: '127.0.0.1|android|okhttp',
      consumerLabel: 'Android · okhttp (localhost)',
      consumerPlatform: 'android',
    };
    const iosReq: CapturedRequest = {
      id: '2',
      timestamp: '2026-01-01T00:01:00Z',
      method: 'GET',
      path: '/b',
      headers: {},
      consumerId: '192.168.1.20|ios|CFNetwork',
      consumerLabel: 'iOS · CFNetwork · 192.168.1.20',
      consumerPlatform: 'ios',
    };

    let registry = incrementTrafficConsumers({}, [androidReq]);
    registry = incrementTrafficConsumers(registry, [iosReq]);

    expect(Object.keys(registry)).toHaveLength(2);
    expect(registry['127.0.0.1|android|okhttp'].requestCount).toBe(1);
    expect(registry['192.168.1.20|ios|CFNetwork'].requestCount).toBe(1);

    registry = incrementTrafficConsumers(registry, [androidReq]);
    expect(Object.keys(registry)).toHaveLength(2);
    expect(registry['127.0.0.1|android|okhttp'].requestCount).toBe(2);
  });

  it('registers consumers from poll updates without dropping previous devices', () => {
    const androidReq: CapturedRequest = {
      id: '1',
      timestamp: '2026-01-01T00:00:00Z',
      method: 'GET',
      path: '/a',
      headers: {},
      consumerId: '127.0.0.1|android|okhttp',
      consumerLabel: 'Android · okhttp (localhost)',
      consumerPlatform: 'android',
    };
    const iosReq: CapturedRequest = {
      id: '2',
      timestamp: '2026-01-01T00:01:00Z',
      method: 'GET',
      path: '/b',
      headers: {},
      consumerId: '192.168.1.20|ios|CFNetwork',
      consumerLabel: 'iOS · CFNetwork · 192.168.1.20',
      consumerPlatform: 'ios',
    };

    let registry = registerTrafficConsumers({}, [androidReq]);
    registry = registerTrafficConsumers(registry, [iosReq]);

    expect(Object.keys(registry)).toHaveLength(2);

    registry = registerTrafficConsumers(registry, [androidReq]);
    expect(Object.keys(registry)).toHaveLength(2);
    expect(registry['192.168.1.20|ios|CFNetwork'].label).toContain('iOS');
  });

  it('derives consumers from traffic and filters by selection', () => {
    const traffic: CapturedRequest[] = [
      {
        id: '1',
        timestamp: '2026-01-01T00:00:00Z',
        method: 'GET',
        path: '/a',
        headers: {},
        consumerId: '127.0.0.1|android|okhttp',
        consumerLabel: 'Android · okhttp (localhost)',
        consumerPlatform: 'android',
      },
      {
        id: '2',
        timestamp: '2026-01-01T00:01:00Z',
        method: 'GET',
        path: '/b',
        headers: {},
        consumerId: '192.168.1.20|ios|CFNetwork',
        consumerLabel: 'iOS · CFNetwork · 192.168.1.20',
        consumerPlatform: 'ios',
      },
    ];

    const consumers = deriveConsumersFromTraffic(traffic);
    expect(consumers).toHaveLength(2);
    expect(filterTrafficByConsumer(traffic, '127.0.0.1|android|okhttp')).toHaveLength(1);
  });
});
