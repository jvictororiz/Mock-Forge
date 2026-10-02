const { execFileSync } = require('child_process');
const { mkdtempSync, writeFileSync, rmSync } = require('fs');
const { tmpdir } = require('os');
const { join } = require('path');

const UPSTREAM = 'Homebrew/homebrew-cask';
const CASK_PATH = 'Casks/m/mockforge.rb';
const RELEASE_REPO = 'jvictororiz/Mock-Forge';

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

function patchUpstreamCask(source, version, hashes) {
  const text = source.replace(/\r\n/g, '\n');
  const versionRe = /^([ \t]*)version "[^"]+"/m;
  if (!versionRe.test(text)) {
    throw new Error('Upstream cask has no version stanza');
  }

  let next = text.replace(versionRe, `$1version "${version}"`);
  const arm = hashes.arm64;
  const intel = hashes.x64;
  const hasArmStanza = /^[ \t]*sha256 arm:\s+"[a-f0-9]+"/m.test(text);
  const hasIntelStanza = /^[ \t]*intel:\s+"[a-f0-9]+"/m.test(text);

  if (arm && intel) {
    if (!hasArmStanza || !hasIntelStanza) {
      throw new Error('Upstream cask is missing arm/intel sha256 stanzas');
    }
    next = next.replace(
      /^([ \t]*sha256 arm:\s+)"[a-f0-9]+"/m,
      `$1"${arm}"`,
    );
    next = next.replace(
      /^([ \t]*intel:\s+)"[a-f0-9]+"/m,
      `$1"${intel}"`,
    );
  } else if (arm) {
    if (hasIntelStanza) {
      throw new Error('Refusing to drop the Intel checksum from the Homebrew cask');
    }
    if (!/^[ \t]*sha256 "[a-f0-9]+"/m.test(text)) {
      throw new Error('Upstream cask is missing a sha256 stanza');
    }
    next = next.replace(
      /^([ \t]*sha256 )"[a-f0-9]+"/m,
      `$1"${arm}"`,
    );
  } else {
    throw new Error('Generated cask has no sha256');
  }

  return next;
}

function pullRequestTitle(version, isNew) {
  return isNew ? `mockforge ${version} (new cask)` : `mockforge ${version}`;
}

function pullRequestBody(version) {
  const release = `https://github.com/${RELEASE_REPO}/releases/tag/v${version}`;
  return `-----

<!-- Do not tick a checkbox if you haven’t performed its action. Honesty is indispensable for a smooth review process. -->
<!-- Use [x] to mark item done before creation, or just click the checkboxes with device pointer after creation -->
<!-- In the following questions \`<cask>\` is the token of the cask you're editing. -->

After making any changes to a cask, existing or new, verify:

- [x] The submission is for [a stable version](https://docs.brew.sh/Acceptable-Casks#stable-versions) or [documented exception](https://docs.brew.sh/Acceptable-Casks#but-there-is-no-stable-version).
- [ ] \`brew audit --cask --online <cask>\` is error-free.
- [ ] \`brew style --fix <cask>\` reports no offenses.

Additionally, if adding a new cask:

- [x] Named the cask according to the [token reference](https://docs.brew.sh/Cask-Cookbook#token-reference).
- [x] Checked the cask was not [already refused](https://github.com/search?q=repo%3AHomebrew%2Fhomebrew-cask+is%3Aclosed+is%3Aunmerged+&type=pullrequests) (add your cask's name to the end of the search field).
- [ ] \`brew audit --cask --new <cask>\` worked successfully.
- [ ] \`HOMEBREW_NO_INSTALL_FROM_API=1 brew install --cask <cask>\` worked successfully.
- [ ] \`brew uninstall --cask <cask>\` worked successfully.

-----

- [x] I did not use AI/LLM to create this PR, or I disclosed the tool/model below and reviewed its output, including [\`zap\` stanza](https://docs.brew.sh/Cask-Cookbook#stanza-zap) paths; I did not attribute commits to AI and will answer maintainer questions and review comments myself without AI/LLM.

<!-- If AI was used, explain below how it was used and how you verified the changes. Non-maintainers may only have one AI-assisted PR open at a time. See https://docs.brew.sh/Responsible-AI-Usage for guidance. -->

Cursor generated the cask file from the sha256 of the DMGs in ${release}.
The cask token is \`mockforge\`.
Zap paths were checked against the app source: \`~/.mockforge\`, \`~/Library/Application Support/MockForge\`, \`~/Library/Logs/MockForge\`, \`~/Library/Preferences/com.mockforge.app.plist\`, and \`~/Library/Saved Application State/com.mockforge.app.savedState\`.
\`brew audit\`, install, and uninstall were not run, so those boxes stay open.

-----
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
    // That token cannot read Homebrew/homebrew-cask, so Git fails the clone instead of
    // falling back to anonymous access. This command-scoped header replaces it.
    GIT_CONFIG_COUNT: '1',
    GIT_CONFIG_KEY_0: 'http.https://github.com/.extraheader',
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${basic}`,
  };
}

