import { execSync } from 'child_process';

function getPidsOnPort(port: number): number[] {
  if (process.platform === 'win32') {
    try {
      const output = execSync('netstat -ano -p tcp', { encoding: 'utf-8', stdio: 'pipe' });
      const pids = new Set<number>();
      const portToken = `:${port}`;

      for (const line of output.split(/\r?\n/)) {
        if (!line.includes('LISTENING') || !line.includes(portToken)) continue;

        const localAddress = line.trim().split(/\s+/)[1] ?? '';
        if (!localAddress.endsWith(portToken) && !localAddress.endsWith(`${portToken} `)) {
          continue;
        }

        const pid = parseInt(line.trim().split(/\s+/).at(-1) ?? '', 10);
        if (!isNaN(pid) && pid > 0) {
          pids.add(pid);
        }
      }

      return [...pids];
    } catch {
      return [];
    }
  }

  try {
    const output = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf-8', stdio: 'pipe' }).trim();
    if (!output) return [];
    return output
      .split('\n')
      .map((pid) => parseInt(pid, 10))
      .filter((id) => !isNaN(id));
  } catch {
    return [];
  }
}

function terminateProcess(pid: number): void {
  if (pid === process.pid) return;

  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'pipe' });
      return;
    }
    process.kill(pid, 'SIGTERM');
  } catch {
    // process may already be gone
  }
}

export function killProcessOnPort(port: number, exceptPid?: number): void {
  for (const pid of getPidsOnPort(port)) {
    if (pid !== exceptPid) {
      terminateProcess(pid);
    }
  }
}

export function isPortInUse(port: number): boolean {
  return getPidsOnPort(port).length > 0;
}
