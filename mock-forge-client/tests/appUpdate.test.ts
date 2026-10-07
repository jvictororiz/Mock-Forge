import { describe, expect, it } from 'vitest';
import {
  brewUpgradeScript,
  compareVersions,
  macDmgAssetName,
  macDmgAssetNameLegacy,
  mergeBackgroundUpdateCheck,
  parseBrewLivecheck,
  releaseFromTag,
  resolveUpdatePlan,
  tagFromGithubReleaseUrl,
  updateWindowCopy,
  windowsSetupAssetName,
  windowsSetupAssetNameLegacy,
  type AppUpdateCheckResult,
  type GithubRelease,
} from '../shared/appUpdate';
import { macUpdateWindowScript, windowsUpdateWindowScript } from '../shared/updateWindowScripts';

const release = (tag: string, assetNames: string[]): GithubRelease => ({
  tag_name: tag,
  html_url: 'https://github.com/jvictororiz/Mock-Forge/releases/tag/v0.8.0',
  body: 'Notes',
  assets: assetNames.map((name) => ({
    name,
    browser_download_url: `https://github.com/jvictororiz/Mock-Forge/releases/download/${tag}/${name}`,
  })),
});

describe('brewUpgradeScript', () => {
  it('asks Homebrew to upgrade the installed cask before reopening the app', () => {
    const script = brewUpgradeScript({
      brewPath: '/opt/homebrew/bin/brew',
      pid: 42,
      version: 'v0.7.20',
      caskUrl: 'https://github.com/jvictororiz/Mock-Forge/releases/download/v0.7.20/mockforge.rb',
      caskPath: '/tmp/mockforge-update.rb',
    });

    expect(script).toContain("'/opt/homebrew/bin/brew' upgrade --cask --greedy --appdir=\"$APPDIR\" 'mockforge'");
    expect(script).toContain('"$HOME/Applications/MockForge.app"');
    expect(script).not.toContain('joao.holanda');
    expect(script).toContain("target '0.7.20'");
    expect(script).toContain('jvictororiz/homebrew-mockforge');
    expect(script).not.toContain('uninstall');
    expect(script).toContain('app missing, installing from the tap');
  });

  it('reports progress and retries opening the app', () => {
    const script = brewUpgradeScript({
      brewPath: '/opt/homebrew/bin/brew',
      pid: 42,
      version: '0.7.29',
      caskUrl: null,
      caskPath: '/tmp/mockforge-update.rb',
      statusPath: '/tmp/mockforge-status',
    });

    expect(script).toContain("status_path='/tmp/mockforge-status'");
    expect(script).toContain('set_status installing');
    expect(script).toContain('set_status opening');
    expect(script).toContain('open attempt');
    expect(script).toContain('set_status failed');
    expect(script).toContain('set_status done');
  });
});

describe('parseBrewLivecheck', () => {
  it('reads the latest version from Homebrew JSON', () => {
    const stdout = JSON.stringify([
      {
        cask: 'mockforge',
        version: { current: '0.7.16', latest: '0.7.17', outdated: true },
      },
    ]);
    expect(parseBrewLivecheck(stdout)).toBe('0.7.17');
  });

  it('reads the plain livecheck line', () => {
    expect(parseBrewLivecheck('mockforge: 0.7.16 ==> 0.7.17\n')).toBe('0.7.17');
  });

  it('returns null when Homebrew reports no version', () => {
    expect(parseBrewLivecheck('')).toBeNull();
    expect(parseBrewLivecheck('[{"cask":"mockforge","status":"error"}]')).toBeNull();
  });
});

describe('tagFromGithubReleaseUrl', () => {
  it('reads the version from the latest-release redirect', () => {
    expect(tagFromGithubReleaseUrl(
      'https://github.com/jvictororiz/Mock-Forge/releases/tag/v0.7.17',
    )).toBe('v0.7.17');
    expect(tagFromGithubReleaseUrl(
      '/jvictororiz/Mock-Forge/releases/tag/v0.7.17',
    )).toBe('v0.7.17');
  });
});