function upstreamCask(env) {
  try {
    const encoded = run(
      'gh',
      ['api', `repos/${UPSTREAM}/contents/${CASK_PATH}`, '--jq', '.content'],
      { env },
    );
    return Buffer.from(encoded.replace(/\s/g, ''), 'base64').toString('utf8');
  } catch (error) {
    const detail = `${error.stdout || ''}\n${error.stderr || ''}`;
    if (error.status === 1 && /404|Not Found/i.test(detail)) return null;
    throw error;
  }
}

function ensureFork(login, env) {
  try {
    run('gh', ['repo', 'view', `${login}/homebrew-cask`, '--json', 'name'], { env });
  } catch {
    run('gh', ['repo', 'fork', UPSTREAM, '--clone=false', '--default-branch-only'], { env });
  }
}

function main() {
  const { readFileSync } = require('fs');
  const args = parseArgs(process.argv);
  if (!args.caskPath || !args.version) {
    console.error('Usage: node scripts/publish-homebrew-cask.js --cask mockforge.rb --version 0.7.10');
    process.exit(1);
  }
  const token = process.env.HOMEBREW_GITHUB_API_TOKEN || '';
  publishCaskPullRequest({
    caskSource: readFileSync(args.caskPath, 'utf8'),
    version: args.version,
    token,
  });
}

function publishCaskPullRequest({ caskSource, version, token }) {
  const generated = readGeneratedCask(caskSource);
  if (!generated.version || generated.version !== version) {
    throw new Error(`Cask version ${generated.version || '(missing)'} does not match ${version}`);
  }
  if (!token) {
    throw new Error(
      'HOMEBREW_GITHUB_API_TOKEN is not set. Create a classic PAT with public_repo and add it as a repository secret.',
    );
  }

  const env = tokenEnv(token);
  const git = gitEnv(token);
  const profile = JSON.parse(run('gh', ['api', 'user'], { env }));
  const login = profile.login;
  const base = run(
    'gh',
    ['repo', 'view', UPSTREAM, '--json', 'defaultBranchRef', '--jq', '.defaultBranchRef.name'],
    { env },
  ).trim();

  const existing = upstreamCask(env);
  const isNew = existing == null;
  const next = isNew ? generated.text : patchUpstreamCask(existing, version, generated.hashes);
  if (!isNew && next === existing.replace(/\r\n/g, '\n')) {
    console.log(`Homebrew cask is already mockforge ${version}`);
    return;
  }

  ensureFork(login, env);

  const dir = mkdtempSync(join(tmpdir(), 'homebrew-cask-'));
  const branch = `mockforge-${version}`;
  try {
    run('git', [
      'clone', '--depth', '1', '--filter=blob:none', '--sparse',
      '--branch', base,
      `https://github.com/${UPSTREAM}.git`,
      dir,
    ], { env: git });
    run('git', ['sparse-checkout', 'set', 'Casks/m'], { cwd: dir, env: git });
    run('git', ['checkout', '-B', branch], { cwd: dir, env: git });
    writeFileSync(join(dir, CASK_PATH), next.endsWith('\n') ? next : `${next}\n`, 'utf8');

    run('git', ['config', 'user.name', profile.name || login], { cwd: dir, env: git });
    run('git', ['config', 'user.email', `${profile.id}+${login}@users.noreply.github.com`], { cwd: dir, env: git });
    run('git', ['config', 'commit.gpgsign', 'false'], { cwd: dir, env: git });
    run('git', ['add', CASK_PATH], { cwd: dir, env: git });

    let dirty = false;
    try {
      run('git', ['diff', '--cached', '--quiet'], { cwd: dir, env: git });
    } catch (error) {
      if (error.status !== 1) throw error;
      dirty = true;
    }
    if (!dirty) {
      console.log(`Homebrew cask is already mockforge ${version}`);
      return;
    }

    const title = pullRequestTitle(version, isNew);
    run('git', ['commit', '-m', title], { cwd: dir, env: git });
    run('git', ['remote', 'add', 'fork', `https://github.com/${login}/homebrew-cask.git`], { cwd: dir, env: git });
    // The branch belongs to this automation. A re-run of the same version replaces it.
    run('git', ['push', '--force-with-lease', 'fork', `HEAD:${branch}`], { cwd: dir, env: git });

    const bodyPath = join(dir, 'pr-body.md');
    writeFileSync(bodyPath, pullRequestBody(version), 'utf8');
    const existingPr = run('gh', [
      'pr', 'list',
      '--repo', UPSTREAM,
      '--head', `${login}:${branch}`,
      '--state', 'open',
      '--json', 'number',
      '--jq', '.[0].number // empty',
    ], { env }).trim();

    if (existingPr) {
      run('gh', [
        'pr', 'edit', existingPr,
        '--repo', UPSTREAM,
        '--title', title,
        '--body-file', bodyPath,
      ], { env });
      console.log(`Updated Homebrew cask pull request #${existingPr}`);
      return;
    }

    const url = run('gh', [
      'pr', 'create',
      '--repo', UPSTREAM,
      '--base', base,
      '--head', `${login}:${branch}`,
      '--title', title,
      '--body-file', bodyPath,
    ], { env }).trim();
    console.log(`Opened Homebrew cask pull request: ${url}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = {
  patchUpstreamCask,
  pullRequestTitle,
  readGeneratedCask,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
