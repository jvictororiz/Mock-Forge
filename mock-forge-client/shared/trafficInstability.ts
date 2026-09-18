import type { CapturedRequest, InstabilityKind } from './types';

function generateId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export const INSTABILITY_EVENT_METHOD = 'EVT';

export function isInstabilityRecord(record: CapturedRequest): boolean {
  return record.recordType === 'instability';
}

export function isConnectionFailedRecord(record: CapturedRequest): boolean {
  return !!record.connectionFailed && record.recordType !== 'instability';
}

export function hasTrafficInstability(record: CapturedRequest): boolean {
  return isInstabilityRecord(record)
    || isConnectionFailedRecord(record)
    || !!record.clientInstability;
}

export function createInstabilityRecord(
  kind: InstabilityKind,
  message: string,
  details?: Record<string, unknown>,
): CapturedRequest {
  const detailText = details && Object.keys(details).length > 0
    ? `${message} ${JSON.stringify(details)}`
    : message;

  return {
    id: generateId(),
    timestamp: new Date().toISOString(),
    method: INSTABILITY_EVENT_METHOD,
    path: kind,
    headers: {},
    recordType: 'instability',
    instabilityKind: kind,
    instabilityMessage: detailText,
  };
}

export function createFailedConnectionRecord(meta: {
  requestId: string;
  timestamp?: string;
  method: string;
  path: string;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  clientIp?: string;
  userAgent?: string;
  startedAt: number;
  reason: string;
  instabilityKind?: InstabilityKind;
}): CapturedRequest {
  return {
    id: meta.requestId,
    timestamp: meta.timestamp ?? new Date().toISOString(),
    method: meta.method,
    path: meta.path,
    headers: meta.requestHeaders ?? {},
    body: meta.requestBody ?? '',
    clientIp: meta.clientIp,
    userAgent: meta.userAgent,
    durationMs: Date.now() - meta.startedAt,
    recordType: 'request',
    connectionFailed: true,
    instabilityKind: meta.instabilityKind ?? 'connection_failed',
    instabilityMessage: meta.reason,
  };
}
