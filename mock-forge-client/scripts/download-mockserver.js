const { createWriteStream, existsSync, mkdirSync, statSync } = require('fs');
const { join } = require('path');
const { get } = require('https');

const JAR_URL =
  'https://repo1.maven.org/maven2/org/mock-server/mockserver-netty/5.15.0/mockserver-netty-5.15.0-jar-with-dependencies.jar';

const JAR_NAME = 'mockserver-netty-5.15.0-jar-with-dependencies.jar';
const DEST_DIR = join(__dirname, '..', 'resources', 'mockserver');
const DEST_PATH = join(DEST_DIR, JAR_NAME);
const MIN_JAR_SIZE = 1_000_000; // ~42MB expected; reject HTML error pages

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    get(url, (response) => {
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
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
      file.on('error', reject);
    }).on('error', reject);
  });
}

async function download() {
  if (existsSync(DEST_PATH)) {
    const size = statSync(DEST_PATH).size;
    if (size >= MIN_JAR_SIZE) {
      console.log('MockServer JAR already exists, skipping download.');
      return;
    }
    console.log('Existing JAR is too small (likely corrupt), re-downloading...');
  }

  mkdirSync(DEST_DIR, { recursive: true });
  console.log('Downloading MockServer 5.15.0 from Maven Central...');

  await downloadFile(JAR_URL, DEST_PATH);

  const size = statSync(DEST_PATH).size;
  if (size < MIN_JAR_SIZE) {
    throw new Error(`Downloaded file is only ${size} bytes — expected ~42MB. Check network or download manually.`);
  }

  console.log(`MockServer JAR downloaded successfully (${(size / 1024 / 1024).toFixed(1)} MB).`);
}

download().catch((err) => {
  console.error('Failed to download MockServer JAR:', err.message);
  console.error('Manual download:');
  console.error(JAR_URL);
  console.error('Place at:', DEST_PATH);
  process.exit(0);
});
