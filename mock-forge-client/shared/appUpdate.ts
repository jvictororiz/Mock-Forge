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

export function githubLatestCaskUrl(): string {
  return `${githubRepoUrl()}/releases/latest/download/mockforge.rb`;
}

export function githubCaskUrlForVersion(version: string): string {
  return `${githubRepoUrl()}/releases/download/v${stripVersionPrefix(version)}/mockforge.rb`;
}

export function githubApiLatestReleaseUrl(): string {
  return `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
}

export function brewInstallCommand(): string {
  return `brew install --cask ${githubLatestCaskUrl()}`;
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

export function windowsSetupAssetName(version: string, arch: string): string {
  return `${APP_PRODUCT_NAME}-${stripVersionPrefix(version)}-win-${normalizeArch(arch)}-setup.exe`;
}

export function macDmgAssetName(version: string, arch: string): string {
  return `${APP_PRODUCT_NAME}-${stripVersionPrefix(version)}-mac-${normalizeArch(arch)}.dmg`;
}

export function findAsset(
  assets: GithubReleaseAsset[],
  fileName: string,
): GithubReleaseAsset | null {
  const expected = fileName.toLowerCase();
  return assets.find((asset) => asset.name.toLowerCase() === expected) ?? null;
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
    const asset = findAsset(input.release.assets, windowsSetupAssetName(latestVersion, input.arch));
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
    const asset = findAsset(input.release.assets, macDmgAssetName(latestVersion, input.arch));
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
