import { randomUUID } from 'crypto';
import type {
  Environment,
  Route,
  MockServerExpectation,
  CapturedRequest,
  MatchRule,
  RequestOverride,
  RequestOverrideVariant,
  MockResponse,
  Upstream,
  MockKind,
} from '../../shared/types';
import {
  MOCKFORGE_RESPONSE_MARKER_HEADER,
  MOCKFORGE_REQUEST_MARKER_HEADER,
  MOCKFORGE_REQUEST_BODY_PATHS_HEADER,
  MOCKFORGE_REQUEST_HEADER_FIELDS_HEADER,
  isInternalMockForgeHeader,
  withoutInternalMockForgeHeaders,
} from '../../shared/mockforgeHeaders';
import { inferTrafficMockStatus } from '../../shared/trafficMockStatus';
import { getMockedRequestPathsFromOverride, inferTrafficMockPaths } from '../../shared/trafficMockPaths';
import { resolveUpstream } from '../../shared/upstreamUtils';
import { decodeHttpBody, stripContentEncodingHeaders } from '../../shared/httpBodyEncoding';
import { prettifyJsonIfPossible } from '../../shared/jsonFormat';
import { applyResponseTemplating, containsResponseTemplates } from '../../shared/responseTemplating';
import { parseJsonBody, pickPaths } from '../../shared/jsonMergeUtils';
import {
  shouldProxyApplyBodyMerge,
  type ProxyRequestMockRoute,
} from '../../shared/requestOverrideApply';
import {
  endpointHasActiveResponseMock,
  findComplementaryRouteForMock,
  getActiveRequestOverride,
  getActiveResponse,
  hasActiveRouteMocks,
  normalizeRoute,
  toRequestOverrideFields,
} from '../../shared/routeUtils';
import { fromMockServerPathPattern, toMockServerPathPattern } from '../../shared/routePathMatch';

function headersToMockServer(headers: Record<string, string>): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(headers)) {
    result[key] = [value];
  }
  return result;
}

function parseBody(body: string): unknown {
  if (!body || body.trim() === '') return undefined;
  try {
    return JSON.parse(body);
  } catch {
    return body;
  }
}

function buildHttpRequest(route: Route, matchRules?: MatchRule[]): Record<string, unknown> {
  const httpRequest: Record<string, unknown> = {
    method: route.method,
    path: toMockServerPathPattern(route.path),
  };

  if (matchRules) {
    for (const rule of matchRules) {
      switch (rule.type) {
        case 'header_equals':
          httpRequest.headers = {
            ...(httpRequest.headers as Record<string, unknown> || {}),
            [rule.key]: [rule.value],
          };
          break;
        case 'body_field_equals':
          httpRequest.body = {
            type: 'JSON',
            json: { [rule.key]: rule.value },
            matchType: 'ONLY_MATCHING_FIELDS',
          };
          break;
        case 'query_param_equals':
          httpRequest.queryStringParameters = {
            ...(httpRequest.queryStringParameters as Record<string, unknown> || {}),
            [rule.key]: [rule.value],
          };
          break;
      }
    }
  }

  return httpRequest;
}

function buildStaticHttpResponse(response: MockResponse): Record<string, unknown> {
  const httpResponse: Record<string, unknown> = {
    statusCode: response.statusCode,
    headers: headersToMockServer({
      ...withoutInternalMockForgeHeaders(response.headers || {}),
      [MOCKFORGE_RESPONSE_MARKER_HEADER]: '1',
    }),
  };

  const parsed = parseBody(response.body);
  if (parsed !== undefined) {
    httpResponse.body = parsed;
  }

  if (response.delayMs) {
    httpResponse.delay = { timeUnit: 'MILLISECONDS', value: response.delayMs };
  }

  return httpResponse;
}

