import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const { renderCask } = require('../scripts/generate-cask.js') as {
  renderCask: (input: {
    version: string;
    owner: string;
    repo: string;
    hashes: { arm64?: string; x64?: string };
  }) => string;
};
const { readGeneratedCask } = require(
  '../scripts/publish-homebrew-cask.js',
) as {
  readGeneratedCask: (source: string) => {
    text: string;
    version: string;
    hashes: { arm64: string; x64: string };
  };
};

const arm = 'a'.repeat(64);
const intel = 'b'.repeat(64);

describe('homebrew cask', () => {
  it('renders a cask for both Mac architectures', () => {
    const source = renderCask({
      version: '0.7.10',
      owner: 'jvictororiz',
      repo: 'Mock-Forge',
      hashes: { arm64: arm, x64: intel },
    });

    expect(source).toContain('cask "mockforge" do');
    expect(source).toContain('arch arm: "arm64", intel: "x64"');
    expect(source).toContain(`sha256 arm:   "${arm}",`);
    expect(source).toContain(`intel: "${intel}"`);
    expect(source).toContain('auto_updates true');
    expect(source).toContain('uninstall quit: "com.mockforge.app"');
    expect(source).toContain('postflight do');
    expect(source).toContain('"/usr/bin/xattr"');
    expect(source).toContain('"com.apple.quarantine"');
    expect(source).toContain('"#{appdir}/MockForge.app"');
    expect(source).toContain('"~/.mockforge"');
    expect(source).toContain(
      'https://github.com/jvictororiz/Mock-Forge/releases/download/v#{version}/MockForge-mac-#{arch}.dmg',
    );
    expect(source).not.toContain('mockforge.rb');
    expect(readGeneratedCask(source)).toEqual({
      text: source,
      version: '0.7.10',
      hashes: { arm64: arm, x64: intel },
    });
  });

});
