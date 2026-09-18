import { compareSessions } from '../../shared/sessionCompare';
import type { SessionCompareOptions } from '../../shared/comparisonTypes';
import type { ComparisonPair, SessionComparison } from '../../shared/comparisonTypes';
import {
  findSessionPairs,
  resolveSessionPair,
  searchRoutes,
  searchSessionRequests,
} from './queries';
import {
  getEnvironment,
  getSession,
  listEnvironments,
  listSessions,
  readSessionRecords,
} from './storage';

export interface ImportantDivergence {
  endpoint: string;
  severity: 'critical' | 'warning' | 'info';
  status: 'different' | 'missing_in_a' | 'missing_in_b';
  diffs: ComparisonPair['diffs'];
}

function getImportantDivergences(comparison: SessionComparison): ImportantDivergence[] {
  const endpointDiffs: ImportantDivergence[] = comparison.pairs
    .filter((pair) => pair.status === 'different')
    .map((pair) => {
      const relevantDiffs = pair.diffs.filter((diff) => !diff.ignored);
      const severity = relevantDiffs.some((diff) => diff.severity === 'error')
        ? 'critical'
        : 'warning';

      return {
        endpoint: pair.key,
        severity,
        status: 'different' as const,
        diffs: relevantDiffs,
      };
    })
    .filter((entry) => entry.diffs.length > 0);

  const missingInB: ImportantDivergence[] = comparison.unmatchedA.map((record) => ({
    endpoint: `${record.method}:${record.path}`,
    severity: 'warning',
    status: 'missing_in_b',
    diffs: [],
  }));

  const missingInA: ImportantDivergence[] = comparison.unmatchedB.map((record) => ({
    endpoint: `${record.method}:${record.path}`,
    severity: 'warning',
    status: 'missing_in_a',
    diffs: [],
  }));

  return [...endpointDiffs, ...missingInB, ...missingInA];
}

