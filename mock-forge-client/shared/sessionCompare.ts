import type {
  ComparisonDiff,
  ComparisonPair,
  ComparisonPairStatus,
  ComparisonSummary,
  SessionCompareOptions,
  SessionComparison,
} from './comparisonTypes';
import { getHeaderValue } from './consumerUtils';
import { isNoiseBodyPath, isNoiseHeader } from './platformNoise';
import { pairSessions } from './sessionMatch';
import type { TrafficSessionMeta } from './sessionTypes';
import type { CapturedRequest } from './types';

function parseJsonBody(body?: string): unknown | undefined {
  if (!body) return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return undefined;
  }
}

function jsonPath(parent: string, segment: string | number): string {
  if (parent === '$') {
    return typeof segment === 'number' ? `$[${segment}]` : `$.${segment}`;
  }
  return typeof segment === 'number' ? `${parent}[${segment}]` : `${parent}.${segment}`;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function diffJsonValues(
  valueA: unknown,
  valueB: unknown,
  path: string,
  field: 'request.body' | 'response.body',
  ignorePlatformNoise: boolean,
): ComparisonDiff[] {
  if (valuesEqual(valueA, valueB)) return [];

  if (
    valueA === null
    || valueB === null
    || typeof valueA !== 'object'
    || typeof valueB !== 'object'
  ) {
    const ignored = ignorePlatformNoise && isNoiseBodyPath(path);
    return [{
      field,
      path,
      valueA,
      valueB,
      severity: 'warning',
      ignored,
    }];
  }

  if (Array.isArray(valueA) && Array.isArray(valueB)) {
    const diffs: ComparisonDiff[] = [];
    const maxLength = Math.max(valueA.length, valueB.length);

    for (let i = 0; i < maxLength; i += 1) {
      const childPath = jsonPath(path, i);
      const childA = valueA[i];
      const childB = valueB[i];

      if (i >= valueA.length) {
        diffs.push({
          field,
          path: childPath,
          valueA: undefined,
          valueB: childB,
          severity: 'warning',
          ignored: ignorePlatformNoise && isNoiseBodyPath(childPath),
        });
        continue;
      }

      if (i >= valueB.length) {
        diffs.push({
          field,
          path: childPath,
          valueA: childA,
          valueB: undefined,
          severity: 'warning',
          ignored: ignorePlatformNoise && isNoiseBodyPath(childPath),
        });
        continue;
      }

      diffs.push(...diffJsonValues(childA, childB, childPath, field, ignorePlatformNoise));
    }

    return diffs;
  }

  if (Array.isArray(valueA) || Array.isArray(valueB)) {
    const ignored = ignorePlatformNoise && isNoiseBodyPath(path);
    return [{
      field,
      path,
      valueA,
      valueB,
      severity: 'warning',
      ignored,
    }];
  }

  const recordA = valueA as Record<string, unknown>;
  const recordB = valueB as Record<string, unknown>;
  const keys = new Set([...Object.keys(recordA), ...Object.keys(recordB)]);
  const diffs: ComparisonDiff[] = [];

  for (const key of keys) {
    const childPath = jsonPath(path, key);
    const childA = recordA[key];
    const childB = recordB[key];

    if (!(key in recordA)) {
      diffs.push({
        field,
        path: childPath,
        valueA: undefined,
        valueB: childB,
        severity: 'warning',
        ignored: ignorePlatformNoise && isNoiseBodyPath(childPath),
      });
      continue;
    }

    if (!(key in recordB)) {
      diffs.push({
        field,
        path: childPath,
        valueA: childA,
        valueB: undefined,
        severity: 'warning',
        ignored: ignorePlatformNoise && isNoiseBodyPath(childPath),
      });
      continue;
    }

    diffs.push(...diffJsonValues(childA, childB, childPath, field, ignorePlatformNoise));
  }

  return diffs;
}

function compareJsonBodies(
  bodyA: string | undefined,
  bodyB: string | undefined,
  field: 'request.body' | 'response.body',
  ignorePlatformNoise: boolean,
): ComparisonDiff[] {
  const parsedA = parseJsonBody(bodyA);
  const parsedB = parseJsonBody(bodyB);

  if (parsedA !== undefined && parsedB !== undefined) {
    return diffJsonValues(parsedA, parsedB, '$', field, ignorePlatformNoise);
  }

  const normalizedA = bodyA ?? '';
  const normalizedB = bodyB ?? '';
  if (normalizedA === normalizedB) return [];

  return [{
    field,
    valueA: normalizedA,
    valueB: normalizedB,
    severity: 'warning',
    ignored: false,
  }];
}

function compareHeaders(
  headersA: Record<string, string> | undefined,
  headersB: Record<string, string> | undefined,
  field: 'request.headers' | 'response.headers',
  ignorePlatformNoise: boolean,
): ComparisonDiff[] {
  const left = headersA ?? {};
  const right = headersB ?? {};
  const keys = new Set([
    ...Object.keys(left).map((key) => key.toLowerCase()),
    ...Object.keys(right).map((key) => key.toLowerCase()),
  ]);

  const diffs: ComparisonDiff[] = [];

  for (const key of keys) {
    const valueA = getHeaderValue(left, key);
    const valueB = getHeaderValue(right, key);
    if (valueA === valueB) continue;

    diffs.push({
      field,
      path: key,
      valueA,
      valueB,
      severity: 'warning',
      ignored: ignorePlatformNoise && isNoiseHeader(key),
    });
  }

  return diffs;
}

function classifyPairStatus(diffs: ComparisonDiff[]): ComparisonPairStatus {
  const relevant = diffs.filter((diff) => !diff.ignored);
  if (relevant.length === 0) return 'identical';
  if (relevant.some((diff) => diff.severity === 'error' || diff.severity === 'warning')) {
    return 'different';
  }
  return 'partial';
}

function countDiffsByField(diffs: ComparisonDiff[]): Pick<
  ComparisonSummary,
  'requestBodyDiffs' | 'responseBodyDiffs' | 'statusCodeDiffs' | 'headerDiffs' | 'timingDiffs'
> {
  const relevant = diffs.filter((diff) => !diff.ignored);

  return {
    requestBodyDiffs: relevant.filter((diff) => diff.field === 'request.body').length,
    responseBodyDiffs: relevant.filter((diff) => diff.field === 'response.body').length,
    statusCodeDiffs: relevant.filter((diff) => diff.field === 'response.status').length,
    headerDiffs: relevant.filter(
      (diff) => diff.field === 'request.headers' || diff.field === 'response.headers',
    ).length,
    timingDiffs: relevant.filter((diff) => diff.field === 'duration').length,
  };
}

export function compareRecords(
  recordA: CapturedRequest,
  recordB: CapturedRequest,
  options?: SessionCompareOptions,
): ComparisonDiff[] {
  const ignorePlatformNoise = options?.ignorePlatformNoise !== false;
  const ignoreTiming = options?.ignoreTiming === true;
  const diffs: ComparisonDiff[] = [];

  if (recordA.responseStatus !== recordB.responseStatus) {
    diffs.push({
      field: 'response.status',
      valueA: recordA.responseStatus,
      valueB: recordB.responseStatus,
      severity: 'error',
      ignored: false,
    });
  }

  diffs.push(
    ...compareHeaders(recordA.headers, recordB.headers, 'request.headers', ignorePlatformNoise),
    ...compareHeaders(
      recordA.responseHeaders,
      recordB.responseHeaders,
      'response.headers',
      ignorePlatformNoise,
    ),
    ...compareJsonBodies(recordA.body, recordB.body, 'request.body', ignorePlatformNoise),
    ...compareJsonBodies(
      recordA.responseBody,
      recordB.responseBody,
      'response.body',
      ignorePlatformNoise,
    ),
  );

  if (!ignoreTiming && recordA.durationMs !== recordB.durationMs) {
    diffs.push({
      field: 'duration',
      valueA: recordA.durationMs,
      valueB: recordB.durationMs,
      severity: 'info',
      ignored: false,
    });
  }

  return diffs;
}

function buildSummary(
  recordsA: CapturedRequest[],
  recordsB: CapturedRequest[],
  pairs: ComparisonPair[],
  unmatchedA: CapturedRequest[],
  unmatchedB: CapturedRequest[],
): ComparisonSummary {
  const pairDiffCounts = pairs.flatMap((pair) => pair.diffs);
  const fieldCounts = countDiffsByField(pairDiffCounts);

  return {
    totalA: recordsA.length,
    totalB: recordsB.length,
    matched: pairs.length,
    identical: pairs.filter((pair) => pair.status === 'identical').length,
    withDifferences: pairs.filter((pair) => pair.status === 'different').length,
    onlyInA: unmatchedA.length,
    onlyInB: unmatchedB.length,
    ...fieldCounts,
  };
}

function resolveSessionPlatform(
  session: TrafficSessionMeta,
): SessionComparison['sessionA']['platform'] {
  return session.primaryPlatform ?? session.platforms?.[0] ?? 'unknown';
}

export function compareSessions(
  sessionA: TrafficSessionMeta & { records?: CapturedRequest[] },
  sessionB: TrafficSessionMeta & { records?: CapturedRequest[] },
  options?: SessionCompareOptions,
): SessionComparison {
  const recordsA = sessionA.records ?? [];
  const recordsB = sessionB.records ?? [];
  const { pairs, unmatchedA, unmatchedB } = pairSessions(recordsA, recordsB);

  const comparisonPairs: ComparisonPair[] = pairs.map(({ key, recordA, recordB }) => {
    const diffs = compareRecords(recordA, recordB, options);
    return {
      key,
      recordA,
      recordB,
      status: classifyPairStatus(diffs),
      diffs,
    };
  });

  const createdAt = new Date().toISOString();

  return {
    id: `cmp-${sessionA.id}-${sessionB.id}-${createdAt}`,
    sessionA: {
      id: sessionA.id,
      name: sessionA.name,
      platform: resolveSessionPlatform(sessionA),
    },
    sessionB: {
      id: sessionB.id,
      name: sessionB.name,
      platform: resolveSessionPlatform(sessionB),
    },
    createdAt,
    summary: buildSummary(recordsA, recordsB, comparisonPairs, unmatchedA, unmatchedB),
    pairs: comparisonPairs,
    unmatchedA,
    unmatchedB,
  };
}
