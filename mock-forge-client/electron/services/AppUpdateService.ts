import { execFile, spawn } from 'child_process';
import { app, net, shell } from 'electron';
import { chmodSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { promisify } from 'util';
import {
  type AppUpdateCheckResult,
  type GithubRelease,
  CASK_TOKEN,
  brewInstallCommand,
  brewUpgradeScript,
  githubLatestReleasePageUrl,
  parseBrewLivecheck,
  releaseFromTag,
  resolveUpdatePlan,
  tagFromGithubReleaseUrl,
  updateWindowCopy,
} from '../../shared/appUpdate';
import { macUpdateWindowScript, windowsUpdateWindowScript } from '../../shared/updateWindowScripts';
import { downloadFile } from '../utils/downloadFile';
import { updatesSession } from '../utils/updatesSession';
import { resolveCommandPath } from '../utils/platform';
import { getShellEnv } from '../utils/shellEnv';

const execFileAsync = promisify(execFile);

let lastCheck: AppUpdateCheckResult | null = null;

export async function checkForAppUpdate(): Promise<AppUpdateCheckResult> {
  const currentVersion = app.getVersion();
  const brewInstall = brewInstallCommand();

  try {
    const brewCaskInstalled = process.platform === 'darwin'
      ? await isBrewCaskInstalled()
      : false;
    const release = (brewCaskInstalled ? await fetchLatestReleaseFromBrew() : null)
      ?? await fetchLatestRelease();

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
      error: isMissingPublishedRelease(error) ? undefined : networkErrorMessage(error),
    };
    return lastCheck;
  }
}

export async function applyAppUpdate(
  onProgress?: (percent: number | null) => void,
  prepareToReplace?: () => Promise<void>,
  locale?: string,
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
    if (!info.latestVersion) {
      return { success: false, error: 'Homebrew version is missing' };
    }
    await prepareToReplace?.();
    startBrewUpgradeAndQuit(info.latestVersion, info.caskUrl, locale);
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
  startWindowsInstallAndQuit(dest, locale);
  return { success: true };
}

function fetchLatestRelease(): Promise<GithubRelease> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      action();
    };

    const request = net.request({
      method: 'GET',
      url: githubLatestReleasePageUrl(),
      session: updatesSession(),
      redirect: 'manual',
    });
    request.setHeader('Accept', 'text/html');
    request.setHeader('User-Agent', 'MockForge');

    request.on('redirect', (_status, _method, redirectUrl) => {
      const release = releaseFromRedirect(redirectUrl);
      if (!release) {
        finish(() => reject(new Error('GitHub did not return a release tag')));
        return;
      }
      finish(() => resolve(release));
    });

    request.on('response', (response) => {
      const status = response.statusCode;
      const chunks: Buffer[] = [];
      response.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      response.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        const release = releaseFromRedirect(firstHeader(response.headers.location))
          ?? releaseFromRedirect(body);
        if (release && (status === 200 || status === 301 || status === 302)) {
          finish(() => resolve(release));
          return;
        }
        if (status === 404) {
          finish(() => reject(new Error('No GitHub release published yet')));
          return;
        }
        const detail = githubErrorDetail(body);
        finish(() => reject(new Error(detail ? `GitHub HTTP ${status}: ${detail}` : `GitHub HTTP ${status}`)));
      });
      response.on('error', (error: unknown) => finish(() => reject(error)));
    });

    request.on('error', (error) => finish(() => reject(error)));
    request.end();
  });
}

function releaseFromRedirect(value: string): GithubRelease | null {
  const tag = tagFromGithubReleaseUrl(value);
  return tag ? releaseFromTag(tag) : null;
}

function firstHeader(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? '';
  return value ?? '';
}

function githubErrorDetail(body: string): string {
  try {
    const parsed = JSON.parse(body) as { message?: string };
    return (parsed.message || '').trim();
  } catch {
    return '';
  }
}

function networkErrorMessage(error: unknown): string {
  const parts: string[] = [];
  const seen = new Set<unknown>();
  let current: unknown = error;
  while (current && !seen.has(current)) {
    seen.add(current);
    if (current instanceof Error) {
      if (current.message) parts.push(current.message);
      current = (current as Error & { cause?: unknown }).cause;
      continue;
    }
    parts.push(String(current));
    break;
  }
  const unique = parts.filter((part, index) => parts.indexOf(part) === index);
  return unique.join(': ') || 'Network request failed';
}

