import type { CapturedRequest } from './types';

export function normalizePath(path: string): string {
  const [pathname, query] = path.split('?');
  if (!query) return pathname;

  const params = new URLSearchParams(query);
  const sorted = [...params.entries()].sort(([a], [b]) => a.localeCompare(b));
  return sorted.length > 0
    ? `${pathname}?${new URLSearchParams(sorted).toString()}`
    : pathname;
}

export function buildMatchKey(record: CapturedRequest): string {
  return `${record.method}:${normalizePath(record.path)}`;
}

export function groupRecordsByKey(records: CapturedRequest[]): Map<string, CapturedRequest[]> {
  const groups = new Map<string, CapturedRequest[]>();

  for (const record of records) {
    const key = buildMatchKey(record);
    const existing = groups.get(key);
    if (existing) {
      existing.push(record);
    } else {
      groups.set(key, [record]);
    }
  }

  return groups;
}

export interface SessionPair {
  key: string;
  recordA: CapturedRequest;
  recordB: CapturedRequest;
}

export function pairSessions(
  recordsA: CapturedRequest[],
  recordsB: CapturedRequest[],
): {
  pairs: SessionPair[];
  unmatchedA: CapturedRequest[];
  unmatchedB: CapturedRequest[];
} {
  const groupsA = groupRecordsByKey(recordsA);
  const groupsB = groupRecordsByKey(recordsB);
  const allKeys = new Set([...groupsA.keys(), ...groupsB.keys()]);

  const pairs: SessionPair[] = [];
  const unmatchedA: CapturedRequest[] = [];
  const unmatchedB: CapturedRequest[] = [];

  for (const key of allKeys) {
    const listA = groupsA.get(key) ?? [];
    const listB = groupsB.get(key) ?? [];
    const pairCount = Math.min(listA.length, listB.length);

    for (let i = 0; i < pairCount; i += 1) {
      pairs.push({ key, recordA: listA[i], recordB: listB[i] });
    }

    for (let i = pairCount; i < listA.length; i += 1) {
      unmatchedA.push(listA[i]);
    }

    for (let i = pairCount; i < listB.length; i += 1) {
      unmatchedB.push(listB[i]);
    }
  }

  return { pairs, unmatchedA, unmatchedB };
}
