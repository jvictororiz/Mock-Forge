import type { CapturedRequest, InstabilityKind } from '../types';
import type { Translation } from '../i18n/types';
import { INSTABILITY_EVENT_METHOD, isInstabilityRecord } from '../../shared/trafficInstability';

export function getInstabilityLabel(
  kind: InstabilityKind | undefined,
  t: Translation,
): string {
  if (!kind) return t.traffic.instabilityGeneric;
  return t.traffic.instabilityLabels[kind] ?? t.traffic.instabilityGeneric;
}

export function getTrafficPathLabel(record: CapturedRequest, t: Translation): string {
  if (isInstabilityRecord(record)) {
    return getInstabilityLabel(record.instabilityKind, t);
  }
  return record.path;
}

export function getTrafficMethodLabel(record: CapturedRequest): string {
  if (isInstabilityRecord(record)) {
    return INSTABILITY_EVENT_METHOD;
  }
  return record.method;
}

export function getTrafficStatusLabel(record: CapturedRequest, t: Translation): string {
  if (isInstabilityRecord(record)) {
    return t.traffic.instabilityStatus;
  }
  if (record.connectionFailed) {
    return t.traffic.connectionFailedStatus;
  }
  if (record.clientInstability) {
    return t.traffic.clientInstabilityStatus;
  }
  return record.responseStatus != null ? String(record.responseStatus) : '—';
}

export function getInstabilityToastMessage(record: CapturedRequest, t: Translation): string {
  if (isInstabilityRecord(record)) {
    return getInstabilityLabel(record.instabilityKind, t);
  }
  if (record.connectionFailed) {
    return t.traffic.connectionFailedToast(record.method, record.path);
  }
  if (record.clientInstability) {
    return t.traffic.clientInstabilityToast(record.method, record.path);
  }
  return t.traffic.instabilityGeneric;
}
