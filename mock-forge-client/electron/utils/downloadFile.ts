import { createWriteStream } from 'fs';
import { net } from 'electron';
import { updatesSession } from './updatesSession';

export function downloadFile(
  url: string,
  dest: string,
  onProgress?: (percent: number | null) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = net.request({
      method: 'GET',
      url,
      session: updatesSession(),
      redirect: 'follow',
    });
    request.setHeader('User-Agent', 'MockForge');

    request.on('response', (response) => {
      const status = response.statusCode;
      if (status !== 200) {
        response.on('data', () => undefined);
        reject(new Error(`HTTP ${status} downloading ${url}`));
        return;
      }

      const lengthHeader = response.headers['content-length'];
      const lengthValue = Array.isArray(lengthHeader) ? lengthHeader[0] : lengthHeader;
      const total = Number(lengthValue || 0);
      const file = createWriteStream(dest);
      const body = response as unknown as NodeJS.ReadableStream;
      let received = 0;

      body.on('data', (chunk: Buffer) => {
        received += chunk.length;
        if (!file.write(chunk)) body.pause();
        if (!onProgress) return;
        if (total > 0) {
          onProgress(Math.min(100, Math.round((received / total) * 100)));
        } else {
          onProgress(null);
        }
      });
      file.on('drain', () => body.resume());

      body.on('end', () => {
        file.end();
      });
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
      body.on('error', reject);
    });

    request.on('error', reject);
    request.end();
  });
}
