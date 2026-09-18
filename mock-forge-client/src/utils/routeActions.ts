import type { MockKind, Route } from '../types';
import {
  findRouteForTrafficMock,
  hasActiveRequestMock,
  hasActiveResponseMock,
  hasActiveRouteMocks,
} from '../../shared/routeUtils';
import { useAppStore } from '../stores/appStore';
import { useLocaleStore } from '../stores/localeStore';
import { showToast } from './notify';

export function isRouteEnabled(route: Route): boolean {
  return route.enabled !== false;
}

export function isRouteApplied(route: Route): boolean {
  return isRouteEnabled(route) && hasActiveRouteMocks(route);
}

export function canEnableRoute(route: Route): boolean {
  return hasActiveRouteMocks(route);
}

export function routeEndpointKey(route: Route): string {
  return `${route.method}:${route.path}`;
}

export function findDuplicateEnabledRouteIds(routes: Route[]): Set<string> {
  const groups = new Map<string, Route[]>();

  for (const route of routes) {
    if (!isRouteEnabled(route)) continue;
    const endpoint = routeEndpointKey(route);
    if (hasActiveRequestMock(route)) {
      const key = `${endpoint}:request`;
      const group = groups.get(key) || [];
      group.push(route);
      groups.set(key, group);
    }
    if (hasActiveResponseMock(route)) {
      const key = `${endpoint}:response`;
      const group = groups.get(key) || [];
      group.push(route);
      groups.set(key, group);
    }
  }

  const duplicates = new Set<string>();
  for (const group of groups.values()) {
    if (group.length > 1) {
      for (const route of group) {
        duplicates.add(route.id);
      }
    }
  }
  return duplicates;
}

export function openTrafficMockInEditor(
  method: string,
  path: string,
  kind: MockKind,
): boolean {
  const env = useAppStore.getState().currentEnvironment;
  if (!env) {
    showToast(useLocaleStore.getState().t.traffic.noEnvironmentForRecording, 'error');
    return false;
  }

  const route = findRouteForTrafficMock(env.routes, method, path, kind);
  if (!route) {
    showToast(useLocaleStore.getState().t.traffic.mockRouteNotFound, 'error');
    return false;
  }

  const store = useAppStore.getState();
  store.setSelectedRouteId(route.id);
  store.setEditorTab(kind);
  store.setActiveTab('editor');
  return true;
}

export function cloneRoute(route: Route): Route {
  const responseIdMap = new Map<string, string>();
  const responses = route.responses?.map((response) => {
    const id = crypto.randomUUID();
    responseIdMap.set(response.id, id);
    return { ...response, id, rules: response.rules ? [...response.rules] : undefined };
  });

  const requestIdMap = new Map<string, string>();
  const requestOverrides = route.requestOverrides?.map((override) => {
    const id = crypto.randomUUID();
    requestIdMap.set(override.id, id);
    return {
      ...override,
      id,
      headers: { ...override.headers },
      rules: override.rules ? [...override.rules] : undefined,
    };
  });

  return {
    ...route,
    id: crypto.randomUUID(),
    name: `${route.name}${useLocaleStore.getState().t.routes.copySuffix}`,
    responses,
    defaultResponseId: route.defaultResponseId
      ? responseIdMap.get(route.defaultResponseId) || responses?.[0]?.id
      : responses?.[0]?.id,
    requestOverrides,
    defaultRequestOverrideId: route.defaultRequestOverrideId
      ? requestIdMap.get(route.defaultRequestOverrideId) || requestOverrides?.[0]?.id
      : requestOverrides?.[0]?.id,
  };
}

export function downloadRouteJson(route: Route): void {
  const blob = new Blob([JSON.stringify(route, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${route.method}-${route.path.replace(/^\//, '').replace(/\//g, '-') || 'route'}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importRouteFromFile(): Promise<Route | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json,.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      try {
        const parsed = JSON.parse(await file.text()) as Route;
        if (!parsed.method || !parsed.path) {
          resolve(null);
          return;
        }
        const responses = parsed.responses?.map((response) => ({
          ...response,
          id: crypto.randomUUID(),
        }));
        const requestOverrides = parsed.requestOverrides?.map((override) => ({
          ...override,
          id: crypto.randomUUID(),
        }));
        resolve({
          ...parsed,
          id: crypto.randomUUID(),
          enabled: parsed.enabled !== false,
          responses,
          defaultResponseId: responses?.[0]?.id,
          requestOverrides,
          defaultRequestOverrideId: requestOverrides?.[0]?.id,
        });
      } catch {
        resolve(null);
      }
    };
    input.click();
  });
}

export async function executeRouteFromMenu(route: Route): Promise<boolean> {
  const result = await window.mockforge.route.execute(route);
  if (!result.success) {
    showToast(result.error || useLocaleStore.getState().t.routes.executeFailed, 'error');
    return false;
  }

  const store = useAppStore.getState();
  if (result.record) {
    store.appendTraffic([result.record]);
    store.setSelectedRequestId(result.record.id);
  } else if (result.requestId) {
    store.setSelectedRequestId(result.requestId);
  }
  store.setActiveTab('traffic');

  return true;
}
