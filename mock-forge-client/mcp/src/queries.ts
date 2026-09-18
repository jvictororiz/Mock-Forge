import type { ConsumerPlatform } from '../../shared/consumerUtils';
import type { TrafficSessionMeta } from '../../shared/sessionTypes';
import type { CapturedRequest, Environment, HttpMethod, Route } from '../../shared/types';
import {
  getEnvironment,
  getSession,
  listEnvironments,
  listSessions,
  readSessionRecords,
} from './storage';

export interface SearchSessionRequestsOptions {
  sessionId: string;
  path?: string;
  method?: string;
  minStatus?: number;
  maxStatus?: number;
  errorsOnly?: boolean;
  limit?: number;
}

export interface SearchRoutesOptions {
  path?: string;
  method?: string;
  environmentId?: string;
  enabledOnly?: boolean;
}

export interface RouteSearchResult {
  environmentId: string;
  environmentName: string;
  route: Route;
}

export interface SessionPairResult {
  flowName: string;
  sessionA: TrafficSessionMeta;
  sessionB: TrafficSessionMeta;
  matchedBy: 'comparison_group' | 'platform' | 'paired_session';
}

export interface FindSessionPairsOptions {
  flowName: string;
  platformA?: string;
  platformB?: string;
}

function normalizeText(value: string): string {
  return value.toLowerCase();
}

function sessionMatchesPlatform(session: TrafficSessionMeta, platform: string): boolean {
  const normalized = normalizeText(platform);
  return session.primaryPlatform?.toLowerCase() === normalized
    || session.platforms.some((value) => value.toLowerCase() === normalized);
}

function pickLatestSession(
  sessions: TrafficSessionMeta[],
  platform: string,
): TrafficSessionMeta | null {
  const matches = sessions
    .filter((session) => sessionMatchesPlatform(session, platform))
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  return matches[0] ?? null;
}

function recordsMatchPath(record: CapturedRequest, path: string): boolean {
  return normalizeText(record.path).includes(normalizeText(path));
}

function recordsMatchMethod(record: CapturedRequest, method: string): boolean {
  return record.method.toLowerCase() === method.toLowerCase();
}

function recordsMatchStatus(
  record: CapturedRequest,
  minStatus?: number,
  maxStatus?: number,
): boolean {
  if (minStatus === undefined && maxStatus === undefined) return true;

  const status = record.responseStatus;
  if (status === undefined) return false;
  if (minStatus !== undefined && status < minStatus) return false;
  if (maxStatus !== undefined && status > maxStatus) return false;
  return true;
}

export function searchSessionRequests(options: SearchSessionRequestsOptions): CapturedRequest[] {
  const session = getSession(options.sessionId, false);
  if (!session) {
    throw new Error(`Session not found: ${options.sessionId}`);
  }

  const records = readSessionRecords(options.sessionId);
  const limit = options.limit && options.limit > 0 ? options.limit : 100;

  return records.filter((record) => {
    if (options.path && !recordsMatchPath(record, options.path)) return false;
    if (options.method && !recordsMatchMethod(record, options.method)) return false;

    if (options.errorsOnly) {
      if (record.responseStatus === undefined || record.responseStatus < 400) return false;
    } else if (
      options.minStatus !== undefined
      || options.maxStatus !== undefined
    ) {
      if (!recordsMatchStatus(record, options.minStatus, options.maxStatus)) return false;
    }

    return true;
  }).slice(0, limit);
}

function routeMatchesPath(route: Route, path: string): boolean {
  return normalizeText(route.path).includes(normalizeText(path));
}

function routeMatchesMethod(route: Route, method: string): boolean {
  return route.method.toLowerCase() === method.toLowerCase();
}

