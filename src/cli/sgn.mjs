/**
 * Minimal CLI: publish/fetch/verify
 */
import { readFileSync } from 'fs';
import { RealSQLiteStorageTier } from '../persistence/sqlite-real-storage.mjs';
import { validateKU } from '../ku/schema.mjs';
import { cidForKU } from '../ku/cid.mjs';
import { signKU, verifyKU } from '../ku/sign.mjs';

async function main() {
  const [,, cmd, ...args] = process.argv;
  if (!cmd) {
    console.log('Usage: node src/cli/sgn.mjs <publish|fetch|verify|ku> [options]');
    process.exit(1);
  if (cmd === 'ku') {
    const sub = args[0];
    if (sub === 'canonicalize') {
      const file = args[1];
      const ku = JSON.parse(readFileSync(file, 'utf8'));
      const { computeCIDv1, cidToString, encodeForCID } = await import('../ku/cid_v1.mjs');
      const cid = await computeCIDv1(ku);
      const bytes = await encodeForCID(ku);
      console.log(JSON.stringify({ cid: cidToString(cid), bytes_len: bytes.length }, null, 2));
      process.exit(0);
    }
    if (sub === 'sign') {
      const file = args[1]; const privPath = args[2]; const pubPath = args[3];
      const ku = JSON.parse(readFileSync(file, 'utf8'));
      const privPem = readFileSync(privPath, 'utf8');
      const pubPem = readFileSync(pubPath, 'utf8');
      const { signKU_v1 } = await import('../ku/sign_v1.mjs');
      const signed = await signKU_v1(ku, privPem, pubPem);
      const fs = await import('node:fs/promises');
      await fs.writeFile(file, JSON.stringify(signed, null, 2));
      console.log('signed ok');
      process.exit(0);
    }
    if (sub === 'verify') {
      const file = args[1]; const pubPath = args[2];
      const ku = JSON.parse(readFileSync(file, 'utf8'));
      const pubPem = readFileSync(pubPath, 'utf8');
      const { verifyKU_v1 } = await import('../ku/sign_v1.mjs');
      const res = await verifyKU_v1(ku, pubPem);
      console.log(JSON.stringify(res));
      process.exit(res.ok ? 0 : 1);
    }
    if (sub === 'print' && args[1] === '--dag-json') {
      const file = args[2];
      const ku = JSON.parse(readFileSync(file, 'utf8'));
      const { encodeForCID } = await import('../ku/cid_v1.mjs');
      const bytes = await encodeForCID(ku);
      const dagJson = (await import('@ipld/dag-json')).encode(JSON.parse(JSON.stringify(ku)));
      console.log(new TextDecoder().decode(dagJson));
      process.exit(0);
    }
    console.error('Usage: node src/cli/sgn.mjs ku <canonicalize|sign|verify|print --dag-json> <args>');
    process.exit(2);
  }

  }
  // Optional --db <path> to isolate tests
  const dbIdx = args.indexOf('--db');
  const dbPath = dbIdx !== -1 ? args[dbIdx + 1] : 'data/sgn-ku.db';
  const storage = new RealSQLiteStorageTier({ dbPath, backupPath: dbPath + '.backup' });
  await storage.initialize();

  if (cmd === 'publish') {
    const fileIdx = args.indexOf('--file');
    const signIdx = args.indexOf('--sign');
    if (fileIdx === -1) {
      console.error('--file <path> is required');
      process.exit(2);
    }
    const filePath = args[fileIdx + 1];
    const ku = JSON.parse(readFileSync(filePath, 'utf8'));
    const { valid, errors } = validateKU(ku);
    if (!valid) {
      console.error('Invalid KU:', errors.join('; '));
      process.exit(3);
    }
    if (signIdx !== -1) {
      const pkIdx = args.indexOf('--priv');
      const pubIdx = args.indexOf('--pub');
      if (pkIdx === -1 || pubIdx === -1) {
        console.error('--sign requires --priv <pem> and --pub <pem>');
        process.exit(4);
      }
      const privPEM = readFileSync(args[pkIdx + 1], 'utf8');
      const pubPEM = readFileSync(args[pubIdx + 1], 'utf8');
      const { cid } = await signKU(ku, privPEM, pubPEM);
      ku.signatures[ku.signatures.length-1].pubkey = pubPEM;
      ku.provenance = ku.provenance || {};
      ku.provenance.agent_pubkey = pubPEM;
    }
    const cid = cidForKU(ku);
    ku.id = cid;
    // For storage compatibility, map KU to storage record fields (minimal)
    const record = {
      id: ku.id,
      title: ku.payload?.title || ku.payload?.name || 'KU',
      type: ku.type,
      description: ku.payload?.description || '',
      solution: ku.payload?.patch || null,
      severity: ku.payload?.severity || 'MEDIUM',
      confidence: ku.payload?.confidence || 0.9,
      tags: ku.tags || [],
      affectedSystems: ku.payload?.affectedSystems || [],
      discoveredBy: ku.provenance?.agent_pubkey || null,
      originPeer: null,
      hash: cid,
      signature: ku.signatures?.[0]?.sig || null
    };
    await storage.store(record);
    // Ensure data is persisted before exit
    await storage.flushToFile?.();
    console.log('Published KU', cid);
    process.exit(0);
  }

  if (cmd === 'fetch') {
    const id = args[0];
    if (!id) { console.error('fetch <cid>'); process.exit(2);}
    const ku = await storage.retrieve(id);
    console.log(JSON.stringify(ku, null, 2));
    process.exit(0);
  }

  if (cmd === 'verify') {
    const id = args[0];
    const pubIdx = args.indexOf('--pub');
    if (!id || pubIdx === -1) { console.error('verify <cid> --pub <pem-file>'); process.exit(2);}
    const pubPEM = readFileSync(args[pubIdx + 1], 'utf8');
    const ku = await storage.retrieve(id);
    if (!ku) { console.error('Not found'); process.exit(3); }
    // Build a minimal KU-like object to recompute CID
    const reconstructed = {
      schema_id: ku.schema_id || 'ku.v0',
      type: ku.type,
      content_type: 'application/json',
      payload: { title: ku.title, description: ku.description, patch: ku.solution, severity: ku.severity, confidence: ku.confidence, affectedSystems: ku.affectedSystems },
      parents: [], sources: [], tests: [], provenance: { agent_pubkey: ku.discoveredBy }, tags: ku.tags
    };
    const { ok, cidExpected } = await verifyKU({ ...reconstructed, signatures: [{ sig: ku.signature }] }, pubPEM);
    console.log(JSON.stringify({ ok, cidExpected, id }, null, 2));
    process.exit(ok ? 0 : 4);
  }
}

main().catch(e => { console.error(e); process.exit(99); });

