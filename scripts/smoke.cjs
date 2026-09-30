const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { setTimeout: delay } = require('node:timers/promises');
const env = { PATH: process.env.PATH, HOME: process.env.HOME, NEXT_TELEMETRY_DISABLED: '1', CI: 'true' };
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "4311"], { env, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
server.stdout.on('data', (chunk) => { output += chunk; });
server.stderr.on('data', (chunk) => { output += chunk; });
async function main() {
  try {
    const url = 'http://127.0.0.1:4311/';
    let response;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error(`Smoke server exited: ${output}`);
      try { response = await fetch(url, { signal: AbortSignal.timeout(1000) }); break; }
      catch { await delay(200); }
    }
    assert.ok(response, `Smoke server never became ready: ${output}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.match(html, /Immunology Scout/);
    
    console.log('PASS production HTTP smoke (loopback, no integration requests)');
  } finally {
    server.kill('SIGTERM');
    if (server.exitCode === null) await new Promise((resolve) => server.once('exit', resolve));
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
