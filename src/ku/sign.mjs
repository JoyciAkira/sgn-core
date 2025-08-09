/**
 * Ed25519 sign/verify for KU using Node.js crypto (no native deps)
 */
import { createPrivateKey, createPublicKey, sign as edSign, verify as edVerify } from 'crypto';
import { cidForKU } from './cid.mjs';

/**
 * Sign a KU with an Ed25519 private key in PEM format (PKCS#8)
 * @param {object} ku
 * @param {string} privateKeyPEM - PEM string
 * @param {string} publicKeyPEM - PEM string (for provenance pubkey)
 */
export async function signKU(ku, privateKeyPEM, publicKeyPEM) {
  const cid = cidForKU(ku);
  const msg = Buffer.from(cid);
  const keyObj = createPrivateKey({ key: privateKeyPEM });
  const signature = edSign(null, msg, keyObj); // Ed25519: algorithm null
  const signatureHex = Buffer.from(signature).toString('hex');
  if (!Array.isArray(ku.signatures)) ku.signatures = [];
  ku.signatures.push({ pubkey: null, sig: signatureHex, cid });
  ku.id = cid;
  return { cid, signatureHex };
}

/**
 * Verify a KU signature with an Ed25519 public key in PEM (SPKI)
 * @param {object} kuLike - object with same canonicalizable fields and signatures[0].sig
 * @param {string} publicKeyPEM - PEM string
 */
export async function verifyKU(kuLike, publicKeyPEM) {
  const cid = cidForKU(kuLike);
  const msg = Buffer.from(cid);
  const sigHex = kuLike.signatures?.[0]?.sig;
  if (!sigHex) return { ok: false, reason: 'No signature' };
  const signature = Buffer.from(sigHex, 'hex');
  const pubKeyObj = createPublicKey({ key: publicKeyPEM });
  const ok = edVerify(null, msg, pubKeyObj, signature);
  return { ok, cidExpected: cid };
}

