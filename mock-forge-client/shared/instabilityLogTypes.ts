import type { CapturedRequest, InstabilityKind } from './types';

export type InstabilityLogCategory = 'adb' | 'proxy' | 'request' | 'system';

export interface InstabilityLogEntry {
  id: string;
  timestamp: string;
  category: InstabilityLogCategory;
  kind: InstabilityKind | string;
  message: string;
  correlationId?: string;
  details?: Record<string, unknown>;
}

export interface InstabilityServerSnapshot {
  running: boolean;
  port: number;
  healthy: boolean;
  proxyRequestCount: number;
  proxyActiveConnections: number;
  adbReverseActive: boolean;
  adbDevices: Array<{ id: string; state: string; reverseActive?: boolean }>;
  activeAdbDevice: string | null;
  deviceBaseUrl: string | null;
  lastError: string | null;
}

export interface InstabilityExportBundle {
  exportedAt: string;
  mockforgeVersion: string;
  platform: string;
  trafficRecord: CapturedRequest;
  serverSnapshot: InstabilityServerSnapshot;
  logEntries: InstabilityLogEntry[];
  relatedTraffic: CapturedRequest[];
  diagnosis: {
    summary: string;
    likelyCause: string;
    userImpact: string;
    mitigationsActive: string[];
    recommendations: string[];
  };
}
