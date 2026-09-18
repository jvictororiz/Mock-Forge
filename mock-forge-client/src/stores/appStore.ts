import { create } from 'zustand';
import type { Environment, Route, CapturedRequest, ServerStatus } from '../types';
import { cloneRoute } from '../utils/routeActions';
import {
  setRouteMockEnabled as applyRouteMockEnabled,
  syncRouteEnabledWithMocks,
} from '../../shared/routeUtils';
import type { MockKind } from '../types';
import { incrementTrafficConsumers, listTrafficConsumers, registerTrafficConsumers } from '../../shared/consumerUtils';
import type { TrafficConsumer } from '../../shared/consumerUtils';
import { capturedRequestSnapshotEqual, trafficSnapshotsEqual } from '../../shared/trafficDedup';
import { showToast } from '../utils/notify';
import { useLocaleStore } from './localeStore';

import { MOCKFORGE_REQUEST_ID_HEADER } from '../../shared/mockforgeHeaders';

const PERSIST_DEBOUNCE_MS = 400;

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPersistEnv: Environment | null = null;

function persistEnvironment(env: Environment): void {
  void window.mockforge.environment.save(env).catch((err: unknown) => {
    const message = err instanceof Error
      ? err.message
      : useLocaleStore.getState().t.routes.saveRouteFailed;
    showToast(message, 'error');
  });
}

function schedulePersistEnvironment(env: Environment): void {
  pendingPersistEnv = env;
  if (persistTimer !== null) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const envToSave = pendingPersistEnv;
    pendingPersistEnv = null;
    if (envToSave) persistEnvironment(envToSave);
  }, PERSIST_DEBOUNCE_MS);
}

export function flushEnvironmentPersist(): void {
  if (persistTimer !== null) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  if (pendingPersistEnv) {
    const envToSave = pendingPersistEnv;
    pendingPersistEnv = null;
    persistEnvironment(envToSave);
  }
}

function getTraceId(request: CapturedRequest): string | undefined {
  return request.headers[MOCKFORGE_REQUEST_ID_HEADER]
    || request.headers['X-MockForge-Request-Id'];
}

function trafficRecordsMatch(a: CapturedRequest, b: CapturedRequest): boolean {
  if (a.method !== b.method || a.path !== b.path) return false;
  if (a.timestamp && b.timestamp) return a.timestamp === b.timestamp;
  if (a.responseStatus !== undefined && b.responseStatus !== undefined) {
    return a.responseStatus === b.responseStatus
      && (a.responseBody || '') === (b.responseBody || '');
  }
  return (a.body || '') === (b.body || '');
}

function isTrafficSuppressed(
  request: CapturedRequest,
  suppressed: CapturedRequest[],
): boolean {
  return suppressed.some((record) => trafficRecordsMatch(record, request));
}

function filterSuppressedTraffic(
  requests: CapturedRequest[],
  suppressed: CapturedRequest[],
): CapturedRequest[] {
  if (suppressed.length === 0) return requests;
  return requests.filter((request) => !isTrafficSuppressed(request, suppressed));
}

function buildTrafficLookup(records: CapturedRequest[]): {
  byId: Map<string, number>;
  byTraceId: Map<string, number>;
} {
  const byId = new Map<string, number>();
  const byTraceId = new Map<string, number>();

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    byId.set(record.id, index);
    const traceId = getTraceId(record);
    if (traceId) byTraceId.set(traceId, index);
  }

  return { byId, byTraceId };
}

function mergeIncomingTrafficRecord(
  existing: CapturedRequest,
  incoming: CapturedRequest,
): CapturedRequest {
  return {
    ...incoming,
    id: existing.id,
    body: incoming.body || existing.body,
    headers: { ...existing.headers, ...incoming.headers },
    mockedRequest: !!(existing.mockedRequest || incoming.mockedRequest),
    mockedResponse: !!(existing.mockedResponse || incoming.mockedResponse),
    mockedRequestBodyPaths: incoming.mockedRequestBodyPaths ?? existing.mockedRequestBodyPaths,
    mockedRequestHeaderFields: incoming.mockedRequestHeaderFields ?? existing.mockedRequestHeaderFields,
    forcedExecution: !!(existing.forcedExecution || incoming.forcedExecution),
    connectionFailed: !!(existing.connectionFailed || incoming.connectionFailed),
    clientInstability: !!(existing.clientInstability || incoming.clientInstability),
    instabilityKind: incoming.instabilityKind ?? existing.instabilityKind,
    instabilityMessage: incoming.instabilityMessage ?? existing.instabilityMessage,
    recordType: incoming.recordType ?? existing.recordType,
    consumerId: incoming.consumerId ?? existing.consumerId,
    consumerLabel: incoming.consumerLabel ?? existing.consumerLabel,
    consumerPlatform: incoming.consumerPlatform ?? existing.consumerPlatform,
    clientIp: incoming.clientIp ?? existing.clientIp,
    userAgent: incoming.userAgent ?? existing.userAgent,
  };
}

