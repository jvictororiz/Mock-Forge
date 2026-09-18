const { spawn } = require('child_process');
const { execFileSync } = require('child_process');
const path = require('path');

execFileSync(process.execPath, [path.join(__dirname, 'copy-proxy.js')], {
  stdio: 'inherit',
});

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn('vite', [], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
});

child.on('exit', (code) => {
  process.exit(code ?? 0);
});
