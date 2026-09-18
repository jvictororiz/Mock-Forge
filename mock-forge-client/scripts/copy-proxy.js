const fs = require('fs');
const path = require('path');

const sourceDir = path.join(__dirname, '..', 'electron');
const destinationDir = path.join(__dirname, '..', 'dist-electron');

fs.mkdirSync(destinationDir, { recursive: true });
for (const file of [
  'proxy-server.cjs',
  'proxyRequestUtils.cjs',
  'proxyUpstream.cjs',
  'proxyBodyUtils.cjs',
  'proxyOverrideUtils.cjs',
  'proxyClientMonitor.cjs',
  'routePathMatch.cjs',
]) {
  fs.copyFileSync(path.join(sourceDir, file), path.join(destinationDir, file));
}
console.log('[copy-proxy] Copied proxy scripts to dist-electron');
