export function getJrePlatformKey(): string {
  if (process.platform === 'darwin') {
    return process.arch === 'arm64' ? 'macos-arm64' : 'macos-x64';
  }
  if (process.platform === 'win32') {
    return process.arch === 'ia32' ? 'win-ia32' : 'win-x64';
  }
  return process.arch === 'arm64' ? 'linux-arm64' : 'linux-x64';
}

export function getJavaBinaryName(): string {
  return process.platform === 'win32' ? 'java.exe' : 'java';
}

export function getAdoptiumOsArch(): { os: string; arch: string } | null {
  if (process.platform === 'darwin') {
    return { os: 'mac', arch: process.arch === 'arm64' ? 'aarch64' : 'x64' };
  }
  if (process.platform === 'win32') {
    return { os: 'windows', arch: process.arch === 'ia32' ? 'x86' : 'x64' };
  }
  if (process.platform === 'linux') {
    return { os: 'linux', arch: process.arch === 'arm64' ? 'aarch64' : 'x64' };
  }
  return null;
}
