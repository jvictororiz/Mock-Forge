import { describe, expect, it } from 'vitest';
import {
  createInstabilityRecord,
  createFailedConnectionRecord,
  hasTrafficInstability,
  isConnectionFailedRecord,
  isInstabilityRecord,
  INSTABILITY_EVENT_METHOD,
} from '../shared/trafficInstability';
import { dedupeTrafficRecords } from '../shared/trafficDedup';

describe('trafficInstability', () => {
  it('creates instability events with EVT method', () => {
    const record = createInstabilityRecord(
      'adb_reverse_lost',
      'Tunnel lost',
      { port: 1743 },
    );

    expect(record.recordType).toBe('instability');
    expect(record.method).toBe(INSTABILITY_EVENT_METHOD);
    expect(record.instabilityKind).toBe('adb_reverse_lost');
    expect(isInstabilityRecord(record)).toBe(true);
    expect(hasTrafficInstability(record)).toBe(true);
  });

  it('creates failed connection records', () => {
    const record = createFailedConnectionRecord({
      requestId: 'req-1',
      method: 'GET',
      path: '/overview',
      startedAt: Date.now() - 54,
      reason: 'unexpected end of stream',
    });

    expect(record.connectionFailed).toBe(true);
    expect(isConnectionFailedRecord(record)).toBe(true);
    expect(hasTrafficInstability(record)).toBe(true);
    expect(isInstabilityRecord(record)).toBe(false);
  });

  it('keeps instability events separate during dedupe', () => {
    const instability = createInstabilityRecord('adb_reverse_lost', 'lost');
    const request = createFailedConnectionRecord({
      requestId: 'req-1',
      method: 'GET',
      path: '/overview',
      startedAt: Date.now(),
      reason: 'failed',
    });

    const result = dedupeTrafficRecords([instability, request]);
    expect(result).toHaveLength(2);
  });
});
