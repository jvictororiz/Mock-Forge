import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  macDmgAssetName,
  macDmgAssetNameLegacy,
  parseBrewLivecheck,
  releaseFromTag,
  resolveUpdatePlan,
  tagFromGithubReleaseUrl,
  windowsSetupAssetName,
  windowsSetupAssetNameLegacy,
  type GithubRelease,
} from '../shared/appUpdate';

const release = (tag: string, assetNames: string[]): GithubRelease => ({
  tag_name: tag,
  html_url: 'https://github.com/jvictororiz/Mock-Forge/releases/tag/v0.8.0',
  body: 'Notes',
  assets: assetNames.map((name) => ({
    name,
    browser_download_url: `https://github.com/jvictororiz/Mock-Forge/releases/download/${tag}/${name}`,
  })),
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
