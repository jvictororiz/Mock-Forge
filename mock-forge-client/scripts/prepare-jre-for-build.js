const { existsSync, mkdirSync, rmSync, cpSync, chmodSync, readdirSync, statSync } = require('fs');
const { join } = require('path');

function getPlatformKey() {
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'macos-arm64' : 'macos-x64';
  }
  if (process.platform === 'win32') {
    return process.arch === 'ia32' ? 'win-ia32' : 'win-x64';
  }
  if (process.platform === 'linux') {
    return process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
  }
  return null;
}

const platformKey = getPlatformKey();
if (!platformKey) {
  console.error(`Unsupported platform for bundled JRE: ${process.platform} ${process.arch}`);
  process.exit(1);
}

const sourceDir = join(__dirname, '..', 'resources', 'jre', platformKey);
const destDir = join(__dirname, '..', 'resources', 'jre', 'current');
const javaBinary = join(
  sourceDir,
  'bin',
  process.platform === 'win32' ? 'java.exe' : 'java',
);

if (!existsSync(javaBinary)) {
  console.error(`Bundled JRE not found for ${platformKey}. Run: npm run download-jre`);
  process.exit(1);
}

rmSync(destDir, { recursive: true, force: true });
mkdirSync(destDir, { recursive: true });
cpSync(sourceDir, destDir, { recursive: true });
makeTreeWritable(destDir);

console.log(`Prepared bundled JRE for packaging: ${destDir}`);

function makeTreeWritable(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    const mode = statSync(fullPath).mode;
    chmodSync(fullPath, mode | 0o200);

    if (entry.isDirectory()) {
      makeTreeWritable(fullPath);
    }
  }
}
