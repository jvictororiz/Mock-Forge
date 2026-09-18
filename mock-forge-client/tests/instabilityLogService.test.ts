import { describe, expect, it } from 'vitest';
import { InstabilityLogService } from '../electron/services/InstabilityLogService';
import { createFailedConnectionRecord } from '../shared/trafficInstability';

describe('InstabilityLogService', () => {
  it('builds export bundle with correlated entries', () => {
    const service = new InstabilityLogService();
    const record = createFailedConnectionRecord({
      requestId: 'req-1',
      method: 'GET',
      path: '/overview',
      startedAt: Date.now() - 54,
      reason: 'unexpected end of stream',
    });

    service.append('adb', 'adb_reverse_lost', 'Tunnel lost', {
      correlationId: record.id,
      details: { port: 1080 },
    });

    const bundle = service.buildExportBundle(
      record,
      [record],
      {
        running: true,
        port: 1080,
        healthy: true,
        proxyRequestCount: 12,
        proxyActiveConnections: 0,
        adbReverseActive: true,
        adbDevices: [],
        activeAdbDevice: null,
        deviceBaseUrl: 'http://localhost:1080',
        lastError: null,
      },
      { version: '0.7.3', platform: 'darwin' },
    );

    expect(bundle.trafficRecord.id).toBe('req-1');
    expect(bundle.logEntries.length).toBeGreaterThan(0);
    expect(bundle.diagnosis.summary).toContain('Connection failed');
  });
});
