const { createWriteStream, existsSync, mkdirSync, statSync } = require('fs');
const { join } = require('path');
const { get } = require('https');

const SCRCPY_VERSION = '3.1';
const SERVER_NAME = `scrcpy-server-v${SCRCPY_VERSION}`;
const SERVER_URL = `https://github.com/Genymobile/scrcpy/releases/download/v${SCRCPY_VERSION}/${SERVER_NAME}`;
const DEST_DIR = join(__dirname, '..', 'resources', 'scrcpy');
const DEST_PATH = join(DEST_DIR, 'scrcpy-server');
const MIN_SIZE = 50_000;
const DOWNLOAD_TIMEOUT_MS = 5 * 60 * 1000;

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const request = get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
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

async function download() {
  if (existsSync(DEST_PATH)) {
    const size = statSync(DEST_PATH).size;
    if (size >= MIN_SIZE) {
      console.log('scrcpy-server already exists, skipping download.');
      return;
    }
    console.log('Existing scrcpy-server is too small (likely corrupt), re-downloading...');
  }

  mkdirSync(DEST_DIR, { recursive: true });
  console.log(`Downloading scrcpy-server ${SCRCPY_VERSION} from GitHub releases...`);

  await downloadFile(SERVER_URL, DEST_PATH);

  const size = statSync(DEST_PATH).size;
  if (size < MIN_SIZE) {
    throw new Error(`Downloaded file is only ${size} bytes — expected much larger. Check network or download manually.`);
  }

  console.log(`scrcpy-server downloaded successfully (${(size / 1024).toFixed(1)} KB).`);
}

download().catch((error) => {
  console.warn(`Warning: failed to download scrcpy-server: ${error.message}`);
  console.warn('Device mirroring will require manual download via: npm run download-scrcpy-server');
});
