import { describe, it, expect } from 'vitest';
import {
  dedupeTrafficRecords,
  buildTrafficFingerprint,
  trafficSnapshotsEqual,
  capturedRequestSnapshotEqual,
  presentTrafficRecords,
  PENDING_TRAFFIC_TIMEOUT_MS,
} from '../shared/trafficDedup';
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

describe('dedupeTrafficRecords', () => {
  it('merges proxy and mockserver records by trace id', () => {
    const proxyRecord = makeRequest({
      id: '11111111-1111-4111-8111-111111111111',
      headers: { 'x-mockforge-request-id': 'trace-1' },
      mockedRequest: true,
      mockedResponse: false,
      clientIp: '10.0.0.1',
    });
    const mockServerRecord = makeRequest({
      id: 'GET:/api/items:2026-01-01T00:00:00.000Z',
      headers: { 'x-mockforge-request-id': 'trace-1' },
      mockedRequest: false,
      mockedResponse: false,
      responseStatus: 200,
    });

    const result = dedupeTrafficRecords([proxyRecord, mockServerRecord]);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(proxyRecord.id);
    expect(result[0].mockedRequest).toBe(true);
    expect(result[0].responseStatus).toBe(200);
    expect(result[0].clientIp).toBe('10.0.0.1');
  });

  it('keeps request body from proxy record when mockserver duplicate has none', () => {
    const proxyRecord = makeRequest({
      id: '11111111-1111-4111-8111-111111111111',
      headers: { 'x-mockforge-request-id': 'trace-2' },
      body: '{"session_id":"abc"}',
    });
    const mockServerRecord = makeRequest({
      id: 'POST:/api/items:2026-01-01T00:00:00.000Z',
      headers: { 'x-mockforge-request-id': 'trace-2' },
      body: '',
      responseStatus: 200,
    });

    const result = dedupeTrafficRecords([proxyRecord, mockServerRecord]);

    expect(result).toHaveLength(1);
    expect(result[0].body).toBe('{"session_id":"abc"}');
  });

  it('keeps records without trace id', () => {
    const records = [
      makeRequest({ id: 'a', path: '/one' }),
      makeRequest({ id: 'b', path: '/two' }),
    ];

    expect(dedupeTrafficRecords(records)).toHaveLength(2);
  });
});

describe('trafficSnapshotsEqual', () => {
  it('detects identical traffic snapshots', () => {
    const records = [
      makeRequest({ id: 'a', responseStatus: 200, body: '{"ok":true}' }),
      makeRequest({ id: 'b', path: '/two' }),
    ];
    const clone = records.map((record) => ({ ...record }));

    expect(trafficSnapshotsEqual(records, clone)).toBe(true);
  });

  it('detects response updates', () => {
    const before = makeRequest({ id: 'a', responseStatus: undefined });
    const after = makeRequest({ id: 'a', responseStatus: 200 });

    expect(capturedRequestSnapshotEqual(before, after)).toBe(false);
  });
});

describe('buildTrafficFingerprint', () => {
  it('changes when response status updates', () => {
    const pending = [makeRequest({ id: 'a', responseStatus: undefined })];
    const completed = [makeRequest({ id: 'a', responseStatus: 200 })];

    expect(buildTrafficFingerprint(pending)).not.toBe(buildTrafficFingerprint(completed));
  });
});

describe('presentTrafficRecords', () => {
  it('keeps an in-flight request visible and refreshes its duration', () => {
    const started = Date.parse('2026-01-01T00:00:00.000Z');
    const [record] = presentTrafficRecords([
      makeRequest({
        id: 'pending-1',
        timestamp: '2026-01-01T00:00:00.000Z',
        pending: true,
        durationMs: 0,
      }),
    ], started + 1500);

    expect(record.pending).toBe(true);
    expect(record.durationMs).toBe(1500);
    expect(record.connectionFailed).toBeUndefined();
  });

  it('marks a request that never finishes as failed', () => {
    const started = Date.parse('2026-01-01T00:00:00.000Z');
    const [record] = presentTrafficRecords([
      makeRequest({
        id: 'pending-2',
        timestamp: '2026-01-01T00:00:00.000Z',
        pending: true,
      }),
    ], started + PENDING_TRAFFIC_TIMEOUT_MS);

    expect(record.pending).toBe(false);
    expect(record.connectionFailed).toBe(true);
    expect(record.durationMs).toBe(PENDING_TRAFFIC_TIMEOUT_MS);
  });

  it('does not let a pending capture hide a completed response', () => {
    const pending = makeRequest({
      id: '11111111-1111-4111-8111-111111111111',
      headers: { 'x-mockforge-request-id': 'trace-pending' },
      pending: true,
      durationMs: 0,
    });
    const completed = makeRequest({
      id: 'GET:/api/items:2026-01-01T00:00:00.000Z',
      headers: { 'x-mockforge-request-id': 'trace-pending' },
      responseStatus: 200,
      durationMs: 40,
      body: '{"ok":true}',
    });

    const [record] = dedupeTrafficRecords([pending, completed]);

    expect(record.responseStatus).toBe(200);
    expect(record.pending).toBeUndefined();
    expect(record.durationMs).toBe(40);
    expect(record.body).toBe('{"ok":true}');
  });
});
