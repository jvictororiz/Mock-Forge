# MockForge client

Desktop Electron app. See the [repository root README](../README.md) for monorepo overview.

## Requirements

- Node.js 18+
- Java 17+ is bundled in packaged builds; for development you may still need a local JDK on some setups

## Quick start

```bash
npm install
npm run download-mockserver
npm run dev
```

## Scripts

```bash
npm test
npm run typecheck
npm run build
npm run build:win
npm run build:mac
```

## Updates

GitHub Releases is the source of truth. Push a tag that matches `package.json` (e.g. `v0.7.4`) to run the Release workflow from the repo root.

In the app: **Settings → System → Check for updates**. A header **Update** button appears when a newer version exists.

| Platform | Update button |
|---|---|
| Windows | Downloads NSIS, installs, reopens |
| macOS (Homebrew cask) | Reinstalls from the release cask and reopens |
| macOS (DMG) | Opens the disk image — drag to Applications |

```bash
brew install --cask mockforge
```

That command works once Homebrew merges the cask pull request opened at the end of this workflow. The job uses the `HOMEBREW_GITHUB_API_TOKEN` secret (classic PAT, `public_repo` scope).

Environments and sessions stay in `~/.mockforge`.

## License

MIT — see [LICENSE](LICENSE).
