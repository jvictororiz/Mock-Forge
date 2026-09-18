import http from 'http';
import { randomUUID } from 'crypto';
import type { Environment, Route } from '../../shared/types';
import { buildExecuteRequestPayload, environmentForRouteExecution } from '../../shared/executeRouteUtils';
import { resolveUpstream, upstreamToUrl } from '../../shared/upstreamUtils';
import type { MockServerAdapter } from './MockServerAdapter';

const EXECUTE_TIMEOUT_MS = 30_000;
const METHODS_WITH_BODY = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export interface ExecuteRouteDeps {
  port: number;
  adapter: MockServerAdapter;
  syncProxyRouting: (env: Environment) => Promise<void>;
}

export interface ExecuteRouteResult {
  success: boolean;
  requestId?: string;
  error?: string;
}

function hasRequestBody(method: string, body?: string): boolean {
  return body !== undefined && METHODS_WITH_BODY.has(method.toUpperCase());
}

function waitForHttpResponse(
  port: number,
  options: {
    method: string;
    path: string;
    headers: Record<string, string>;
    body?: string;
  },
): Promise<{ statusCode?: number; location?: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port,
        path: options.path,
        method: options.method,
        headers: options.headers,
        timeout: EXECUTE_TIMEOUT_MS,
      },
      (res) => {
        const location = res.headers.location;
        res.resume();
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            location: Array.isArray(location) ? location[0] : location,
          });
        });
      },
    );

    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    if (hasRequestBody(options.method, options.body)) {
      req.end(options.body);
    } else {
      req.end();
    }
  });
}

export async function restoreExecutionEnvironment(
  env: Environment,
  deps: Pick<ExecuteRouteDeps, 'adapter' | 'syncProxyRouting'>,
): Promise<void> {
  const upstream = resolveUpstream(env);
  const restoredEnv = { ...env, upstream };
  await deps.adapter.syncEnvironment(restoredEnv);
  await deps.syncProxyRouting(restoredEnv);
}

export async function executeRoute(
  route: Route,
  env: Environment,
  deps: ExecuteRouteDeps,
): Promise<ExecuteRouteResult> {
  const requestId = randomUUID();
  const { method, path, headers, body } = buildExecuteRequestPayload(route, requestId);
  const executionEnv = environmentForRouteExecution(env, route.id);
  const upstream = resolveUpstream(executionEnv);
  const syncedExecutionEnv = { ...executionEnv, upstream };

  console.log('[MockForge execute] sending request', JSON.stringify({
    method,
    proxyUrl: `http://127.0.0.1:${deps.port}${path}`,
    upstreamUrl: upstream ? upstreamToUrl(upstream) : null,
    headerCount: Object.keys(headers).length,
    headers,
    body: body ?? null,
    requestId,
  }, null, 2));

  try {
    await deps.adapter.syncEnvironment(syncedExecutionEnv);
    await deps.syncProxyRouting(syncedExecutionEnv);

    const response = await waitForHttpResponse(deps.port, { method, path, headers, body });
    console.log('[MockForge execute] response', JSON.stringify({
      requestId,
      statusCode: response.statusCode,
      location: response.location ?? null,
    }));

    return { success: true, requestId };
  } catch (err) {
    console.error('[MockForge execute] failed', err);
    return { success: false, error: (err as Error).message };
  }
}