function appendTrafficRecords(
  previous: CapturedRequest[],
  incoming: CapturedRequest[],
): { merged: CapturedRequest[]; added: CapturedRequest[] } {
  if (incoming.length === 0) {
    return { merged: previous, added: [] };
  }

  let next = [...previous];
  const added: CapturedRequest[] = [];
  let lookup = buildTrafficLookup(next);

  for (const req of incoming) {
    const traceId = getTraceId(req);
    let existingIndex = traceId
      ? lookup.byTraceId.get(traceId) ?? lookup.byId.get(traceId)
      : undefined;

    if (existingIndex === undefined) {
      existingIndex = next.findIndex((record) => trafficRecordsMatch(record, req));
    }

    if (existingIndex >= 0) {
      const existing = next[existingIndex];
      const mergedRecord = mergeIncomingTrafficRecord(existing, req);
      if (!capturedRequestSnapshotEqual(existing, mergedRecord)) {
        next = [...next];
        next[existingIndex] = mergedRecord;
        lookup = buildTrafficLookup(next);
      }
    } else {
      next = [req, ...next];
      added.push(req);
      lookup = buildTrafficLookup(next);
    }
  }

  return { merged: next, added };
}

function trafficConsumersEqual(
  left: Record<string, TrafficConsumer>,
  right: Record<string, TrafficConsumer>,
): boolean {
  const leftKeys = Object.keys(left);
  if (leftKeys.length !== Object.keys(right).length) return false;

  for (const key of leftKeys) {
    const a = left[key];
    const b = right[key];
    if (!b) return false;
    if (
      a.requestCount !== b.requestCount
      || a.label !== b.label
      || a.platform !== b.platform
    ) {
      return false;
    }
  }

  return true;
}

function serverStatusEqual(left: ServerStatus, right: ServerStatus): boolean {
  return left.running === right.running
    && left.port === right.port
    && left.healthy === right.healthy
    && left.javaAvailable === right.javaAvailable
    && left.jarAvailable === right.jarAvailable
    && left.localIp === right.localIp
    && left.lastError === right.lastError
    && left.adbReverseActive === right.adbReverseActive
    && left.deviceBaseUrl === right.deviceBaseUrl
    && left.activeAdbDevice === right.activeAdbDevice
    && (left.adbDevices?.length ?? 0) === (right.adbDevices?.length ?? 0)
    && (left.adbDevices ?? []).every((device, index) => {
      const other = right.adbDevices?.[index];
      return other
        && device.id === other.id
        && device.state === other.state
        && device.reverseActive === other.reverseActive;
    });
}

type Tab = 'traffic' | 'editor' | 'settings' | 'sessions';
type SettingsTab = 'server' | 'devices' | 'mcp' | 'language';
type EditorTab = 'request' | 'response';

interface AppState {
  activeTab: Tab;
  setActiveTab: (tab: Tab) => void;
  settingsTab: SettingsTab;
  setSettingsTab: (tab: SettingsTab) => void;
  openDevicesSettings: () => void;
  openEnvironmentsSettings: () => void;

  serverStatus: ServerStatus;
  setServerStatus: (status: ServerStatus) => void;

  environments: Environment[];
  setEnvironments: (envs: Environment[]) => void;
  refreshEnvironments: () => Promise<Environment[]>;
  currentEnvironment: Environment | null;
  setCurrentEnvironment: (env: Environment | null) => void;

  selectedRouteId: string | null;
  setSelectedRouteId: (id: string | null) => void;
  editorTab: EditorTab;
  setEditorTab: (tab: EditorTab) => void;

