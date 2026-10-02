const { createHash } = require('crypto');
const { readFileSync, writeFileSync } = require('fs');
const { basename } = require('path');

function parseArgs(argv) {
  const args = {
    version: '',
    owner: 'jvictororiz',
    repo: 'Mock-Forge',
    out: '',
    dmgs: [],
  };

  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '--version' && next) {
      args.version = next.replace(/^v/i, '');
      i += 1;
    } else if (token === '--owner' && next) {
      args.owner = next;
      i += 1;
    } else if (token === '--repo' && next) {
      args.repo = next;
      i += 1;
    } else if (token === '--out' && next) {
      args.out = next;
      i += 1;
    } else if (token === '--dmg' && next) {
      args.dmgs.push(next);
      i += 1;
    }
  }

  return args;
}

function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

function detectArch(filePath) {
  const name = basename(filePath).toLowerCase();
  if (name.includes('arm64')) return 'arm64';
  if (name.includes('x64') || name.includes('intel')) return 'x64';
  return null;
}

function caskTail(extraDepends) {
  const depends = [extraDepends, '  depends_on macos: :big_sur'].filter(Boolean).join('\n');
  const installedApp = '#{appdir}/MockForge.app';
  return `  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true
${depends}

  app "MockForge.app"

  postflight do
    system_command "/usr/bin/xattr",
                   args: ["-dr", "com.apple.quarantine", "${installedApp}"],
                   must_succeed: false
  end

  uninstall quit: "com.mockforge.app"

  zap trash: [
    "~/.mockforge",
    "~/Library/Application Support/MockForge",
    "~/Library/Logs/MockForge",
    "~/Library/Preferences/com.mockforge.app.plist",
    "~/Library/Saved Application State/com.mockforge.app.savedState",
  ]
end
`;
}

function normalizeNewlines(body) {
  return body.replace(/\r\n/g, '\n');
}

function renderCask({ version, owner, repo, hashes }) {
  const homepage = `https://github.com/${owner}/${repo}`;
  const arm = hashes.arm64;
  const intel = hashes.x64;

  if (arm && intel) {
    return normalizeNewlines(`cask "mockforge" do
  arch arm: "arm64", intel: "x64"

  version "${version}"
  sha256 arm:   "${arm}",
         intel: "${intel}"

  url "${homepage}/releases/download/v#{version}/MockForge-mac-#{arch}.dmg"
  name "MockForge"
  desc "Visual mock server manager for MockServer"
  homepage "${homepage}"

${caskTail()}`);
  }

  if (arm) {
    return normalizeNewlines(`cask "mockforge" do
  version "${version}"
  sha256 "${arm}"

  url "${homepage}/releases/download/v#{version}/MockForge-mac-arm64.dmg"
  name "MockForge"
  desc "Visual mock server manager for MockServer"
  homepage "${homepage}"

${caskTail('  depends_on arch: :arm64')}`);
  }

  throw new Error('No macOS arm64 DMG found to generate the Homebrew cask');
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.version || args.dmgs.length === 0 || !args.out) {
    console.error('Usage: node scripts/generate-cask.js --version 0.7.4 --dmg file.dmg --out mockforge.rb');
    process.exit(1);
  }

  const hashes = {};
  for (const dmg of args.dmgs) {
    const arch = detectArch(dmg);
    if (!arch) {
      throw new Error(`Could not detect arch from ${dmg}`);
    }
    hashes[arch] = sha256File(dmg);
  }

  const contents = renderCask({
    version: args.version,
    owner: args.owner,
    repo: args.repo,
    hashes,
  });
  writeFileSync(args.out, contents.replace(/\r\n/g, '\n'), 'utf8');
  console.log(`Wrote ${args.out}`);
}

module.exports = { renderCask };

if (require.main === module) {
  main();
}
