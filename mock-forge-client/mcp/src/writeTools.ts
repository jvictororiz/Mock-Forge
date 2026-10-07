import type { McpMutation, RouteWriteInput } from '../../shared/mcpBridge';
import { getEnvironment, getSession, listEnvironments, readSessionRecords } from './storage';

const WRITE_TOOL_NAMES = new Set([
  'create_environment',
  'update_environment',
  'delete_environment',
  'duplicate_environment',
  'create_route',
  'update_route',
  'delete_route',
  'duplicate_route',
  'set_route_mocks',
  'create_mock_from_session_request',
]);

function argsOf(args: Record<string, unknown> | undefined): Record<string, unknown> {
  return args ?? {};
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function optionalBoolean(value: unknown): boolean | undefined {
  return typeof value === 'boolean' ? value : undefined;
}

function optionalStringRecord(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (entry === undefined || entry === null) continue;
    result[key] = typeof entry === 'string' ? entry : JSON.stringify(entry);
  }
  return result;
}

function optionalBody(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'string') return value;
  if (value === null) return 'null';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string');
}

function optionalRules(value: unknown): RouteWriteInput['rules'] {
  if (!Array.isArray(value)) return undefined;
  const rules: NonNullable<RouteWriteInput['rules']> = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const rule = item as Record<string, unknown>;
    if (
      rule.type !== 'header_equals'
      && rule.type !== 'body_field_equals'
      && rule.type !== 'query_param_equals'
    ) continue;
    if (typeof rule.key !== 'string' || typeof rule.value !== 'string') continue;
    rules.push({ type: rule.type, key: rule.key, value: rule.value });
  }
  return rules;
}

function optionalAction(value: unknown): RouteWriteInput['action'] {
  if (value === 'mock' || value === 'forward' || value === 'forward_with_override') return value;
  return undefined;
}

function optionalMode(value: unknown): 'replace' | 'merge' | undefined {
  if (value === 'replace' || value === 'merge') return value;
  return undefined;
}

function routeInput(source: Record<string, unknown>): RouteWriteInput {
  return {
    name: optionalString(source.name),
    method: optionalString(source.method),
    path: optionalString(source.path),
    action: optionalAction(source.action),
    statusCode: optionalNumber(source.statusCode),
    headers: optionalStringRecord(source.headers),
    body: optionalBody(source.body),
    delayMs: optionalNumber(source.delayMs),
    rules: optionalRules(source.rules),
    enabled: optionalBoolean(source.enabled),
    mockResponseEnabled: optionalBoolean(source.mockResponseEnabled),
    mockRequestEnabled: optionalBoolean(source.mockRequestEnabled),
    priority: optionalNumber(source.priority),
    requestHeaders: optionalStringRecord(source.requestHeaders),
    requestBody: optionalBody(source.requestBody),
    requestHeadersMode: optionalMode(source.requestHeadersMode),
    requestBodyMode: optionalMode(source.requestBodyMode),
    requestMergeFields: optionalStringArray(source.requestMergeFields),
    requestMergeHeaderFields: optionalStringArray(source.requestMergeHeaderFields),
    requestRules: optionalRules(source.requestRules),
    index: optionalNumber(source.index),
  };
}

function upstreamPatch(value: unknown): string | null | undefined {
  if (value === null || value === '') return null;
  if (typeof value === 'string') return value;
  return undefined;
}

function resolveEnvironmentId(requested: string | undefined, sessionEnvironmentId?: string): string {
  if (requested) return requested;
  if (sessionEnvironmentId && getEnvironment(sessionEnvironmentId)) return sessionEnvironmentId;
  const environments = listEnvironments();
  if (environments.length === 1) return environments[0].id;
  throw new Error('environmentId is required when more than one environment exists');
}

const routeProperties = {
  environmentId: { type: 'string', description: 'Environment ID that owns the route' },
  routeId: { type: 'string', description: 'Route ID. Optional when method and path identify a single route' },
  method: { type: 'string', description: 'HTTP method' },
  path: { type: 'string', description: 'Request path, for example /api/orders' },
};