  traffic: CapturedRequest[];
  setTraffic: (requests: CapturedRequest[]) => void;
  appendTraffic: (requests: CapturedRequest[]) => void;
  clearTraffic: (consumerId?: string | null) => void;
  suppressedTraffic: CapturedRequest[];
  selectedRequestId: string | null;
  setSelectedRequestId: (id: string | null) => void;

  selectedConsumerId: string | null;
  setSelectedConsumerId: (id: string | null) => void;
  trafficConsumers: Record<string, TrafficConsumer>;
  getTrafficConsumers: () => TrafficConsumer[];

  updateRoute: (route: Route) => void;
  deleteRoute: (routeId: string) => void;
  addRoute: (route: Route) => void;
  duplicateRoute: (routeId: string) => void;
  setRouteMockEnabled: (routeId: string, kind: MockKind, enabled: boolean) => void;
  upsertRoute: (route: Route, editorTab?: EditorTab) => void;
  upsertRoutes: (routes: Route[]) => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  activeTab: 'traffic',
  setActiveTab: (tab) => set({ activeTab: tab }),
  settingsTab: 'server',
  setSettingsTab: (tab) => set({ settingsTab: tab }),
  openDevicesSettings: () => set({ activeTab: 'settings', settingsTab: 'devices' }),
  openEnvironmentsSettings: () => set({ activeTab: 'settings', settingsTab: 'server' }),

  serverStatus: {
    running: false,
    port: 1080,
    healthy: false,
    javaAvailable: false,
    jarAvailable: false,
    localIp: null,
  },
  setServerStatus: (status) => {
    const current = get().serverStatus;
    if (serverStatusEqual(current, status)) return;
    set({ serverStatus: status });
  },

  environments: [],
  setEnvironments: (envs) => set({ environments: envs }),
  refreshEnvironments: async () => {
    const [list, current] = await Promise.all([
      window.mockforge.environment.list(),
      window.mockforge.environment.current(),
    ]);
    set((state) => ({
      environments: list,
      currentEnvironment: current ?? state.currentEnvironment,
    }));
    return list;
  },
  currentEnvironment: null,
  setCurrentEnvironment: (env) => {
    flushEnvironmentPersist();
    set({ currentEnvironment: env });
  },

  selectedRouteId: null,
  setSelectedRouteId: (id) => {
    flushEnvironmentPersist();
    set({ selectedRouteId: id });
  },
  editorTab: 'response',
  setEditorTab: (tab) => set({ editorTab: tab }),

  traffic: [],
  setTraffic: (requests) => {
    const { selectedRequestId, traffic } = get();
    if (trafficSnapshotsEqual(traffic, requests)) return;

    const stillSelected = requests.some((r) => r.id === selectedRequestId);
    set({
      traffic: requests,
      selectedRequestId: stillSelected ? selectedRequestId : null,
    });
  },
  appendTraffic: (requests) => {
    const { selectedRequestId, traffic, trafficConsumers, suppressedTraffic } = get();
    const incoming = filterSuppressedTraffic(requests, suppressedTraffic);
    if (incoming.length === 0) return;

    const { merged, added } = appendTrafficRecords(traffic, incoming);
    const registered = registerTrafficConsumers(trafficConsumers, incoming);
    const updatedConsumers = incrementTrafficConsumers(registered, added);

    const trafficChanged = !trafficSnapshotsEqual(traffic, merged);
    const consumersChanged = !trafficConsumersEqual(trafficConsumers, updatedConsumers);
    if (!trafficChanged && !consumersChanged) return;

    const stillSelected = selectedRequestId
      ? merged.some((r) => r.id === selectedRequestId)
      : false;

    set({
      traffic: merged,
      trafficConsumers: updatedConsumers,
      selectedRequestId: stillSelected ? selectedRequestId : null,
    });
  },
  clearTraffic: (consumerId) => {
    const {
      traffic,
      trafficConsumers,
      selectedRequestId,
      selectedConsumerId,
      suppressedTraffic,
    } = get();
    const targetConsumerId = consumerId !== undefined ? consumerId : selectedConsumerId;

    if (targetConsumerId) {
      const removed = traffic.filter((record) => record.consumerId === targetConsumerId);
      if (removed.length === 0) return;

      const remaining = traffic.filter((record) => record.consumerId !== targetConsumerId);
      const stillSelected = selectedRequestId
        ? remaining.some((record) => record.id === selectedRequestId)
        : false;

      const updatedConsumers = { ...trafficConsumers };
      if (updatedConsumers[targetConsumerId]) {
        updatedConsumers[targetConsumerId] = {
          ...updatedConsumers[targetConsumerId],
          requestCount: 0,
        };
      }

      set({
        traffic: remaining,
        trafficConsumers: updatedConsumers,
        suppressedTraffic: [...suppressedTraffic, ...removed],
        selectedRequestId: stillSelected ? selectedRequestId : null,
      });
      return;
    }

    set({
      traffic: [],
      trafficConsumers: {},
      suppressedTraffic: [],
      selectedRequestId: null,
    });
  },
  suppressedTraffic: [],
  selectedRequestId: null,
  setSelectedRequestId: (id) => set({ selectedRequestId: id }),