export function searchRoutes(options: SearchRoutesOptions = {}): RouteSearchResult[] {
  const environments = options.environmentId
    ? [getEnvironment(options.environmentId)].filter((env): env is Environment => env !== null)
    : listEnvironments();

  const results: RouteSearchResult[] = [];

  for (const environment of environments) {
    for (const route of environment.routes) {
      if (options.enabledOnly && route.enabled === false) continue;
      if (options.path && !routeMatchesPath(route, options.path)) continue;
      if (options.method && !routeMatchesMethod(route, options.method)) continue;

      results.push({
        environmentId: environment.id,
        environmentName: environment.name,
        route,
      });
    }
  }

  return results;
}

function findPairByComparisonGroup(
  sessions: TrafficSessionMeta[],
  platformA: string,
  platformB: string,
): SessionPairResult | null {
  const groups = new Map<string, TrafficSessionMeta[]>();

  for (const session of sessions) {
    if (!session.comparisonGroupId) continue;
    const existing = groups.get(session.comparisonGroupId) ?? [];
    existing.push(session);
    groups.set(session.comparisonGroupId, existing);
  }

  for (const groupedSessions of groups.values()) {
    const sessionA = pickLatestSession(groupedSessions, platformA);
    const sessionB = pickLatestSession(groupedSessions, platformB);
    if (sessionA && sessionB && sessionA.id !== sessionB.id) {
      return {
        flowName: sessionA.flowName || sessionB.flowName || '',
        sessionA,
        sessionB,
        matchedBy: 'comparison_group',
      };
    }
  }

  return null;
}

function findPairByPairedSessionId(sessions: TrafficSessionMeta[]): SessionPairResult | null {
  const byId = new Map(sessions.map((session) => [session.id, session]));

  for (const session of sessions) {
    if (!session.pairedSessionId) continue;
    const paired = byId.get(session.pairedSessionId);
    if (!paired) continue;

    return {
      flowName: session.flowName || paired.flowName || '',
      sessionA: session,
      sessionB: paired,
      matchedBy: 'paired_session',
    };
  }

  return null;
}

export function findSessionPairs(options: FindSessionPairsOptions): SessionPairResult[] {
  const flowName = options.flowName.trim();
  if (!flowName) {
    throw new Error('flowName is required');
  }

  const platformA = (options.platformA || 'ios').toLowerCase();
  const platformB = (options.platformB || 'android').toLowerCase();
  const sessions = listSessions({ flowName });

  if (sessions.length === 0) {
    return [];
  }

  const pairs: SessionPairResult[] = [];
  const seen = new Set<string>();

  const groupedPair = findPairByComparisonGroup(sessions, platformA, platformB);
  if (groupedPair) {
    const key = [groupedPair.sessionA.id, groupedPair.sessionB.id].sort().join(':');
    seen.add(key);
    pairs.push(groupedPair);
  }

  const pairedSession = findPairByPairedSessionId(sessions);
  if (pairedSession) {
    const key = [pairedSession.sessionA.id, pairedSession.sessionB.id].sort().join(':');
    if (!seen.has(key)) {
      seen.add(key);
      pairs.push(pairedSession);
    }
  }

  const sessionA = pickLatestSession(sessions, platformA);
  const sessionB = pickLatestSession(sessions, platformB);
  if (sessionA && sessionB && sessionA.id !== sessionB.id) {
    const key = [sessionA.id, sessionB.id].sort().join(':');
    if (!seen.has(key)) {
      pairs.push({
        flowName,
        sessionA,
        sessionB,
        matchedBy: 'platform',
      });
    }
  }

  return pairs;
}

export function resolveSessionPair(
  options: FindSessionPairsOptions,
): SessionPairResult {
  const pairs = findSessionPairs(options);
  if (pairs.length === 0) {
    throw new Error(`No session pair found for flow "${options.flowName}"`);
  }

  return pairs[0];
}

export function resolvePlatformLabel(session: TrafficSessionMeta): ConsumerPlatform {
  return session.primaryPlatform ?? session.platforms[0] ?? 'unknown';
}

export function parseHttpMethod(method?: string): HttpMethod | undefined {
  if (!method) return undefined;
  const normalized = method.toUpperCase();
  const allowed: HttpMethod[] = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'];
  return allowed.find((value) => value === normalized);
}
