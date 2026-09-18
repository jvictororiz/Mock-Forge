import type { Environment, Upstream } from './types';
import { normalizeEnvironmentRoutes } from './routeUtils';

export function parseUpstreamUrl(input: string): Upstream | null {
  const raw = input.trim();
  if (!raw) return null;

  try {
    const normalized = raw.includes('://') ? raw : `https://${raw}`;
    const hasTrailingSlash = normalized.endsWith('/') && !normalized.endsWith('://');
    const url = new URL(normalized);
    const isHttps = url.protocol === 'https:';
    const defaultPort = isHttps ? 443 : 80;
    const port = url.port ? Number(url.port) : defaultPort;

    if (!url.hostname) return null;

    let basePath = url.pathname || '';
    if (basePath === '/') {
      basePath = '';
    }

    return {
      host: url.hostname,
      port,
      scheme: isHttps ? 'HTTPS' : 'HTTP',
      ...(basePath ? { basePath } : {}),
      ...(hasTrailingSlash && !basePath ? { trailingSlash: true } : {}),
    };
  } catch {
    return null;
  }
}

export function upstreamToUrl(upstream?: Upstream): string {
  if (!upstream) return '';

  const scheme = upstream.scheme === 'HTTPS' ? 'https' : 'http';
  const defaultPort = upstream.scheme === 'HTTPS' ? 443 : 80;
  const portPart = upstream.port === defaultPort ? '' : `:${upstream.port}`;
  const basePath = upstream.basePath || '';
  const trailingSlash = upstream.trailingSlash && !basePath ? '/' : '';

  return `${scheme}://${upstream.host}${portPart}${basePath}${trailingSlash}`;
}

export function normalizeUpstream(upstream: Upstream): Upstream {
  return parseUpstreamUrl(upstreamToUrl(upstream)) ?? upstream;
}

export function getUpstreamUrl(env: Pick<Environment, 'upstream' | 'upstreamUrl'>): string {
  return env.upstreamUrl?.trim() || upstreamToUrl(env.upstream);
}

export function resolveUpstream(
  env: Pick<Environment, 'upstream' | 'upstreamUrl'>,
): Upstream | undefined {
  const raw = env.upstreamUrl?.trim();
  if (raw) {
    return parseUpstreamUrl(raw) ?? (env.upstream ? normalizeUpstream(env.upstream) : undefined);
  }
  return env.upstream ? normalizeUpstream(env.upstream) : undefined;
}

export function prepareEnvironment(env: Environment): Environment {
  const explicitUrl = env.upstreamUrl?.trim();
  const upstreamUrl = explicitUrl || upstreamToUrl(env.upstream) || undefined;
  const upstream = explicitUrl
    ? (parseUpstreamUrl(explicitUrl) ?? (env.upstream ? normalizeUpstream(env.upstream) : undefined))
    : (env.upstream ? normalizeUpstream(env.upstream) : undefined);

  return {
    ...env,
    routes: normalizeEnvironmentRoutes(env.routes ?? []),
    ...(upstreamUrl ? { upstreamUrl } : {}),
    ...(upstream ? { upstream } : {}),
  };
}

export function isUpstreamUrlValid(input: string): boolean {
  const trimmed = input.trim();
  return !trimmed || !!parseUpstreamUrl(trimmed);
}

export function areUpstreamUrlsEqual(a: string, b: string): boolean {
  const left = a.trim();
  const right = b.trim();

  if (left === right) return true;
  if (!left && !right) return true;

  const parsedLeft = left ? parseUpstreamUrl(left) : null;
  const parsedRight = right ? parseUpstreamUrl(right) : null;

  if (!parsedLeft || !parsedRight) return false;

  return upstreamToUrl(parsedLeft) === upstreamToUrl(parsedRight);
}

export function isUpstreamDirty(input: string, env: Pick<Environment, 'upstream' | 'upstreamUrl'>): boolean {
  const trimmed = input.trim();
  const saved = getUpstreamUrl(env).trim();

  if (!trimmed && !saved) return false;
  return !areUpstreamUrlsEqual(trimmed, saved);
}
