import assert from 'node:assert/strict';
import test from 'node:test';
import { spawn } from 'node:child_process';
import { request } from 'node:http';

function waitFor(port, path = '/health', timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = () => {
      const req = request({ host: '127.0.0.1', port, path, method: 'GET' }, res => {
        let b = '';
        res.on('data', c => b += c);
        res.on('end', () => {
          try { resolve({ code: res.statusCode, body: b }); } catch (e) { reject(e); }
        });
      });
      req.on('error', () => {
        if (Date.now() - start > timeoutMs) return reject(new Error('timeout'));
        setTimeout(tick, 150);
      });
      req.end();
    };
    tick();
  });
}

await test('daemon start -> /health responds', async () => {
  const port = 8978;
  const env = { ...process.env, SGN_HTTP_PORT: String(port), SGN_DB: './tmp-daemon-e2e.db' };
  const p = spawn(process.execPath, ['src/daemon/daemon.mjs'], { env, stdio: 'inherit' });
  try {
    const res = await waitFor(port);
    assert.equal(res.code, 200);
    const json = JSON.parse(res.body);
    assert.equal(json.ok, true);
  } finally {
    p.kill();
  }
});

