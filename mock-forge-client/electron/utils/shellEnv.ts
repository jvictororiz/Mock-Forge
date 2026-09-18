import { homedir } from 'os';
import { join } from 'path';

export function getShellEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };

  if (process.platform === 'darwin') {
    const home = homedir();
    const prefixes = [
      '/opt/homebrew/bin',
      '/usr/local/bin',
      join(home, 'Library', 'Android', 'sdk', 'platform-tools'),
      join(home, 'Library', 'Android', 'Sdk', 'platform-tools'),
    ];
    const current = env.PATH ?? '';
    const parts = new Set([...prefixes, ...current.split(':').filter(Boolean)]);
    env.PATH = [...parts].join(':');
  }

  return env;
}
