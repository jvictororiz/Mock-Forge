import { spawn, type ChildProcess } from 'child_process';
import { resolveAdbPath } from '../utils/adbPath';
import { getShellEnv } from '../utils/shellEnv';

let trackerProcess: ChildProcess | null = null;

export function startAdbDeviceTracker(onChange: () => void): void {
  stopAdbDeviceTracker();

  const adb = resolveAdbPath();
  if (!adb) return;

  const child = spawn(adb, ['track-devices'], {
    env: getShellEnv(),
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  trackerProcess = child;

  child.stdout?.on('data', () => {
    onChange();
  });

  child.stderr?.on('data', () => {
    onChange();
  });

  child.on('exit', () => {
    if (trackerProcess === child) {
      trackerProcess = null;
    }
  });

  child.on('error', () => {
    if (trackerProcess === child) {
      trackerProcess = null;
    }
  });
}

export function stopAdbDeviceTracker(): void {
  const child = trackerProcess;
  trackerProcess = null;
  if (!child) return;

  try {
    child.kill('SIGTERM');
  } catch {
    // already gone
  }
}
