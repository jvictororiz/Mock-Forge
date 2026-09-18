import { appendFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import type { CapturedRequest, InstabilityKind } from '../../shared/types';
import type {
  InstabilityExportBundle,
  InstabilityLogCategory,
  InstabilityLogEntry,
  InstabilityServerSnapshot,
} from '../../shared/instabilityLogTypes';
import { hasTrafficInstability, isInstabilityRecord } from '../../shared/trafficInstability';

const MAX_ENTRIES = 500;
const CORRELATION_WINDOW_MS = 90_000;

const MITIGATIONS_ACTIVE = [
  'adb-poll-1s',
  'adb-proactive-reverse-refresh-5s',
  'adb-track-devices',
  'proxy-graceful-shutdown',
  'mockserver-connection-retry',
  'response-drain-before-close',
];

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

function diagnosisForRecord(record: CapturedRequest): InstabilityExportBundle['diagnosis'] {
  const kind = record.instabilityKind;

  if (kind === 'adb_reverse_lost') {
    return {
      summary: 'ADB reverse tunnel was lost',
      likelyCause: 'USB/Wi-Fi ADB connection dropped briefly. Mobile requests to localhost failed until the tunnel was restored.',
      userImpact: 'Mobile may show CONNECTION_ERROR or unexpected end of stream. Traffic may not appear in MockForge.',
      mitigationsActive: MITIGATIONS_ACTIVE,
      recommendations: [
        'Keep USB cable stable or use a reliable Wi-Fi ADB connection.',
        'If the issue persists, reconnect the device in MockForge Settings.',
        'Share this export with the MockForge team for investigation.',
      ],
    };
  }

  if (kind === 'adb_reverse_restore_failed') {
    return {
      summary: 'Failed to restore ADB reverse tunnel',
      likelyCause: 'ADB could not re-establish tcp reverse after a drop.',
      userImpact: 'Mobile requests fail until the tunnel is manually restored.',
      mitigationsActive: MITIGATIONS_ACTIVE,
      recommendations: [
        'Reconnect the device via USB or Wi-Fi ADB.',
        'Run adb kill-server && adb start-server if needed.',
      ],
    };
  }

  if (kind === 'adb_no_device') {
    return {
      summary: 'No Android device connected',
      likelyCause: 'Device disconnected while the server was running.',
      userImpact: 'Mobile localhost proxy URL stops working.',
      mitigationsActive: MITIGATIONS_ACTIVE,
      recommendations: ['Reconnect the device and verify ADB reverse in Settings.'],
    };
  }

  if (record.clientInstability) {
    return {
      summary: 'Client disconnected during response',
      likelyCause: 'The mobile client closed the connection before receiving the full HTTP response. Often caused by ADB tunnel instability or the app aborting the request.',
      userImpact: 'Mobile shows unexpected end of stream. MockForge may show a 2xx response that the device never received.',
      mitigationsActive: MITIGATIONS_ACTIVE,
      recommendations: [
        'Retry the request on mobile — transient issues usually resolve on the next attempt.',
        'Check USB/Wi-Fi stability if this happens frequently.',
        'Share this export for deeper investigation.',
      ],
    };
  }

  if (record.connectionFailed) {
    return {
      summary: 'Connection failed before a complete response',
      likelyCause: 'Proxy or MockServer closed the connection before sending a full HTTP response.',
      userImpact: 'Mobile shows CONNECTION_ERROR. Request may appear as failed in MockForge traffic.',
      mitigationsActive: MITIGATIONS_ACTIVE,
      recommendations: [
        'Verify MockForge server is running and the device tunnel is active.',
        'Retry the request.',
      ],
    };
  }

  return {
    summary: 'Connection instability detected',
    likelyCause: 'Transient network or tunnel issue between mobile and MockForge.',
    userImpact: 'Request may fail on mobile without appearing normally in traffic.',
    mitigationsActive: MITIGATIONS_ACTIVE,
    recommendations: ['Retry the request and export logs if it keeps happening.'],
  };
}

export class InstabilityLogService {
  private entries: InstabilityLogEntry[] = [];
  private logFilePath: string | null = null;

  setLogDirectory(dir: string): void {
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    this.logFilePath = join(dir, 'instability.log');
  }

  append(
    category: InstabilityLogCategory,
    kind: InstabilityKind | string,
    message: string,
    options?: {
      correlationId?: string;
      details?: Record<string, unknown>;
    },
  ): InstabilityLogEntry {
    const entry: InstabilityLogEntry = {
      id: generateId(),
      timestamp: new Date().toISOString(),
      category,
      kind,
      message,
      correlationId: options?.correlationId,
      details: options?.details,
    };

    this.entries.unshift(entry);
    if (this.entries.length > MAX_ENTRIES) {
      this.entries.length = MAX_ENTRIES;
    }

    const line = `${entry.timestamp} [${entry.category}] ${entry.kind} ${entry.message}${entry.correlationId ? ` correlation=${entry.correlationId}` : ''}${entry.details ? ` ${JSON.stringify(entry.details)}` : ''}\n`;
    console.warn(`[MockForge instability] ${line.trim()}`);

    if (this.logFilePath) {
      try {
        appendFileSync(this.logFilePath, line, 'utf8');
      } catch {
        // ignore file write errors
      }
    }

    return entry;
  }

  appendFromTrafficRecord(
    record: CapturedRequest,
    snapshot: InstabilityServerSnapshot,
  ): void {
    if (!hasTrafficInstability(record)) return;

    const kind = record.instabilityKind
      ?? (isInstabilityRecord(record) ? 'instability_event' : 'connection_issue');

    this.append(
      isInstabilityRecord(record) ? 'system' : 'request',
      kind,
      record.instabilityMessage || `Traffic instability: ${record.method} ${record.path}`,
      {
        correlationId: record.id,
        details: {
          method: record.method,
          path: record.path,
          responseStatus: record.responseStatus,
          durationMs: record.durationMs,
          connectionFailed: record.connectionFailed,
          clientInstability: record.clientInstability,
          clientIp: record.clientIp,
          userAgent: record.userAgent,
          serverSnapshot: snapshot,
        },
      },
    );
  }

  getEntriesForRecord(
    record: CapturedRequest,
  ): InstabilityLogEntry[] {
    const recordTime = Date.parse(record.timestamp);
    const traceId = record.headers?.['x-mockforge-request-id']
      ?? record.headers?.['X-MockForge-Request-Id'];

    return this.entries.filter((entry) => {
      if (entry.correlationId === record.id) return true;
      if (traceId && entry.correlationId === traceId) return true;
      if (!Number.isFinite(recordTime)) return false;
      const entryTime = Date.parse(entry.timestamp);
      if (!Number.isFinite(entryTime)) return false;
      if (Math.abs(entryTime - recordTime) > CORRELATION_WINDOW_MS) return false;

      const path = entry.details?.path;
      if (typeof path === 'string' && path === record.path) return true;

      return entry.category === 'adb' && hasTrafficInstability(record);
    });
  }

  buildExportBundle(
    record: CapturedRequest,
    allTraffic: CapturedRequest[],
    snapshot: InstabilityServerSnapshot,
    meta: { version: string; platform: string },
  ): InstabilityExportBundle {
    const recordTime = Date.parse(record.timestamp);
    const relatedTraffic = allTraffic.filter((item) => {
      if (item.id === record.id) return false;
      const itemTime = Date.parse(item.timestamp);
      if (!Number.isFinite(recordTime) || !Number.isFinite(itemTime)) return false;
      return Math.abs(itemTime - recordTime) <= CORRELATION_WINDOW_MS;
    });

    return {
      exportedAt: new Date().toISOString(),
      mockforgeVersion: meta.version,
      platform: meta.platform,
      trafficRecord: record,
      serverSnapshot: snapshot,
      logEntries: this.getEntriesForRecord(record),
      relatedTraffic,
      diagnosis: diagnosisForRecord(record),
    };
  }
}

export const instabilityLog = new InstabilityLogService();
