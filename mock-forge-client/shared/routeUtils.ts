import type { MockKind, MockResponse, RequestOverride, RequestOverrideVariant, Route } from './types';

function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function getActiveResponse(route: Route): MockResponse | undefined {
  if (!route.responses?.length) return undefined;
  return route.responses.find((r) => r.id === route.defaultResponseId) || route.responses[0];
}

export function getActiveRequestOverride(route: Route): RequestOverrideVariant | undefined {
  if (!route.requestOverrides?.length) return undefined;
  return route.requestOverrides.find((r) => r.id === route.defaultRequestOverrideId)
    || route.requestOverrides[0];
}

export function createDefaultResponse(name = 'Response 1'): MockResponse {
  return {
    id: newId(),
    name,
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
    rules: [],
  };
}

export function createDefaultRequestOverride(name = 'Request 1'): RequestOverrideVariant {
  return {
    id: newId(),
    name,
    headers: {},
    headersMode: 'merge',
    mergeHeaderFields: [],
    body: '',
    bodyMode: 'merge',
    mergeFields: [],
    rules: [],
  };
}

function migrateLegacyRequestOverride(route: Route): Route {
  if (route.requestOverrides?.length || !route.requestOverride) {
    return route;
  }

  const id = route.defaultRequestOverrideId || newId();
  const variant: RequestOverrideVariant = {
    id,
    name: 'Default',
    ...route.requestOverride,
    rules: route.matchRules?.length ? [...route.matchRules] : route.requestOverride
      ? undefined
      : [],
  };

  const { requestOverride: _removed, ...rest } = route;
  return {
    ...rest,
    requestOverrides: [variant],
    defaultRequestOverrideId: id,
  };
}

function migrateLegacyMatchRules(route: Route): Route {
  if (!route.matchRules?.length) {
    const { matchRules: _removed, ...rest } = route;
    return rest;
  }

  const rules = [...route.matchRules];
  let updated = { ...route };

  if (updated.responses?.length) {
    const defaultId = updated.defaultResponseId || updated.responses[0].id;
    updated = {
      ...updated,
      responses: updated.responses.map((response) => (
        response.id === defaultId && !response.rules?.length
          ? { ...response, rules }
          : response
      )),
    };
  }

  if (updated.requestOverrides?.length) {
    const defaultId = updated.defaultRequestOverrideId || updated.requestOverrides[0].id;
    updated = {
      ...updated,
      requestOverrides: updated.requestOverrides.map((override) => (
        override.id === defaultId && !override.rules?.length
          ? { ...override, rules }
          : override
      )),
    };
  }

  const { matchRules: _removed, ...rest } = updated;
  return rest;
}

export function normalizeRoute(route: Route): Route {
  return migrateLegacyMatchRules(migrateLegacyRequestOverride(route));
}

export function normalizeEnvironmentRoutes(routes: Route[] | undefined): Route[] {
  return (routes ?? []).map(normalizeRoute);
}

export function hasActiveRequestMock(route: Route): boolean {
  const normalized = normalizeRoute(route);
  return !!normalized.mockRequestEnabled && !!getActiveRequestOverride(normalized);
}

export function hasActiveResponseMock(route: Route): boolean {
  const normalized = normalizeRoute(route);
  return normalized.mockResponseEnabled !== false && !!getActiveResponse(normalized);
}

export function hasActiveRouteMocks(route: Route): boolean {
  return hasActiveRequestMock(route) || hasActiveResponseMock(route);
}

export function routeEndpointKeyFromParts(method: string, path: string): string {
  return `${method}:${path}`;
}

export function findComplementaryRouteForMock(
  routes: Route[],
  method: string,
  path: string,
  kind: MockKind,
): Route | undefined {
  const key = routeEndpointKeyFromParts(method, path);
  return routes.find((route) => {
    if (routeEndpointKeyFromParts(route.method, route.path) !== key) return false;
    if (route.enabled === false) return false;
    const hasRequest = hasActiveRequestMock(route);
    const hasResponse = hasActiveResponseMock(route);
    if (kind === 'request') return hasResponse && !hasRequest;
    return hasRequest && !hasResponse;
  });
}

export function findRouteForTrafficMock(
  routes: Route[],
  method: string,
  path: string,
  kind: MockKind,
): Route | undefined {
  const key = routeEndpointKeyFromParts(method, path);
  return routes.find((route) => {
    if (routeEndpointKeyFromParts(route.method, route.path) !== key) return false;
    if (route.enabled === false) return false;
    return kind === 'request' ? hasActiveRequestMock(route) : hasActiveResponseMock(route);
  });
}

export function endpointHasActiveResponseMock(
  routes: Route[],
  method: string,
  path: string,
  excludeRouteId?: string,
): boolean {
  const key = routeEndpointKeyFromParts(method, path);
  return routes.some((route) => {
    if (excludeRouteId && route.id === excludeRouteId) return false;
    if (route.enabled === false) return false;
    if (routeEndpointKeyFromParts(route.method, route.path) !== key) return false;
    return hasActiveResponseMock(route);
  });
}

export function syncRouteEnabledWithMocks(route: Route): Route {
  const hasMocks = hasActiveRouteMocks(route);
  if (hasMocks && route.enabled === false) {
    return { ...route, enabled: true };
  }
  if (!hasMocks && route.enabled !== false) {
    return { ...route, enabled: false };
  }
  return route;
}

export function disableRouteWithMocks(route: Route): Route {
  return {
    ...route,
    enabled: false,
    mockRequestEnabled: false,
    mockResponseEnabled: false,
  };
}

export function setRouteMockEnabled(
  route: Route,
  kind: MockKind,
  enabled: boolean,
): Route {
  if (kind === 'request') {
    if (!enabled) {
      return syncRouteEnabledWithMocks({ ...route, mockRequestEnabled: false });
    }

    let requestOverrides = route.requestOverrides ?? [];
    let defaultRequestOverrideId = route.defaultRequestOverrideId;
    if (requestOverrides.length === 0) {
      const created = createDefaultRequestOverride();
      requestOverrides = [created];
      defaultRequestOverrideId = created.id;
    }

    return syncRouteEnabledWithMocks({
      ...route,
      requestOverrides,
      defaultRequestOverrideId,
      mockRequestEnabled: true,
    });
  }

  if (!enabled) {
    return syncRouteEnabledWithMocks({ ...route, mockResponseEnabled: false });
  }

  let responses = route.responses ?? [];
  let defaultResponseId = route.defaultResponseId;
  if (responses.length === 0) {
    const created = createDefaultResponse();
    responses = [created];
    defaultResponseId = created.id;
  }

  return syncRouteEnabledWithMocks({
    ...route,
    responses,
    defaultResponseId,
    mockResponseEnabled: true,
  });
}

export function toRequestOverrideFields(variant: RequestOverrideVariant): RequestOverride {
  return {
    headers: variant.headers,
    body: variant.body,
    headersMode: variant.headersMode,
    bodyMode: variant.bodyMode,
    mergeHeaderFields: variant.mergeHeaderFields,
    mergeFields: variant.mergeFields,
  };
}
