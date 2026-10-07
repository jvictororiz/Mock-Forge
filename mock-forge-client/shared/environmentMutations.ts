import { randomUUID } from 'crypto';
import { DEFAULT_PORT } from './constants';
import type { McpEditorTab, McpMutation, EnvironmentMutationResult, RouteWriteInput } from './mcpBridge';
import {
  createDefaultResponse,
  disableRouteWithMocks,
  setRouteMockEnabled,
  syncRouteEnabledWithMocks,
} from './routeUtils';
import type { CapturedRequest, Environment, HttpMethod, Route } from './types';
import { prepareEnvironment } from './upstreamUtils';
import {
  createFullMockRouteFromCaptured,
  upsertRouteFromCapturedRequest,
} from '../electron/services/MockServerAdapter';

const HTTP_METHODS: readonly HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];

function isHttpMethod(value: string): value is HttpMethod {
  return (HTTP_METHODS as readonly string[]).includes(value);
}

function requireEnvironment(environments: Environment[], environmentId: string): Environment {
  const environment = environments.find((item) => item.id === environmentId);
  if (!environment) throw new Error(`Environment not found: ${environmentId}`);
  return environment;
}

function replaceEnvironment(environments: Environment[], environment: Environment): Environment[] {
  return environments.map((item) => (item.id === environment.id ? environment : item));
}

function normalizePath(path: string): string {
  const trimmed = path.trim();
  if (!trimmed) throw new Error('path is required');
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function parseMethod(method: string | undefined, fallback: HttpMethod = 'GET'): HttpMethod {
  if (!method) return fallback;
  const normalized = method.trim().toUpperCase();
  if (!isHttpMethod(normalized)) {
    throw new Error(`Unsupported HTTP method: ${method}`);
  }
  return normalized;
}

function parsePort(port: number | undefined, fallback: number): number {
  if (port === undefined) return fallback;
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('port must be an integer between 1024 and 65535');
  }
  return port;
}

interface RouteRef {
  routeId?: string;
  method?: string;
  path?: string;
}

function findRoute(environment: Environment, ref: RouteRef): Route {
  if (ref.routeId) {
    const route = environment.routes.find((item) => item.id === ref.routeId);
    if (!route) throw new Error(`Route not found: ${ref.routeId}`);
    return route;
  }

  if (!ref.method && !ref.path) {
    throw new Error('routeId or method and path are required');
  }

  const method = ref.method ? parseMethod(ref.method) : undefined;
  const path = ref.path ? normalizePath(ref.path) : undefined;
  const matches = environment.routes.filter((route) => {
    if (method && route.method !== method) return false;
    if (path && route.path !== path) return false;
    return true;
  });

  if (matches.length === 0) {
    throw new Error(`Route not found for ${method ?? '*'} ${path ?? '*'}`);
  }
  if (matches.length > 1) {
    throw new Error(`Multiple routes match ${method ?? '*'} ${path ?? '*'}. Pass routeId.`);
  }
  return matches[0];
}

function upsertRoute(routes: Route[], route: Route): Route[] {
  const index = routes.findIndex((item) => item.id === route.id);
  if (index < 0) return [...routes, route];
  return routes.map((item, itemIndex) => (itemIndex === index ? route : item));
}

function moveRoute(routes: Route[], routeId: string, index: number): Route[] {
  const current = routes.findIndex((route) => route.id === routeId);
  if (current < 0 || !Number.isInteger(index)) return routes;
  const next = [...routes];
  const [route] = next.splice(current, 1);
  const target = Math.max(0, Math.min(index, next.length));
  next.splice(target, 0, route);
  return next;
}

