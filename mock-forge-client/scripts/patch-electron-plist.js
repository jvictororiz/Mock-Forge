/**
 * Patches Electron's Info.plist for macOS Local Network permission (required for
 * physical devices to connect to the dev server on the LAN IP).
 */
const fs = require('fs');
const path = require('path');

if (process.platform !== 'darwin') {
  console.log('[patch-electron-plist] Not macOS, skipping.');
  process.exit(0);
}

const plistPath = path.join(
  __dirname,
  '../node_modules/electron/dist/Electron.app/Contents/Info.plist',
);

if (!fs.existsSync(plistPath)) {
  console.log('[patch-electron-plist] Electron not installed, skipping.');
  process.exit(0);
}

let content = fs.readFileSync(plistPath, 'utf8');

const entries = {
  NSLocalNetworkUsageDescription:
    'MockForge captures API requests from devices on your local network.',
  NSBonjourServices: ['_mockforge._tcp'],
};

let changed = false;

for (const [key, value] of Object.entries(entries)) {
  if (content.includes(`<key>${key}</key>`)) continue;

  let xmlValue;
  if (Array.isArray(value)) {
    xmlValue =
      '<array>\n' + value.map((v) => `    <string>${v}</string>`).join('\n') + '\n  </array>';
  } else {
    xmlValue = `<string>${value}</string>`;
  }

  content = content.replace(
    '</dict>\n</plist>',
    `  <key>${key}</key>\n  ${xmlValue}\n</dict>\n</plist>`,
  );
  changed = true;
}

if (changed) {
  fs.writeFileSync(plistPath, content);
  console.log('[patch-electron-plist] Added Local Network keys to Electron Info.plist');
} else {
  console.log('[patch-electron-plist] Already patched.');
}
