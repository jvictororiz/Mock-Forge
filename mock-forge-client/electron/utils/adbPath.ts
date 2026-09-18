import { existsSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import { resolveCommandPath } from './platform';
import { getShellEnv } from './shellEnv';

let cachedAdbPath: string | null | undefined;

function getAdbCandidates(): string[] {
  const home = homedir();
  const envRoots = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT]
    .filter((value): value is string => !!value?.trim());

  return [
    ...envRoots.map((root) => join(root, 'platform-tools', 'adb')),
    join(home, 'Library', 'Android', 'sdk', 'platform-tools', 'adb'),
    join(home, 'Library', 'Android', 'Sdk', 'platform-tools', 'adb'),
    join(process.env.HOMEBREW_PREFIX ?? '/opt/homebrew', 'bin', 'adb'),
    join('/usr/local', 'bin', 'adb'),
  ];
}

export function resolveAdbPath(): string | null {
  if (cachedAdbPath !== undefined) return cachedAdbPath;

  for (const candidate of getAdbCandidates()) {
    if (existsSync(candidate)) {
      cachedAdbPath = candidate;
      return cachedAdbPath;
    }
  }

  const fromPath = resolveCommandPath('adb', getShellEnv().PATH);
  if (fromPath && existsSync(fromPath)) {
    cachedAdbPath = fromPath;
    return cachedAdbPath;
  }

  cachedAdbPath = null;
  return null;
}

export function adbAvailable(): boolean {
  return resolveAdbPath() !== null;
}