function buildTemplatedHttpResponse(response: MockResponse): Record<string, unknown> {
  const templatedBody = applyResponseTemplating(response.body);
  const parsed = parseBody(templatedBody);

  const templatePayload: Record<string, unknown> = {
    statusCode: response.statusCode,
    headers: headersToMockServer({
      ...withoutInternalMockForgeHeaders(response.headers || {}),
      [MOCKFORGE_RESPONSE_MARKER_HEADER]: '1',
    }),
  };

  if (parsed !== undefined) {
    templatePayload.body = parsed;
  }

  if (response.delayMs) {
    templatePayload.delay = { timeUnit: 'MILLISECONDS', value: response.delayMs };
  }

  return {
    templateType: 'MUSTACHE',
    template: JSON.stringify(templatePayload),
  };
}

function buildResponseAction(response: MockResponse): {
  httpResponse?: Record<string, unknown>;
  httpResponseTemplate?: Record<string, unknown>;
} {
  if (containsResponseTemplates(response.body)) {
    return { httpResponseTemplate: buildTemplatedHttpResponse(response) };
  }
  return { httpResponse: buildStaticHttpResponse(response) };
}

function buildHttpResponseForRoute(route: Route): {
  httpResponse?: Record<string, unknown>;
  httpResponseTemplate?: Record<string, unknown>;
} | undefined {
  const response = getActiveResponse(route);
  if (!response) return undefined;
  return buildResponseAction(response);
}

function buildHttpResponse(route: Route): {
  httpResponse?: Record<string, unknown>;
  httpResponseTemplate?: Record<string, unknown>;
} | undefined {
  if (route.action !== 'mock' || !route.responses?.length) return undefined;
  return buildHttpResponseForRoute(route);
}

function buildOverrideBody(requestOverride: RequestOverride): unknown {
  if (!requestOverride.body?.trim()) return undefined;

  const body = requestOverride.body;
  if (requestOverride.bodyMode === 'merge') {
    if (shouldProxyApplyBodyMerge(requestOverride)) {
      return undefined;
    }

    const parsed = parseJsonBody(body);
    if (parsed === null || typeof parsed !== 'object') return undefined;

    const mergeFields = requestOverride.mergeFields;
    const json = mergeFields?.length
      ? pickPaths(parsed, mergeFields)
      : parsed;

    const isEmpty = Array.isArray(json)
      ? json.length === 0
      : Object.keys(json as Record<string, unknown>).length === 0;

    if (isEmpty) return undefined;

    return {
      type: 'JSON',
      json,
      matchType: 'ONLY_MATCHING_FIELDS',
    };
  }

  return parseBody(body);
}

function buildOverrideHeaders(
  requestOverride: RequestOverride,
  upstream: Upstream,
): Record<string, string[]> {
  const source = requestOverride.headers || {};
  let headers: Record<string, string>;

  if (requestOverride.headersMode === 'merge') {
    const fields = requestOverride.mergeHeaderFields ?? [];
    headers = fields.length > 0
      ? pickPaths(source, fields) as Record<string, string>
      : {};
  } else {
    headers = { ...source };
  }

  headers.Host = upstream.host;
  return headersToMockServer(headers);
}

function buildRequestMockResponseModifier(requestOverride: RequestOverride): Record<string, unknown> {
  const paths = getMockedRequestPathsFromOverride(requestOverride);
  const add: Record<string, string[]> = {
    [MOCKFORGE_REQUEST_MARKER_HEADER]: ['1'],
  };

  if (paths.mockedRequestBodyPaths?.length) {
    add[MOCKFORGE_REQUEST_BODY_PATHS_HEADER] = [JSON.stringify(paths.mockedRequestBodyPaths)];
  }
  if (paths.mockedRequestHeaderFields?.length) {
    add[MOCKFORGE_REQUEST_HEADER_FIELDS_HEADER] = [JSON.stringify(paths.mockedRequestHeaderFields)];
  }

  return {
    headers: {
      add,
    },
  };
}

