import type { CapturedRequest } from './types';
import { MOCKFORGE_FORCED_EXECUTION_HEADER } from './mockforgeHeaders';

export const MOCKFORGE_CONSUMER_ID = 'client:MockForge';
export const MOCKFORGE_CONSUMER_LABEL = 'MockForge';

export type ConsumerPlatform = 'android' | 'ios' | 'mac' | 'mockforge' | 'unknown';

export interface TrafficConsumer {
  id: string;
  label: string;
  platform: ConsumerPlatform;
  clientIp?: string;
  userAgent?: string;
  lastSeen: string;
  requestCount: number;
}

export function normalizeClientIp(ip?: string | null): string {
  if (!ip) return 'unknown';
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  if (ip === '::1') return '127.0.0.1';
  return ip;
}

export function getHeaderValue(headers: Record<string, string>, key: string): string | undefined {
  const lower = key.toLowerCase();
  for (const [headerKey, value] of Object.entries(headers)) {
    if (headerKey.toLowerCase() === lower) return value;
  }
  return undefined;
}

export function inferPlatformFromUserAgent(userAgent?: string): ConsumerPlatform {
  if (!userAgent) return 'unknown';
  const ua = userAgent.toLowerCase();
  if (ua.includes('okhttp') || ua.includes('dalvik') || ua.includes('android')) return 'android';
  if (
    ua.includes('cfnetwork')
    || ua.includes('iphone')
    || ua.includes('ipad')
    || (ua.includes('ios') && !ua.includes('macintosh'))
  ) {
    return 'ios';
  }
  if (ua.includes('darwin') || ua.includes('macintosh')) return 'mac';
  return 'unknown';
}

export function shortenUserAgent(userAgent?: string): string {
  if (!userAgent) return 'no-ua';

  const appMatch = userAgent.match(/^([^\s/]+)/);
  if (appMatch) {
    const first = appMatch[1];
    if (!first.toLowerCase().includes('mozilla')) return first;
  }
  if (userAgent.includes('okhttp')) return 'okhttp';
  if (userAgent.includes('CFNetwork')) return 'CFNetwork';
  if (userAgent.includes('Darwin')) return 'Darwin';
  return userAgent.slice(0, 40);
}

export function buildConsumerId(
  clientIp: string,
  userAgent?: string,
  customClient?: string,
  platform?: ConsumerPlatform,
): string {
  if (customClient?.trim()) return `client:${customClient.trim()}`;
  const ip = normalizeClientIp(clientIp);
  const plat = platform ?? inferPlatformFromUserAgent(userAgent);
  const ua = shortenUserAgent(userAgent);
  return `${ip}|${plat}|${ua}`;
}

export function buildConsumerLabel(options: {
  clientIp?: string;
  userAgent?: string;
  customClient?: string;
  platform?: ConsumerPlatform;
}): string {
  const { clientIp, userAgent, customClient, platform } = options;
  if (customClient?.trim()) return customClient.trim();

  const plat = platform ?? inferPlatformFromUserAgent(userAgent);
  const ip = normalizeClientIp(clientIp);
  const isLocal = ip === '127.0.0.1' || ip === 'unknown';

  const platLabel = plat === 'android'
    ? 'Android'
    : plat === 'ios'
      ? 'iOS'
      : plat === 'mac'
        ? 'Mac'
        : 'Desconhecido';

  const uaShort = shortenUserAgent(userAgent);
  const uaPart = uaShort !== 'no-ua' && uaShort !== platLabel ? ` · ${uaShort}` : '';

  if (isLocal) {
    return `${platLabel}${uaPart} (localhost)`;
  }
  return `${platLabel}${uaPart} · ${ip}`;
}

export function isMockForgeConsumer(options: {
  consumerId?: string;
  forcedExecution?: boolean;
  headers?: Record<string, string>;
}): boolean {
  if (options.consumerId === MOCKFORGE_CONSUMER_ID || options.forcedExecution) {
    return true;
  }
  if (options.headers) {
    return getHeaderValue(options.headers, MOCKFORGE_FORCED_EXECUTION_HEADER) === '1';
  }
  return false;
}