describe('releaseFromTag', () => {
  it('points the macOS plan at the public download without the GitHub API', () => {
    const plan = resolveUpdatePlan({
      currentVersion: '0.7.16',
      release: releaseFromTag('v0.7.17'),
      platform: 'darwin',
      arch: 'arm64',
      brewCaskInstalled: true,
    });

    expect(plan.available).toBe(true);
    expect(plan.latestVersion).toBe('0.7.17');
    expect(plan.method).toBe('mac-brew');
    expect(plan.caskUrl).toBe(
      'https://github.com/jvictororiz/Mock-Forge/releases/download/v0.7.17/mockforge.rb',
    );
    expect(plan.downloadUrl).toBe(
      'https://github.com/jvictororiz/Mock-Forge/releases/download/v0.7.17/MockForge-mac-arm64.dmg',
    );
  });
});

describe('update window', () => {
  it('uses the app language in the native progress window', () => {
    expect(updateWindowCopy('pt-BR').installing).toBe('Instalando a atualização…');
    expect(updateWindowCopy('pt-BR').retry).toBe('Tentar novamente');
    expect(updateWindowCopy('en').opening).toBe('Opening MockForge…');
    expect(updateWindowCopy('en').retry).toBe('Try again');
  });

  it('shows a Windows progress window and reopens whatever install the setup registered', () => {
    const script = windowsUpdateWindowScript();
    expect(script).toContain('System.Windows.Forms.ProgressBar');
    expect(script).toContain('ProgressBarStyle]::Marquee');
    expect(script).toContain('DisplayName -ne "MockForge"');
    expect(script).toContain('$config.relaunchPaths');
    expect(script).toContain('ArgumentList "/S"');
    expect(script).toContain('System.Windows.Forms.Button');
    expect(script).toContain('$config.retry');
  });

  it('shows a macOS progress window while the upgrade script runs', () => {
    const script = macUpdateWindowScript();
    expect(script).toContain('NSProgressIndicator');
    expect(script).toContain('NSWindow');
    expect(script).toContain('workerIsGone');
    expect(script).toContain('installingText');
    expect(script).toContain('retryText');
    expect(script).toContain('addButtonWithTitle:retryText');
  });
});

describe('compareVersions', () => {
  it('orders semver tags with or without a v prefix', () => {
    expect(compareVersions('0.7.4', 'v0.8.0')).toBe(-1);
    expect(compareVersions('v0.8.0', '0.7.4')).toBe(1);
    expect(compareVersions('0.8.0', 'v0.8.0')).toBe(0);
  });
});

