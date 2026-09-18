import type { ConsumerPlatform } from './consumerUtils';
import type { CapturedRequest } from './types';

export type SessionStatus = 'recording' | 'paused' | 'completed';
export type TrafficSessionStatus = SessionStatus;

export interface EnvironmentSnapshot {
  name: string;
  upstreamUrl?: string;
  routeCount: number;
  activeRouteIds: string[];
}

export interface TrafficSessionMeta {
  id: string;
  name: string;
  environmentId: string;
  environmentName: string;
  createdAt: string;
  endedAt?: string;
  updatedAt?: string;
  completedAt?: string;
  status: SessionStatus;
  requestCount: number;
  consumerIds: string[];
  platforms: ConsumerPlatform[];
  primaryPlatform?: ConsumerPlatform;
  flowName?: string;
  pairedSessionId?: string;
  comparisonGroupId?: string;
  environmentSnapshot?: EnvironmentSnapshot;
  notes?: string;
  tags?: string[];
}

export interface TrafficSession extends TrafficSessionMeta {
  records?: CapturedRequest[];
}

/** Frontend convenience options — environment is resolved by the main process when omitted. */
export interface CreateSessionOptions {
  name?: string;
  flowName?: string;
  primaryPlatform?: ConsumerPlatform;
}

export interface SaveSessionOptions {
  flowName?: string;
  primaryPlatform?: ConsumerPlatform;
  notes?: string;
}

export interface GetRecordsOptions {
  limit?: number;
  offset?: number;
}
