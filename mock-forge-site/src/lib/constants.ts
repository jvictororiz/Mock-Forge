/** Alinhar com mock-forge-client/package.json — usado nos fallbacks latest/download. */
export const APP_VERSION = '0.7.6';

/** CDN de assets da release (links diretos de download). */
const downloadBase =
  'https://github.com/jvictororiz/Mock-Forge/releases/latest/download';

/** Links diretos do instalador. */
export const WINDOWS_SETUP_URL = `${downloadBase}/MockForge-${APP_VERSION}-win-x64-setup.exe`;
export const MAC_ARM_DMG_URL = `${downloadBase}/MockForge-${APP_VERSION}-mac-arm64.dmg`;
export const MAC_X64_DMG_URL = `${downloadBase}/MockForge-${APP_VERSION}-mac-x64.dmg`;

/** Instalação via Homebrew (cask da release). */
export const BREW_INSTALL = `brew install --cask ${downloadBase}/mockforge.rb`;
