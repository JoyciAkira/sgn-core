/**
 * SGN Daemon HTTP/JSON-RPC (PR #3)
 * Endpoints:
 * - GET  /health -> { ok, ku_count, outbox_ready, time_ms }
 * - GET  /ku/:cid[?view=dag-json|json]
 * - POST /publish { ku, verify?:bool, pub_pem?:string } -> { cid, stored, enqueued }
 * - POST /verify  { ku, pub_pem } -> { ok, reason?, trusted }
 */
import http from 'node:http';
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dagJson from '@ipld/dag-json';
import { RealSQLiteStorageTier } from '../persistence/sqlite-real-storage.mjs';
import { computeCIDv1, cidToString, encodeForCID } from '../ku/cid_v1.mjs';
import { verifyKU_v1 } from '../ku/sign_v1.mjs';
import { PersistentOutbox } from '../network/outbox-persistent.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = Number(process.env.SGN_HTTP_PORT || 8787);
const DB_PATH = process.env.SGN_DB || join(__dirname, '../../data/sgn.db.json');
const KUS_DIR = process.env.SGN_KUS_DIR || join(__dirname, '../../data/kus');
const LOGS_DIR = process.env.SGN_LOGS_DIR || join(__dirname, '../../logs');
const TRUST_PATH = process.env.SGN_TRUST_PATH || join(__dirname, '../../trust.json');

const storage = new RealSQLiteStorageTier({ dbPath: DB_PATH, backupPath: DB_PATH + '.backup' });
const outbox = new PersistentOutbox(join(__dirname, '../../data/outbox.db'));

async function ensureDirs() {
  for (const d of [dirname(DB_PATH), KUS_DIR, LOGS_DIR]) {
    if (!existsSync(d)) await mkdir(d, { recursive: true });
  }
}

async function appendLog(obj) {
  try {
    const line = JSON.stringify({ ts: Date.now(), ...obj }) + '\n';
    await writeFile(join(LOGS_DIR, 'daemon.jsonl'), line, { flag: 'a' });
  } catch {}
}

async function loadTrust() {
  try {
    const txt = await readFile(TRUST_PATH, 'utf8');
    const pol = JSON.parse(txt);
    return { mode: pol.mode || 'warn', allow: new Set(pol.allow || []) };
  } catch {
    return { mode: 'warn', allow: new Set() };
  }
}

function sendJson(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': body.length });
  res.end(body);
}

async function handlePublish(req, res) {
  let buf = Buffer.alloc(0);
  for await (const chunk of req) buf = Buffer.concat([buf, chunk]);
  try {
    const { ku, verify, pub_pem } = JSON.parse(buf.toString('utf8')) || {};
    if (!ku || typeof ku !== 'object') return sendJson(res, 400, { error: 'invalid_ku' });

    // Compute CIDv1 and bytes
    const cid = cidToString(await computeCIDv1(ku));

    // Optional verify
    if (verify) {
      if (!pub_pem) return sendJson(res, 400, { error: 'missing_pub_pem' });
      const v = await verifyKU_v1(ku, pub_pem);
      if (!v.ok) return sendJson(res, 400, { error: 'verify_fail', reason: v.reason });
      const trust = await loadTrust();
      let trusted = false;
      if (ku.sig?.key_id) trusted = trust.allow.has(ku.sig.key_id);
      if (trust.mode === 'enforce' && !trusted) {
        return sendJson(res, 403, { error: 'untrusted_key' });
      }
    }

    // Persist raw KU to filesystem
    await writeFile(join(KUS_DIR, `${cid}.json`), JSON.stringify(ku, null, 2));

    // Store minimal record in warm storage (compat)
    const record = {
      id: cid,
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
      signature: ku.sig?.signature || null
    };
    await storage.store(record);

    // Enqueue broadcast
    outbox.enqueue(cid, { type: 'ku-broadcast', ku, timestamp: Date.now() });

    await appendLog({ evt: 'publish', cid });
    return sendJson(res, 200, { cid, stored: true, enqueued: true });
  } catch (e) {
    await appendLog({ evt: 'publish_error', error: e.message });
    return sendJson(res, 500, { error: 'server_error' });
  }
}

async function handleVerify(req, res) {
  let buf = Buffer.alloc(0);
  for await (const chunk of req) buf = Buffer.concat([buf, chunk]);
  try {
    const { ku, pub_pem } = JSON.parse(buf.toString('utf8')) || {};
    if (!ku || !pub_pem) return sendJson(res, 400, { ok: false, reason: 'missing_params' });

    const trust = await loadTrust();
    const v = await verifyKU_v1(ku, pub_pem);
    let trusted = false;
    if (v.ok && ku.sig?.key_id) trusted = trust.allow.has(ku.sig.key_id);
    // In enforce mode: do not block /verify; report trusted=false with 200
    return sendJson(res, 200, { ok: v.ok, reason: v.reason, trusted });
  } catch (e) {
    return sendJson(res, 500, { ok: false, reason: 'server_error' });
  }
}

async function handleHealth(_req, res) {
  const start = Date.now();
  const stats = storage.getStatistics();
  const outboxReady = outbox.getReady(1).length; // peek
  const time_ms = Date.now() - start;
  return sendJson(res, 200, { ok: true, ku_count: stats.totalKUs, outbox_ready: outboxReady, time_ms });
}

async function handleGetKU(req, res, cid, view) {
  try {
    // Prefer raw KU file
    const path = join(KUS_DIR, `${cid}.json`);
    let ku = null;
    try { ku = JSON.parse(await readFile(path, 'utf8')); } catch {}

    if (!ku) {
      // Fallback to warm storage record reconstructed
      const record = await storage.retrieve(cid);
      if (!record) return sendJson(res, 404, { error: 'not_found' });
      ku = {
        type: record.type,
        schema_id: 'ku.v1',
        content_type: 'application/json',
        payload: {
          title: record.title,
          description: record.description,
          patch: record.solution,
          severity: record.severity,
          confidence: record.confidence,
          affectedSystems: record.affectedSystems
        },
        parents: [], sources: [], tests: [], provenance: { agent_pubkey: record.discoveredBy }, tags: record.tags,
      };
    }

    if (view === 'dag-json') {
      const copy = JSON.parse(JSON.stringify(ku));
      delete copy.sig;
      const bytes = dagJson.encode(copy);
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(Buffer.from(bytes));
    }
    return sendJson(res, 200, ku);
  } catch (e) {
    return sendJson(res, 500, { error: 'server_error' });
  }
}

async function main() {
  await ensureDirs();
  await storage.initialize();
  await outbox.initialize();

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (req.method === 'GET' && url.pathname === '/health') return handleHealth(req, res);
      if (req.method === 'POST' && url.pathname === '/publish') return handlePublish(req, res);
      if (req.method === 'POST' && url.pathname === '/verify') return handleVerify(req, res);
      if (req.method === 'GET' && url.pathname.startsWith('/ku/')) {
        const cid = decodeURIComponent(url.pathname.substring(4));
        const view = url.searchParams.get('view') || 'json';
        return handleGetKU(req, res, cid, view);
      }
      return sendJson(res, 404, { error: 'not_found' });
    } catch (e) {
      return sendJson(res, 500, { error: 'server_error' });
    }
  });

  server.listen(PORT, () => {
    console.log(`SGN Daemon listening on http://localhost:${PORT}`);
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}

