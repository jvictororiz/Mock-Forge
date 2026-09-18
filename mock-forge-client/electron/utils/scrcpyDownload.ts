import { createWriteStream, existsSync, mkdirSync, statSync } from 'fs';
import { get } from 'https';
import { join } from 'path';
import { app } from 'electron';
import {
  SCRCPY_SERVER_VERSION,
  getBundledServerPath,
  getScrcpyServerDownloadPath,
  resetScrcpyServerCache,
  resolveScrcpyServerPath,
} from './scrcpyPath';

const SERVER_NAME = `scrcpy-server-v${SCRCPY_SERVER_VERSION}`;
const SERVER_URL = `https://github.com/Genymobile/scrcpy/releases/download/v${SCRCPY_SERVER_VERSION}/${SERVER_NAME}`;
const MIN_SIZE = 50_000;

let downloadPromise: Promise<{ success: boolean; path?: string; error?: string }> | null = null;

function downloadFile(url: string, dest: string): Promise<void> {
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

async function downloadScrcpyServer(): Promise<{ success: boolean; path?: string; error?: string }> {
  const destPath = getScrcpyServerDownloadPath();
  const destDir = join(destPath, '..');

  mkdirSync(destDir, { recursive: true });
  console.log(`[MockForge] Downloading scrcpy-server ${SCRCPY_SERVER_VERSION}...`);

  try {
    await downloadFile(SERVER_URL, destPath);
    const size = statSync(destPath).size;
    if (size < MIN_SIZE) {
      throw new Error(`Downloaded file is only ${size} bytes`);
    }

    resetScrcpyServerCache();
    const resolved = resolveScrcpyServerPath();
    if (!resolved) {
      throw new Error('Download completed but scrcpy-server path could not be resolved');
    }

    console.log(`[MockForge] scrcpy-server ready (${(size / 1024).toFixed(1)} KB)`);
    return { success: true, path: resolved };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to download scrcpy-server';
    console.warn(`[MockForge] scrcpy-server download failed: ${message}`);
    return { success: false, error: message };
  }
}

export async function ensureScrcpyServerDownloaded(): Promise<{ success: boolean; path?: string; error?: string }> {
  const existing = resolveScrcpyServerPath();
  if (existing) {
    return { success: true, path: existing };
  }

  if (app.isPackaged && existsSync(getBundledServerPath())) {
    const bundled = resolveScrcpyServerPath();
    if (bundled) {
      return { success: true, path: bundled };
    }
  }

  if (!downloadPromise) {
    downloadPromise = downloadScrcpyServer().finally(() => {
      downloadPromise = null;
    });
  }

  return downloadPromise;
}

export function isScrcpyServerDownloadPending(): boolean {
  return downloadPromise !== null;
}
