import { execSync } from 'child_process';

export function commandExists(command: string): boolean {
  try {
    if (process.platform === 'win32') {
      execSync(`where ${command}`, { encoding: 'utf-8', stdio: 'pipe' });
    } else {
      execSync(`which ${command}`, { encoding: 'utf-8', stdio: 'pipe' });
    }
    return true;
  } catch {
    return false;
  }
}

export function resolveCommandPath(command: string, pathEnv?: string): string | null {
  try {
    const env = pathEnv ? { ...process.env, PATH: pathEnv } : process.env;
    if (process.platform === 'win32') {
      const output = execSync(`where ${command}`, { encoding: 'utf-8', stdio: 'pipe', env });
      return output.split(/\r?\n/)[0]?.trim() ?? null;
    }
    return execSync(`which ${command}`, { encoding: 'utf-8', stdio: 'pipe', env }).trim();
  } catch {
    return null;
  }
}

export function getNodeRuntime(): { command: string; env: NodeJS.ProcessEnv } {
  if (process.versions.electron) {
    return {
      command: process.execPath,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    };
  }

  return {
    command: resolveCommandPath('node') ?? 'node',
    env: process.env,
  };
}

export function getJavaInstallHint(): string {
  if (process.platform === 'win32') {
    return 'Java not found. Please install Java 17+ (e.g. from https://adoptium.net).';
  }
  if (process.platform === 'darwin') {
    return 'Java not found. Please install Java 17+ (e.g. via Homebrew: brew install openjdk@17).';
  }
  return 'Java not found. Please install Java 17+ using your package manager.';
}
