import { describe, expect, it } from 'vitest';
import { getAdoptiumOsArch, getJavaBinaryName, getJrePlatformKey } from '../electron/utils/jrePlatform';

describe('getJrePlatformKey', () => {
  it('returns a stable platform key for the current runtime', () => {
    const key = getJrePlatformKey();

    if (process.platform === 'darwin') {
      expect(['macos-arm64', 'macos-x64']).toContain(key);
    } else if (process.platform === 'win32') {
      expect(['win-x64', 'win-ia32']).toContain(key);
    } else if (process.platform === 'linux') {
      expect(['linux-arm64', 'linux-x64']).toContain(key);
    }
  });
});

describe('getJavaBinaryName', () => {
  it('uses java.exe on Windows', () => {
    if (process.platform === 'win32') {
      expect(getJavaBinaryName()).toBe('java.exe');
    } else {
      expect(getJavaBinaryName()).toBe('java');
    }
  });
});

describe('getAdoptiumOsArch', () => {
  it('maps the current platform to Adoptium coordinates', () => {
    const target = getAdoptiumOsArch();
    expect(target).not.toBeNull();

    if (process.platform === 'darwin') {
      expect(target).toEqual({
        os: 'mac',
        arch: process.arch === 'arm64' ? 'aarch64' : 'x64',
      });
    }
  });
});
