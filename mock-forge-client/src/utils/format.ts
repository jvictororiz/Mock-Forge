import { SENSITIVE_HEADERS } from '../types';
import {
  MOCKFORGE_RESPONSE_MARKER_HEADER,
  MOCKFORGE_REQUEST_MARKER_HEADER,
  MOCKFORGE_REQUEST_BODY_PATHS_HEADER,
  MOCKFORGE_REQUEST_HEADER_FIELDS_HEADER,
} from '../../shared/mockforgeHeaders';
import { prettifyJsonIfPossible } from '../../shared/jsonFormat';

const HIDDEN_HEADERS = new Set([
  MOCKFORGE_RESPONSE_MARKER_HEADER,
  MOCKFORGE_REQUEST_MARKER_HEADER,
  MOCKFORGE_REQUEST_BODY_PATHS_HEADER,
  MOCKFORGE_REQUEST_HEADER_FIELDS_HEADER,
  'x-mockforge-request-id',
]);

export function maskSensitiveHeaders(headers: Record<string, string>): Record<string, string> {
  const masked: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (HIDDEN_HEADERS.has(lowerKey)) continue;
    if (SENSITIVE_HEADERS.includes(lowerKey)) {
      masked[key] = '••••••••';
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

export function formatTimestamp(iso: string): string {
  if (!iso) return '—';

  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '—';

    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();

    if (isToday) {
      return d.toLocaleTimeString('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });
    }

    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return '—';
  }
}

export function formatDuration(durationMs?: number): string {
  if (durationMs == null) return '—';
  if (durationMs < 1000) return `${durationMs}ms`;
  const seconds = durationMs / 1000;
  return Number.isInteger(seconds) ? `${seconds}s` : `${seconds.toFixed(1)}s`;
}

export function methodColor(method: string): string {
  const colors: Record<string, string> = {
    EVT: '#ff7043',
    GET: '#61affe',
    POST: '#49cc90',
    PUT: '#fca130',
    DELETE: '#f93e3e',
    PATCH: '#50e3c2',
    HEAD: '#9012fe',
    OPTIONS: '#0d5aa7',
  };
  return colors[method.toUpperCase()] || '#999';
}

export function statusColor(status?: number, options?: { failed?: boolean; unstable?: boolean }): string {
  if (options?.failed) return '#f93e3e';
  if (options?.unstable) return '#ff7043';
  if (!status) return '#999';
  if (status >= 200 && status < 300) return '#49cc90';
  if (status >= 300 && status < 400) return '#fca130';
  if (status >= 400) return '#f93e3e';
  return '#999';
}

export function tryFormatJson(str?: string): string {
  return prettifyJsonIfPossible(str || '');
}
