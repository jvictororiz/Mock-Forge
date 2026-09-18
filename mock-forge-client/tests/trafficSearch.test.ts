import { describe, expect, it } from 'vitest';
import { filterTrafficRequests } from '../src/utils/trafficSearch';
import type { CapturedRequest } from '../shared/types';

const sample: CapturedRequest[] = [
  {
    id: '1',
    timestamp: '2026-01-01T00:00:00Z',
    method: 'POST',
    path: '/smart-checkout/v2/screen/sof',
    headers: {},
    responseStatus: 200,
  },
  {
    id: '2',
    timestamp: '2026-01-01T00:01:00Z',
    method: 'GET',
    path: '/api/wallet/balance',
    headers: {},
    responseStatus: 404,
  },
];

describe('filterTrafficRequests', () => {
  it('returns all requests when query is empty', () => {
    expect(filterTrafficRequests(sample, '')).toEqual(sample);
    expect(filterTrafficRequests(sample, '   ')).toEqual(sample);
  });

  it('filters by path substring', () => {
    expect(filterTrafficRequests(sample, 'wallet')).toHaveLength(1);
    expect(filterTrafficRequests(sample, 'wallet')[0].id).toBe('2');
  });

  it('filters by method', () => {
    expect(filterTrafficRequests(sample, 'post')).toHaveLength(1);
    expect(filterTrafficRequests(sample, 'post')[0].id).toBe('1');
  });

  it('filters by status code', () => {
    expect(filterTrafficRequests(sample, '404')).toHaveLength(1);
    expect(filterTrafficRequests(sample, '404')[0].id).toBe('2');
  });

  it('filters by consumer id', () => {
    const withConsumers: CapturedRequest[] = [
      { ...sample[0], consumerId: '127.0.0.1|android|okhttp', consumerLabel: 'Android app' },
      { ...sample[1], consumerId: '192.168.1.20|ios|CFNetwork', consumerLabel: 'iOS app' },
    ];
    expect(filterTrafficRequests(withConsumers, '', '127.0.0.1|android|okhttp')).toHaveLength(1);
    expect(filterTrafficRequests(withConsumers, '', '127.0.0.1|android|okhttp')[0].id).toBe('1');
  });
});