function cloneRoute(route: Route, name?: string): Route {
  const responseIdMap = new Map<string, string>();
  const responses = route.responses?.map((response) => {
    const id = randomUUID();
    responseIdMap.set(response.id, id);
    return { ...response, id, rules: response.rules ? [...response.rules] : undefined };
  });

  const requestIdMap = new Map<string, string>();
  const requestOverrides = route.requestOverrides?.map((override) => {
    const id = randomUUID();
    requestIdMap.set(override.id, id);
    return {
      ...override,
      id,
      headers: override.headers ? { ...override.headers } : undefined,
      rules: override.rules ? [...override.rules] : undefined,
      mergeFields: override.mergeFields ? [...override.mergeFields] : undefined,
      mergeHeaderFields: override.mergeHeaderFields ? [...override.mergeHeaderFields] : undefined,
    };
  });

  return {
    ...route,
    id: randomUUID(),
    name: name?.trim() || `${route.name} (copy)`,
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

function overlayResponse(route: Route, patch: RouteWriteInput): Route {
  const hasResponseFields = patch.statusCode !== undefined
    || patch.headers !== undefined
    || patch.body !== undefined
    || patch.delayMs !== undefined
    || patch.rules !== undefined;

  if (!hasResponseFields) return route;

  let next = route;
  if (!next.responses?.length || next.mockResponseEnabled === false) {
    next = setRouteMockEnabled(next, 'response', true);
  }

  const activeId = next.defaultResponseId || next.responses?.[0]?.id;
  const responses = (next.responses ?? []).map((response) => {
    if (response.id !== activeId) return response;
    return {
      ...response,
      ...(patch.statusCode !== undefined ? { statusCode: patch.statusCode } : {}),
      ...(patch.headers !== undefined ? { headers: patch.headers } : {}),
      ...(patch.body !== undefined ? { body: patch.body } : {}),
      ...(patch.delayMs !== undefined ? { delayMs: patch.delayMs } : {}),
      ...(patch.rules !== undefined ? { rules: patch.rules } : {}),
    };
  });

  return { ...next, responses };
}

function overlayRequest(route: Route, patch: RouteWriteInput): Route {
  const hasRequestFields = patch.requestHeaders !== undefined
    || patch.requestBody !== undefined
    || patch.requestHeadersMode !== undefined
    || patch.requestBodyMode !== undefined
    || patch.requestMergeFields !== undefined
    || patch.requestMergeHeaderFields !== undefined
    || patch.requestRules !== undefined;

  if (!hasRequestFields) return route;

  let next = route.mockRequestEnabled ? route : setRouteMockEnabled(route, 'request', true);
  const activeId = next.defaultRequestOverrideId || next.requestOverrides?.[0]?.id;
  const requestOverrides = (next.requestOverrides ?? []).map((override) => {
    if (override.id !== activeId) return override;
    return {
      ...override,
      ...(patch.requestHeaders !== undefined ? { headers: patch.requestHeaders } : {}),
      ...(patch.requestBody !== undefined ? { body: patch.requestBody } : {}),
      ...(patch.requestHeadersMode !== undefined ? { headersMode: patch.requestHeadersMode } : {}),
      ...(patch.requestBodyMode !== undefined ? { bodyMode: patch.requestBodyMode } : {}),
      ...(patch.requestMergeFields !== undefined ? { mergeFields: patch.requestMergeFields } : {}),
      ...(patch.requestMergeHeaderFields !== undefined ? { mergeHeaderFields: patch.requestMergeHeaderFields } : {}),
      ...(patch.requestRules !== undefined ? { rules: patch.requestRules } : {}),
    };
  });

  return { ...next, requestOverrides };
}

function applyRoutePatch(route: Route, patch: RouteWriteInput): Route {
  let next: Route = { ...route };

  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error('name cannot be empty');
    next.name = name;
  }
  if (patch.method !== undefined) next.method = parseMethod(patch.method);
  if (patch.path !== undefined) next.path = normalizePath(patch.path);
  if (patch.action !== undefined) next.action = patch.action;
  if (patch.priority !== undefined) next.priority = patch.priority;

  next = overlayResponse(next, patch);
  next = overlayRequest(next, patch);

  if (patch.mockResponseEnabled !== undefined) {
    next = setRouteMockEnabled(next, 'response', patch.mockResponseEnabled);
  }
  if (patch.mockRequestEnabled !== undefined) {
    next = setRouteMockEnabled(next, 'request', patch.mockRequestEnabled);
  }

  if (patch.enabled === false) {
    next = disableRouteWithMocks(next);
  } else if (patch.enabled === true) {
    if (patch.mockResponseEnabled === undefined && next.responses?.length) {
      next = { ...next, mockResponseEnabled: true };
    }
    if (patch.mockRequestEnabled === undefined && next.requestOverrides?.length) {
      next = { ...next, mockRequestEnabled: true };
    }
    if (!next.responses?.length && !next.requestOverrides?.length && patch.mockResponseEnabled === undefined) {
      next = setRouteMockEnabled(next, 'response', true);
    }
    next = syncRouteEnabledWithMocks(next);
  } else {
    next = syncRouteEnabledWithMocks(next);
  }

  return next;
}

function buildRoute(input: RouteWriteInput): Route {
  const method = parseMethod(input.method);
  const path = normalizePath(input.path || '');
  const response = createDefaultResponse('Response 1');
  const responseId = response.id;
  const route: Route = {
    id: randomUUID(),
    name: input.name?.trim() || `${method} ${path}`,
    method,
    path,
    action: input.action ?? 'mock',
    enabled: true,
    mockResponseEnabled: input.mockResponseEnabled ?? true,
    mockRequestEnabled: input.mockRequestEnabled ?? false,
    responses: [response],
    defaultResponseId: responseId,
    priority: input.priority ?? 0,
  };

  return applyRoutePatch(route, {
    ...input,
    name: undefined,
    method: undefined,
    path: undefined,
    mockResponseEnabled: input.mockResponseEnabled,
    mockRequestEnabled: input.mockRequestEnabled,
  });
}

function editorTabFor(route: Route, preferred?: McpEditorTab | null): McpEditorTab {
  if (preferred) return preferred;
  if (route.mockRequestEnabled && route.mockResponseEnabled === false) return 'request';
  return 'response';
}

function withEnvironment(
  environments: Environment[],
  environment: Environment,
  route: Route | null,
  options: { openEditor: boolean; editorTab?: McpEditorTab | null; replaceSelection: boolean },
): EnvironmentMutationResult {
  const prepared = prepareEnvironment(environment);
  return {
    environments: replaceEnvironment(environments, prepared),
    saveIds: [prepared.id],
    deleteIds: [],
    currentEnvironmentId: prepared.id,
    switchCurrent: true,
    route,
    openEditor: options.openEditor,
    selectedRouteId: route?.id ?? null,
    replaceSelection: options.replaceSelection,
    editorTab: route ? editorTabFor(route, options.editorTab) : options.editorTab ?? null,
  };
}

function routeFromCaptured(environment: Environment, captured: CapturedRequest, kind: 'request' | 'response' | 'full'): Route {
  if (kind === 'full') return createFullMockRouteFromCaptured(environment.routes, captured);
  return upsertRouteFromCapturedRequest(environment.routes, captured, kind);
}

export function applyEnvironmentMutation(
  environments: Environment[],
  mutation: McpMutation,
  currentEnvironmentId: string | null,
): EnvironmentMutationResult {
  switch (mutation.op) {
    case 'create_environment': {
      const name = mutation.name.trim();
      if (!name) throw new Error('name is required');
      const environment = prepareEnvironment({
        id: randomUUID(),
        name,
        port: parsePort(mutation.port, DEFAULT_PORT),
        routes: [],
        revision: 0,
        ...(mutation.upstreamUrl ? { upstreamUrl: mutation.upstreamUrl } : {}),
      });
      return {
        environments: [...environments, environment],
        saveIds: [environment.id],
        deleteIds: [],
        currentEnvironmentId: environment.id,
        switchCurrent: true,
        route: null,
        openEditor: true,
        selectedRouteId: null,
        replaceSelection: true,
        editorTab: null,
      };
    }

    case 'update_environment': {
      const current = requireEnvironment(environments, mutation.environmentId);
      const name = mutation.name !== undefined ? mutation.name.trim() : current.name;
      if (!name) throw new Error('name cannot be empty');
      let next: Environment = {
        ...current,
        name,
        port: parsePort(mutation.port, current.port),
      };
      if (mutation.upstreamUrl === null) {
        delete next.upstreamUrl;
        delete next.upstream;
      } else if (typeof mutation.upstreamUrl === 'string') {
        next = { ...next, upstreamUrl: mutation.upstreamUrl };
      }
      const prepared = prepareEnvironment(next);
      const isCurrent = currentEnvironmentId === prepared.id;
      return {
        environments: replaceEnvironment(environments, prepared),
        saveIds: [prepared.id],
        deleteIds: [],
        currentEnvironmentId: isCurrent ? prepared.id : currentEnvironmentId,
        switchCurrent: isCurrent,
        route: null,
        openEditor: false,
        selectedRouteId: null,
        replaceSelection: false,
        editorTab: null,
      };
    }

    case 'delete_environment': {
      if (environments.length <= 1) throw new Error('Cannot delete the last environment');
      requireEnvironment(environments, mutation.environmentId);
      const remaining = environments.filter((item) => item.id !== mutation.environmentId);
      const deletedCurrent = currentEnvironmentId === mutation.environmentId;
      return {
        environments: remaining,
        saveIds: [],
        deleteIds: [mutation.environmentId],
        currentEnvironmentId: deletedCurrent ? remaining[0]?.id ?? null : currentEnvironmentId,
        switchCurrent: deletedCurrent,
        route: null,
        openEditor: false,
        selectedRouteId: null,
        replaceSelection: deletedCurrent,
        editorTab: null,
      };
    }

    case 'duplicate_environment': {
      const source = requireEnvironment(environments, mutation.environmentId);
      const name = mutation.name?.trim() || `${source.name} (copy)`;
      const copy = prepareEnvironment({
        ...structuredClone(source),
        id: randomUUID(),
        name,
        revision: 0,
      });
      return {
        environments: [...environments, copy],
        saveIds: [copy.id],
        deleteIds: [],
        currentEnvironmentId: copy.id,
        switchCurrent: true,
        route: null,
        openEditor: true,
        selectedRouteId: null,
        replaceSelection: true,
        editorTab: null,
      };
    }

    case 'create_route': {
      const environment = requireEnvironment(environments, mutation.environmentId);
      const route = buildRoute(mutation.route);
      return withEnvironment(
        environments,
        { ...environment, routes: [...environment.routes, route] },
        route,
        { openEditor: true, replaceSelection: true },
      );
    }

    case 'update_route': {
      const environment = requireEnvironment(environments, mutation.environmentId);
      const existing = findRoute(environment, mutation);
      const route = applyRoutePatch(existing, mutation.patch);
      let routes = upsertRoute(environment.routes, route);
      if (mutation.patch.index !== undefined) {
        routes = moveRoute(routes, route.id, mutation.patch.index);
      }
      return withEnvironment(
        environments,
        { ...environment, routes },
        route,
        { openEditor: true, replaceSelection: true },
      );
    }

    case 'delete_route': {
      const environment = requireEnvironment(environments, mutation.environmentId);
      const existing = findRoute(environment, mutation);
      return withEnvironment(
        environments,
        { ...environment, routes: environment.routes.filter((route) => route.id !== existing.id) },
        null,
        { openEditor: true, replaceSelection: true },
      );
    }

    case 'duplicate_route': {
      const environment = requireEnvironment(environments, mutation.environmentId);
      const existing = findRoute(environment, mutation);
      const route = cloneRoute(existing, mutation.name);
      return withEnvironment(
        environments,
        { ...environment, routes: [...environment.routes, route] },
        route,
        { openEditor: true, replaceSelection: true },
      );
    }

    case 'set_route_mocks': {
      const environment = requireEnvironment(environments, mutation.environmentId);
      const existing = findRoute(environment, mutation);
      if (
        mutation.enabled === undefined
        && mutation.mockResponseEnabled === undefined
        && mutation.mockRequestEnabled === undefined
      ) {
        throw new Error('enabled, mockResponseEnabled, or mockRequestEnabled is required');
      }
      const route = applyRoutePatch(existing, {
        enabled: mutation.enabled,
        mockResponseEnabled: mutation.mockResponseEnabled,
        mockRequestEnabled: mutation.mockRequestEnabled,
      });
      const editorTab: McpEditorTab | null = mutation.mockRequestEnabled !== undefined && mutation.mockResponseEnabled === undefined
        ? 'request'
        : 'response';
      return withEnvironment(
        environments,
        { ...environment, routes: upsertRoute(environment.routes, route) },
        route,
        { openEditor: true, editorTab, replaceSelection: true },
      );
    }

    case 'create_mock_from_request': {
      const environment = requireEnvironment(environments, mutation.environmentId);
      const route = routeFromCaptured(environment, mutation.captured, mutation.kind);
      const editorTab: McpEditorTab = mutation.kind === 'request' ? 'request' : 'response';
      return withEnvironment(
        environments,
        { ...environment, routes: upsertRoute(environment.routes, route) },
        route,
        { openEditor: true, editorTab, replaceSelection: true },
      );
    }

    default:
      throw new Error('Unknown environment mutation');
  }
}
