import { spawn, type ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { killProcessOnPort } from './portUtils';
import { getNodeRuntime } from '../utils/platform';
import type { Upstream, CapturedRequest } from '../../shared/types';
import type { InterceptRoute } from '../../shared/proxyRouteMatch';
import type { ProxyRequestMockRoute } from '../../shared/requestOverrideApply';

const PROXY_SHUTDOWN_GRACE_MS = 5500;

function upstreamToProxyConfig(upstream?: Upstream | null): {
  host: string;
  port: number;
  scheme: 'HTTP' | 'HTTPS';
  basePath: string;
} | null {
  if (!upstream) return null;
  return {
    host: upstream.host,
    port: upstream.port,
    scheme: upstream.scheme,
    basePath: upstream.basePath || '',
  };
}

function getProxyScriptPath(): string {
  const candidates = [
    join(__dirname, 'proxy-server.cjs'),
    join(__dirname, '../electron/proxy-server.cjs'),
  ];
  const found = candidates.find(existsSync);
  if (!found) {
    throw new Error('proxy-server.cjs not found');
  }
  return found;
}

export class ProxyProcessManager {
  private child: ChildProcess | null = null;
  private publicPort = 0;
  private targetPort = 0;
  private requestCount = 0;
  private activeConnections = 0;
  private running = false;
  private timings = new Map<string, number>();
  private passthroughTraffic: CapturedRequest[] = [];
  private pendingUpstream: Upstream | null | undefined = undefined;
  private pendingInterceptRoutes: InterceptRoute[] = [];
  private pendingRequestMockRoutes: ProxyRequestMockRoute[] = [];
  private onTrafficRecorded: (() => void) | null = null;
  private onInstabilityLog: ((entry: {
    timestamp?: string;
    category?: string;
    kind?: string;
    message?: string;
    correlationId?: string;
    details?: Record<string, unknown>;
  }) => void) | null = null;

  setOnTrafficRecorded(handler: (() => void) | null): void {
    this.onTrafficRecorded = handler;
  }

  setOnInstabilityLog(handler: ((entry: {
    timestamp?: string;
    category?: string;
    kind?: string;
    message?: string;
    correlationId?: string;
    details?: Record<string, unknown>;
  }) => void) | null): void {
    this.onInstabilityLog = handler;
  }

  isRunning(): boolean {
    return this.running && this.child !== null && !this.child.killed;
  }

  getRequestCount(): number {
    return this.requestCount;
  }

  getActiveConnections(): number {
    return this.activeConnections;
  }

  getTiming(requestId: string): number | undefined {
    return this.timings.get(requestId);
  }

  clearTimings(): void {
    this.timings.clear();
  }

  getPassthroughTraffic(): CapturedRequest[] {
    return [...this.passthroughTraffic];
  }

  clearPassthroughTraffic(): void {
    this.passthroughTraffic = [];
  }

  private recordPassthroughTraffic(record: CapturedRequest): void {
    this.passthroughTraffic.push(record);
    if (this.passthroughTraffic.length > 50) {
      this.passthroughTraffic = this.passthroughTraffic.slice(-50);
    }
    this.onTrafficRecorded?.();
  }

  async start(
    publicPort: number,
    targetPort: number,
    upstream?: Upstream | null,
  ): Promise<{ success: boolean; error?: string }> {
    this.pendingUpstream = upstream ?? null;

    if (this.isRunning()) {
      if (this.publicPort === publicPort && this.targetPort === targetPort) {
        await this.setUpstream(upstream);
        await this.setInterceptRoutes(this.pendingInterceptRoutes);
        await this.setRequestMockRoutes(this.pendingRequestMockRoutes);
        return { success: true };
      }
      await this.stop();
    }

    killProcessOnPort(publicPort);
    await new Promise((r) => setTimeout(r, 300));

    this.publicPort = publicPort;
    this.targetPort = targetPort;
    this.requestCount = 0;
    this.activeConnections = 0;

    const hosts = ['0.0.0.0'];

    let proxyScript: string;
    try {
      proxyScript = getProxyScriptPath();
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }

    return new Promise((resolve) => {
      let stderr = '';
      let settled = false;

      const finish = (result: { success: boolean; error?: string }) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(result);
      };

      const upstreamConfig = upstreamToProxyConfig(upstream);
      const args = [
        proxyScript,
        String(publicPort),
        String(targetPort),
        ...hosts,
      ];
      if (upstreamConfig) {
        args.push(JSON.stringify(upstreamConfig));
      }

      const nodeRuntime = getNodeRuntime();
      const child = spawn(
        nodeRuntime.command,
        args,
        { stdio: ['ignore', 'pipe', 'pipe', 'ipc'], env: nodeRuntime.env },
      );

      this.child = child;

      child.stdout?.on('data', (data: Buffer) => {
        console.log(`[MockForge proxy] ${data.toString().trim()}`);
      });

      child.stderr?.on('data', (data: Buffer) => {
        const chunk = data.toString();
        stderr += chunk;
        for (const line of chunk.split('\n').map((item) => item.trim()).filter(Boolean)) {
          console.warn(`[MockForge proxy] ${line}`);
        }
      });

      child.on('message', (msg: {
        type?: string;
        count?: number;
        id?: string;
        durationMs?: number;
        record?: CapturedRequest;
        activeConnections?: number;
        entry?: {
          timestamp?: string;
          category?: string;
          kind?: string;
          message?: string;
          correlationId?: string;
          details?: Record<string, unknown>;
        };
      }) => {
        if (msg?.type === 'request' && typeof msg.count === 'number') {
          this.requestCount = msg.count;
        }
        if (msg?.type === 'active-connections' && typeof msg.activeConnections === 'number') {
          this.activeConnections = msg.activeConnections;
        }
        if (msg?.type === 'timing' && msg.id && typeof msg.durationMs === 'number') {
          this.timings.set(msg.id, msg.durationMs);
          if (this.timings.size > 200) {
            const oldest = this.timings.keys().next().value;
            if (oldest) this.timings.delete(oldest);
          }
        }
        if (msg?.type === 'traffic' && msg.record) {
          this.recordPassthroughTraffic(msg.record);
        }
        if (msg?.type === 'instability-log' && msg.entry) {
          this.onInstabilityLog?.(msg.entry as {
            timestamp?: string;
            category?: string;
            kind?: string;
            message?: string;
            correlationId?: string;
            details?: Record<string, unknown>;
          });
        }
        if (msg?.type === 'ready') {
          this.running = true;
          void Promise.all([
            this.setUpstream(this.pendingUpstream),
            this.setInterceptRoutes(this.pendingInterceptRoutes),
            this.setRequestMockRoutes(this.pendingRequestMockRoutes),
          ]).then(() => {
            finish({ success: true });
          });
        }
      });

      child.on('error', (err) => {
        this.running = false;
        this.child = null;
        finish({ success: false, error: err.message });
      });

      child.on('exit', (code) => {
        this.running = false;
        this.child = null;
        this.activeConnections = 0;
        if (!settled) {
          finish({
            success: false,
            error: `Proxy exited with code ${code}${stderr ? `: ${stderr.slice(-200)}` : ''}`,
          });
        }
      });

      const timeout = setTimeout(() => {
        if (child.exitCode === null && !this.running) {
          child.kill('SIGTERM');
          finish({ success: false, error: 'Proxy failed to start within 5 seconds' });
        }
      }, 5000);
    });
  }

  async setRequestMockRoutes(routes: ProxyRequestMockRoute[]): Promise<void> {
    this.pendingRequestMockRoutes = routes;
    const child = this.child;
    if (!child?.send) return;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(), 1000);

      const onMessage = (msg: { type?: string }) => {
        if (msg?.type === 'request-mock-routes-updated') {
          clearTimeout(timeout);
          child.off('message', onMessage);
          resolve();
        }
      };

      child.on('message', onMessage);
      child.send({ type: 'request-mock-routes', routes });
    });
  }

  async setInterceptRoutes(routes: InterceptRoute[]): Promise<void> {
    this.pendingInterceptRoutes = routes;
    const child = this.child;
    if (!child?.send) return;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(), 1000);

      const onMessage = (msg: { type?: string }) => {
        if (msg?.type === 'intercept-routes-updated') {
          clearTimeout(timeout);
          child.off('message', onMessage);
          resolve();
        }
      };

      child.on('message', onMessage);
      child.send({ type: 'intercept-routes', routes });
    });
  }

  async setAdbStatus(active: boolean): Promise<void> {
    const child = this.child;
    if (!child?.send) return;
    child.send({ type: 'adb-status', active });
  }

  async setUpstream(upstream?: Upstream | null): Promise<void> {
    this.pendingUpstream = upstream ?? null;
    const config = upstreamToProxyConfig(upstream);
    const child = this.child;
    if (!child?.send) return;

    return new Promise((resolve) => {
      const timeout = setTimeout(() => resolve(), 1000);

      const onMessage = (msg: { type?: string }) => {
        if (msg?.type === 'upstream-updated') {
          clearTimeout(timeout);
          child.off('message', onMessage);
          resolve();
        }
      };

      child.on('message', onMessage);
      child.send({ type: 'upstream', config });
    });
  }

  async stop(): Promise<void> {
    this.running = false;
    this.timings.clear();
    this.pendingUpstream = undefined;
    this.pendingInterceptRoutes = [];
    this.pendingRequestMockRoutes = [];
    const child = this.child;
    this.child = null;

    if (!child) return;

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      const onMessage = (msg: { type?: string }) => {
        if (msg?.type === 'shutdown-complete') {
          child.off('message', onMessage);
          finish();
        }
      };

      child.on('message', onMessage);

      if (child.send) {
        child.send({ type: 'shutdown' });
      } else {
        child.kill('SIGTERM');
      }

      child.once('exit', () => finish());

      setTimeout(() => {
        if (!child.killed) {
          try {
            child.kill('SIGKILL');
          } catch {
            // already gone
          }
        }
        finish();
      }, PROXY_SHUTDOWN_GRACE_MS);
    });

    this.activeConnections = 0;
  }
}

export function getInternalPort(publicPort: number): number {
  return publicPort + 10000;
}