async function fetchLatestReleaseFromBrew(): Promise<GithubRelease | null> {
  const brew = resolveBrewPath();
  if (!brew) return null;

  try {
    const { stdout } = await execFileAsync(brew, ['livecheck', '--cask', '--json', CASK_TOKEN], {
      env: {
        ...getShellEnv(),
        HOMEBREW_NO_AUTO_UPDATE: '1',
        HOMEBREW_NO_ENV_HINTS: '1',
        HOMEBREW_NO_ANALYTICS: '1',
      },
      timeout: 45_000,
    });
    const latest = parseBrewLivecheck(stdout);
    return latest ? releaseFromTag(latest) : null;
  } catch {
    return null;
  }
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

function startBrewUpgradeAndQuit(version: string, caskUrl: string | null, locale?: string): void {
  const brew = resolveBrewPath();
  if (!brew) {
    throw new Error('Homebrew was not found');
  }

  const stamp = Date.now();
  const scriptPath = join(tmpdir(), `mockforge-brew-upgrade-${stamp}.sh`);
  const statusPath = join(tmpdir(), `mockforge-update-status-${stamp}.txt`);
  const uiPath = join(tmpdir(), `mockforge-update-ui-${stamp}.applescript`);
  const caskPath = join(tmpdir(), 'mockforge-update.rb');
  const copy = updateWindowCopy(locale || '');
  writeFileSync(statusPath, 'closing', 'utf8');
  writeFileSync(scriptPath, brewUpgradeScript({
    brewPath: brew,
    pid: process.pid,
    version,
    caskUrl,
    caskPath,
    statusPath,
  }), 'utf8');
  chmodSync(scriptPath, 0o755);
  writeFileSync(uiPath, macUpdateWindowScript(), 'utf8');

  const worker = spawn('/bin/bash', [scriptPath], {
    detached: true,
    stdio: 'ignore',
    env: getShellEnv(),
  });
  worker.unref();

  if (worker.pid) {
    const windowProcess = spawn('/usr/bin/osascript', [
      uiPath,
      String(worker.pid),
      statusPath,
      scriptPath,
      copy.title,
      copy.closing,
      copy.installing,
      copy.opening,
      copy.failed,
      copy.retry,
      copy.close,
    ], {
      detached: true,
      stdio: 'ignore',
      env: getShellEnv(),
    });
    windowProcess.unref();
  }
  quitSoon();
}

function startWindowsInstallAndQuit(setupPath: string, locale?: string): void {
  const stamp = Date.now();
  const scriptPath = join(tmpdir(), `mockforge-win-upgrade-${stamp}.ps1`);
  const configPath = join(tmpdir(), `mockforge-win-upgrade-${stamp}.json`);
  const copy = updateWindowCopy(locale || '');
  const config = {
    pid: process.pid,
    setupPath,
    relaunchPaths: windowsRelaunchPaths(),
    ...copy,
  };
  writeFileSync(scriptPath, `\uFEFF${windowsUpdateWindowScript()}`, 'utf8');
  writeFileSync(configPath, `\uFEFF${JSON.stringify(config)}`, 'utf8');

  const child = spawn('powershell.exe', [
    '-NoProfile',
    '-STA',
    '-ExecutionPolicy', 'Bypass',
    '-WindowStyle', 'Hidden',
    '-File', scriptPath,
    configPath,
  ], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  quitSoon();
}

function windowsRelaunchPaths(): string[] {
  const current = app.getPath('exe');
  const localAppData = process.env.LOCALAPPDATA || '';
  const programFiles = process.env.ProgramFiles || 'C:\\Program Files';
  const programFilesX86 = process.env['ProgramFiles(x86)'] || '';
  const candidates = [
    current,
    localAppData ? join(localAppData, 'Programs', 'MockForge', 'MockForge.exe') : '',
    join(programFiles, 'MockForge', 'MockForge.exe'),
    programFilesX86 ? join(programFilesX86, 'MockForge', 'MockForge.exe') : '',
  ];
  return [...new Set(candidates.filter((path) => path.length > 0))];
}

function quitSoon(): void {
  setTimeout(() => {
    app.quit();
  }, 700);
}

function isMissingPublishedRelease(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /No GitHub release published yet|HTTP 404/i.test(message);
}
