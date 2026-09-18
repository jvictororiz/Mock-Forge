# MockForge site

Static marketing site built with [Astro](https://astro.build/), deployed on Cloudflare Pages.

## Local development

```bash
npm install
npm run dev
```

```bash
npm run build
npm run preview
```

## Cloudflare Pages

In the Cloudflare dashboard → Workers & Pages → Create → Connect to Git:

| Setting | Value |
|---------|-------|
| Repository | `jvictororiz/Mock-Forge` |
| Root directory | `mock-forge-site` |
| Framework preset | Astro (or None) |
| Build command | `npm ci && npm run build` |
| Build output directory | `dist` |

After the first deploy, attach your custom domain under **Custom domains**.

Optional local Pages preview (requires Wrangler installed globally or as a one-off):

```bash
npm run build
npx wrangler@3 pages dev dist
```

`wrangler.jsonc` sets `pages_build_output_dir` to `dist` for CLI deploys.

## Idioma

O site é apenas em português (`/`).

## Downloads

A seção de download busca os assets da última GitHub Release em runtime e define o `href` direto do instalador Windows (`.exe`) e do DMG macOS. Destaca a plataforma do visitante. Homebrew:

```bash
brew install --cask https://github.com/jvictororiz/Mock-Forge/releases/latest/download/mockforge.rb
```
