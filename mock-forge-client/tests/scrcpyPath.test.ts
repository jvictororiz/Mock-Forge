import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync } from 'fs';
import { join } from 'path';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    existsSync: vi.fn(actual.existsSync),
  };
});

vi.mock('electron', () => ({
  app: {
    isPackaged: false,
    getPath: (name: string) => `/tmp/mockforge-${name}`,
  },
}));

vi.mock('../electron/utils/platform', () => ({
  resolveCommandPath: vi.fn(() => null),
}));

describe('resolveScrcpyServerPath', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.mocked(existsSync).mockImplementation((path) => {
      const value = String(path);
      return value.endsWith('/resources/scrcpy/scrcpy-server');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns bundled scrcpy-server from development resources', async () => {
    const { resolveScrcpyServerPath } = await import('../electron/utils/scrcpyPath');
    const resolved = resolveScrcpyServerPath();

    expect(resolved?.endsWith(join('resources', 'scrcpy', 'scrcpy-server'))).toBe(true);
  });
});