function buildHttpOverrideForwardedRequest(
  requestOverride: RequestOverride,
  upstream: Upstream,
): Record<string, unknown> {
  const request: Record<string, unknown> = {
    headers: buildOverrideHeaders(requestOverride, upstream),
    socketAddress: {
      host: upstream.host,
      port: upstream.port,
      scheme: upstream.scheme,
    },
  };

  const body = buildOverrideBody(requestOverride);
  if (body !== undefined) {
    request.body = body;
  }

  return {
    requestOverride: request,
    responseModifier: buildRequestMockResponseModifier(requestOverride),
  };
}

function buildHttpForward(route: Route): Record<string, unknown> | undefined {
  if (route.action === 'mock') return undefined;
  if (!route.upstream) return undefined;

  return {
    host: route.upstream.host,
    port: route.upstream.port,
    scheme: route.upstream.scheme,
  };
}

function buildHttpOverride(route: Route): Record<string, unknown> | undefined {
  const activeRequest = getActiveRequestOverride(route);
  if (route.action !== 'forward_with_override' || !activeRequest || !route.upstream) {
    return undefined;
  }
  return buildHttpOverrideForwardedRequest(toRequestOverrideFields(activeRequest), route.upstream);
}

export function routeToExpectation(route: Route): MockServerExpectation {
  const normalized = normalizeRoute(route);
  const activeResponse = getActiveResponse(normalized);
  const expectation: MockServerExpectation = {
    id: normalized.id,
    priority: normalized.priority ?? 0,
    httpRequest: buildHttpRequest(normalized, activeResponse?.rules),
    times: { unlimited: true },
  };

  const responseAction = normalized.mockResponseEnabled !== false
    ? buildHttpResponse(normalized)
    : undefined;
  if (responseAction?.httpResponse) expectation.httpResponse = responseAction.httpResponse;
  if (responseAction?.httpResponseTemplate) {
    expectation.httpResponseTemplate = responseAction.httpResponseTemplate;
  }

  const httpOverride = buildHttpOverride(normalized);
  if (httpOverride) {
    expectation.httpOverrideForwardedRequest = httpOverride;
    return expectation;
  }

  const httpForward = buildHttpForward(normalized);
  if (httpForward) expectation.httpForward = httpForward;

  return expectation;
}

function isValidExpectation(exp: MockServerExpectation): boolean {
  return !!(
    exp.httpResponse
    || exp.httpResponseTemplate
    || exp.httpForward
    || exp.httpOverrideForwardedRequest
  );
}

export function routeToExpectations(
  route: Route,
  envUpstream?: Upstream,
  allRoutes?: Route[],
): MockServerExpectation[] {
  const normalized = normalizeRoute(route);
  const priority = normalized.priority ?? 0;
  const expectations: MockServerExpectation[] = [];
  const routes = allRoutes ?? [route];

  const activeResponse = getActiveResponse(normalized);
  const activeRequest = getActiveRequestOverride(normalized);
  const hasResponseMock = normalized.mockResponseEnabled !== false && !!activeResponse;
  const hasRequestMock = !!normalized.mockRequestEnabled && !!activeRequest;
  const responseMockedOnEndpoint = hasResponseMock
    || endpointHasActiveResponseMock(routes, normalized.method, normalized.path, normalized.id);

  if (hasResponseMock) {
    const responseAction = buildResponseAction(activeResponse);
    expectations.push({
      id: `${normalized.id}-response`,
      priority,
      httpRequest: buildHttpRequest(normalized, activeResponse.rules),
      ...responseAction,
      times: { unlimited: true },
    });
  }

  // Request overrides are applied in the TCP proxy. Only register a forward
  // expectation when the endpoint has no response mock (same route or sibling).
  if (hasRequestMock && !responseMockedOnEndpoint) {
    const upstream = normalized.upstream || envUpstream;
    if (upstream) {
      expectations.push({
        id: `${normalized.id}-request`,
        priority,
        httpRequest: buildHttpRequest(normalized, activeRequest.rules),
        httpOverrideForwardedRequest: buildHttpOverrideForwardedRequest(
          toRequestOverrideFields(activeRequest),
          upstream,
        ),
        times: { unlimited: true },
      });
    }
  }

  if (expectations.length === 0) {
    const upstream = normalized.upstream || envUpstream;
    const requestHandledByProxy = hasRequestMock && responseMockedOnEndpoint;
    if (upstream && !requestHandledByProxy) {
      expectations.push({
        id: `${normalized.id}-forward`,
        priority,
        httpRequest: buildHttpRequest(normalized, activeResponse?.rules),
        httpForward: {
          host: upstream.host,
          port: upstream.port,
          scheme: upstream.scheme,
        },
        times: { unlimited: true },
      });
    }
  }

  return expectations;
}

