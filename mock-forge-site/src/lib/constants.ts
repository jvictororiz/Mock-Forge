export const GITHUB_OWNER = 'jvictororiz';
export const GITHUB_REPO = 'Mock-Forge';
export const GITHUB_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}`;
export const RELEASES_URL = `${GITHUB_URL}/releases`;
export const RELEASES_LATEST_URL = `${GITHUB_URL}/releases/latest`;

/** Alinhar com mock-forge-client/package.json — usado nos fallbacks latest/download. */
export const APP_VERSION = '0.7.5';

const downloadBase = `${GITHUB_URL}/releases/latest/download`;

/** Links diretos do instalador (não abrem a página do GitHub). */
export const WINDOWS_SETUP_URL = `${downloadBase}/MockForge-${APP_VERSION}-win-x64-setup.exe`;
export const MAC_ARM_DMG_URL = `${downloadBase}/MockForge-${APP_VERSION}-mac-arm64.dmg`;
export const MAC_X64_DMG_URL = `${downloadBase}/MockForge-${APP_VERSION}-mac-x64.dmg`;

export const BREW_INSTALL = `brew install --cask ${downloadBase}/mockforge.rb`;
