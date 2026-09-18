import type { Environment, Route } from './types';
import { getActiveRequestOverride, normalizeRoute } from './routeUtils';
import {
  MOCKFORGE_FORCED_EXECUTION_HEADER,
  MOCKFORGE_REQUEST_ID_HEADER,
} from './mockforgeHeaders';

const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function environmentForRouteExecution(env: Environment, routeId: string): Environment {
  return {
    ...env,
    routes: env.routes.map((route) => (
      route.id === routeId ? { ...route, enabled: true } : route
    )),
  };
}

export function buildExecuteRequestPayload(route: Route, requestId: string): {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: string;
} {
  const normalized = normalizeRoute(route);
  const activeRequest = getActiveRequestOverride(normalized);

  const headers: Record<string, string> = {};

  if (activeRequest?.headers) {
    for (const [key, value] of Object.entries(activeRequest.headers)) {
      headers[key] = value;
    }
  }

  headers[MOCKFORGE_REQUEST_ID_HEADER] = requestId;
  headers[MOCKFORGE_FORCED_EXECUTION_HEADER] = '1';

  let body: string | undefined;
  if (
    activeRequest
    && METHODS_WITH_BODY.has(normalized.method)
    && activeRequest.body !== undefined
  ) {
    body = activeRequest.body;
  }

  return {
    method: normalized.method,
    path: normalized.path,
    headers,
    body,
  };
}
