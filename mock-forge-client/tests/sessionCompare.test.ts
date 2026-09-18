import { describe, expect, it } from 'vitest';
import { compareRecords, compareSessions } from '../shared/sessionCompare';
import type { TrafficSession } from '../shared/sessionTypes';
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

function makeSession(
  partial: Partial<TrafficSession> & Pick<TrafficSession, 'id' | 'name'>,
  records: CapturedRequest[],
): TrafficSession {
  return {
    environmentId: 'env-1',
    environmentName: 'staging',
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'completed',
    requestCount: records.length,
    consumerIds: [],
    platforms: [],
    ...partial,
    records,
  };
}

describe('compareRecords', () => {
  it('ignores platform noise headers when requested', () => {
    const ios = makeRequest({
      id: 'ios',
      headers: {
        'user-agent': 'MyApp/1.0 CFNetwork/1408 Darwin/22.0.0',
        authorization: 'Bearer ios-token',
      },
      body: JSON.stringify({
        amount: 99.9,
        device: { platform: 'ios' },
      }),
      responseStatus: 200,
      responseBody: JSON.stringify({ ok: true }),
      durationMs: 120,
    });

    const android = makeRequest({
      id: 'android',
      headers: {
        'user-agent': 'okhttp/4.11.0',
        authorization: 'Bearer ios-token',
      },
      body: JSON.stringify({
        amount: 99.9,
        device: { platform: 'android' },
      }),
      responseStatus: 200,
      responseBody: JSON.stringify({ ok: true }),
      durationMs: 180,
    });

    const diffs = compareRecords(ios, android, {
      ignorePlatformNoise: true,
      ignoreTiming: true,
    });

    expect(diffs.filter((diff) => !diff.ignored)).toEqual([]);
    expect(diffs.some((diff) => diff.ignored && diff.path === 'user-agent')).toBe(true);
    expect(diffs.some((diff) => diff.ignored && diff.path === '$.device.platform')).toBe(true);
  });

  it('flags response status differences as errors', () => {
    const ios = makeRequest({
      id: 'ios',
      method: 'POST',
      path: '/api/checkout',
      responseStatus: 200,
      responseBody: JSON.stringify({ orderId: 'ios-1' }),
    });
    const android = makeRequest({
      id: 'android',
      method: 'POST',
      path: '/api/checkout',
      responseStatus: 422,
      responseBody: JSON.stringify({ error: 'invalid_payment' }),
    });

    const diffs = compareRecords(ios, android);

    expect(diffs).toContainEqual({
      field: 'response.status',
      valueA: 200,
      valueB: 422,
      severity: 'error',
      ignored: false,
    });
    expect(diffs.some((diff) => diff.field === 'response.body' && diff.severity === 'warning')).toBe(true);
  });

  it('reports timing differences as informational diffs', () => {
    const ios = makeRequest({
      id: 'ios',
      path: '/api/cart',
      responseStatus: 200,
      durationMs: 45,
    });
    const android = makeRequest({
      id: 'android',
      path: '/api/cart',
      responseStatus: 200,
      durationMs: 180,
    });

    const diffs = compareRecords(ios, android);

    expect(diffs).toContainEqual({
      field: 'duration',
      valueA: 45,
      valueB: 180,
      severity: 'info',
      ignored: false,
    });
  });
});

