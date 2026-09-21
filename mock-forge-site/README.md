# Mock Forge site

Static marketing site built with [Astro](https://astro.build/), deployed on Cloudflare Pages.

Site deploys are **independent** from app releases: changing the site does **not** create a `v*.*.*` tag or a GitHub Release.

## Local development

```bash
npm install
npm run dev
```

```bash
npm run build
npm run preview
```

## Deploy

### Automatic (GitHub Actions)

Workflow [`.github/workflows/site.yml`](../.github/workflows/site.yml):

- Runs on pushes to `main` that touch `mock-forge-site/**`
- Builds Astro and deploys to the Pages project `mock-forge-site`
- Requires repository secret `CLOUDFLARE_API_TOKEN` (Permissions: Account → Cloudflare Pages → Edit)

Manual run: Actions → **Site** → **Run workflow**.

### Local

```bash
npm run build
npx wrangler@3 pages deploy dist --project-name mock-forge-site
```

`wrangler.jsonc` sets `pages_build_output_dir` to `dist`.

Custom domain: Cloudflare dashboard → Workers & Pages → `mock-forge-site` → Custom domains (e.g. `mock-forge.dev`).

## App releases (separate)

Desktop installers are published only by [`.github/workflows/release.yml`](../.github/workflows/release.yml) when you push a tag like `v0.7.8` (version must match `mock-forge-client/package.json`).

## Idioma

O site é apenas em português (`/`).

## Downloads

A seção de download oferece Windows e macOS. No Mac: Apple Silicon, Intel e comando Homebrew. Os links usam `/releases/latest/download/` com nomes estáveis de asset.

<!-- deploy-trigger: verify CLOUDFLARE_API_TOKEN -->

