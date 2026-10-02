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

export function brewUpgradeScript(input: {
  brewPath: string;
  pid: number;
  version: string;
  caskUrl: string | null;
  caskPath: string;
}): string {
  if (!Number.isInteger(input.pid) || input.pid < 0) {
    throw new Error('Invalid process id for the Homebrew upgrade script');
  }
  const brew = shellQuote(input.brewPath);
  const version = shellQuote(stripVersionPrefix(input.version));
  const tap = shellQuote(HOMEBREW_TAP);
  const cask = shellQuote(CASK_TOKEN);
  const caskUrl = shellQuote(input.caskUrl ?? '');
  const caskPath = shellQuote(input.caskPath);
  return `#!/bin/bash
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:\$PATH"
export HOMEBREW_NO_AUTO_UPDATE=1
export HOMEBREW_NO_ENV_HINTS=1
export HOMEBREW_NO_ANALYTICS=1
log="\${HOME}/Library/Logs/MockForge/update.log"
mkdir -p "\$(dirname "\$log")" 2>/dev/null || true
exec >>"\$log" 2>&1
echo "---- \$(date) target ${version} ----"
while kill -0 ${input.pid} 2>/dev/null; do
  sleep 0.2
done
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if ! pgrep -f "/MockForge.app/Contents/MacOS/" >/dev/null 2>&1; then
    break
  fi
  sleep 0.3
done
sleep 0.4

installed_version() {
  ${brew} list --cask --versions ${cask} 2>/dev/null | awk '{print \$2}' | head -n1
}

version_lt() {
  local IFS=.
  local i x y
  local -a left right
  read -r -a left <<< "\$1"
  read -r -a right <<< "\$2"
  for i in 0 1 2; do
    x="\${left[i]:-0}"
    y="\${right[i]:-0}"
    if ((10#\$x < 10#\$y)); then return 0; fi
    if ((10#\$x > 10#\$y)); then return 1; fi
  done
  return 1
}

echo "installed before: \$(installed_version)"
repo="\$(${brew} --repository ${tap} 2>/dev/null || true)"
if [ ! -d "\$repo/.git" ]; then
  echo "tapping ${tap}"
  ${brew} tap ${tap} || echo "tap failed: \$?"
  repo="\$(${brew} --repository ${tap} 2>/dev/null || true)"
fi
if [ -d "\$repo/.git" ]; then
  echo "updating tap \$repo"
  git -C "\$repo" fetch --quiet --depth 1 origin main || echo "fetch failed: \$?"
  git -C "\$repo" reset --quiet --hard origin/main || echo "reset failed: \$?"
fi
echo "brew upgrade --cask --greedy"
${brew} upgrade --cask --greedy ${cask} || echo "upgrade failed: \$?"
current="\$(installed_version)"
echo "installed after upgrade: \${current:-none}"
if [ -z "\$current" ] || version_lt "\$current" ${version}; then
  echo "falling back to the release cask"
  curl -fL --retry 3 -A Homebrew ${caskUrl} -o ${caskPath} || echo "curl failed: \$?"
  if grep -q 'cask "mockforge"' ${caskPath}; then
    ${brew} uninstall --cask --force ${cask} || echo "uninstall failed: \$?"
    ${brew} install --cask ${caskPath} || echo "install failed: \$?"
  else
    echo "release cask download was not a cask"
  fi
  echo "installed after fallback: \$(installed_version)"
fi

open_newest() {
  local best="" best_ver="" candidate ver
  for candidate in "/Applications/MockForge.app" "\$HOME/Applications/MockForge.app"; do
    if [ ! -d "\$candidate" ]; then
      continue
    fi
    ver="\$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "\$candidate/Contents/Info.plist" 2>/dev/null || true)"
    if [ -z "\$best" ] || { [ -n "\$ver" ] && version_lt "\$best_ver" "\$ver"; }; then
      best="\$candidate"
      best_ver="\$ver"
    fi
  done
  echo "opening \${best:-none} (\${best_ver:-unknown})"
  if [ -n "\$best" ]; then
    /usr/bin/open "\$best"
    return \$?
  fi
  /usr/bin/open -b com.mockforge.app
}
open_newest || echo "open failed: \$?"
`;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
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
