import { describe, expect, it } from 'vitest';
import { getJavaInstallHint } from '../electron/utils/platform';

describe('getJavaInstallHint', () => {
  it('returns a platform-specific install hint', () => {
    const hint = getJavaInstallHint();
    expect(hint).toContain('Java not found');
    expect(hint).toContain('Java 17+');

    if (process.platform === 'win32') {
      expect(hint).toContain('adoptium.net');
    } else if (process.platform === 'darwin') {
      expect(hint).toContain('Homebrew');
    }
  });
});
