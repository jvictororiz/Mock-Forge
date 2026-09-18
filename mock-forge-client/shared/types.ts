export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'HEAD' | 'OPTIONS';

export type RouteAction = 'mock' | 'forward' | 'forward_with_override';

export interface MatchRule {
  type: 'header_equals' | 'body_field_equals' | 'query_param_equals';
  key: string;
  value: string;
}

export interface MockResponse {
  id: string;
  name: string;
  statusCode: number;
  headers: Record<string, string>;
  body: string;
  rules?: MatchRule[];
  delayMs?: number;
}

export interface RequestOverride {
  headers?: Record<string, string>;
  body?: string;
  headersMode?: 'replace' | 'merge';
  bodyMode: 'replace' | 'merge';
  /** Header keys included in merge overrides. */
  mergeHeaderFields?: string[];
  /** Leaf JSON paths included in merge overrides. */
  mergeFields?: string[];
}

export interface RequestOverrideVariant extends RequestOverride {
  id: string;
  name: string;
  rules?: MatchRule[];
}

export interface Upstream {
  host: string;
  port: number;
  scheme: 'HTTP' | 'HTTPS';
  basePath?: string;
  trailingSlash?: boolean;
}

export interface Route {
  id: string;
  name: string;
  method: HttpMethod;
  path: string;
  action: RouteAction;
  /** @deprecated Migrated to variant-level rules on load. */
  matchRules?: MatchRule[];
  responses?: MockResponse[];
  defaultResponseId?: string;
  /** @deprecated Migrated to requestOverrides on load. */
  requestOverride?: RequestOverride;
  requestOverrides?: RequestOverrideVariant[];
  defaultRequestOverrideId?: string;
  upstream?: Upstream;
  priority?: number;
  /** When true, returns the configured mock response for matching requests. */
  mockResponseEnabled?: boolean;
  /** When true, forwards to upstream with the configured request override. */
  mockRequestEnabled?: boolean;
  /** When false, this route is ignored by MockServer until re-enabled. */
  enabled?: boolean;
}

export type MockKind = 'request' | 'response';

export interface Environment {
  id: string;
  name: string;
  port: number;
  routes: Route[];
  /** Raw upstream URL as entered in settings (preserves trailing slash). */
  upstreamUrl?: string;
  upstream?: Upstream;
}

export type ConsumerPlatform = 'android' | 'ios' | 'mac' | 'mockforge' | 'unknown';

export type TrafficRecordType = 'request' | 'instability';

export type InstabilityKind =
  | 'adb_reverse_lost'
  | 'adb_reverse_restore_failed'
  | 'adb_no_device'
  | 'connection_failed'
  | 'client_disconnect'
  | 'proxy_shutdown'
  | 'mockserver_unreachable'
  | 'upstream_error';

export interface CapturedRequest {
  id: string;
  timestamp: string;
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: string;
  responseStatus?: number;
  responseHeaders?: Record<string, string>;
  responseBody?: string;
  responseBodyTruncated?: boolean;
  responseReason?: string;
  durationMs?: number;
  /** Set at capture time; do not infer from current route config. */
  mockedRequest?: boolean;
  mockedResponse?: boolean;
  /** JSON body paths overridden by a request mock at capture time. */
  mockedRequestBodyPaths?: string[];
  /** Request header fields overridden by a request mock at capture time. */
  mockedRequestHeaderFields?: string[];
  /** True when the request was triggered manually from the route editor. */
  forcedExecution?: boolean;
  /** Client IP as seen by the proxy (may be localhost for tunneled devices). */
  clientIp?: string;
  userAgent?: string;
  consumerId?: string;
  consumerLabel?: string;
  consumerPlatform?: ConsumerPlatform;
  /** Distinguishes system instability events from regular HTTP requests. */
  recordType?: TrafficRecordType;
  instabilityKind?: InstabilityKind;
  /** Technical detail for instability events or failed connections. */
  instabilityMessage?: string;
  /** True when the request reached the proxy but failed before a complete response. */
  connectionFailed?: boolean;
  /** True when upstream succeeded but the client lost the connection mid-stream. */
  clientInstability?: boolean;
}

export interface AdbDevice {
  id: string;
  name: string;
  address: string;
  state: 'device' | 'offline' | 'unauthorized' | 'connecting' | string;
  connectionType: 'usb' | 'wifi' | 'emulator' | 'unknown';
  reverseActive: boolean;
}

export interface ServerStatus {
  running: boolean;
  port: number;
  healthy: boolean;
  javaAvailable: boolean;
  javaVersion?: string;
  javaSource?: 'bundled' | 'system';
  jarAvailable: boolean;
  localIp?: string | null;
  lastError?: string | null;
  proxyRequestCount?: number;
  adbAvailable?: boolean;
  adbDevices?: AdbDevice[];
  adbReverseActive?: boolean;
  activeAdbDevice?: string | null;
  deviceBaseUrl?: string | null;
  error?: string;
}

export type MirrorRuntimeState = 'idle' | 'downloading' | 'starting' | 'streaming' | 'error';

export interface MirrorStatus {
  state: MirrorRuntimeState;
  active: boolean;
  deviceId: string | null;
  serverAvailable: boolean;
  error: string | null;
}

export type MirrorTouchAction = 'down' | 'up' | 'move';

export interface MirrorTouchInput {
  action: MirrorTouchAction;
  x: number;
  y: number;
  screenWidth: number;
  screenHeight: number;
}

export interface MirrorScrollInput {
  x: number;
  y: number;
  screenWidth: number;
  screenHeight: number;
  deltaX: number;
  deltaY: number;
}

export interface MirrorCaptureResult {
  success: boolean;
  canceled?: boolean;
  path?: string;
  error?: string;
}

export interface MockServerExpectation {
  id?: string;
  priority?: number;
  httpRequest?: Record<string, unknown>;
  httpResponse?: Record<string, unknown>;
  httpResponseTemplate?: Record<string, unknown>;
  httpForward?: Record<string, unknown>;
  httpOverrideForwardedRequest?: Record<string, unknown>;
  times?: { unlimited?: boolean };
}

export const SENSITIVE_HEADERS = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-access-token',
];
