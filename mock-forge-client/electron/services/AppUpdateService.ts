import { execFile, spawn } from 'child_process';
import { app, shell } from 'electron';
import { chmodSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import {
  type AppUpdateCheckResult,
  type GithubRelease,
  brewInstallCommand,
  githubApiLatestReleaseUrl,
  githubRepoUrl,
  resolveUpdatePlan,
} from '../../shared/appUpdate';
import { downloadFile } from '../utils/downloadFile';
import { resolveCommandPath } from '../utils/platform';
import { getShellEnv } from '../utils/shellEnv';

const execFileAsync = promisify(execFile);
const CASK_TOKEN = 'mockforge';

let lastCheck: AppUpdateCheckResult | null = null;

export async function checkForAppUpdate(): Promise<AppUpdateCheckResult> {
  const currentVersion = app.getVersion();
  const brewInstall = brewInstallCommand();

  try {
    const release = await fetchLatestRelease();
    const brewCaskInstalled = process.platform === 'darwin'
      ? await isBrewCaskInstalled()
      : false;

    const plan = resolveUpdatePlan({
      currentVersion,
      release,
      platform: process.platform,
      arch: process.arch,
      brewCaskInstalled,
    });

    lastCheck = {
      ...plan,
      packaged: app.isPackaged,
    };
    return lastCheck;
  } catch (error) {
    lastCheck = {
      currentVersion,
      latestVersion: null,
      available: false,
      method: null,
      releaseUrl: null,
      notes: '',
      assetName: null,
      downloadUrl: null,
      caskUrl: null,
      brewInstallCommand: brewInstall,
      packaged: app.isPackaged,
      error: isMissingPublishedRelease(error) ? undefined : (error instanceof Error ? error.message : String(error)),
    };
    return lastCheck;
  }
}

export async function applyAppUpdate(
  onProgress?: (percent: number | null) => void,
  prepareToReplace?: () => Promise<void>,
): Promise<{ success: boolean; error?: string; openedReleasePage?: boolean }> {
  const info = lastCheck ?? await checkForAppUpdate();
  if (info.error) {
    return { success: false, error: info.error };
  }
  if (!info.available) {
    return { success: false, error: 'No update available' };
  }

  if (!app.isPackaged) {
    if (info.releaseUrl) {
      await shell.openExternal(info.releaseUrl);
      return { success: true, openedReleasePage: true };
    }
    return { success: false, error: 'No release page to open' };
  }

  if (!info.method) {
    if (info.releaseUrl) {
      await shell.openExternal(info.releaseUrl);
      return { success: true, openedReleasePage: true };
    }
    return { success: false, error: 'No package found for this system' };
  }

  if (info.method === 'mac-brew') {
    await prepareToReplace?.();
    startBrewUpgradeAndQuit(info.caskUrl);
    return { success: true };
  }

  if (info.method === 'mac-dmg') {
    if (!info.downloadUrl || !info.assetName) {
      return { success: false, error: 'macOS disk image is missing from the release' };
    }
    const dest = join(app.getPath('downloads'), info.assetName);
    await downloadFile(info.downloadUrl, dest, onProgress);
    const openError = await shell.openPath(dest);
    if (openError) {
      return { success: false, error: openError };
    }
    return { success: true };
  }

  if (!info.downloadUrl || !info.assetName) {
    return { success: false, error: 'Windows installer is missing from the release' };
  }

  const dest = join(app.getPath('temp'), info.assetName);
  await downloadFile(info.downloadUrl, dest, onProgress);
  await prepareToReplace?.();
  startWindowsInstallAndQuit(dest);
  return { success: true };
}

export async function openReleaseUrl(url: string): Promise<{ success: boolean; error?: string }> {
  if (!url.startsWith(`${githubRepoUrl()}/`)) {
    return { success: false, error: 'Unexpected release URL' };
  }
  await shell.openExternal(url);
  return { success: true };
}

async function fetchLatestRelease(): Promise<GithubRelease> {
  const response = await fetch(githubApiLatestReleaseUrl(), {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'MockForge',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (response.status === 404) {
    throw new Error('No GitHub release published yet');
  }
  if (!response.ok) {
    throw new Error(`GitHub API HTTP ${response.status}`);
  }

  return response.json() as Promise<GithubRelease>;
}

async function isBrewCaskInstalled(): Promise<boolean> {
  const brew = resolveBrewPath();
  if (!brew) return false;

  try {
    await execFileAsync(brew, ['list', '--cask', CASK_TOKEN], {
      env: getShellEnv(),
      timeout: 15_000,
    });
    return true;
  } catch {
    return false;
  }
}

function resolveBrewPath(): string | null {
  return resolveCommandPath('brew', getShellEnv().PATH);
}

function startBrewUpgradeAndQuit(caskUrl: string | null): void {
  const brew = resolveBrewPath();
  if (!brew) {
    throw new Error('Homebrew was not found');
  }
  if (!caskUrl) {
    throw new Error('Homebrew cask is missing from the release');
  }

  const scriptPath = join(tmpdir(), `mockforge-brew-upgrade-${Date.now()}.sh`);
  const caskPath = join(tmpdir(), 'mockforge-update.rb');
  const pid = process.pid;
  const script = `#!/bin/bash
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
while kill -0 ${pid} 2>/dev/null; do
  sleep 0.2
done
sleep 0.4
curl -fsSL ${shellQuote(caskUrl)} -o ${shellQuote(caskPath)}
${shellQuote(brew)} install --cask --force ${shellQuote(caskPath)}
open -a MockForge
`;
  writeFileSync(scriptPath, script, 'utf8');
  chmodSync(scriptPath, 0o755);

  const child = spawn('/bin/bash', [scriptPath], {
    detached: true,
    stdio: 'ignore',
    env: getShellEnv(),
  });
  child.unref();
  quitSoon();
}

function startWindowsInstallAndQuit(setupPath: string): void {
  const scriptPath = join(tmpdir(), `mockforge-win-upgrade-${Date.now()}.cmd`);
  const relaunch = join(process.env.LOCALAPPDATA || '', 'Programs', 'MockForge', 'MockForge.exe');
  const pid = process.pid;
  const script = `@echo off
:wait
tasklist /FI "PID eq ${pid}" | find "${pid}" >nul
if not errorlevel 1 (
  timeout /t 1 /nobreak >nul
  goto wait
)
start /wait "" ${cmdQuote(setupPath)} /S
if exist ${cmdQuote(relaunch)} (
  start "" ${cmdQuote(relaunch)}
)
`;
  writeFileSync(scriptPath, script, 'utf8');

  const child = spawn('cmd.exe', ['/c', scriptPath], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  quitSoon();
}

function quitSoon(): void {
  setTimeout(() => {
    app.quit();
  }, 400);
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function cmdQuote(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function isMissingPublishedRelease(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /No GitHub release published yet|HTTP 404/i.test(message);
}
