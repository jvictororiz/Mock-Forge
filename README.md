# MockForge

Visual mock server manager for [MockServer](https://www.mock-server.com/) — offline, open source, no account required.

This repository is a monorepo:

| Path | What it is |
|------|------------|
| [`mock-forge-client/`](mock-forge-client/) | Desktop Electron app (Windows + macOS) |
| [`mock-forge-site/`](mock-forge-site/) | Marketing site (Astro → Cloudflare Pages) |

## Downloads

Installers ship on [GitHub Releases](https://github.com/jvictororiz/Mock-Forge/releases). The website and the in-app updater both point there.

macOS via Homebrew:

```bash
brew install --cask jvictororiz/homebrew-mockforge/mockforge
```

The release workflow pushes the cask to [jvictororiz/homebrew-mockforge](https://github.com/jvictororiz/homebrew-mockforge). The DMG stays on this repository's GitHub Releases. The job needs a classic personal access token with the `public_repo` scope stored as the `HOMEBREW_GITHUB_API_TOKEN` repository secret.

## Develop the app

```bash
cd mock-forge-client
npm install
npm run download-mockserver
npm run dev
```

## Develop the site

```bash
cd mock-forge-site
npm install
npm run dev
```

## Cloudflare Pages

Connect this GitHub repo in Cloudflare Pages with:

- **Root directory:** `mock-forge-site`
- **Build command:** `npm ci && npm run build`
- **Build output:** `dist`

See [`mock-forge-site/README.md`](mock-forge-site/README.md) for details.

## License

MIT — see [`mock-forge-client/LICENSE`](mock-forge-client/LICENSE).
