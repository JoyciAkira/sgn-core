import assert from 'node:assert/strict';
import test from 'node:test';
import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

function runNode(args, cwd) {
  return new Promise((resolve, reject) => {
    execFile('node', args, { cwd }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(err, { stdout, stderr }));
      resolve({ stdout, stderr });
    });
  });
}

await test('publish→fetch via CLI succeeds', async () => {
  const work = mkdtempSync(join(tmpdir(), 'sgn-'));
  const db = join(work, 'e2e.db');
  const ku = {
    schema_id: 'ku.v0',
    type: 'ku.patch.migration',
    content_type: 'application/json',
    payload: { title: 'E2E', description: 'D', patch: '--- diff', severity: 'LOW', confidence: 0.9, affectedSystems: [] },
    parents: [], sources: [], tests: [], provenance: { agent_pubkey: null }, tags: [], signatures: []
  };
  const kuPath = join(work, 'ku.json');
  writeFileSync(kuPath, JSON.stringify(ku));

  const pub = await runNode(['src/cli/sgn.mjs', 'publish', '--file', kuPath, '--db', db], process.cwd());
  const m = pub.stdout.match(/Published KU (cid-blake3:[a-f0-9]+)/);
  assert.ok(m && m[1], 'CID not found in output');
  const cid = m[1];

  const fet = await runNode(['src/cli/sgn.mjs', 'fetch', cid, '--db', db], process.cwd());
  assert.ok(fet.stdout.includes(cid));
});

