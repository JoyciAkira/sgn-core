/**
 * DAG-CBOR canonical bytes + CIDv1 (dag-cbor + sha2-256, base32)
 */
import * as dagCbor from '@ipld/dag-cbor';
import { CID } from 'multiformats/cid';
import { sha256 } from 'multiformats/hashes/sha2';
import { base32 } from 'multiformats/bases/base32';

export function stripSig(ku) {
  if (!ku) return {};
  const { sig, signatures, ...rest } = ku;
  return rest;
}

export async function encodeForCID(ku) {
  return dagCbor.encode(stripSig(ku));
}

export async function computeCIDv1(ku) {
  const bytes = await encodeForCID(ku);
  const mh = await sha256.digest(bytes);
  return CID.createV1(dagCbor.code, mh);
}

export function cidToString(cid) {
  return cid.toString(base32.encoder);
}

