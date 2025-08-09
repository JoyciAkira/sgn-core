import test from 'node:test';
import assert from 'node:assert/strict';
import { signKU_v1, verifyKU_v1, keyIdFromPubPEM } from '../src/ku/sign_v1.mjs';
import { generateKeyPairSync } from 'node:crypto';

const ku = {
  type: 'ku.patch.migration',
  schema_id: 'ku.v1',
  payload: { title: 'X', description: 'Y', patch: '---', severity: 'LOW', confidence: 0.9 },
  parents: [], sources: [], tests: [], provenance: { agent_pubkey: null }, tags: []
};

await test('sign/verify v1 OK and FAIL on tamper', async () => {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const priv = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  const pub = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const signed = await signKU_v1(ku, priv, pub);
  assert.equal((await verifyKU_v1(signed, pub)).ok, true);
  const tampered = structuredClone(signed);
  tampered.sig.signature = tampered.sig.signature.slice(1);
  assert.equal((await verifyKU_v1(tampered, pub)).ok, false);
});