function isRouteEnabled(route: Route): boolean {
  return route.enabled !== false && hasActiveRouteMocks(route);
}

export function environmentToInterceptRoutes(env: Environment): Array<{ method: string; path: string }> {
  return env.routes
    .filter(isRouteEnabled)
    .map((route) => ({ method: route.method, path: route.path }));
}

export function environmentToProxyRequestMocks(env: Environment): ProxyRequestMockRoute[] {
  const mocks: ProxyRequestMockRoute[] = [];

  for (const route of env.routes) {
    if (!isRouteEnabled(route) || !route.mockRequestEnabled) continue;

    const normalized = normalizeRoute(route);
    const activeRequest = getActiveRequestOverride(normalized);
    if (!activeRequest) continue;

    mocks.push({
      method: normalized.method,
      path: normalized.path,
      requestOverride: toRequestOverrideFields(activeRequest),
    });
  }

  return mocks;
}

export function environmentToExpectations(env: Environment): MockServerExpectation[] {
  const upstream = resolveUpstream(env);
  const enabledRoutes = env.routes.filter(isRouteEnabled);
  return enabledRoutes
    .flatMap((route) => routeToExpectations(route, upstream, env.routes))
    .filter(isValidExpectation);
}

function mockServerHeadersToRecord(headers: Record<string, string[]> | undefined): Record<string, string> {
  if (!headers) return {};
  const result: Record<string, string> = {};
  for (const [key, values] of Object.entries(headers)) {
    result[key] = Array.isArray(values) ? values[0] : String(values);
  }
  return result;
}

function bodyToString(body: unknown): string {
  if (body === undefined || body === null) return '';
  if (typeof body === 'string') return body;
  if (Buffer.isBuffer(body)) return body.toString('latin1');
  return JSON.stringify(body, null, 2);
}

function decodeRecordedResponseBody(
  body: string,
  headers?: Record<string, string>,
): string {
  if (!body || !headers) return body;
  const encoding = headers['content-encoding'] || headers['Content-Encoding'];
  if (!encoding) return body;
  return decodeHttpBody(Buffer.from(body, 'latin1'), encoding);
}

export function expectationToRoute(exp: MockServerExpectation): Route {
  const httpRequest = exp.httpRequest || {};
  const method = (httpRequest.method as string) || 'GET';
  const path = fromMockServerPathPattern((httpRequest.path as string) || '/');

  let action: Route['action'] = 'mock';
  if (exp.httpForward) {
    action = exp.httpOverrideForwardedRequest ? 'forward_with_override' : 'forward';
  }

  const route: Route = {
    id: exp.id || randomUUID(),
    name: path,
    method: method as Route['method'],
    path,
    action,
    priority: exp.priority,
    matchRules: [],
  };

  if (exp.httpResponse) {
    const resp = exp.httpResponse;
    const responseId = randomUUID();
    route.responses = [{
      id: responseId,
      name: 'Default',
      statusCode: (resp.statusCode as number) || 200,
      headers: mockServerHeadersToRecord(resp.headers as Record<string, string[]>),
      body: bodyToString(resp.body),
      delayMs: (resp.delay as { value?: number })?.value,
    }];
    route.defaultResponseId = responseId;
  }

  if (exp.httpForward) {
    const fwd = exp.httpForward;
    route.upstream = {
      host: fwd.host as string,
      port: fwd.port as number,
      scheme: (fwd.scheme as 'HTTP' | 'HTTPS') || 'HTTP',
    };
  }

  if (exp.httpOverrideForwardedRequest) {
    const override = exp.httpOverrideForwardedRequest.httpRequest as Record<string, unknown> | undefined;
    if (override) {
      const requestOverrideId = randomUUID();
      route.requestOverrides = [{
        id: requestOverrideId,
        name: 'Default',
        headers: mockServerHeadersToRecord(override.headers as Record<string, string[]>),
        body: bodyToString(override.body),
        bodyMode: 'replace',
      }];
      route.defaultRequestOverrideId = requestOverrideId;
    }
  }

  return route;
}

