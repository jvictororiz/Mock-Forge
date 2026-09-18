import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
  };
});

vi.mock('../electron/utils/platform', () => ({
  resolveCommandPath: vi.fn(() => null),
}));

describe('resolveAdbPath', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(existsSync).mockImplementation((path) => {
      const value = String(path);
      return value.endsWith('/Library/Android/sdk/platform-tools/adb');
    });
    delete process.env.ANDROID_HOME;
    delete process.env.ANDROID_SDK_ROOT;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('falls back to the default Android SDK location when adb is not in PATH', async () => {
    const { resolveAdbPath } = await import('../electron/utils/adbPath');
    const expected = join(homedir(), 'Library', 'Android', 'sdk', 'platform-tools', 'adb');

    expect(resolveAdbPath()).toBe(expected);
  });
});
