import type { Environment, Route, CapturedRequest, ServerStatus, AdbDevice, MockKind, MirrorStatus, MirrorTouchInput, MirrorScrollInput, MirrorCaptureResult } from './types';
import type { AppUpdateCheckResult } from './appUpdate';
import type { ConsumerPlatform } from './consumerUtils';
import type { EnvironmentSnapshot, TrafficSession, TrafficSessionMeta } from './sessionTypes';
import type { SessionComparison, CompareOptions } from './comparisonTypes';
import type { McpClientId, McpClientInfo, McpIntegrationResult, McpManualConfig } from './mcpTypes';

export interface MockForgeAPI {
  server: {
    status: () => Promise<ServerStatus>;
    start: () => Promise<{ success: boolean; error?: string }>;
    stop: () => Promise<{ success: boolean }>;
    onStopped: (callback: (data: { error?: string }) => void) => () => void;
    onStatusChanged: (callback: () => void) => () => void;
  };
  traffic: {
    get: () => Promise<CapturedRequest[]>;
    clear: () => Promise<{ success: boolean }>;
    onUpdate: (callback: (requests: CapturedRequest[]) => void) => () => void;
    exportInstabilityLogs: (recordId: string) => Promise<{
      success: boolean;
      filePath?: string;
      cancelled?: boolean;
      error?: string;
    }>;
  };
  environment: {
    list: () => Promise<Environment[]>;
    get: (id: string) => Promise<Environment | null>;
    current: () => Promise<Environment | null>;
    setCurrent: (id: string) => Promise<Environment | null>;
    create: (name: string, port?: number) => Promise<Environment>;
    save: (env: Environment) => Promise<Environment>;
    delete: (id: string) => Promise<Environment | null>;
    duplicate: (id: string, newName?: string) => Promise<Environment | null>;
    rename: (id: string, name: string) => Promise<Environment | null>;
    export: (id: string) => Promise<boolean>;
    import: () => Promise<Environment | null>;
  };
  route: {
    createFromRequest: (captured: CapturedRequest, kind?: MockKind) => Promise<Route | null>;
    createFullMockFromRequest: (captured: CapturedRequest) => Promise<Route | null>;
    createFullMocksFromRequests: (capturedList: CapturedRequest[]) => Promise<Route[]>;
    previewExpectation: (route: Route) => Promise<unknown>;
    execute: (route: Route) => Promise<{
      success: boolean;
      requestId?: string;
      record?: CapturedRequest;
      error?: string;
    }>;
  };
  expectations: {
    sync: () => Promise<void>;
  };
  adb: {
    list: () => Promise<AdbDevice[]>;
    connect: (address: string) => Promise<{ success: boolean; error?: string }>;
    connectDevice: (deviceId: string) => Promise<{ success: boolean; deviceId?: string; error?: string }>;
    setup: () => Promise<{ success: boolean; devices?: string[]; error?: string }>;
  };
  mirror: {
    status: () => Promise<MirrorStatus>;
    start: (deviceId?: string) => Promise<{ success: boolean; error?: string }>;
    stop: () => Promise<{ success: boolean }>;
    injectTouch: (input: MirrorTouchInput) => Promise<{ success: boolean }>;
    injectScroll: (input: MirrorScrollInput) => Promise<{ success: boolean }>;
    injectText: (text: string) => Promise<{ success: boolean }>;
    copyScreenshot: (pngBase64: string) => Promise<{ success: boolean; error?: string }>;
    saveScreenshot: (pngBase64: string, defaultName?: string) => Promise<MirrorCaptureResult>;
    copyRecording: (data: ArrayBuffer, mimeType: string, defaultName?: string) => Promise<{ success: boolean; error?: string }>;
    saveRecording: (data: ArrayBuffer, mimeType: string, defaultName?: string) => Promise<MirrorCaptureResult>;
    onChunk: (callback: (chunk: Uint8Array) => void) => () => void;
    onState: (callback: (status: MirrorStatus) => void) => () => void;
  };
  sessions: {
    list: () => Promise<TrafficSessionMeta[]>;
    get: (id: string) => Promise<TrafficSession | null>;
    getRecords: (id: string, options?: { offset?: number; limit?: number }) => Promise<CapturedRequest[]>;
    create: (options: {
      name?: string;
      environmentId: string;
      environmentName: string;
      flowName?: string;
      primaryPlatform?: ConsumerPlatform;
      environmentSnapshot?: EnvironmentSnapshot;
    }) => Promise<TrafficSession>;
    saveCurrent: (
      name: string,
      records: CapturedRequest[],
      options?: {
        flowName?: string;
        primaryPlatform?: ConsumerPlatform;
        notes?: string;
      },
    ) => Promise<TrafficSession>;
    complete: (id: string) => Promise<TrafficSessionMeta | null>;
    rename: (id: string, name: string, notes?: string) => Promise<TrafficSessionMeta | null>;
    delete: (id: string) => Promise<void>;
    export: (id: string) => Promise<boolean>;
    import: () => Promise<TrafficSession | null>;
    getActive: () => Promise<TrafficSessionMeta | null>;
    startRecording: () => Promise<TrafficSessionMeta>;
    stopRecording: () => Promise<TrafficSessionMeta | null>;
    compare: (
      sessionAId: string,
      sessionBId: string,
      options?: CompareOptions,
    ) => Promise<SessionComparison>;
  };
  mcp: {
    listClients: () => Promise<McpClientInfo[]>;
    setup: (clientId: McpClientId) => Promise<McpIntegrationResult>;
    remove: (clientId: McpClientId) => Promise<McpIntegrationResult>;
    getManualConfig: () => Promise<McpManualConfig>;
    isReady: () => Promise<boolean>;
  };
  updates: {
    check: () => Promise<AppUpdateCheckResult>;
    apply: () => Promise<{ success: boolean; error?: string; openedReleasePage?: boolean }>;
    openUrl: (url: string) => Promise<{ success: boolean; error?: string }>;
    onProgress: (callback: (percent: number | null) => void) => () => void;
  };
  platform: NodeJS.Platform;
}