describe('compareSessions', () => {
  it('compares iOS and Android checkout sessions with summary metrics', () => {
    const iosSession = makeSession(
      {
        id: 'session-ios',
        name: 'Checkout - iOS',
        primaryPlatform: 'ios',
        platforms: ['ios'],
        flowName: 'Checkout',
      },
      [
        makeRequest({
          id: 'ios-cart',
          method: 'GET',
          path: '/api/cart',
          consumerPlatform: 'ios',
          headers: { 'user-agent': 'CFNetwork' },
          responseStatus: 200,
          responseBody: JSON.stringify({ total: 99.9 }),
          durationMs: 45,
        }),
        makeRequest({
          id: 'ios-checkout',
          method: 'POST',
          path: '/api/checkout',
          consumerPlatform: 'ios',
          body: JSON.stringify({
            amount: 99.9,
            device: { platform: 'ios' },
            paymentToken: 'apple-pay',
          }),
          responseStatus: 200,
          responseBody: JSON.stringify({ orderId: 'ios-order' }),
        }),
        makeRequest({
          id: 'ios-only',
          method: 'GET',
          path: '/api/user/profile',
          consumerPlatform: 'ios',
          responseStatus: 200,
        }),
      ],
    );

    const androidSession = makeSession(
      {
        id: 'session-android',
        name: 'Checkout - Android',
        primaryPlatform: 'android',
        platforms: ['android'],
        flowName: 'Checkout',
      },
      [
        makeRequest({
          id: 'android-cart',
          method: 'GET',
          path: '/api/cart',
          consumerPlatform: 'android',
          headers: { 'user-agent': 'okhttp/4.11.0' },
          responseStatus: 200,
          responseBody: JSON.stringify({ total: 99.9 }),
          durationMs: 180,
        }),
        makeRequest({
          id: 'android-checkout',
          method: 'POST',
          path: '/api/checkout',
          consumerPlatform: 'android',
          body: JSON.stringify({
            amount: 99.9,
            device: { platform: 'android' },
          }),
          responseStatus: 422,
          responseBody: JSON.stringify({ error: 'missing_payment_token' }),
        }),
        makeRequest({
          id: 'android-only',
          method: 'GET',
          path: '/api/tracking/pixel',
          consumerPlatform: 'android',
          responseStatus: 200,
        }),
      ],
    );

    const comparison = compareSessions(iosSession, androidSession, {
      ignorePlatformNoise: true,
      ignoreTiming: true,
    });

    expect(comparison.sessionA).toMatchObject({
      id: 'session-ios',
      name: 'Checkout - iOS',
      platform: 'ios',
    });
    expect(comparison.sessionB).toMatchObject({
      id: 'session-android',
      name: 'Checkout - Android',
      platform: 'android',
    });

    expect(comparison.summary).toMatchObject({
      totalA: 3,
      totalB: 3,
      matched: 2,
      identical: 1,
      withDifferences: 1,
      onlyInA: 1,
      onlyInB: 1,
      statusCodeDiffs: 1,
      responseBodyDiffs: 2,
      requestBodyDiffs: 1,
    });

    const cartPair = comparison.pairs.find((pair) => pair.key === 'GET:/api/cart');
    const checkoutPair = comparison.pairs.find((pair) => pair.key === 'POST:/api/checkout');

    expect(cartPair?.status).toBe('identical');
    expect(checkoutPair?.status).toBe('different');
    expect(checkoutPair?.diffs.some((diff) => diff.field === 'response.status')).toBe(true);
    expect(checkoutPair?.diffs.some((diff) => diff.path === '$.paymentToken')).toBe(true);
    expect(checkoutPair?.diffs.some((diff) => diff.path === '$.device.platform' && diff.ignored)).toBe(true);

    expect(comparison.unmatchedA.map((record) => record.id)).toEqual(['ios-only']);
    expect(comparison.unmatchedB.map((record) => record.id)).toEqual(['android-only']);
  });

  it('keeps timing diffs when ignoreTiming is false', () => {
    const iosSession = makeSession(
      { id: 'session-ios', name: 'Cart - iOS', primaryPlatform: 'ios', platforms: ['ios'] },
      [
        makeRequest({
          id: 'ios-cart',
          path: '/api/cart',
          responseStatus: 200,
          durationMs: 40,
        }),
      ],
    );
    const androidSession = makeSession(
      { id: 'session-android', name: 'Cart - Android', primaryPlatform: 'android', platforms: ['android'] },
      [
        makeRequest({
          id: 'android-cart',
          path: '/api/cart',
          responseStatus: 200,
          durationMs: 210,
        }),
      ],
    );

    const comparison = compareSessions(iosSession, androidSession, {
      ignorePlatformNoise: true,
      ignoreTiming: false,
    });

    expect(comparison.summary.timingDiffs).toBe(1);
    expect(comparison.pairs[0]?.status).toBe('partial');
  });
});