export function expectationsToEnvironment(
  expectations: MockServerExpectation[],
  env: Pick<Environment, 'id' | 'name' | 'port'>
): Environment {
  return {
    ...env,
    routes: expectations.map(expectationToRoute),
  };
}

let lastSyncedExpectationsHash: string | null = null;

export class MockServerAdapter {
  constructor(private baseUrl: string) {}

  private async request(path: string, body?: unknown): Promise<Response> {
    return fetch(`${this.baseUrl}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  private async retrieve(
    type: 'REQUEST_RESPONSES' | 'ACTIVE_EXPECTATIONS' | 'REQUESTS',
    filter: Record<string, unknown> = {},
  ): Promise<Response> {
    const params = new URLSearchParams({
      type,
      format: 'JSON',
    });
    return fetch(`${this.baseUrl}/mockserver/retrieve?${params}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(filter),
    });
  }

  async syncExpectations(
    expectations: MockServerExpectation[],
    options?: { clearLog?: boolean },
  ): Promise<void> {
    await fetch(`${this.baseUrl}/mockserver/clear?type=EXPECTATIONS`, { method: 'PUT' });
    for (const exp of expectations) {
      const res = await this.request('/mockserver/expectation', exp);
      if (!res.ok) {
        const detail = await res.text();
        const label = exp.id || String(exp.httpRequest?.path || 'unknown');
        throw new Error(`Failed to sync expectation "${label}": ${detail.slice(0, 200)}`);
      }
    }
    if (options?.clearLog) {
      await this.clearRequestLog();
    }
  }

  async clearRequestLog(): Promise<void> {
    await fetch(`${this.baseUrl}/mockserver/clear?type=LOG`, { method: 'PUT' });
  }

  async syncEnvironment(
    env: Environment,
    options?: { clearLog?: boolean; force?: boolean },
  ): Promise<void> {
    const expectations = environmentToExpectations(env);
    const hash = JSON.stringify(expectations);
    if (!options?.force && !options?.clearLog && hash === lastSyncedExpectationsHash) {
      return;
    }
    await this.syncExpectations(expectations, options);
    lastSyncedExpectationsHash = hash;
  }

  static resetSyncState(): void {
    lastSyncedExpectationsHash = null;
  }

  async getRecordedRequests(): Promise<CapturedRequest[]> {
    const responsesRes = await this.retrieve('REQUEST_RESPONSES');

    const items = responsesRes.ok
      ? (await responsesRes.json() as Array<Record<string, unknown>>)
      : [];

    const filtered = items.filter((item) => {
      const req = item.httpRequest as { path?: string } | undefined;
      const path = req?.path;
      return path && !path.startsWith('/mockserver');
    });

    const slice = filtered.slice(-50).reverse();

    return slice.map((item) => {
      const req = (item.httpRequest || {}) as {
        method?: string;
        path?: string;
        headers?: Record<string, string[]>;
        body?: unknown;
      };
      const resp = item.httpResponse as {
        statusCode?: number;
        reasonPhrase?: string;
        headers?: Record<string, string[]>;
        body?: unknown;
      } | undefined;

      const method = req.method || 'GET';
      const path = req.path || '/';
      const timestamp = typeof item.timestamp === 'string' ? item.timestamp : '';
      const body = prettifyJsonIfPossible(bodyToString(req.body));
      const responseHeadersRaw = resp ? mockServerHeadersToRecord(resp.headers) : undefined;
      let responseBody = resp ? bodyToString(resp.body) : '';
      let responseHeaders = responseHeadersRaw;
      if (responseHeadersRaw && responseBody) {
        const decoded = decodeRecordedResponseBody(responseBody, responseHeadersRaw);
        if (decoded !== responseBody) {
          responseBody = decoded;
          responseHeaders = stripContentEncodingHeaders(responseHeadersRaw);
        }
      }
      responseBody = prettifyJsonIfPossible(responseBody);
      const id = timestamp
        ? `${method}:${path}:${timestamp}`
        : `${method}:${path}:${body.slice(0, 64)}:${resp?.statusCode ?? 0}:${responseBody.slice(0, 64)}`;
      const mockStatus = inferTrafficMockStatus(responseHeaders);
      const mockPaths = inferTrafficMockPaths(responseHeaders);

      return {
        id,
        timestamp,
        method,
        path,
        headers: mockServerHeadersToRecord(req.headers),
        body,
        responseStatus: resp?.statusCode,
        responseHeaders,
        responseBody: resp ? responseBody : undefined,
        responseReason: resp?.reasonPhrase,
        durationMs: (item.timeToResponse as { value?: number })?.value,
        mockedRequest: mockStatus.mockedRequest,
        mockedResponse: mockStatus.mockedResponse,
        mockedRequestBodyPaths: mockPaths.mockedRequestBodyPaths,
        mockedRequestHeaderFields: mockPaths.mockedRequestHeaderFields,
      };
    });
  }

  async getActiveExpectations(): Promise<MockServerExpectation[]> {
    const res = await this.retrieve('ACTIVE_EXPECTATIONS');
    if (!res.ok) return [];
    return res.json() as Promise<MockServerExpectation[]>;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const res = await this.retrieve('REQUESTS');
      return res.ok;
    } catch {
      return false;
    }
  }
}

