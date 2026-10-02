const { execFileSync } = require('child_process');
const { mkdtempSync, mkdirSync, writeFileSync, rmSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');

const TAP = 'jvictororiz/homebrew-mockforge';
const CASK_PATH = 'Casks/mockforge.rb';
const README_PATH = 'README.md';

function parseArgs(argv) {
  const args = { caskPath: '', version: '' };
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    const next = argv[i + 1];
    if (token === '--cask' && next) {
      args.caskPath = next;
      i += 1;
    } else if (token === '--version' && next) {
      args.version = next.replace(/^v/i, '');
      i += 1;
    }
  }
  return args;
}

function readGeneratedCask(source) {
  const text = source.replace(/\r\n/g, '\n');
  const version = text.match(/^  version "([^"]+)"/m)?.[1] ?? '';
  const armLine = text.match(/^  sha256 arm:\s+"([a-f0-9]{64})"/m)?.[1] ?? '';
  const single = text.match(/^  sha256 "([a-f0-9]{64})"/m)?.[1] ?? '';
  const intel = text.match(/^[ \t]*intel: "([a-f0-9]{64})"/m)?.[1] ?? '';
  return {
    text,
    version,
    hashes: {
      arm64: armLine || single,
      x64: intel,
    },
  };
}

function tapReadme() {
  return `# Homebrew tap for MockForge

\`\`\`bash
brew install --cask ${TAP}/mockforge
\`\`\`

The cask downloads the macOS app from [MockForge releases](https://github.com/jvictororiz/Mock-Forge/releases).
`;
}

function run(command, args, options) {
  try {
    return execFileSync(command, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      ...options,
    });
  } catch (error) {
    const stderr = error.stderr ? String(error.stderr).trim() : '';
    const stdout = error.stdout ? String(error.stdout).trim() : '';
    const detail = [stderr, stdout].filter(Boolean).join('\n');
    if (detail && !String(error.message).includes(detail)) {
      error.message = `${error.message}\n${detail}`;
    }
    throw error;
  }
}

function tokenEnv(token) {
  return {
    ...process.env,
    GH_TOKEN: token,
    GITHUB_TOKEN: token,
  };
}

function gitEnv(token) {
  const basic = Buffer.from(`x-access-token:${token}`).toString('base64');
  return {
    ...tokenEnv(token),
    // checkout persists the workflow token in http.https://github.com/.extraheader.
    // Scope Git credentials to this command so that token is not used for the tap.
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
  };
}

function ensureTap(env) {
  try {
    run('gh', ['repo', 'view', TAP, '--json', 'name'], { env });
  } catch {
    run('gh', [
      'repo', 'create', TAP,
      '--public',
      '--description', 'Homebrew cask for MockForge',
      '--clone=false',
    ], { env });
  }
}

function publishHomebrewTap({ caskSource, version, token }) {
  const generated = readGeneratedCask(caskSource);
  if (!generated.version || generated.version !== version) {
    throw new Error(`Cask version ${generated.version || '(missing)'} does not match ${version}`);
  }
  if (!token) {
    throw new Error(
      'HOMEBREW_GITHUB_API_TOKEN is not set. Create a classic PAT with public_repo and add it as a repository secret. The token pushes the cask to jvictororiz/homebrew-mockforge.',
    );
  }

  const env = tokenEnv(token);
  const git = gitEnv(token);
  const profile = JSON.parse(run('gh', ['api', 'user'], { env }));
  if (profile.login !== 'jvictororiz') {
    throw new Error(`HOMEBREW_GITHUB_API_TOKEN belongs to ${profile.login}, expected jvictororiz.`);
  }

  ensureTap(env);

  const dir = mkdtempSync(join(tmpdir(), 'homebrew-mockforge-'));
  try {
    run('git', ['clone', `https://github.com/${TAP}.git`, dir], { env: git });
    run('git', ['checkout', '-B', 'main'], { cwd: dir, env: git });
    mkdirSync(join(dir, 'Casks'), { recursive: true });
    const caskBody = generated.text.endsWith('\n') ? generated.text : `${generated.text}\n`;
    writeFileSync(join(dir, CASK_PATH), caskBody, 'utf8');
    writeFileSync(join(dir, README_PATH), tapReadme(), 'utf8');

    run('git', ['config', 'user.name', profile.name || profile.login], { cwd: dir, env: git });
    run('git', ['config', 'user.email', `${profile.id}+${profile.login}@users.noreply.github.com`], { cwd: dir, env: git });
    run('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir, env: git });
    run('git', ['add', CASK_PATH, README_PATH], { cwd: dir, env: git });

    let dirty = false;
    try {
      run('git', ['diff', '--cached', '--quiet'], { cwd: dir, env: git });
    } catch (error) {
      if (error.status !== 1) throw error;
      dirty = true;
    }
    if (!dirty) {
      console.log(`Homebrew tap is already mockforge ${version}`);
      return;
    }

    run('git', ['commit', '-m', `mockforge ${version}`], { cwd: dir, env: git });
    run('git', ['push', 'origin', 'HEAD:main'], { cwd: dir, env: git });
    console.log(`Published mockforge ${version} to https://github.com/${TAP}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function main() {
  const { readFileSync } = require('fs');
  const args = parseArgs(process.argv);
  if (!args.caskPath || !args.version) {
    console.error('Usage: node scripts/publish-homebrew-cask.js --cask mockforge.rb --version 0.7.11');
    process.exit(1);
  }
  publishHomebrewTap({
    caskSource: readFileSync(args.caskPath, 'utf8'),
    version: args.version,
    token: process.env.HOMEBREW_GITHUB_API_TOKEN || '',
  });
}

module.exports = {
  readGeneratedCask,
  TAP,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
