const { build } = require('esbuild');
const { mkdirSync } = require('fs');
const { join } = require('path');

const rootDir = join(__dirname, '..');
const outFile = join(rootDir, 'mcp', 'dist', 'index.js');

mkdirSync(join(rootDir, 'mcp', 'dist'), { recursive: true });

build({
  entryPoints: [join(rootDir, 'mcp', 'src', 'index.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: outFile,
  banner: {
    js: '#!/usr/bin/env node',
  },
  external: [],
}).then(() => {
  console.log(`Built ${outFile}`);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