export function createRouteFromCapturedRequest(
  captured: CapturedRequest,
  kind: MockKind = 'response',
): Route {
  return upsertRouteFromCapturedRequest([], captured, kind);
}

export function createFullMockRouteFromCaptured(
  routes: Route[],
  captured: CapturedRequest,
): Route {
  const responseRoute = upsertRouteFromCapturedRequest(routes, captured, 'response');
  const nextRoutes = routes.some((route) => route.id === responseRoute.id)
    ? routes.map((route) => (route.id === responseRoute.id ? responseRoute : route))
    : [...routes, responseRoute];

  return upsertRouteFromCapturedRequest(nextRoutes, captured, 'request', responseRoute.id);
}

export function createFullMockRoutesFromCaptured(
  routes: Route[],
  capturedList: CapturedRequest[],
): { routes: Route[]; added: Route[] } {
  let currentRoutes = [...routes];
  const added: Route[] = [];

  for (const captured of capturedList) {
    const route = createFullMockRouteFromCaptured(currentRoutes, captured);
    const existingIndex = currentRoutes.findIndex((item) => item.id === route.id);
    if (existingIndex >= 0) {
      currentRoutes[existingIndex] = route;
    } else {
      currentRoutes.push(route);
    }

    const addedIndex = added.findIndex((item) => item.id === route.id);
    if (addedIndex >= 0) {
      added[addedIndex] = route;
    } else {
      added.push(route);
    }
  }

  return { routes: currentRoutes, added };
}

