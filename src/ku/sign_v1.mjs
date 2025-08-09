/**
 * Ed25519 signature over DAG-CBOR canonical bytes (prehash=none)
 */
import { createPrivateKey, createPublicKey, sign as edSign, verify as edVerify, createHash } from 'node:crypto';
import { sha256 } from 'multiformats/hashes/sha2';
import { base32 } from 'multiformats/bases/base32';
import { encodeForCID } from './cid_v1.mjs';

export async function keyIdFromPubPEM(pubPem) {
  const der = createPublicKey(pubPem).export({ type: 'spki', format: 'der' });
  const mh = await sha256.digest(Buffer.from(der));
  return base32.encode(mh.bytes);
}

export async function signKU_v1(ku, privPem, pubPem) {
  const bytes = await encodeForCID(ku); // bytes canonici senza sig
  const priv = createPrivateKey({ key: privPem });
  const sigRaw = edSign(null, bytes, priv);
  const signature = Buffer.from(sigRaw).toString('base64url');
  const key_id = await keyIdFromPubPEM(pubPem);
  return {
    ...ku,
    sig: { alg: 'ed25519', prehash: 'none', context: 'sgn-ku-v1', key_id, signature }
  };
}

export async function verifyKU_v1(ku, pubPem) {
  if (!ku?.sig) return { ok: false, reason: 'missing_sig' };
  const { alg, prehash, context, signature, key_id } = ku.sig;
  if (alg !== 'ed25519' || prehash !== 'none' || context !== 'sgn-ku-v1') {
    return { ok: false, reason: 'bad_sig_header' };
  }
  const kid = await keyIdFromPubPEM(pubPem);
  if (kid !== key_id) return { ok: false, reason: 'key_mismatch' };
  const { sig, ...unsigned } = ku;
  const bytes = await encodeForCID(unsigned);
  const pub = createPublicKey({ key: pubPem });
  const ok = edVerify(null, bytes, pub, Buffer.from(signature, 'base64url'));
  return { ok };
}