  selectedConsumerId: null,
  setSelectedConsumerId: (id) => set({ selectedConsumerId: id }),
  trafficConsumers: {},
  getTrafficConsumers: () => listTrafficConsumers(get().trafficConsumers),

  updateRoute: (route) => {
    const env = get().currentEnvironment;
    if (!env) return;
    const syncedRoute = syncRouteEnabledWithMocks(route);
    const routes = env.routes.map((r) => (r.id === syncedRoute.id ? syncedRoute : r));
    const updated = { ...env, routes };
    set({ currentEnvironment: updated });
    schedulePersistEnvironment(updated);
  },

  deleteRoute: (routeId) => {
    const env = get().currentEnvironment;
    if (!env) return;
    const routes = env.routes.filter((r) => r.id !== routeId);
    const updated = { ...env, routes };
    const { selectedRouteId } = get();
    set({
      currentEnvironment: updated,
      selectedRouteId: selectedRouteId === routeId ? null : selectedRouteId,
    });
    flushEnvironmentPersist();
    persistEnvironment(updated);
  },

  duplicateRoute: (routeId) => {
    const env = get().currentEnvironment;
    if (!env) return;
    const route = env.routes.find((r) => r.id === routeId);
    if (!route) return;
    const copy = cloneRoute(route);
    const updated = { ...env, routes: [...env.routes, copy] };
    set({ currentEnvironment: updated, selectedRouteId: copy.id, activeTab: 'editor' });
    flushEnvironmentPersist();
    persistEnvironment(updated);
  },

  setRouteMockEnabled: (routeId, kind, enabled) => {
    const env = get().currentEnvironment;
    if (!env) return;
    const route = env.routes.find((r) => r.id === routeId);
    if (!route) return;
    const updatedRoute = applyRouteMockEnabled(route, kind, enabled);
    const routes = env.routes.map((r) => (r.id === routeId ? updatedRoute : r));
    const updated = { ...env, routes };
    set({ currentEnvironment: updated });
    schedulePersistEnvironment(updated);
  },

  addRoute: (route) => {
    const env = get().currentEnvironment;
    if (!env) return;
    const updated = { ...env, routes: [...env.routes, route] };
    set({ currentEnvironment: updated, selectedRouteId: route.id, activeTab: 'editor' });
    flushEnvironmentPersist();
    persistEnvironment(updated);
  },

  upsertRoute: (route, editorTab) => {
    const env = get().currentEnvironment;
    if (!env) return;

    const byId = env.routes.findIndex((r) => r.id === route.id);
    const routes = byId >= 0
      ? env.routes.map((r, index) => (index === byId ? route : r))
      : [...env.routes, route];

    const updated = { ...env, routes };
    set({
      currentEnvironment: updated,
      selectedRouteId: route.id,
      activeTab: 'editor',
      editorTab: editorTab ?? get().editorTab,
    });
    schedulePersistEnvironment(updated);
  },

  upsertRoutes: (incomingRoutes) => {
    const env = get().currentEnvironment;
    if (!env || incomingRoutes.length === 0) return;

    let routes = [...env.routes];
    for (const route of incomingRoutes) {
      const byId = routes.findIndex((item) => item.id === route.id);
      if (byId >= 0) {
        routes[byId] = route;
      } else {
        routes.push(route);
      }
    }

    const updated = { ...env, routes };
    set({
      currentEnvironment: updated,
      selectedRouteId: incomingRoutes[0].id,
      activeTab: 'editor',
    });
    schedulePersistEnvironment(updated);
  },
}));
