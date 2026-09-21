export const GITHUB_OWNER = 'jvictororiz';
export const GITHUB_REPO = 'Mock-Forge';
export const GITHUB_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
export const RELEASES_URL = `${GITHUB_URL}/releases`;
export const RELEASES_LATEST_URL = `${GITHUB_URL}/releases/latest`;

/** Stable asset names — always resolve via /releases/latest/download/. */
const downloadBase = `${GITHUB_URL}/releases/latest/download`;

export const WINDOWS_SETUP_URL = `${downloadBase}/MockForge-win-x64-setup.exe`;
export const MAC_ARM_DMG_URL = `${downloadBase}/MockForge-mac-arm64.dmg`;
export const MAC_X64_DMG_URL = `${downloadBase}/MockForge-mac-x64.dmg`;

export const BREW_INSTALL = `brew install --cask ${downloadBase}/mockforge.rb`;