export async function handleToolCall(
  name: string,
  args: Record<string, unknown> | undefined,
): Promise<unknown> {
  switch (name) {
    case 'list_sessions':
      return listSessions({
        platform: typeof args?.platform === 'string' ? args.platform : undefined,
        flowName: typeof args?.flowName === 'string' ? args.flowName : undefined,
        limit: typeof args?.limit === 'number' ? args.limit : undefined,
      });

    case 'get_session': {
      const sessionId = typeof args?.sessionId === 'string' ? args.sessionId : '';
      if (!sessionId) throw new Error('sessionId is required');
      const includeRecords = args?.includeRecords !== false;
      const session = getSession(sessionId, includeRecords);
      if (!session) throw new Error(`Session not found: ${sessionId}`);
      return session;
    }

    case 'get_session_records': {
      const sessionId = typeof args?.sessionId === 'string' ? args.sessionId : '';
      if (!sessionId) throw new Error('sessionId is required');
      return readSessionRecords(sessionId, {
        offset: typeof args?.offset === 'number' ? args.offset : undefined,
        limit: typeof args?.limit === 'number' ? args.limit : undefined,
      });
    }

    case 'compare_sessions': {
      const sessionAId = typeof args?.sessionAId === 'string' ? args.sessionAId : '';
      const sessionBId = typeof args?.sessionBId === 'string' ? args.sessionBId : '';
      if (!sessionAId || !sessionBId) {
        throw new Error('sessionAId and sessionBId are required');
      }

      const sessionA = getSession(sessionAId, true);
      const sessionB = getSession(sessionBId, true);
      if (!sessionA || !sessionB) {
        throw new Error('One or both sessions not found');
      }

      const options: SessionCompareOptions = {
        ignorePlatformNoise: args?.ignorePlatformNoise !== false,
        ignoreTiming: args?.ignoreTiming === true,
      };

      return compareSessions(sessionA, sessionB, options);
    }

    case 'get_important_divergences': {
      const sessionAId = typeof args?.sessionAId === 'string' ? args.sessionAId : '';
      const sessionBId = typeof args?.sessionBId === 'string' ? args.sessionBId : '';
      if (!sessionAId || !sessionBId) {
        throw new Error('sessionAId and sessionBId are required');
      }

      const sessionA = getSession(sessionAId, true);
      const sessionB = getSession(sessionBId, true);
      if (!sessionA || !sessionB) {
        throw new Error('One or both sessions not found');
      }

      const comparison = compareSessions(sessionA, sessionB, {
        ignorePlatformNoise: args?.ignorePlatformNoise !== false,
        ignoreTiming: args?.ignoreTiming === true,
      });

      return {
        sessionA: comparison.sessionA,
        sessionB: comparison.sessionB,
        summary: comparison.summary,
        divergences: getImportantDivergences(comparison),
      };
    }

    case 'list_environments':
      return listEnvironments();

    case 'get_environment': {
      const environmentId = typeof args?.environmentId === 'string' ? args.environmentId : '';
      if (!environmentId) throw new Error('environmentId is required');
      const environment = getEnvironment(environmentId);
      if (!environment) throw new Error(`Environment not found: ${environmentId}`);
      return environment;
    }

    case 'search_session_requests': {
      const sessionId = typeof args?.sessionId === 'string' ? args.sessionId : '';
      if (!sessionId) throw new Error('sessionId is required');

      return searchSessionRequests({
        sessionId,
        path: typeof args?.path === 'string' ? args.path : undefined,
        method: typeof args?.method === 'string' ? args.method : undefined,
        minStatus: typeof args?.minStatus === 'number' ? args.minStatus : undefined,
        maxStatus: typeof args?.maxStatus === 'number' ? args.maxStatus : undefined,
        errorsOnly: args?.errorsOnly === true,
        limit: typeof args?.limit === 'number' ? args.limit : undefined,
      });
    }

    case 'search_routes':
      return searchRoutes({
        path: typeof args?.path === 'string' ? args.path : undefined,
        method: typeof args?.method === 'string' ? args.method : undefined,
        environmentId: typeof args?.environmentId === 'string' ? args.environmentId : undefined,
        enabledOnly: args?.enabledOnly === true,
      });

    case 'find_session_pairs': {
      const flowName = typeof args?.flowName === 'string' ? args.flowName : '';
      if (!flowName) throw new Error('flowName is required');

      return findSessionPairs({
        flowName,
        platformA: typeof args?.platformA === 'string' ? args.platformA : undefined,
        platformB: typeof args?.platformB === 'string' ? args.platformB : undefined,
      });
    }

    case 'compare_by_flow': {
      const flowName = typeof args?.flowName === 'string' ? args.flowName : '';
      if (!flowName) throw new Error('flowName is required');

      const pair = resolveSessionPair({
        flowName,
        platformA: typeof args?.platformA === 'string' ? args.platformA : undefined,
        platformB: typeof args?.platformB === 'string' ? args.platformB : undefined,
      });

      const sessionA = getSession(pair.sessionA.id, true);
      const sessionB = getSession(pair.sessionB.id, true);
      if (!sessionA || !sessionB) {
        throw new Error('Matched sessions could not be loaded');
      }

      const options: SessionCompareOptions = {
        ignorePlatformNoise: args?.ignorePlatformNoise !== false,
        ignoreTiming: args?.ignoreTiming === true,
      };

      const comparison = compareSessions(sessionA, sessionB, options);

      return {
        flowName,
        matchedBy: pair.matchedBy,
        sessionA: comparison.sessionA,
        sessionB: comparison.sessionB,
        summary: comparison.summary,
        divergences: getImportantDivergences(comparison),
      };
    }

    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export const TOOL_DEFINITIONS = [
  {
    name: 'list_sessions',
    description: 'List recorded traffic sessions. Optionally filter by platform (ios, android, etc.) or flow name.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: { type: 'string', description: 'Filter by consumer platform' },
        flowName: { type: 'string', description: 'Filter by flow name (partial match)' },
        limit: { type: 'number', description: 'Maximum number of sessions to return' },
      },
    },
  },
  {
    name: 'get_session',
    description: 'Get a traffic session by ID, including metadata and captured requests.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID' },
        includeRecords: { type: 'boolean', description: 'Include captured requests (default true)' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'get_session_records',
    description: 'Get captured requests from a session with optional pagination.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID' },
        offset: { type: 'number', description: 'Record offset (default 0)' },
        limit: { type: 'number', description: 'Maximum records to return (default 500)' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'compare_sessions',
    description: 'Compare two recorded sessions (e.g. Android vs iOS). Returns matched pairs, diffs and unmatched requests.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionAId: { type: 'string', description: 'First session ID' },
        sessionBId: { type: 'string', description: 'Second session ID' },
        ignorePlatformNoise: {
          type: 'boolean',
          description: 'Ignore known platform-specific headers and body fields (default true)',
        },
        ignoreTiming: { type: 'boolean', description: 'Ignore duration differences (default false)' },
      },
      required: ['sessionAId', 'sessionBId'],
    },
  },
  {
    name: 'get_important_divergences',
    description: 'Compare two sessions and return only meaningful divergences (status codes, body diffs, missing endpoints).',
    inputSchema: {
      type: 'object',
      properties: {
        sessionAId: { type: 'string', description: 'First session ID' },
        sessionBId: { type: 'string', description: 'Second session ID' },
        ignorePlatformNoise: { type: 'boolean', description: 'Ignore platform noise (default true)' },
        ignoreTiming: { type: 'boolean', description: 'Ignore timing differences (default false)' },
      },
      required: ['sessionAId', 'sessionBId'],
    },
  },
  {
    name: 'list_environments',
    description: 'List all MockForge environments with their routes.',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'get_environment',
    description: 'Get a MockForge environment by ID, including all routes.',
    inputSchema: {
      type: 'object',
      properties: {
        environmentId: { type: 'string', description: 'Environment ID' },
      },
      required: ['environmentId'],
    },
  },
  {
    name: 'search_session_requests',
    description: 'Search captured requests inside a session by path, method, or HTTP status.',
    inputSchema: {
      type: 'object',
      properties: {
        sessionId: { type: 'string', description: 'Session ID' },
        path: { type: 'string', description: 'Filter by path substring (e.g. /checkout)' },
        method: { type: 'string', description: 'Filter by HTTP method (GET, POST, etc.)' },
        minStatus: { type: 'number', description: 'Minimum response status code' },
        maxStatus: { type: 'number', description: 'Maximum response status code' },
        errorsOnly: { type: 'boolean', description: 'Return only 4xx/5xx responses (default false)' },
        limit: { type: 'number', description: 'Maximum records to return (default 100)' },
      },
      required: ['sessionId'],
    },
  },
  {
    name: 'search_routes',
    description: 'Search mock routes across environments by path and/or HTTP method.',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'Filter by route path substring' },
        method: { type: 'string', description: 'Filter by HTTP method' },
        environmentId: { type: 'string', description: 'Limit search to one environment' },
        enabledOnly: { type: 'boolean', description: 'Return only enabled routes (default false)' },
      },
    },
  },
  {
    name: 'find_session_pairs',
    description: 'Find likely Android/iOS session pairs for a flow using flowName, comparisonGroupId, or platform matching.',
    inputSchema: {
      type: 'object',
      properties: {
        flowName: { type: 'string', description: 'Flow name to match (e.g. checkout)' },
        platformA: { type: 'string', description: 'First platform (default ios)' },
        platformB: { type: 'string', description: 'Second platform (default android)' },
      },
      required: ['flowName'],
    },
  },
  {
    name: 'compare_by_flow',
    description: 'Find the iOS/Android sessions for a flow and return important divergences in one step.',
    inputSchema: {
      type: 'object',
      properties: {
        flowName: { type: 'string', description: 'Flow name to compare (e.g. checkout)' },
        platformA: { type: 'string', description: 'First platform (default ios)' },
        platformB: { type: 'string', description: 'Second platform (default android)' },
        ignorePlatformNoise: { type: 'boolean', description: 'Ignore platform noise (default true)' },
        ignoreTiming: { type: 'boolean', description: 'Ignore timing differences (default false)' },
      },
      required: ['flowName'],
    },
  },
] as const;
