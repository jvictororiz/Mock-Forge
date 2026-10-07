const { build } = require('esbuild');
const { mkdirSync, readFileSync, writeFileSync } = require('fs');
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
  const source = readFileSync(outFile, 'utf8');
  const normalized = source.replace(/^(#![^\n]*\r?\n)+/, '#!/usr/bin/env node\n');
  if (normalized !== source) {
    writeFileSync(outFile, normalized);
  }
  const secondLine = normalized.split(/\r?\n/)[1] || '';
  if (secondLine.startsWith('#!')) {
    throw new Error('MCP bundle still has a shebang after the first line');
  }
  console.log(`Built ${outFile}`);
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
