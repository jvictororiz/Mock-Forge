const { existsSync, readdirSync, rmSync } = require('fs');
const { join } = require('path');

const distDir = join(__dirname, '..', 'dist');

if (!existsSync(distDir)) {
  console.log('dist/ does not exist, nothing to clean.');
  process.exit(0);
}

for (const name of readdirSync(distDir)) {
  const entry = join(distDir, name);
  rmSync(entry, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
  console.log(`Removed ${entry}`);
}
