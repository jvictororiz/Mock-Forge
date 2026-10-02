export const GITHUB_OWNER = 'jvictororiz';
export const GITHUB_REPO = 'Mock-Forge';
export const CASK_TOKEN = 'mockforge';
export const APP_PRODUCT_NAME = 'MockForge';

export type AppUpdateMethod = 'windows-setup' | 'mac-brew' | 'mac-dmg';

export type GithubReleaseAsset = {
  name: string;
  browser_download_url: string;
  size?: number;
};

export type GithubRelease = {
  tag_name: string;
  html_url: string;
  body?: string | null;
  assets: GithubReleaseAsset[];
};

export type AppUpdateCheckResult = {
  currentVersion: string;
  latestVersion: string | null;
  available: boolean;
  method: AppUpdateMethod | null;
  releaseUrl: string | null;
  notes: string;
  assetName: string | null;
  downloadUrl: string | null;
  caskUrl: string | null;
  brewInstallCommand: string;
  packaged: boolean;
  error?: string;
};

export function githubRepoUrl(): string {
  return `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
}

export function githubCaskUrlForVersion(version: string): string {
  return `${githubRepoUrl()}/releases/download/v${stripVersionPrefix(version)}/mockforge.rb`;
}

export function githubApiLatestReleaseUrl(): string {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
}

/** Public release page. Avoids the REST API rate limit that returns 403. */
export function githubLatestReleasePageUrl(): string {
  return `${githubRepoUrl()}/releases/latest`;
}

/** Latest version reported by `brew livecheck --cask --json`, or null when the output has none. */
export function parseBrewLivecheck(stdout: string): string | null {
  const trimmed = stdout.trim();
  if (!trimmed) return null;

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    for (const entry of entries) {
      if (!entry || typeof entry !== 'object') continue;
      const version = (entry as { version?: { latest?: unknown } }).version;
      if (typeof version?.latest === 'string') {
        const semver = semverFromText(version.latest);
        if (semver) return semver;
      }
    }
  } catch {
    // Homebrew also prints a plain "current ==> latest" line.
  }

  const arrow = trimmed.match(/==>\s*v?(\d+\.\d+\.\d+)/i);
  return arrow?.[1] ?? null;
}

function semverFromText(value: string): string | null {
  const match = value.match(/v?(\d+\.\d+\.\d+)/i);
  return match?.[1] ?? null;
}

export function tagFromGithubReleaseUrl(value: string): string | null {
  const match = value.match(/\/releases\/tag\/(v?\d+\.\d+\.\d+)/i);
  return match?.[1] ?? null;
}

export function githubAssetDownloadUrl(version: string, fileName: string): string {
  return `${githubRepoUrl()}/releases/download/v${stripVersionPrefix(version)}/${fileName}`;
}

const RELEASE_ARCHS = ['arm64', 'x64', 'ia32'] as const;

/** Builds the release the updater expects from a tag, without calling the GitHub API. */
export function releaseFromTag(tag: string): GithubRelease {
  const version = stripVersionPrefix(tag);
  const names = new Set<string>(['mockforge.rb']);
  for (const arch of RELEASE_ARCHS) {
    names.add(macDmgAssetName(arch));
    names.add(macDmgAssetNameLegacy(version, arch));
    names.add(windowsSetupAssetName(arch));
    names.add(windowsSetupAssetNameLegacy(version, arch));
  }

  return {
    tag_name: `v${version}`,
    html_url: `${githubRepoUrl()}/releases/tag/v${version}`,
    body: '',
    assets: [...names].map((name) => ({
      name,
      browser_download_url: githubAssetDownloadUrl(version, name),
    })),
  };
}

export const HOMEBREW_TAP = 'jvictororiz/homebrew-mockforge';

export function brewInstallCommand(): string {
  return `brew install --cask ${HOMEBREW_TAP}/${CASK_TOKEN}`;
}

export function stripVersionPrefix(version: string): string {
  return version.trim().replace(/^v/i, '');
}

export function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return 1;
    if (a[i] < b[i]) return -1;
  }
  return 0;
}

/** Stable release asset names (no version) — used with /releases/latest/download/. */
export function windowsSetupAssetName(arch: string): string {
  return `${APP_PRODUCT_NAME}-win-${normalizeArch(arch)}-setup.exe`;
}

export function macDmgAssetName(arch: string): string {
  return `${APP_PRODUCT_NAME}-mac-${normalizeArch(arch)}.dmg`;
}

/** Older releases embedded the semver in the filename. */
export function windowsSetupAssetNameLegacy(version: string, arch: string): string {
  return `${APP_PRODUCT_NAME}-${stripVersionPrefix(version)}-win-${normalizeArch(arch)}-setup.exe`;
}

export function macDmgAssetNameLegacy(version: string, arch: string): string {
  return `${APP_PRODUCT_NAME}-${stripVersionPrefix(version)}-mac-${normalizeArch(arch)}.dmg`;
}

export function findAsset(
  assets: GithubReleaseAsset[],
  fileName: string,
): GithubReleaseAsset | null {
  const expected = fileName.toLowerCase();
  return assets.find((asset) => asset.name.toLowerCase() === expected) ?? null;
}

export function findWindowsSetupAsset(
  assets: GithubReleaseAsset[],
  version: string,
  arch: string,
): GithubReleaseAsset | null {
  return (
    findAsset(assets, windowsSetupAssetName(arch))
    ?? findAsset(assets, windowsSetupAssetNameLegacy(version, arch))
  );
}

export function findMacDmgAsset(
  assets: GithubReleaseAsset[],
  version: string,
  arch: string,
): GithubReleaseAsset | null {
  return (
    findAsset(assets, macDmgAssetName(arch))
    ?? findAsset(assets, macDmgAssetNameLegacy(version, arch))
  );
}

export function findCaskAsset(assets: GithubReleaseAsset[]): GithubReleaseAsset | null {
  return findAsset(assets, 'mockforge.rb');
}

export type UpdatePlanInput = {
  currentVersion: string;
  release: GithubRelease;
  platform: NodeJS.Platform;
  arch: string;
  brewCaskInstalled: boolean;
};

export function resolveUpdatePlan(input: UpdatePlanInput): AppUpdateCheckResult {
  const currentVersion = stripVersionPrefix(input.currentVersion);
  const latestVersion = stripVersionPrefix(input.release.tag_name);
  const brewInstall = brewInstallCommand();
  const caskAsset = findCaskAsset(input.release.assets);
  const caskUrl = caskAsset?.browser_download_url ?? githubCaskUrlForVersion(latestVersion);
  const notes = (input.release.body || '').trim();
  const base: AppUpdateCheckResult = {
    currentVersion,
    latestVersion,
    available: false,
    method: null,
    releaseUrl: input.release.html_url,
    notes,
    assetName: null,
    downloadUrl: null,
    caskUrl,
    brewInstallCommand: brewInstall,
    packaged: true,
  };

  if (compareVersions(latestVersion, currentVersion) <= 0) {
    return base;
  }

  const available = { ...base, available: true };

  if (input.platform === 'win32') {
    const asset = findWindowsSetupAsset(input.release.assets, latestVersion, input.arch);
    if (!asset) {
      return available;
    }
    return {
      ...available,
      method: 'windows-setup',
      assetName: asset.name,
      downloadUrl: asset.browser_download_url,
    };
  }

  if (input.platform === 'darwin') {
    const asset = findMacDmgAsset(input.release.assets, latestVersion, input.arch);
    if (input.brewCaskInstalled) {
      return {
        ...available,
        method: 'mac-brew',
        assetName: asset?.name ?? caskAsset?.name ?? 'mockforge.rb',
        downloadUrl: asset?.browser_download_url ?? null,
        caskUrl,
      };
    }
    if (!asset) {
      return available;
    }
    return {
      ...available,
      method: 'mac-dmg',
      assetName: asset.name,
      downloadUrl: asset.browser_download_url,
    };
  }

  return available;
}

function parseVersion(version: string): [number, number, number] {
  const parts = stripVersionPrefix(version).split(/[.+-]/);
  return [
    Number.parseInt(parts[0] ?? '0', 10) || 0,
    Number.parseInt(parts[1] ?? '0', 10) || 0,
    Number.parseInt(parts[2] ?? '0', 10) || 0,
  ];
}

function normalizeArch(arch: string): string {
  if (arch === 'ia32' || arch === 'x86') return 'ia32';
  if (arch === 'aarch64') return 'arm64';
  return arch;
}
