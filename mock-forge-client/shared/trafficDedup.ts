import type { CapturedRequest } from './types';
import { isInstabilityRecord } from './trafficInstability';

function getTraceId(request: CapturedRequest): string | undefined {
  return request.headers['x-mockforge-request-id']
    || request.headers['X-MockForge-Request-Id'];
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function mergeTrafficRecords(primary: CapturedRequest, secondary: CapturedRequest): CapturedRequest {
  const preferPrimary = isUuid(primary.id) && !isUuid(secondary.id);
  const base = preferPrimary ? { ...secondary, ...primary } : { ...primary, ...secondary };

  return {
    ...base,
    id: preferPrimary ? primary.id : (isUuid(secondary.id) ? secondary.id : primary.id),
    body: primary.body || secondary.body,
    headers: {
      ...secondary.headers,
      ...primary.headers,
    },
    mockedRequest: !!(primary.mockedRequest || secondary.mockedRequest),
    mockedResponse: !!(primary.mockedResponse || secondary.mockedResponse),
    mockedRequestBodyPaths: primary.mockedRequestBodyPaths ?? secondary.mockedRequestBodyPaths,
    mockedRequestHeaderFields: primary.mockedRequestHeaderFields ?? secondary.mockedRequestHeaderFields,
    forcedExecution: !!(primary.forcedExecution || secondary.forcedExecution),
    connectionFailed: !!(primary.connectionFailed || secondary.connectionFailed),
    clientInstability: !!(primary.clientInstability || secondary.clientInstability),
    instabilityKind: primary.instabilityKind ?? secondary.instabilityKind,
    instabilityMessage: primary.instabilityMessage ?? secondary.instabilityMessage,
    recordType: primary.recordType ?? secondary.recordType,
    durationMs: primary.durationMs ?? secondary.durationMs,
    clientIp: primary.clientIp ?? secondary.clientIp,
    userAgent: primary.userAgent ?? secondary.userAgent,
    consumerId: primary.consumerId ?? secondary.consumerId,
    consumerLabel: primary.consumerLabel ?? secondary.consumerLabel,
    consumerPlatform: primary.consumerPlatform ?? secondary.consumerPlatform,
  };
}

export function capturedRequestSnapshotEqual(a: CapturedRequest, b: CapturedRequest): boolean {
  return a.id === b.id
    && a.timestamp === b.timestamp
    && a.method === b.method
    && a.path === b.path
    && a.responseStatus === b.responseStatus
    && a.durationMs === b.durationMs
    && a.mockedRequest === b.mockedRequest
    && a.mockedResponse === b.mockedResponse
    && a.forcedExecution === b.forcedExecution
    && a.connectionFailed === b.connectionFailed
    && a.clientInstability === b.clientInstability
    && a.recordType === b.recordType
    && a.instabilityKind === b.instabilityKind
    && a.consumerId === b.consumerId
    && (a.body || '') === (b.body || '')
    && (a.responseBody || '') === (b.responseBody || '');
}

export function trafficSnapshotsEqual(a: CapturedRequest[], b: CapturedRequest[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (!capturedRequestSnapshotEqual(a[i], b[i])) return false;
  }
  return true;
}

export function buildTrafficFingerprint(records: CapturedRequest[]): string {
  return records.map((record) => [
    record.id,
    record.timestamp ?? '',
    record.responseStatus ?? '',
    record.durationMs ?? '',
    record.mockedRequest ? '1' : '0',
    record.mockedResponse ? '1' : '0',
    record.forcedExecution ? '1' : '0',
    record.connectionFailed ? '1' : '0',
    record.clientInstability ? '1' : '0',
    record.recordType ?? 'request',
    record.instabilityKind ?? '',
    record.consumerId ?? '',
    (record.body || '').length,
    (record.responseBody || '').length,
  ].join('|')).join('\n');
}

export function dedupeTrafficRecords(records: CapturedRequest[]): CapturedRequest[] {
  const byTraceId = new Map<string, CapturedRequest>();
  const withoutTrace: CapturedRequest[] = [];

  for (const record of records) {
    if (isInstabilityRecord(record)) {
      withoutTrace.push(record);
      continue;
    }

    const traceId = getTraceId(record);
    if (!traceId) {
      withoutTrace.push(record);
      continue;
    }

    const existing = byTraceId.get(traceId);
    if (!existing) {
      byTraceId.set(traceId, record);
      continue;
    }

    byTraceId.set(traceId, mergeTrafficRecords(existing, record));
  }

  return [...byTraceId.values(), ...withoutTrace];
}