const responseProperties = {
  name: { type: 'string', description: 'Display name' },
  statusCode: { type: 'number', description: 'Mock response status code' },
  headers: { type: 'object', description: 'Mock response headers' },
  body: { description: 'Mock response body. A string or a JSON value' },
  delayMs: { type: 'number', description: 'Artificial response delay in milliseconds' },
  rules: {
    type: 'array',
    description: 'Match rules for the active response. Items use type header_equals, body_field_equals, or query_param_equals',
  },
  mockResponseEnabled: { type: 'boolean', description: 'Return the configured mock response' },
  mockRequestEnabled: { type: 'boolean', description: 'Override the forwarded request' },
  enabled: { type: 'boolean', description: 'Enable or disable the whole route' },
  priority: { type: 'number', description: 'Match priority. Higher values win' },
  action: { type: 'string', description: 'mock, forward, or forward_with_override' },
  requestHeaders: { type: 'object', description: 'Headers sent on the forwarded request' },
  requestBody: { description: 'Body sent on the forwarded request. A string or a JSON value' },
  requestHeadersMode: { type: 'string', description: 'replace or merge' },
  requestBodyMode: { type: 'string', description: 'replace or merge' },
  requestMergeFields: { type: 'array', description: 'JSON paths included when requestBodyMode is merge' },
  requestMergeHeaderFields: { type: 'array', description: 'Header names included when requestHeadersMode is merge' },
  index: { type: 'number', description: 'Move the route to this position in the editor list' },
};

export const WRITE_TOOL_DEFINITIONS = [
  {
    name: 'create_environment',
    description: 'Create a MockForge environment and show it in the Editor tab when the app is open.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Environment name' },
        port: { type: 'number', description: 'Proxy port between 1024 and 65535. Defaults to 1080' },
        upstreamUrl: { type: 'string', description: 'Real API base URL used when a request is not mocked' },
      },
      required: ['name'],
    },
  },
  {
    name: 'update_environment',
    description: 'Rename an environment or change its port and upstream URL.',
    inputSchema: {
      type: 'object',
      properties: {
        environmentId: { type: 'string', description: 'Environment ID' },
        name: { type: 'string', description: 'New name' },
        port: { type: 'number', description: 'New proxy port. Restarts the server when this is the active environment' },
        upstreamUrl: { type: 'string', description: 'New upstream URL. Pass an empty string to clear it' },
      },
      required: ['environmentId'],
    },
  },
  {
    name: 'delete_environment',
    description: 'Delete an environment and its routes. The last remaining environment cannot be deleted.',
    inputSchema: {
      type: 'object',
      properties: {
        environmentId: { type: 'string', description: 'Environment ID' },
      },
      required: ['environmentId'],
    },
  },
  {
    name: 'duplicate_environment',
    description: 'Duplicate an environment, including its routes, and show the copy in the Editor.',
    inputSchema: {
      type: 'object',
      properties: {
        environmentId: { type: 'string', description: 'Environment ID to copy' },
        name: { type: 'string', description: 'Name for the copy' },
      },
      required: ['environmentId'],
    },
  },
  {
    name: 'create_route',
    description: 'Create a mock route in an environment and select it in the Editor tab.',
    inputSchema: {
      type: 'object',
      properties: {
        ...routeProperties,
        ...responseProperties,
      },
      required: ['environmentId', 'path'],
    },
  },
  {
    name: 'update_route',
    description: 'Edit a mock route. Changes show up in the Editor tab and are synced to MockServer when it is running.',
    inputSchema: {
      type: 'object',
      properties: {
        ...routeProperties,
        ...responseProperties,
      },
      required: ['environmentId'],
    },
  },
  {
    name: 'delete_route',
    description: 'Delete a mock route from an environment.',
    inputSchema: {
      type: 'object',
      properties: routeProperties,
      required: ['environmentId'],
    },
  },
  {
    name: 'duplicate_route',
    description: 'Duplicate a mock route and select the copy in the Editor tab.',
    inputSchema: {
      type: 'object',
      properties: {
        ...routeProperties,
        name: { type: 'string', description: 'Name for the copied route' },
      },
      required: ['environmentId'],
    },
  },
  {
    name: 'set_route_mocks',
    description: 'Enable or disable a route, its response mock, or its request mock.',
    inputSchema: {
      type: 'object',
      properties: {
        ...routeProperties,
        enabled: { type: 'boolean', description: 'Enable or disable the whole route' },
        mockResponseEnabled: { type: 'boolean', description: 'Return the mock response' },
        mockRequestEnabled: { type: 'boolean', description: 'Override the forwarded request' },
      },
      required: ['environmentId'],
    },
  },
  {
    name: 'create_mock_from_session_request',
    description: 'Create or update a mock from a captured session request and open it in the Editor tab. kind=full mocks the request and the response.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Recorded session ID' },
        requestId: { type: 'string', description: 'Captured request ID inside the session' },
        environmentId: { type: 'string', description: 'Target environment. Defaults to the session environment, or the only environment' },
        kind: { type: 'string', description: 'response, request, or full. Defaults to full' },
      },
      required: ['sessionId', 'requestId'],
    },
  },
] as const;

