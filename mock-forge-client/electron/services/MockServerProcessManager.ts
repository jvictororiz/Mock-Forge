import { spawn, ChildProcess } from 'child_process';
import { getMockServerJarPath, checkJava, checkJar, getJavaExecutable } from './javaCheck';
import { killProcessOnPort } from './portUtils';

export type ProcessExitHandler = (code: number | null, stderr: string) => void;

export class MockServerProcessManager {
  private process: ChildProcess | null = null;
  private childPid: number | null = null;
  private currentPort = 1080;
  private started = false;
  private starting = false;
  private lastError: string | null = null;
  private onUnexpectedExit: ProcessExitHandler | null = null;
  private forceKillTimer: ReturnType<typeof setTimeout> | null = null;

  setOnUnexpectedExit(handler: ProcessExitHandler | null): void {
    this.onUnexpectedExit = handler;
  }

  getLastError(): string | null {
    return this.lastError;
  }

  getPort(): number {
    return this.currentPort;
  }

  isRunning(): boolean {
    if (this.childPid) {
      try {
        process.kill(this.childPid, 0);
        return this.started;
      } catch {
        this.childPid = null;
        this.process = null;
        this.started = false;
        return false;
      }
    }
    return false;
  }

  private clearForceKillTimer(): void {
    if (this.forceKillTimer) {
      clearTimeout(this.forceKillTimer);
      this.forceKillTimer = null;
    }
  }

  async start(port = 1080): Promise<{ success: boolean; error?: string }> {
    if (this.starting) {
      return { success: false, error: 'MockServer is already starting' };
    }

    if (this.isRunning()) {
      if (this.currentPort === port) {
        return { success: true };
      }
      await this.stop();
    }

    const javaExecutable = getJavaExecutable();
    if (!javaExecutable) {
      const javaCheck = checkJava();
      return { success: false, error: javaCheck.error };
    }

    const javaCheck = checkJava();
    if (!javaCheck.available) {
      return { success: false, error: javaCheck.error };
    }

    if (!checkJar()) {
      return {
        success: false,
        error: 'MockServer JAR not found. Run: npm run download-mockserver',
      };
    }

    this.starting = true;
    this.clearForceKillTimer();

    // Clear orphaned processes from previous sessions / hot reload
    killProcessOnPort(port);
    await new Promise((r) => setTimeout(r, 400));

    const jarPath = getMockServerJarPath();
    this.currentPort = port;
    this.lastError = null;
    this.started = false;

    try {
      return await this.spawnAndWaitForHealthy(port, jarPath, javaExecutable);
    } finally {
      this.starting = false;
    }
  }

  private spawnAndWaitForHealthy(
    port: number,
    jarPath: string,
    javaExecutable: string,
  ): Promise<{ success: boolean; error?: string }> {
    return new Promise((resolve) => {
      let stderr = '';
      let resolved = false;

      const child = spawn(
        javaExecutable,
        [
          '-Djava.net.preferIPv4Stack=true',
          '-Dmockserver.localBoundIP=0.0.0.0',
          '-jar', jarPath,
          '-serverPort', String(port),
        ],
        { stdio: ['ignore', 'pipe', 'pipe'], detached: false },
      );

      this.process = child;
      this.childPid = child.pid ?? null;

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.stdout?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      const finish = (result: { success: boolean; error?: string }) => {
        if (resolved) return;
        resolved = true;
        clearTimeout(timeout);
        resolve(result);
      };

      const timeout = setTimeout(() => {
        finish({ success: false, error: 'MockServer failed to start within 30 seconds' });
      }, 30000);

      const checkHealth = async () => {
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 1000));

          if (!this.childPid) {
            finish({
              success: false,
              error: `MockServer exited before starting${stderr ? `: ${stderr.slice(-300)}` : ''}`,
            });
            return;
          }

          try {
            process.kill(this.childPid, 0);
          } catch {
            finish({
              success: false,
              error: `MockServer exited before starting${stderr ? `: ${stderr.slice(-300)}` : ''}`,
            });
            return;
          }

          try {
            const res = await fetch(`http://127.0.0.1:${port}/mockserver/retrieve`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ httpRequest: {}, type: 'REQUESTS' }),
            });
            if (res.ok) {
              this.started = true;
              finish({ success: true });
              return;
            }
          } catch {
            // keep waiting
          }
        }

        finish({ success: false, error: 'MockServer health check failed' });
      };

      child.on('error', (err) => {
        finish({ success: false, error: err.message });
      });

      child.on('exit', (code) => {
        const wasStarted = this.started;
        const pid = this.childPid;
        this.process = null;
        this.childPid = null;
        this.started = false;

        if (!resolved) {
          finish({
            success: false,
            error: `MockServer exited with code ${code}${stderr ? `: ${stderr.slice(-300)}` : ''}`,
          });
          return;
        }

        if (wasStarted) {
          this.lastError = `MockServer stopped unexpectedly (code ${code})${stderr ? `: ${stderr.slice(-300)}` : ''}`;
          this.onUnexpectedExit?.(code, stderr);
        }

        void pid;
      });

      checkHealth();
    });
  }

  async stop(): Promise<void> {
    this.clearForceKillTimer();
    this.started = false;
    this.starting = false;

    const proc = this.process;
    const pid = this.childPid;
    this.process = null;
    this.childPid = null;

    if (proc) {
      await new Promise<void>((resolve) => {
        proc.once('exit', () => resolve());
        proc.kill('SIGTERM');

        this.forceKillTimer = setTimeout(() => {
          this.forceKillTimer = null;
          if (!proc.killed) {
            try {
              proc.kill('SIGKILL');
            } catch {
              // already gone
            }
          }
          resolve();
        }, 3000);
      });
      return;
    }

    if (pid) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // already gone
      }
    }
  }

  async isHealthy(): Promise<boolean> {
    if (!this.isRunning()) return false;
    try {
      const res = await fetch(`http://127.0.0.1:${this.currentPort}/mockserver/retrieve`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ httpRequest: {}, type: 'REQUESTS' }),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
