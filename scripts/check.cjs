const { spawnSync } = require('node:child_process');
// No inherited API keys, database URLs, or user configuration in verification.
const env = { PATH: process.env.PATH, HOME: process.env.HOME, CI: 'true', NEXT_TELEMETRY_DISABLED: '1' };
for (const task of ['typecheck', 'lint', 'test', 'build', 'smoke']) {
  const result = spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', task], { stdio: 'inherit', env });
  if (result.status !== 0) process.exit(result.status || 1);
}