function formatCapturedBody(body?: string, headers?: Record<string, string>): string {
  const normalized = decodeRecordedResponseBody(body || '', headers);
  const pretty = prettifyJsonIfPossible(normalized);
  return pretty || '{}';
}

function filterEditableHeaders(headers: Record<string, string>): Record<string, string> {
  const skip = new Set(['host', 'connection', 'content-length', 'x-mockforge-request-id']);
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!skip.has(key.toLowerCase()) && !isInternalMockForgeHeader(key)) {
      result[key] = value;
    }
  }
  return result;
}

function buildCapturedResponse(captured: CapturedRequest, responseId?: string) {
  const id = responseId || randomUUID();
  return {
    responses: [{
      id,
      name: 'Captured Response',
      statusCode: captured.responseStatus || 200,
      headers: withoutInternalMockForgeHeaders(
        captured.responseHeaders || { 'Content-Type': 'application/json' },
      ),
      body: formatCapturedBody(captured.responseBody, captured.responseHeaders) || '{}',
      rules: buildMatchRulesFromRequest(captured),
    }],
    defaultResponseId: id,
  };
}

function buildCapturedRequestOverride(captured: CapturedRequest): RequestOverrideVariant {
  const headers = filterEditableHeaders(captured.headers);
  return {
    id: randomUUID(),
    name: 'Captured Request',
    headers,
    headersMode: 'merge',
    mergeHeaderFields: [],
    body: formatCapturedBody(captured.body),
    bodyMode: 'merge',
    mergeFields: [],
    rules: buildMatchRulesFromRequest(captured),
  };
}

export function upsertRouteFromCapturedRequest(
  routes: Route[],
  captured: CapturedRequest,
  kind: MockKind,
  mergeRouteId?: string,
): Route {
  const existing = mergeRouteId
    ? routes.find((route) => route.id === mergeRouteId)
    : findComplementaryRouteForMock(routes, captured.method, captured.path, kind);

  const base: Route = existing ?? {
    id: randomUUID(),
    name: `${captured.method} ${captured.path}`,
    method: captured.method as Route['method'],
    path: captured.path,
    action: 'mock',
    priority: 10,
    enabled: true,
    mockResponseEnabled: false,
    mockRequestEnabled: false,
  };

  if (kind === 'response') {
    const responseId = base.defaultResponseId || randomUUID();
    const capturedResponse = buildCapturedResponse(captured, responseId);
    const requestOverrides = base.requestOverrides?.length
      ? base.requestOverrides
      : [buildCapturedRequestOverride(captured)];
    return {
      ...base,
      mockResponseEnabled: true,
      mockRequestEnabled: !!base.mockRequestEnabled,
      action: base.mockRequestEnabled ? base.action : 'mock',
      ...capturedResponse,
      requestOverrides,
      defaultRequestOverrideId: base.defaultRequestOverrideId ?? requestOverrides[0]?.id,
    };
  }

  const capturedResponse = base.responses?.length
    ? { responses: base.responses, defaultResponseId: base.defaultResponseId }
    : buildCapturedResponse(captured);

  const requestOverride = buildCapturedRequestOverride(captured);
  const existingOverrides = base.requestOverrides ?? [];
  const requestOverrides = existingOverrides.length
    ? existingOverrides
    : [requestOverride];

  return {
    ...base,
    ...capturedResponse,
    mockRequestEnabled: true,
    mockResponseEnabled: base.mockResponseEnabled === true,
    action: base.mockResponseEnabled ? base.action : 'forward_with_override',
    requestOverrides,
    defaultRequestOverrideId: base.defaultRequestOverrideId || requestOverrides[0]?.id,
  };
}

function buildMatchRulesFromRequest(captured: CapturedRequest): MatchRule[] {
  const rules: MatchRule[] = [];
  const contentType = captured.headers['Content-Type'] || captured.headers['content-type'];
  if (contentType) {
    rules.push({ type: 'header_equals', key: 'Content-Type', value: contentType });
  }
  return rules;
}