export function resolveRequestConsumer(
  headers: Record<string, string>,
  clientIp?: string,
  explicitUserAgent?: string,
): {
  consumerId: string;
  label: string;
  platform: ConsumerPlatform;
  clientIp: string;
  userAgent?: string;
} {
  if (isMockForgeConsumer({ headers })) {
    const ip = clientIp ?? getHeaderValue(headers, 'x-mockforge-client-ip') ?? '127.0.0.1';
    return {
      consumerId: MOCKFORGE_CONSUMER_ID,
      label: MOCKFORGE_CONSUMER_LABEL,
      platform: 'mockforge',
      clientIp: normalizeClientIp(ip),
      userAgent: explicitUserAgent
        || getHeaderValue(headers, 'user-agent')
        || getHeaderValue(headers, 'x-mockforge-client-ua'),
    };
  }

  const userAgent = explicitUserAgent
    || getHeaderValue(headers, 'user-agent')
    || getHeaderValue(headers, 'x-mockforge-client-ua');
  const customClient = getHeaderValue(headers, 'x-mockforge-client');
  const ip = clientIp ?? getHeaderValue(headers, 'x-mockforge-client-ip') ?? 'unknown';
  const platform = inferPlatformFromUserAgent(userAgent);
  const consumerId = buildConsumerId(ip, userAgent, customClient, platform);
  const label = buildConsumerLabel({ clientIp: ip, userAgent, customClient, platform });

  return {
    consumerId,
    label,
    platform,
    clientIp: normalizeClientIp(ip),
    userAgent,
  };
}

function upsertConsumer(
  registry: Record<string, TrafficConsumer>,
  req: CapturedRequest,
  incrementCount: boolean,
): Record<string, TrafficConsumer> {
  if (!req.consumerId) return registry;

  const existing = registry[req.consumerId];
  if (existing) {
    return {
      ...registry,
      [req.consumerId]: {
        ...existing,
        label: req.consumerLabel ?? existing.label,
        platform: req.consumerPlatform ?? existing.platform,
        clientIp: req.clientIp ?? existing.clientIp,
        userAgent: req.userAgent ?? existing.userAgent,
        lastSeen: req.timestamp > existing.lastSeen ? req.timestamp : existing.lastSeen,
        requestCount: incrementCount ? existing.requestCount + 1 : existing.requestCount,
      },
    };
  }

  return {
    ...registry,
    [req.consumerId]: {
      id: req.consumerId,
      label: req.consumerLabel ?? req.consumerId,
      platform: req.consumerPlatform ?? 'unknown',
      clientIp: req.clientIp,
      userAgent: req.userAgent,
      lastSeen: req.timestamp,
      requestCount: incrementCount ? 1 : 0,
    },
  };
}

/** Ensures consumers exist and metadata stays fresh, without incrementing counts. */
export function registerTrafficConsumers(
  registry: Record<string, TrafficConsumer>,
  requests: CapturedRequest[],
): Record<string, TrafficConsumer> {
  return requests.reduce(
    (next, req) => upsertConsumer(next, req, false),
    registry,
  );
}

/** Increments request counts for newly captured traffic records. */
export function incrementTrafficConsumers(
  registry: Record<string, TrafficConsumer>,
  requests: CapturedRequest[],
): Record<string, TrafficConsumer> {
  return requests.reduce(
    (next, req) => upsertConsumer(next, req, true),
    registry,
  );
}

export function listTrafficConsumers(registry: Record<string, TrafficConsumer>): TrafficConsumer[] {
  return Object.values(registry).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}

export function deriveConsumersFromTraffic(traffic: CapturedRequest[]): TrafficConsumer[] {
  const map = new Map<string, TrafficConsumer>();

  for (const req of traffic) {
    if (!req.consumerId) continue;

    const existing = map.get(req.consumerId);
    if (existing) {
      existing.requestCount += 1;
      if (req.timestamp > existing.lastSeen) {
        existing.lastSeen = req.timestamp;
      }
      continue;
    }

    map.set(req.consumerId, {
      id: req.consumerId,
      label: req.consumerLabel ?? req.consumerId,
      platform: req.consumerPlatform ?? 'unknown',
      clientIp: req.clientIp,
      userAgent: req.userAgent,
      lastSeen: req.timestamp,
      requestCount: 1,
    });
  }

  return Array.from(map.values()).sort((a, b) => b.lastSeen.localeCompare(a.lastSeen));
}

export function filterTrafficByConsumer(
  requests: CapturedRequest[],
  consumerId: string | null,
): CapturedRequest[] {
  if (!consumerId) return requests;
  return requests.filter((req) => req.consumerId === consumerId);
}
