import { createWriteStream } from 'fs';
import { get as httpsGet } from 'https';
import { get as httpGet } from 'http';
import type { IncomingMessage } from 'http';

const MAX_REDIRECTS = 8;

export function downloadFile(
  url: string,
  dest: string,
  onProgress?: (percent: number | null) => void,
): Promise<void> {
  return downloadWithRedirects(url, dest, onProgress, 0);
}

function downloadWithRedirects(
  url: string,
  dest: string,
  onProgress: ((percent: number | null) => void) | undefined,
  redirects: number,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirects > MAX_REDIRECTS) {
      reject(new Error('Too many redirects while downloading update'));
      return;
    }

    const client = url.startsWith('http://') ? httpGet : httpsGet;
    const request = client(url, { headers: { 'User-Agent': 'MockForge' } }, (response) => {
      const status = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = response.headers.location;
        response.resume();
        if (!location) {
          reject(new Error(`Redirect without location (${status})`));
          return;
        }
        const nextUrl = new URL(location, url).toString();
        downloadWithRedirects(nextUrl, dest, onProgress, redirects + 1).then(resolve).catch(reject);
        return;
      }

      if (status !== 200) {
        response.resume();
        reject(new Error(`HTTP ${status} downloading ${url}`));
        return;
      }

      const total = Number(response.headers['content-length'] || 0);
      pipeToFile(response, dest, total, onProgress).then(resolve).catch(reject);
    });

    request.on('error', reject);
  });
}

function pipeToFile(
  response: IncomingMessage,
  dest: string,
  total: number,
  onProgress?: (percent: number | null) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = createWriteStream(dest);
    let received = 0;

    response.on('data', (chunk: Buffer) => {
      received += chunk.length;
      if (!onProgress) return;
      if (total > 0) {
        onProgress(Math.min(100, Math.round((received / total) * 100)));
      } else {
        onProgress(null);
      }
    });

    response.pipe(file);
    file.on('finish', () => {
      file.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        onProgress?.(100);
        resolve();
      });
    });
    file.on('error', reject);
    response.on('error', reject);
  });
}
