import test from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { computeCIDv1 } from '../src/ku/cid_v1.mjs';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const sample = JSON.parse(readFileSync(join(__dirname, 'vectors/ku-sample.json'), 'utf8'));

function shuffleKeysDeep(obj) {
  if (Array.isArray(obj)) return obj.map(shuffleKeysDeep);
  if (obj && typeof obj === 'object') {
    const entries = Object.entries(obj).map(([k, v]) => [k, shuffleKeysDeep(v)]);
    for (let i = entries.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [entries[i], entries[j]] = [entries[j], entries[i]]; }
    return Object.fromEntries(entries);
  }
  return obj;
}

await test('CIDv1 invariato a riordino chiavi/bool/null/num', async () => {
  const base = JSON.parse(JSON.stringify(sample));
  const baseCID = (await computeCIDv1(base)).toString();
  await fc.assert(fc.asyncProperty(fc.integer(), async () => {
    const mutated = shuffleKeysDeep(JSON.parse(JSON.stringify(sample)));
    const cid = (await computeCIDv1(mutated)).toString();
    assert.equal(cid, baseCID);
  }), { numRuns: 50 });
});