describe('resolveUpdatePlan', () => {
  it('picks the stable Windows NSIS installer when a newer release exists', () => {
    const plan = resolveUpdatePlan({
      currentVersion: '0.7.4',
      release: release('v0.8.0', [
        windowsSetupAssetName('x64'),
        'mockforge.rb',
      ]),
      platform: 'win32',
      arch: 'x64',
      brewCaskInstalled: false,
    });

    expect(plan.available).toBe(true);
    expect(plan.method).toBe('windows-setup');
    expect(plan.assetName).toBe('MockForge-win-x64-setup.exe');
  });

  it('falls back to legacy versioned Windows asset names', () => {
    const plan = resolveUpdatePlan({
      currentVersion: '0.7.4',
      release: release('v0.8.0', [
        windowsSetupAssetNameLegacy('0.8.0', 'x64'),
      ]),
      platform: 'win32',
      arch: 'x64',
      brewCaskInstalled: false,
    });

    expect(plan.available).toBe(true);
    expect(plan.method).toBe('windows-setup');
    expect(plan.assetName).toBe('MockForge-0.8.0-win-x64-setup.exe');
  });

  it('uses Homebrew when the macOS app was installed as a cask', () => {
    const plan = resolveUpdatePlan({
      currentVersion: '0.7.4',
      release: release('v0.8.0', [
        macDmgAssetName('arm64'),
        'mockforge.rb',
      ]),
      platform: 'darwin',
      arch: 'arm64',
      brewCaskInstalled: true,
    });

    expect(plan.available).toBe(true);
    expect(plan.method).toBe('mac-brew');
    expect(plan.caskUrl).toContain('mockforge.rb');
    expect(plan.brewInstallCommand).toBe('brew install --cask jvictororiz/homebrew-mockforge/mockforge');
  });

  it('falls back to the DMG when Homebrew did not install the app', () => {
    const plan = resolveUpdatePlan({
      currentVersion: '0.7.4',
      release: release('v0.8.0', [macDmgAssetName('arm64')]),
      platform: 'darwin',
      arch: 'arm64',
      brewCaskInstalled: false,
    });

    expect(plan.available).toBe(true);
    expect(plan.method).toBe('mac-dmg');
  });

  it('falls back to legacy versioned macOS DMG names', () => {
    const plan = resolveUpdatePlan({
      currentVersion: '0.7.4',
      release: release('v0.8.0', [macDmgAssetNameLegacy('0.8.0', 'arm64')]),
      platform: 'darwin',
      arch: 'arm64',
      brewCaskInstalled: false,
    });

    expect(plan.available).toBe(true);
    expect(plan.method).toBe('mac-dmg');
    expect(plan.assetName).toBe('MockForge-0.8.0-mac-arm64.dmg');
  });

  it('marks the app as up to date when the latest tag matches', () => {
    const plan = resolveUpdatePlan({
      currentVersion: '0.8.0',
      release: release('v0.8.0', [windowsSetupAssetName('x64')]),
      platform: 'win32',
      arch: 'x64',
      brewCaskInstalled: false,
    });

    expect(plan.available).toBe(false);
    expect(plan.method).toBeNull();
  });

  it('keeps the update available even if the matching asset is missing', () => {
    const plan = resolveUpdatePlan({
      currentVersion: '0.7.4',
      release: release('v0.8.0', ['notes.txt']),
      platform: 'win32',
      arch: 'x64',
      brewCaskInstalled: false,
    });

    expect(plan.available).toBe(true);
    expect(plan.method).toBeNull();
    expect(plan.releaseUrl).toContain('github.com');
  });
});

describe('mergeBackgroundUpdateCheck', () => {
  const check = (overrides: Partial<AppUpdateCheckResult>): AppUpdateCheckResult => ({
    currentVersion: '0.7.27',
    latestVersion: '0.7.28',
    available: true,
    method: 'windows-setup',
    releaseUrl: 'https://github.com/jvictororiz/Mock-Forge/releases/tag/v0.7.28',
    notes: '',
    assetName: 'MockForge-win-x64-setup.exe',
    downloadUrl: 'https://example.test/setup.exe',
    caskUrl: null,
    brewInstallCommand: '',
    packaged: true,
    ...overrides,
  });

  it('keeps an update already found when the later check fails', () => {
    const previous = check({});
    const failed = check({
      latestVersion: null,
      available: false,
      method: null,
      error: 'Network request failed',
    });

    expect(mergeBackgroundUpdateCheck(previous, failed)).toBe(previous);
  });

  it('keeps the last successful result when a later check fails offline', () => {
    const previous = check({ latestVersion: '0.7.27', available: false, method: null });
    const failed = check({ available: false, error: 'Network request failed' });

    expect(mergeBackgroundUpdateCheck(previous, failed)).toBe(previous);
  });

  it('replaces the last result when the later check succeeds', () => {
    const previous = check({ latestVersion: '0.7.27', available: false, method: null });
    const next = check({});

    expect(mergeBackgroundUpdateCheck(previous, next)).toBe(next);
  });
});
