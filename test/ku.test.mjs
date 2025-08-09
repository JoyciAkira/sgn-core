import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalizeKU } from '../src/ku/schema.mjs';
import { cidForKU } from '../src/ku/cid.mjs';
import { signKU, verifyKU } from '../src/ku/sign.mjs';

const baseKU = {
  schema_id: 'ku.v0',
  type: 'ku.patch.migration',
  content_type: 'application/json',
  payload: { title: 'T', description: 'D', patch: '--- diff', severity: 'LOW', confidence: 0.9, affectedSystems: [] },
  parents: [], sources: [], tests: [], provenance: { agent_pubkey: null }, tags: ['x']
};

import { generateKeyPairSync } from 'node:crypto';
function pemPair() {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  return {
    priv: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(),
    pub: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

await test('CID determinism', () => {
  const cid1 = cidForKU(baseKU);
  const cid2 = cidForKU(JSON.parse(JSON.stringify(baseKU)));
  assert.equal(cid1, cid2);
});

await test('sign/verify OK', async () => {
  const { priv, pub } = pemPair();
  const ku = JSON.parse(JSON.stringify(baseKU));
  await signKU(ku, priv, pub);
  const res = await verifyKU(ku, pub);
  assert.equal(res.ok, true);
});

await test('sign/verify FAIL with wrong key', async () => {
  const { priv, pub } = pemPair();
  const ku = JSON.parse(JSON.stringify(baseKU));
  await signKU(ku, priv, pub);
  const wrongPub = `-----BEGIN PUBLIC KEY-----\nMCowBQYDK2VwAyEAaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa=\n-----END PUBLIC KEY-----`;
  const res = await verifyKU(ku, wrongPub);
  assert.equal(res.ok, false);
});

