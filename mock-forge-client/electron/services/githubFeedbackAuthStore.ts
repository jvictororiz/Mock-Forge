import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { StoredGitHubAuth } from '../../shared/githubFeedback';

const FILE_NAME = 'github-feedback-auth.bin';

function authPath(): string {
  return join(app.getPath('userData'), FILE_NAME);
}

export function loadGitHubFeedbackAuth(): StoredGitHubAuth | null {
  const path = authPath();
  if (!existsSync(path) || !safeStorage.isEncryptionAvailable()) return null;
  try {
    const json = safeStorage.decryptString(readFileSync(path));
    const parsed = JSON.parse(json) as StoredGitHubAuth;
    if (!parsed?.accessToken || !parsed.user?.login) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveGitHubFeedbackAuth(auth: StoredGitHubAuth | null): void {
  const path = authPath();
  if (!auth) {
    if (existsSync(path)) unlinkSync(path);
    return;
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('encryption_unavailable');
  }
  writeFileSync(path, safeStorage.encryptString(JSON.stringify(auth)));
}
