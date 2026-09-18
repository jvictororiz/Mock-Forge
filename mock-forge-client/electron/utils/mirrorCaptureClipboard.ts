import { execFileSync } from 'child_process';
import { clipboard } from 'electron';
import { readFileSync } from 'fs';

export function copyMediaFileToClipboard(filePath: string, mimeType: string): void {
  if (process.platform === 'darwin') {
    const escapedPath = filePath.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    execFileSync('osascript', [
      '-e',
      `set the clipboard to (POSIX file "${escapedPath}")`,
    ]);
    return;
  }

  if (process.platform === 'win32') {
    const escapedPath = filePath.replace(/'/g, "''");
    execFileSync(
      'powershell',
      ['-NoProfile', '-Command', `Set-Clipboard -Path '${escapedPath}'`],
      { stdio: 'ignore' },
    );
    return;
  }

  clipboard.writeBuffer(mimeType || 'application/octet-stream', readFileSync(filePath));
}
