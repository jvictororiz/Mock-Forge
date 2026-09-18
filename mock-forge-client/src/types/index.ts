export type {
  Environment,
  Route,
  CapturedRequest,
  ServerStatus,
  HttpMethod,
  RouteAction,
  AdbDevice,
  ConsumerPlatform,
  MockResponse,
  MatchRule,
  RequestOverride,
  RequestOverrideVariant,
  Upstream,
  MockKind,
  InstabilityKind,
  TrafficRecordType,
} from '../../shared/types';

export { MOCKFORGE_RESPONSE_MARKER_HEADER, MOCKFORGE_REQUEST_MARKER_HEADER, MOCKFORGE_REQUEST_BODY_PATHS_HEADER, MOCKFORGE_REQUEST_HEADER_FIELDS_HEADER } from '../../shared/mockforgeHeaders';

export const SENSITIVE_HEADERS = [
  'authorization',
  'cookie',
  'set-cookie',
  'x-api-key',
  'x-auth-token',
  'x-access-token',
];
