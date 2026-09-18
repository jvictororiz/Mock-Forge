import { describe, expect, it } from 'vitest';
import {
  buildMatchKey,
  groupRecordsByKey,
  normalizePath,
  pairSessions,
} from '../shared/sessionMatch';
import type { CapturedRequest } from '../shared/types';

function makeRequest(partial: Partial<CapturedRequest> & Pick<CapturedRequest, 'id'>): CapturedRequest {
  return {
    timestamp: '2026-01-01T00:00:00.000Z',
    method: 'GET',
    path: '/api/items',
    headers: {},
    body: '',
    ...partial,
  };
}

describe('normalizePath', () => {
  it('sorts query parameters for stable matching', () => {
    expect(normalizePath('/api/cart?z=1&a=2')).toBe('/api/cart?a=2&z=1');
    expect(normalizePath('/api/cart')).toBe('/api/cart');
  });
});

describe('buildMatchKey', () => {
  it('builds method and normalized path keys', () => {
    const record = makeRequest({
      id: 'ios-1',
      method: 'POST',
      path: '/api/checkout?flow=main&step=1',
    });

    expect(buildMatchKey(record)).toBe('POST:/api/checkout?flow=main&step=1');
  });
});

describe('groupRecordsByKey', () => {
  it('groups repeated endpoints by occurrence order', () => {
    const records = [
      makeRequest({ id: 'a1', method: 'POST', path: '/api/events' }),
      makeRequest({ id: 'a2', method: 'GET', path: '/api/cart' }),
      makeRequest({ id: 'a3', method: 'POST', path: '/api/events' }),
    ];

    const groups = groupRecordsByKey(records);

    expect(groups.get('POST:/api/events')?.map((record) => record.id)).toEqual(['a1', 'a3']);
    expect(groups.get('GET:/api/cart')?.map((record) => record.id)).toEqual(['a2']);
  });
});

describe('pairSessions', () => {
  it('pairs iOS and Android checkout flows by endpoint and occurrence index', () => {
    const iosRecords = [
      makeRequest({
        id: 'ios-cart',
        method: 'GET',
        path: '/api/cart?fields=total&include=summary',
        consumerPlatform: 'ios',
      }),
      makeRequest({
        id: 'ios-checkout',
        method: 'POST',
        path: '/api/checkout',
        consumerPlatform: 'ios',
      }),
      makeRequest({
        id: 'ios-event-1',
        method: 'POST',
        path: '/api/events',
        consumerPlatform: 'ios',
      }),
      makeRequest({
        id: 'ios-event-2',
        method: 'POST',
        path: '/api/events',
        consumerPlatform: 'ios',
      }),
    ];

    const androidRecords = [
      makeRequest({
        id: 'android-cart',
        method: 'GET',
        path: '/api/cart?include=summary&fields=total',
        consumerPlatform: 'android',
      }),
      makeRequest({
        id: 'android-checkout',
        method: 'POST',
        path: '/api/checkout',
        consumerPlatform: 'android',
      }),
      makeRequest({
        id: 'android-event-1',
        method: 'POST',
        path: '/api/events',
        consumerPlatform: 'android',
      }),
      makeRequest({
        id: 'android-tracking',
        method: 'GET',
        path: '/api/tracking/pixel',
        consumerPlatform: 'android',
      }),
    ];

    const { pairs, unmatchedA, unmatchedB } = pairSessions(iosRecords, androidRecords);

    expect(pairs).toHaveLength(3);
    expect(pairs[0]).toMatchObject({
      key: 'GET:/api/cart?fields=total&include=summary',
      recordA: { id: 'ios-cart' },
      recordB: { id: 'android-cart' },
    });
    expect(pairs[1]).toMatchObject({
      key: 'POST:/api/checkout',
      recordA: { id: 'ios-checkout' },
      recordB: { id: 'android-checkout' },
    });
    expect(pairs[2]).toMatchObject({
      key: 'POST:/api/events',
      recordA: { id: 'ios-event-1' },
      recordB: { id: 'android-event-1' },
    });

    expect(unmatchedA.map((record) => record.id)).toEqual(['ios-event-2']);
    expect(unmatchedB.map((record) => record.id)).toEqual(['android-tracking']);
  });
});
