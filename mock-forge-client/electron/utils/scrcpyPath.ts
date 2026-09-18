import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { app } from 'electron';
import { resolveCommandPath } from './platform';

export const SCRCPY_SERVER_VERSION = '3.1';
const SERVER_FILENAME = 'scrcpy-server';

let cachedServerPath: string | null | undefined;

function getDevResourcesPath(): string {
  return join(__dirname, '..', 'resources');
}

export function getBundledServerPath(): string {
  if (app.isPackaged) {
    return join(process.resourcesPath, 'scrcpy', SERVER_FILENAME);
  }
  return join(getDevResourcesPath(), 'scrcpy', SERVER_FILENAME);
}

export function getScrcpyServerDownloadPath(): string {
  if (app.isPackaged) {
    return join(app.getPath('userData'), 'scrcpy', SERVER_FILENAME);
  }
  return getBundledServerPath();
}

function getUserDataServerPath(): string {
  return join(app.getPath('userData'), 'scrcpy', SERVER_FILENAME);
}

function getExternalServerCandidates(): string[] {
  const home = homedir();
  const brewPrefix = process.env.HOMEBREW_PREFIX ?? '/opt/homebrew';
  const scrcpyBinary = resolveCommandPath('scrcpy');

  const candidates: string[] = [
    join(brewPrefix, 'share', 'scrcpy', SERVER_FILENAME),
    join('/usr/local', 'share', 'scrcpy', SERVER_FILENAME),
    join(home, '.local', 'share', 'scrcpy', SERVER_FILENAME),
  ];

  if (scrcpyBinary) {
    candidates.push(
      join(scrcpyBinary, '..', '..', 'share', 'scrcpy', SERVER_FILENAME),
      join(scrcpyBinary, '..', '..', 'share', 'scrcpy', `${SERVER_FILENAME}-v${SCRCPY_SERVER_VERSION}`),
    );
  }

  if (process.platform === 'win32') {
    candidates.push(
      join(process.env.LOCALAPPDATA ?? '', 'scrcpy', SERVER_FILENAME),
      join(process.env.ProgramFiles ?? '', 'scrcpy', SERVER_FILENAME),
    );
  }

  return candidates;
}

export function resetScrcpyServerCache(): void {
  cachedServerPath = undefined;
}

export function resolveScrcpyServerPath(): string | null {
  if (cachedServerPath !== undefined) {
    if (cachedServerPath && existsSync(cachedServerPath)) {
      return cachedServerPath;
    }
    cachedServerPath = undefined;
  }

  const candidates = [
    getBundledServerPath(),
    getUserDataServerPath(),
    ...getExternalServerCandidates(),
  ];

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      cachedServerPath = candidate;
      return cachedServerPath;
    }
  }

  cachedServerPath = null;
  return null;
}

export function scrcpyServerAvailable(): boolean {
  return resolveScrcpyServerPath() !== null;
}
