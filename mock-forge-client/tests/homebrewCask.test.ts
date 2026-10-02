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
const { patchUpstreamCask, pullRequestTitle, readGeneratedCask } = require(
  '../scripts/publish-homebrew-cask.js',
) as {
  patchUpstreamCask: (
    source: string,
    version: string,
    hashes: { arm64: string; x64: string },
  ) => string;
  pullRequestTitle: (version: string, isNew: boolean) => string;
  readGeneratedCask: (source: string) => {
    version: string;
    hashes: { arm64: string; x64: string };
  };
};

const arm = 'a'.repeat(64);
const intel = 'b'.repeat(64);

describe('homebrew cask', () => {
  it('renders an official cask for both Mac architectures', () => {
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

  it('updates only the version and checksums of an existing cask', () => {
    const upstream = renderCask({
      version: '0.7.7',
      owner: 'jvictororiz',
      repo: 'Mock-Forge',
      hashes: { arm64: 'c'.repeat(64), x64: 'd'.repeat(64) },
    }).replace('desc "Visual mock server manager for MockServer"', 'desc "Kept by Homebrew"');

    const next = patchUpstreamCask(upstream, '0.7.10', { arm64: arm, x64: intel });

    expect(next).toContain('version "0.7.10"');
    expect(next).toContain(`sha256 arm:   "${arm}",`);
    expect(next).toContain(`intel: "${intel}"`);
    expect(next).toContain('desc "Kept by Homebrew"');
    expect(next).not.toContain('0.7.7');
  });

  it('refuses to drop an Intel checksum', () => {
    const upstream = renderCask({
      version: '0.7.7',
      owner: 'jvictororiz',
      repo: 'Mock-Forge',
      hashes: { arm64: 'c'.repeat(64), x64: 'd'.repeat(64) },
    });

    expect(() => patchUpstreamCask(upstream, '0.7.10', { arm64: arm, x64: '' })).toThrow(
      /Intel checksum/,
    );
  });

  it('names a first-time pull request as a new cask', () => {
    expect(pullRequestTitle('0.7.10', true)).toBe('mockforge 0.7.10 (new cask)');
    expect(pullRequestTitle('0.7.11', false)).toBe('mockforge 0.7.11');
  });
});
