import type { ConsumerPlatform } from './consumerUtils';
import type { CapturedRequest } from './types';

export type ComparisonDiffField =
  | 'request.headers'
  | 'request.body'
  | 'response.status'
  | 'response.headers'
  | 'response.body'
  | 'duration';

export interface ComparisonDiff {
  field: ComparisonDiffField;
  path?: string;
  valueA: unknown;
  valueB: unknown;
  severity: 'info' | 'warning' | 'error';
  ignored: boolean;
}

export type ComparisonPairStatus = 'identical' | 'different' | 'partial';

export interface ComparisonPair {
  key: string;
  recordA: CapturedRequest;
  recordB: CapturedRequest;
  status: ComparisonPairStatus;
  diffs: ComparisonDiff[];
}

export interface ComparisonSummary {
  totalA: number;
  totalB: number;
  matched: number;
  identical: number;
  withDifferences: number;
  onlyInA: number;
  onlyInB: number;
  requestBodyDiffs: number;
  responseBodyDiffs: number;
  statusCodeDiffs: number;
  headerDiffs: number;
  timingDiffs: number;
}

export interface SessionCompareOptions {
  ignorePlatformNoise?: boolean;
  ignoreTiming?: boolean;
  smartOrdering?: boolean;
}

export type CompareOptions = SessionCompareOptions;

export interface SessionComparison {
  id: string;
  sessionA: { id: string; name: string; platform: ConsumerPlatform };
  sessionB: { id: string; name: string; platform: ConsumerPlatform };
  createdAt: string;
  summary: ComparisonSummary;
  pairs: ComparisonPair[];
  unmatchedA: CapturedRequest[];
  unmatchedB: CapturedRequest[];
}

/** @deprecated Use ComparisonSummary */
export type SessionComparisonSummary = ComparisonSummary;