export function buildWriteMutation(
  name: string,
  rawArgs: Record<string, unknown> | undefined,
): McpMutation | null {
  if (!WRITE_TOOL_NAMES.has(name)) return null;
  const args = argsOf(rawArgs);

  switch (name) {
    case 'create_environment':
      return {
        op: 'create_environment',
        name: requireString(args.name, 'name'),
        port: optionalNumber(args.port),
        upstreamUrl: optionalString(args.upstreamUrl),
      };

    case 'update_environment':
      return {
        op: 'update_environment',
        environmentId: requireString(args.environmentId, 'environmentId'),
        name: optionalString(args.name),
        port: optionalNumber(args.port),
        upstreamUrl: upstreamPatch(args.upstreamUrl),
      };

    case 'delete_environment':
      return {
        op: 'delete_environment',
        environmentId: requireString(args.environmentId, 'environmentId'),
      };

    case 'duplicate_environment':
      return {
        op: 'duplicate_environment',
        environmentId: requireString(args.environmentId, 'environmentId'),
        name: optionalString(args.name),
      };

    case 'create_route':
      return {
        op: 'create_route',
        environmentId: requireString(args.environmentId, 'environmentId'),
        route: routeInput(args),
      };

    case 'update_route':
      return {
        op: 'update_route',
        environmentId: requireString(args.environmentId, 'environmentId'),
        routeId: optionalString(args.routeId),
        method: optionalString(args.method),
        path: optionalString(args.path),
        patch: routeInput(args),
      };

    case 'delete_route':
      return {
        op: 'delete_route',
        environmentId: requireString(args.environmentId, 'environmentId'),
        routeId: optionalString(args.routeId),
        method: optionalString(args.method),
        path: optionalString(args.path),
      };

    case 'duplicate_route':
      return {
        op: 'duplicate_route',
        environmentId: requireString(args.environmentId, 'environmentId'),
        routeId: optionalString(args.routeId),
        method: optionalString(args.method),
        path: optionalString(args.path),
        name: optionalString(args.name),
      };

    case 'set_route_mocks':
      return {
        op: 'set_route_mocks',
        environmentId: requireString(args.environmentId, 'environmentId'),
        routeId: optionalString(args.routeId),
        method: optionalString(args.method),
        path: optionalString(args.path),
        enabled: optionalBoolean(args.enabled),
        mockResponseEnabled: optionalBoolean(args.mockResponseEnabled),
        mockRequestEnabled: optionalBoolean(args.mockRequestEnabled),
      };

    case 'create_mock_from_session_request': {
      const sessionId = requireString(args.sessionId, 'sessionId');
      const requestId = requireString(args.requestId, 'requestId');
      const session = getSession(sessionId, false);
      if (!session) throw new Error(`Session not found: ${sessionId}`);
      const captured = readSessionRecords(sessionId, { limit: 100000 })
        .find((record) => record.id === requestId);
      if (!captured) throw new Error(`Request not found in session: ${requestId}`);
      const kind = args.kind === 'request' || args.kind === 'response' || args.kind === 'full'
        ? args.kind
        : 'full';
      return {
        op: 'create_mock_from_request',
        environmentId: resolveEnvironmentId(optionalString(args.environmentId), session.environmentId),
        captured,
        kind,
      };
    }

    default:
      return null;
  }
}
