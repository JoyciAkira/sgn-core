/**
 * KU CID (content-address) using BLAKE3
 */
import { createHash } from 'blake3';
import { canonicalizeKU } from './schema.mjs';

export function cidForKU(ku) {
  const data = canonicalizeKU(ku);
  const hasher = createHash();
  hasher.update(Buffer.from(data));
  const hash = hasher.digest('hex');
  return `cid-blake3:${hash}`;
}

