import type { Environment, Route } from './types';

export const MCP_BRIDGE_FILE = 'bridge.json';
export const MCP_BRIDGE_HOST = '127.0.0.1';

export interface McpBridgeInfo {
  port: number;
  token: string;
  pid: number;
}

export type McpEditorTab = 'request' | 'response';

export interface RouteWriteInput {
  name?: string;
  method?: string;
  path?: string;
  action?: 'mock' | 'forward' | 'forward_with_override';
  statusCode?: number;
  headers?: Record<string, string>;
  body?: string;
  delayMs?: number;
  rules?: Array<{ type: 'header_equals' | 'body_field_equals' | 'query_param_equals'; key: string; value: string }>;
  enabled?: boolean;
  mockResponseEnabled?: boolean;
  mockRequestEnabled?: boolean;
  priority?: number;
  requestHeaders?: Record<string, string>;
  requestBody?: string;
  requestHeadersMode?: 'replace' | 'merge';
  requestBodyMode?: 'replace' | 'merge';
  requestMergeFields?: string[];
  requestMergeHeaderFields?: string[];
  requestRules?: Array<{ type: 'header_equals' | 'body_field_equals' | 'query_param_equals'; key: string; value: string }>;
  index?: number;
}

export type McpMockFromRequestKind = 'request' | 'response' | 'full';

export type McpMutation =
  | { op: 'create_environment'; name: string; port?: number; upstreamUrl?: string }
  | { op: 'update_environment'; environmentId: string; name?: string; port?: number; upstreamUrl?: string | null }
  | { op: 'delete_environment'; environmentId: string }
  | { op: 'duplicate_environment'; environmentId: string; name?: string }
  | { op: 'create_route'; environmentId: string; route: RouteWriteInput }
  | {
    op: 'update_route';
    environmentId: string;
    routeId?: string;
    method?: string;
    path?: string;
    patch: RouteWriteInput;
  }
  | { op: 'delete_route'; environmentId: string; routeId?: string; method?: string; path?: string }
  | { op: 'duplicate_route'; environmentId: string; routeId?: string; method?: string; path?: string; name?: string }
  | {
    op: 'set_route_mocks';
    environmentId: string;
    routeId?: string;
    method?: string;
    path?: string;
    enabled?: boolean;
    mockResponseEnabled?: boolean;
    mockRequestEnabled?: boolean;
  }
  | {
    op: 'create_mock_from_request';
    environmentId: string;
    captured: import('./types').CapturedRequest;
    kind: McpMockFromRequestKind;
  };

export interface EnvironmentMutationResult {
  environments: Environment[];
  saveIds: string[];
  deleteIds: string[];
  currentEnvironmentId: string | null;
  switchCurrent: boolean;
  route: Route | null;
  openEditor: boolean;
  selectedRouteId: string | null;
  replaceSelection: boolean;
  editorTab: McpEditorTab | null;
}

export interface McpMutationSuccess {
  ok: true;
  appliedLive: boolean;
  message: string;
  environment: Environment | null;
  route: Route | null;
  openEditor: boolean;
  selectedRouteId: string | null;
  editorTab: McpEditorTab | null;
}

export interface EnvironmentChangedPayload {
  environments: Environment[];
  currentEnvironment: Environment | null;
  openEditor: boolean;
  selectedRouteId?: string | null;
  editorTab?: McpEditorTab | null;
}

export interface EnvironmentSaveResult {
  environment: Environment;
  applied: boolean;
}

export function isStaleEnvironmentSave(incoming: Environment, disk: Environment | null): boolean {
  if (!disk) return false;
  return (incoming.revision ?? 0) < (disk.revision ?? 0);
}

export function bumpEnvironmentRevision(env: Environment, diskRevision?: number): Environment {
  const base = Math.max(diskRevision ?? 0, env.revision ?? 0);
  return { ...env, revision: base + 1 };
}

export function describeMutationResult(
  result: Pick<McpMutationSuccess, 'openEditor' | 'route'>,
  appliedLive: boolean,
): string {
  if (!appliedLive) {
    return 'Saved on disk. Open MockForge to see it in the Editor tab.';
  }
  if (result.openEditor && result.route) {
    return `Updated the running app. ${result.route.method} ${result.route.path} is selected in the Editor tab.`;
  }
  if (result.openEditor) {
    return 'Updated the running app and opened the Editor tab.';
  }
  return 'Updated the running app.';
}
