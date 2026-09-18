import { spawn, execFileSync, type ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { createConnection, createServer, type Server, type Socket } from 'net';
import type { AddressInfo } from 'node:net';
import { resolveAdbPath } from '../utils/adbPath';
import {
  SCRCPY_SERVER_VERSION,
  resetScrcpyServerCache,
  resolveScrcpyServerPath,
  scrcpyServerAvailable,
} from '../utils/scrcpyPath';
import { ensureScrcpyServerDownloaded } from '../utils/scrcpyDownload';
import { getShellEnv } from '../utils/shellEnv';
import {
  MOTION_ACTION_DOWN,
  MOTION_ACTION_MOVE,
  MOTION_ACTION_UP,
  MOTION_BUTTON_PRIMARY,
  serializeInjectScroll,
  serializeInjectText,
  serializeInjectTouch,
  createMirrorScid,
  socketNameForScid,
} from '../../shared/scrcpyControl';
import type { MirrorRuntimeState, MirrorScrollInput, MirrorStatus, MirrorTouchInput } from '../../shared/types';

const SERVER_REMOTE_PATH = '/data/local/tmp/mockforge-scrcpy-server.jar';
const LEGACY_SOCKET_NAME = 'scrcpy';
const CONNECT_TIMEOUT_MS = 10_000;
const CONNECT_RETRY_MS = 350;
const CONNECT_MAX_ATTEMPTS = 12;
const CONNECTION_WAIT_MS = 15_000;
const TUNNEL_SETTLE_MS = 350;

type MirrorListener = (status: MirrorStatus) => void;
type ChunkListener = (chunk: Buffer) => void;
type TunnelMode = 'reverse' | 'forward';

function getAdbCommand(): string {
  return resolveAdbPath() ?? 'adb';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function execAdbSync(deviceId: string, args: string[]): void {
  execFileSync(getAdbCommand(), ['-s', deviceId, ...args], {
    encoding: 'utf-8',
    stdio: 'pipe',
    env: getShellEnv(),
  });
}

function tryExecAdbSync(deviceId: string, args: string[]): boolean {
  try {
    execAdbSync(deviceId, args);
    return true;
  } catch {
    return false;
  }
}

function removeTunnel(deviceId: string, mode: TunnelMode, port: number, socketName: string): void {
  if (mode === 'reverse') {
    tryExecAdbSync(deviceId, ['reverse', '--remove', `localabstract:${socketName}`]);
    return;
  }
  tryExecAdbSync(deviceId, ['forward', '--remove', `tcp:${port}`]);
}

function cleanupStaleMirror(deviceId: string, port: number, socketName: string): void {
  tryExecAdbSync(deviceId, ['reverse', '--remove', `localabstract:${socketName}`]);
  tryExecAdbSync(deviceId, ['reverse', '--remove', `localabstract:${LEGACY_SOCKET_NAME}`]);
  if (port > 0) {
    tryExecAdbSync(deviceId, ['forward', '--remove', `tcp:${port}`]);
  }
}

function isEmulatorDevice(deviceId: string): boolean {
  return deviceId.startsWith('emulator-');
}

function formatMirrorStartError(message: string, serverLog: string): string {
  const detail = serverLog.trim();
  if (!detail) return message;
  return `${message} (${detail})`;
}

class ScrcpyMirrorService {
  private videoSocket: Socket | null = null;
  private controlSocket: Socket | null = null;
  private localServer: Server | null = null;
  private shellProc: ChildProcess | null = null;
  private localPort = 0;
  private deviceId: string | null = null;
  private tunnelMode: TunnelMode | null = null;
  private socketName: string | null = null;
  private sessionId = 0;
  private state: MirrorRuntimeState = 'idle';
  private error: string | null = null;
  private stopping = false;
  private starting = false;
  private startChain: Promise<unknown> = Promise.resolve();
  private statusListeners = new Set<MirrorListener>();
  private chunkListeners = new Set<ChunkListener>();
  private chunkBuffer: Buffer[] = [];
  private bufferedBytes = 0;
  private readonly maxBufferedBytes = 512 * 1024;

  getStatus(): MirrorStatus {
    return {
      state: this.state,
      active: this.state === 'downloading' || this.state === 'starting' || this.state === 'streaming',
      deviceId: this.deviceId,
      serverAvailable: scrcpyServerAvailable(),
      error: this.error,
    };
  }

  onStatus(listener: MirrorListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  onChunk(listener: ChunkListener): () => void {
    for (const buffered of this.chunkBuffer) {
      listener(buffered);
    }
    this.chunkListeners.add(listener);
    return () => this.chunkListeners.delete(listener);
  }

  private emitStatus(): void {
    const status = this.getStatus();
    for (const listener of this.statusListeners) {
      listener(status);
    }
  }

  private setState(state: MirrorRuntimeState, error: string | null = null): void {
    this.state = state;
    this.error = error;
    this.emitStatus();
  }

  private async resolveServerPath(): Promise<string | null> {
    let serverPath = resolveScrcpyServerPath();
    if (serverPath && existsSync(serverPath)) {
      return serverPath;
    }

    resetScrcpyServerCache();
    serverPath = resolveScrcpyServerPath();
    if (serverPath && existsSync(serverPath)) {
      return serverPath;
    }

    this.setState('downloading');
    const download = await ensureScrcpyServerDownloaded();
    if (!download.success || !download.path || !existsSync(download.path)) {
      this.setState('error', download.error ?? 'scrcpy-server not found');
      return null;
    }

    return download.path;
  }

  private emitChunk(chunk: Buffer): void {
    const copy = Buffer.from(chunk);
    this.chunkBuffer.push(copy);
    this.bufferedBytes += copy.length;
    while (this.bufferedBytes > this.maxBufferedBytes && this.chunkBuffer.length > 0) {
      const removed = this.chunkBuffer.shift();
      if (removed) this.bufferedBytes -= removed.length;
    }

    for (const listener of this.chunkListeners) {
      listener(copy);
    }
  }

  async start(deviceId: string): Promise<{ success: boolean; error?: string }> {
    const resultPromise = this.startChain.then(() => this.startInternal(deviceId));
    this.startChain = resultPromise.then(() => undefined, () => undefined);
    return resultPromise;
  }

  private async startInternal(deviceId: string): Promise<{ success: boolean; error?: string }> {
    if (!resolveAdbPath()) {
      return { success: false, error: 'adb not found' };
    }

    let serverPath = await this.resolveServerPath();
    if (!serverPath) {
      return { success: false, error: 'scrcpy-server not found' };
    }

    await this.stopInternal();

    this.deviceId = deviceId;
    const session = this.sessionId;
    const scid = createMirrorScid();
    this.socketName = socketNameForScid(scid);
    this.setState('starting');

    const serverLog: string[] = [];
    try {
      this.starting = true;
      const tunnelModes: TunnelMode[] = isEmulatorDevice(deviceId)
        ? ['forward', 'reverse']
        : ['reverse', 'forward'];
      execAdbSync(deviceId, ['push', serverPath, SERVER_REMOTE_PATH]);

      let lastError: Error | null = null;
      for (let attempt = 0; attempt < tunnelModes.length; attempt += 1) {
        const tunnelMode = tunnelModes[attempt];
        let waitForConnection: (() => Promise<Socket>) | null = null;

        if (attempt > 0) {
          console.warn(`[MockForge][mirror] ${tunnelModes[attempt - 1]} tunnel failed, retrying with ${tunnelMode}`);
          this.killShellProcOnly();
          this.cleanupSockets();
          this.cleanupLocalServer();
          if (this.tunnelMode && this.socketName) {
            removeTunnel(deviceId, this.tunnelMode, this.localPort, this.socketName);
          }
        }

        if (tunnelMode === 'reverse') {
          const localServer = await this.startLocalServer(session);
          this.localPort = localServer.port;
          waitForConnection = localServer.waitForConnection;
        } else {
          this.localPort = await this.reserveLocalPort();
        }

        cleanupStaleMirror(deviceId, this.localPort, this.socketName);
        this.setupTunnel(deviceId, this.localPort, this.socketName, tunnelMode);
        await delay(TUNNEL_SETTLE_MS);
        this.spawnScrcpyServer(deviceId, scid, session, serverLog);

        try {
          await this.waitForMirrorConnection(
            tunnelMode,
            this.localPort,
            session,
            waitForConnection,
          );
          lastError = null;
          break;
        } catch (error) {
          lastError = error instanceof Error ? error : new Error('Failed to start mirror');
          if (attempt === tunnelModes.length - 1) {
            throw lastError;
          }
        }
      }

      if (session !== this.sessionId) {
        return { success: false, error: 'Mirror start cancelled' };
      }

      this.setState('streaming');
      return { success: true };
    } catch (err) {
      const baseMessage = err instanceof Error ? err.message : 'Failed to start mirror';
      const message = formatMirrorStartError(baseMessage, serverLog.join(' '));
      await this.stopInternal();
      this.setState('error', message);
      return { success: false, error: message };
    } finally {
      this.starting = false;
    }
  }

  private setupTunnel(deviceId: string, port: number, socketName: string, mode: TunnelMode): void {
    if (mode === 'reverse') {
      tryExecAdbSync(deviceId, ['forward', '--remove', `tcp:${port}`]);
      execAdbSync(deviceId, ['reverse', `localabstract:${socketName}`, `tcp:${port}`]);
    } else {
      tryExecAdbSync(deviceId, ['reverse', '--remove', `localabstract:${socketName}`]);
      tryExecAdbSync(deviceId, ['forward', '--remove', `tcp:${port}`]);
      execAdbSync(deviceId, ['forward', `tcp:${port}`, `localabstract:${socketName}`]);
    }
    this.tunnelMode = mode;
  }

  private buildServerArgs(scid: string, tunnelForward: boolean): string {
    return [
      SCRCPY_SERVER_VERSION,
      `scid=${scid}`,
      `tunnel_forward=${tunnelForward}`,
      'audio=false',
      'raw_stream=true',
      'max_size=1024',
      'max_fps=30',
      'video_bit_rate=2000000',
    ].join(' ');
  }

  private spawnScrcpyServer(
    deviceId: string,
    scid: string,
    session: number,
    serverLog: string[],
  ): void {
    const shellCommand = `CLASSPATH=${SERVER_REMOTE_PATH} app_process / com.genymobile.scrcpy.Server ${this.buildServerArgs(scid, this.tunnelMode === 'forward')}`;
    const shellProc = spawn(getAdbCommand(), ['-s', deviceId, 'shell', shellCommand], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: getShellEnv(),
    });
    this.shellProc = shellProc;

    shellProc.stderr?.on('data', (data: Buffer) => {
      if (session !== this.sessionId) return;
      const message = data.toString('utf-8').trim();
      if (!message) return;
      serverLog.push(message);
      console.warn(`[MockForge][mirror] ${message}`);
    });

    shellProc.on('exit', (code) => {
      if (session !== this.sessionId) return;
      if (this.starting || this.stopping || this.state === 'idle') return;
      if (this.shellProc !== shellProc) return;
      this.cleanupSockets();
      const detail = serverLog.at(-1);
      const suffix = detail ? `: ${detail}` : '';
      this.setState(
        'error',
        code === 0 ? 'Mirror stopped' : `Mirror stopped (code ${code ?? 'unknown'})${suffix}`,
      );
    });
  }

  private killShellProcOnly(): void {
    if (!this.shellProc) return;
    this.shellProc.removeAllListeners();
    this.shellProc.kill();
    this.shellProc = null;
  }

  private async waitForMirrorConnection(
    tunnelMode: TunnelMode,
    port: number,
    session: number,
    waitForConnection: (() => Promise<Socket>) | null,
  ): Promise<void> {
    if (tunnelMode === 'reverse') {
      if (!waitForConnection) {
        throw new Error('Mirror reverse tunnel is not ready');
      }
      await Promise.race([
        waitForConnection(),
        delay(CONNECTION_WAIT_MS).then(() => {
          throw new Error('Timed out waiting for device mirror');
        }),
      ]);
      await this.waitForControlSocket(session, 5_000);
      return;
    }

    await this.connectWithRetry(port, session);
  }

  injectTouch(input: MirrorTouchInput): { success: boolean } {
    if (!this.controlSocket || this.controlSocket.destroyed || this.state !== 'streaming') {
      return { success: false };
    }

    const action = input.action === 'down'
      ? MOTION_ACTION_DOWN
      : input.action === 'up'
        ? MOTION_ACTION_UP
        : MOTION_ACTION_MOVE;
    const isDown = action === MOTION_ACTION_DOWN;
    const isUp = action === MOTION_ACTION_UP;
    const buttons = isUp ? 0 : MOTION_BUTTON_PRIMARY;

    const payload = serializeInjectTouch({
      action,
      x: input.x,
      y: input.y,
      screenWidth: input.screenWidth,
      screenHeight: input.screenHeight,
      actionButton: isDown || isUp ? MOTION_BUTTON_PRIMARY : 0,
      buttons,
    });

    return this.writeControlPayload(payload);
  }

  injectScroll(input: MirrorScrollInput): { success: boolean } {
    if (!this.controlSocket || this.controlSocket.destroyed || this.state !== 'streaming') {
      return { success: false };
    }

    const hScroll = Math.max(-16, Math.min(16, -input.deltaX / 40));
    const vScroll = Math.max(-16, Math.min(16, -input.deltaY / 40));
    const payload = serializeInjectScroll({
      x: input.x,
      y: input.y,
      screenWidth: input.screenWidth,
      screenHeight: input.screenHeight,
      hScroll,
      vScroll,
    });

    return this.writeControlPayload(payload);
  }

  injectText(text: string): { success: boolean } {
    if (!this.controlSocket || this.controlSocket.destroyed || this.state !== 'streaming') {
      return { success: false };
    }

    const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    if (!normalized) {
      return { success: false };
    }

    return this.writeControlPayload(serializeInjectText(normalized));
  }

  private writeControlPayload(payload: Uint8Array): { success: boolean } {
    if (!this.controlSocket || this.controlSocket.destroyed) {
      return { success: false };
    }

    try {
      this.controlSocket.write(Buffer.from(payload));
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  private reserveLocalPort(): Promise<number> {
    return new Promise((resolve, reject) => {
      const server = createServer();
      server.once('error', reject);
      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          server.close();
          reject(new Error('Failed to reserve local mirror port'));
          return;
        }
        const port = (address as AddressInfo).port;
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }
          resolve(port);
        });
      });
    });
  }

  private startLocalServer(session: number): Promise<{ port: number; waitForConnection: () => Promise<Socket> }> {
    return new Promise((resolve, reject) => {
      const server = createServer();
      let settled = false;
      let connectionResolve: ((socket: Socket) => void) | null = null;
      let connectionReject: ((error: Error) => void) | null = null;

      const waitForConnection = () => new Promise<Socket>((res, rej) => {
        if (session !== this.sessionId) {
          rej(new Error('Mirror start cancelled'));
          return;
        }
        if (this.videoSocket) {
          res(this.videoSocket);
          return;
        }
        connectionResolve = res;
        connectionReject = rej;
      });

      server.on('connection', (socket) => {
        if (session !== this.sessionId) {
          socket.destroy();
          return;
        }

        if (!this.videoSocket) {
          this.attachVideoSocket(socket, session);
          connectionResolve?.(socket);
          connectionResolve = null;
          connectionReject = null;
          return;
        }

        if (!this.controlSocket) {
          this.attachControlSocket(socket, session);
          return;
        }

        socket.destroy();
      });

      server.on('error', (error) => {
        if (!settled) {
          settled = true;
          reject(error);
          return;
        }
        connectionReject?.(error);
      });

      server.listen(0, '127.0.0.1', () => {
        const address = server.address();
        if (!address || typeof address === 'string') {
          reject(new Error('Failed to open local mirror socket'));
          return;
        }
        this.localServer = server;
        settled = true;
        resolve({ port: (address as AddressInfo).port, waitForConnection });
      });
    });
  }

  private attachVideoSocket(socket: Socket, session: number): void {
    this.videoSocket = socket;
    socket.on('data', (chunk) => {
      if (session !== this.sessionId) return;
      this.emitChunk(chunk);
    });
    this.attachSocketLifecycle(socket, 'video', session);
  }

  private attachControlSocket(socket: Socket, session: number): void {
    this.controlSocket = socket;
    socket.on('data', () => {
      // Device-to-client control messages (clipboard, acks) are ignored for now.
    });
    this.attachSocketLifecycle(socket, 'control', session);
  }

  private attachSocketLifecycle(socket: Socket, kind: 'video' | 'control', session: number): void {
    socket.on('error', (error) => {
      if (session !== this.sessionId) return;
      if (this.stopping || this.state === 'idle') return;
      if (kind === 'video' && this.videoSocket !== socket) return;
      if (kind === 'control' && this.controlSocket !== socket) return;
      if (kind === 'video') {
        this.setState('error', error.message);
      } else {
        console.warn(`[MockForge][mirror] control socket error: ${error.message}`);
      }
    });
    socket.on('close', () => {
      if (session !== this.sessionId) return;
      if (this.stopping || this.state === 'idle') return;
      if (kind === 'video' && this.videoSocket !== socket) return;
      if (kind === 'video' && (this.state === 'streaming' || this.state === 'starting')) {
        this.setState('error', 'Mirror connection closed');
      }
      if (kind === 'control' && this.controlSocket === socket) {
        this.controlSocket = null;
      }
    });
  }

  private async waitForControlSocket(session: number, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!this.controlSocket && Date.now() < deadline) {
      if (session !== this.sessionId) {
        throw new Error('Mirror start cancelled');
      }
      await delay(50);
    }
    if (!this.controlSocket) {
      throw new Error('Timed out waiting for mirror control socket');
    }
  }

  private async connectControlSocket(port: number, session: number): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < CONNECT_MAX_ATTEMPTS; attempt += 1) {
      if (session !== this.sessionId) {
        throw new Error('Mirror start cancelled');
      }

      if (attempt > 0) {
        await delay(CONNECT_RETRY_MS);
      }

      try {
        const controlSocket = await this.connectOnce(port);
        if (session !== this.sessionId) {
          controlSocket.destroy();
          throw new Error('Mirror start cancelled');
        }
        this.attachControlSocket(controlSocket, session);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('control socket failed');
      }
    }

    throw lastError ?? new Error('Failed to connect mirror control socket');
  }

  private async connectWithRetry(port: number, session: number): Promise<void> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < CONNECT_MAX_ATTEMPTS; attempt += 1) {
      if (session !== this.sessionId) {
        throw new Error('Mirror start cancelled');
      }

      if (attempt > 0) {
        await delay(CONNECT_RETRY_MS);
      }

      try {
        const videoSocket = await this.connectOnce(port);
        if (session !== this.sessionId) {
          videoSocket.destroy();
          throw new Error('Mirror start cancelled');
        }
        this.attachVideoSocket(videoSocket, session);
        await this.connectControlSocket(port, session);
        return;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Failed to connect to device mirror');
      }
    }

    throw lastError ?? new Error('Failed to connect to device mirror');
  }

  private connectOnce(port: number): Promise<Socket> {
    return new Promise((resolve, reject) => {
      const socket = createConnection({ port, host: '127.0.0.1' });
      let settled = false;

      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        socket.destroy();
        reject(new Error('Timed out connecting to device mirror'));
      }, CONNECT_TIMEOUT_MS);

      socket.on('connect', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        resolve(socket);
      });

      socket.on('error', (error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private cleanupSockets(): void {
    if (this.videoSocket) {
      this.videoSocket.removeAllListeners();
      this.videoSocket.destroy();
      this.videoSocket = null;
    }
    if (this.controlSocket) {
      this.controlSocket.removeAllListeners();
      this.controlSocket.destroy();
      this.controlSocket = null;
    }
  }

  private cleanupLocalServer(): void {
    if (this.localServer) {
      this.localServer.close();
      this.localServer = null;
    }
  }

  async stop(): Promise<void> {
    const stopPromise = this.startChain.then(() => this.stopInternal());
    this.startChain = stopPromise.then(() => undefined, () => undefined);
    await stopPromise;
  }

  private async stopInternal(): Promise<void> {
    this.sessionId += 1;
    this.stopping = true;

    this.cleanupSockets();
    this.cleanupLocalServer();

    if (this.shellProc) {
      this.shellProc.removeAllListeners();
      this.shellProc.kill();
      this.shellProc = null;
    }

    if (this.deviceId && this.localPort > 0 && this.tunnelMode && this.socketName) {
      removeTunnel(this.deviceId, this.tunnelMode, this.localPort, this.socketName);
    }

    this.localPort = 0;
    this.tunnelMode = null;
    this.socketName = null;
    this.deviceId = null;
    this.chunkBuffer = [];
    this.bufferedBytes = 0;
    this.setState('idle');
    this.stopping = false;
  }
}

export const scrcpyMirrorService = new ScrcpyMirrorService();

export function getMirrorStatus(): MirrorStatus {
  return scrcpyMirrorService.getStatus();
}
