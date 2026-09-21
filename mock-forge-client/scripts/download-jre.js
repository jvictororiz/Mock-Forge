const {
  createWriteStream,
  existsSync,
  mkdirSync,
  readdirSync,
  rmSync,
  statSync,
  cpSync,
} = require('fs');
const { join } = require('path');
const { get } = require('https');
const { execFileSync } = require('child_process');

const JRE_VERSION = 17;
const DEST_ROOT = join(__dirname, '..', 'resources', 'jre');
const MIN_JRE_SIZE = 20_000_000;
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

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

function getAdoptiumTarget() {
  if (process.platform === 'darwin') {
    return { os: 'mac', arch: process.arch === 'arm64' ? 'aarch64' : 'x64', ext: 'tar.gz' };
  }
  if (process.platform === 'win32') {
    return { os: 'windows', arch: process.arch === 'ia32' ? 'x86' : 'x64', ext: 'zip' };
  }
  if (process.platform === 'linux') {
    return { os: 'linux', arch: process.arch === 'arm64' ? 'aarch64' : 'x64', ext: 'tar.gz' };
  }
  return null;
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const request = get(url, (response) => {
      if ([301, 302, 307, 308].includes(response.statusCode ?? 0)) {
        const redirectUrl = response.headers.location;
        if (redirectUrl) {
          downloadFile(redirectUrl, dest).then(resolve).catch(reject);
          return;
        }
      }

      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode} downloading ${url}`));
        return;
      }

      const file = createWriteStream(dest);
      let settled = false;
      const fail = (error) => {
        if (settled) return;
        settled = true;
        request.destroy();
        file.destroy();
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      const timer = setTimeout(() => {
        fail(new Error(`Download timed out after ${DOWNLOAD_TIMEOUT_MS}ms: ${url}`));
      }, DOWNLOAD_TIMEOUT_MS);

      response.pipe(file);
      file.on('finish', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        file.close();
        resolve();
      });
      file.on('error', fail);
      response.on('error', fail);
    });

    request.setTimeout(DOWNLOAD_TIMEOUT_MS, () => {
      request.destroy();
      reject(new Error(`Download timed out after ${DOWNLOAD_TIMEOUT_MS}ms: ${url}`));
    });
    request.on('error', reject);
  });
}

function getDirectorySize(dir) {
  let total = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      total += getDirectorySize(fullPath);
    } else {
      total += statSync(fullPath).size;
    }
  }
  return total;
}

function findJavaHome(extractDir) {
  const entries = readdirSync(extractDir);
  const jdkDirName = entries.find((name) => name.startsWith('jdk')) ?? entries[0];
  if (!jdkDirName) {
    throw new Error('No JRE directory found after extraction');
  }

  const root = join(extractDir, jdkDirName);
  const macHome = join(root, 'Contents', 'Home');
  if (existsSync(join(macHome, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'))) {
    return macHome;
  }

  if (existsSync(join(root, 'bin', process.platform === 'win32' ? 'java.exe' : 'java'))) {
    return root;
  }

  throw new Error('Could not locate java binary in downloaded JRE');
}

function extractArchive(archivePath, extractDir, ext) {
  mkdirSync(extractDir, { recursive: true });

  if (ext === 'tar.gz') {
    execFileSync('tar', ['-xzf', archivePath, '-C', extractDir], { stdio: 'inherit' });
    return;
  }

  if (ext === 'zip') {
    if (process.platform === 'win32') {
      execFileSync(
        'powershell',
        ['-NoProfile', '-Command', `Expand-Archive -Path "${archivePath}" -DestinationPath "${extractDir}" -Force`],
        { stdio: 'inherit' },
      );
      return;
    }

    execFileSync('unzip', ['-q', archivePath, '-d', extractDir], { stdio: 'inherit' });
  }
}

async function download() {
  const platformKey = getPlatformKey();
  const target = getAdoptiumTarget();

  if (!platformKey || !target) {
    throw new Error(`Unsupported platform for bundled JRE: ${process.platform} ${process.arch}`);
  }

  const destDir = join(DEST_ROOT, platformKey);
  const javaBinary = join(destDir, 'bin', process.platform === 'win32' ? 'java.exe' : 'java');

  if (existsSync(javaBinary)) {
    const size = getDirectorySize(destDir);
    if (size >= MIN_JRE_SIZE) {
      console.log(`Bundled JRE already exists for ${platformKey}, skipping download.`);
      return;
    }
    console.log('Existing JRE looks incomplete, re-downloading...');
    rmSync(destDir, { recursive: true, force: true });
  }

  const url =
    `https://api.adoptium.net/v3/binary/latest/${JRE_VERSION}/ga/${target.os}/${target.arch}` +
    '/jre/hotspot/normal/eclipse?project=jdk';

  const tempDir = join(DEST_ROOT, '.tmp', platformKey);
  const archivePath = join(tempDir, `jre.${target.ext}`);

  rmSync(tempDir, { recursive: true, force: true });
  mkdirSync(tempDir, { recursive: true });

  console.log(`Downloading Temurin JRE ${JRE_VERSION} for ${platformKey}...`);
  await downloadFile(url, archivePath);

  const archiveSize = statSync(archivePath).size;
  if (archiveSize < MIN_JRE_SIZE) {
    throw new Error(`Downloaded JRE archive is only ${archiveSize} bytes — download may have failed.`);
  }

  const extractDir = join(tempDir, 'extracted');
  extractArchive(archivePath, extractDir, target.ext);

  const javaHome = findJavaHome(extractDir);
  mkdirSync(destDir, { recursive: true });
  cpSync(javaHome, destDir, { recursive: true });

  if (!existsSync(javaBinary)) {
    throw new Error(`JRE install failed: ${javaBinary} not found after extraction`);
  }

  const installedSize = getDirectorySize(destDir);
  rmSync(tempDir, { recursive: true, force: true });

  console.log(
    `Bundled JRE installed at ${destDir} (${(installedSize / 1024 / 1024).toFixed(1)} MB).`,
  );
}

download().catch((err) => {
  console.error('Failed to download bundled JRE:', err.message);
  process.exit(1);
});
