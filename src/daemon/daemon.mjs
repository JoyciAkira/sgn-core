/**
 * SGN Daemon HTTP/JSON-RPC (PR #3)
 * Endpoints:
 * - GET  /health -> { ok, ku_count, outbox_ready, time_ms }
 * - GET  /ku/:cid[?view=dag-json|json]
 * - POST /publish { ku, verify?:bool, pub_pem?:string } -> { cid, stored, enqueued }
 * - POST /verify  { ku, pub_pem } -> { ok, reason?, trusted }
 */
import http from 'node:http';
import { readFile, writeFile, mkdir, unlink, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dagJson from '@ipld/dag-json';
import { RealSQLiteStorageTier } from '../persistence/sqlite-real-storage.mjs';
import { computeCIDv1, cidToString } from '../ku/cid_v1.mjs';
import { verifyKU_v1 } from '../ku/sign_v1.mjs';
import { PersistentOutbox } from '../network/outbox-persistent.mjs';
import { metrics } from './metrics.mjs';
import { createEventsServer } from './events.mjs';
import { TrustManager } from '../trust/trust-manager.mjs';
import { EdgesStore } from '../graph/edges-store.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = Number(process.env.SGN_HTTP_PORT || 8787);
const DB_PATH = process.env.SGN_DB || join(__dirname, '../../data/sgn.db.json');
const KUS_DIR = process.env.SGN_KUS_DIR || join(__dirname, '../../data/kus');
const LOGS_DIR = process.env.SGN_LOGS_DIR || join(__dirname, '../../logs');
const TRUST_PATH = process.env.SGN_TRUST_PATH || join(__dirname, '../../trust.json');
const BROADCAST_ENABLED = process.env.SGN_BROADCAST !== 'off';

const storage = new RealSQLiteStorageTier({ dbPath: DB_PATH, backupPath: DB_PATH + '.backup' });
const outbox = new PersistentOutbox(DB_PATH.replace('.db', '-outbox.db'));
const EDGES_DB_PATH = process.env.SGN_EDGES_DB || DB_PATH.replace(/(\.db(?:\.json)?)$/, '').concat('-edges.db');
const edgesStore = new EdgesStore(EDGES_DB_PATH);
let server = null;
let eventsClose = null;
const toClear = new Set();
function shutdown(signal='SIGTERM'){
  if (shutdown._done) return; shutdown._done = true;
  appendLog?.({ evt:'daemon_shutdown', signal });
  try { eventsClose?.(); } catch {}
  for (const t of toClear) { try { clearInterval(t); clearTimeout(t); } catch {} }
  server?.close?.(()=>{
    try {
      const maybe = storage?.close?.()
      if (maybe && typeof maybe.then === 'function') {
        maybe.finally(()=>process.exit(0))
      } else {
        process.exit(0)
      }
    } catch {
      process.exit(0)
    }
  })
  setTimeout(()=>process.exit(0), 2000).unref();
}
process.on('SIGINT', ()=>shutdown('SIGINT'));
process.on('SIGTERM', ()=>shutdown('SIGTERM'));

const trustManager = new TrustManager(TRUST_PATH);
let eventsBroadcastKU = null;

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

// Legacy function for backward compatibility
async function loadTrust() {
  const config = await trustManager.load();
  return { mode: config.mode || 'warn', allow: new Set(config.allow || []) };
}

function sendJson(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, { 'content-type': 'application/json', 'content-length': body.length });
  res.end(body);
}

function sendText(res, code, text, headers = {}) {
  const body = Buffer.from(text);
  res.writeHead(code, { 'content-type': 'text/plain; charset=utf-8', 'content-length': body.length, ...headers });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let buf = Buffer.alloc(0);
    req.on('data', (chunk) => { buf = Buffer.concat([buf, chunk]); });
    req.on('end', () => resolve(buf));
    req.on('error', reject);
  });
}

async function handlePublish(req, res) {
  let buf = Buffer.alloc(0);
  for await (const chunk of req) buf = Buffer.concat([buf, chunk]);
  try {
    const t0 = Date.now();
    const { ku, verify, pub_pem } = JSON.parse(buf.toString('utf8')) || {};
    if (!ku || typeof ku !== 'object') return sendJson(res, 400, { error: 'invalid_ku' });

    // Compute CIDv1 and bytes
    const cid = cidToString(await computeCIDv1(ku));

    // Optional verify (defensive): warn mode never 500, enforce blocks
    let verifyInfo = null;
    if (verify) {
      try {
        if (!pub_pem) throw new Error('missing_pub_pem');
        const v = await verifyKU_v1(ku, pub_pem);
        if (!v.ok) throw new Error(v.reason || 'verify_fail');
        const trust = await loadTrust();
        const trusted = ku.sig?.key_id ? trust.allow.has(ku.sig.key_id) : false;
        verifyInfo = { ok: v.ok, trusted };
        if (trust.mode === 'enforce' && !trusted) {
          return sendJson(res, 403, { ok: false, error: 'untrusted_key', reason: 'key_not_allowlisted' });
        }
      } catch (err) {
        await appendLog({ evt: 'verify_error', msg: String(err) });
        const trust = await loadTrust().catch(() => ({ mode: 'warn' }));
        if (trust?.mode === 'enforce') {
          return sendJson(res, 400, { ok: false, error: 'verify_failed', reason: String(err) });
        } else {
          verifyInfo = { ok: false, trusted: false, reason: String(err) };
        }
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

    // Check if KU already exists (deduplication)
    const existingKu = await storage.retrieve(cid).catch(() => null);
    if (existingKu) {
      metrics.incrementDeduplication();
      await appendLog({ evt: 'publish_dedup', cid });
    } else {
      // Time the DB write operation
      const writeTimer = metrics.startDbWriteTimer();
      await storage.store(record);
      const writeDuration = metrics.endDbWriteTimer(writeTimer);
      metrics.incrementKuStored('http_publish');
      await appendLog({ evt: 'publish_stored', cid, write_ms: writeDuration });
    }

    // Enqueue broadcast (if enabled)
    if (BROADCAST_ENABLED) {
      outbox.enqueue(cid, { type: 'ku-broadcast', ku, timestamp: Date.now() });
    }

    const lat_ms = Date.now() - t0;
    metrics.http.publish.observe(lat_ms);
    metrics.outbox.ready = outbox.getReady(1).length;
    await appendLog({ evt: 'publish', cid, lat_ms });

    // Broadcast to /events clients
    if (eventsBroadcastKU) {
      try { eventsBroadcastKU({ cid }); } catch {}
    }

    return sendJson(res, 200, { ok: true, cid, stored: true, enqueued: true, verify: verifyInfo });
  } catch (e) {
    await appendLog({ evt: 'publish_error', error: e.message });
    return sendJson(res, 500, { error: 'server_error' });
  }
}

async function handleVerify(req, res) {
  let buf = Buffer.alloc(0);
  for await (const chunk of req) buf = Buffer.concat([buf, chunk]);
  try {
    const t0 = Date.now();
    const { ku, pub_pem } = JSON.parse(buf.toString('utf8')) || {};
    if (!ku || !pub_pem) return sendJson(res, 400, { ok: false, reason: 'missing_params' });

    const v = await verifyKU_v1(ku, pub_pem);
    let trusted = false;
    let trustReason = null;

    if (v.ok && ku.sig?.key_id) {
      const trustResult = await trustManager.isKeyTrusted(ku.sig.key_id);
      trusted = trustResult.trusted;
      if (!trusted) trustReason = trustResult.reason;
    }

    const lat_ms = Date.now() - t0;
    metrics.http.verify.observe(lat_ms);

    const response = { ok: v.ok, trusted };
    if (v.reason) response.reason = v.reason;
    if (trustReason) response.trust_reason = trustReason;

    return sendJson(res, 200, response);
  } catch (e) {
    return sendJson(res, 500, { ok: false, reason: 'server_error' });
  }
}

async function handleHealth(_req, res) {
  const start = Date.now();
  const stats = await storage.getStatistics();
  const outboxReady = outbox.getReady(1).length; // peek
  const dbRead = metrics.db.read.toJSON();
  const dbWrite = metrics.db.write.toJSON();
  const time_ms = Date.now() - start;
  return sendJson(res, 200, {
    status: 'healthy',
    ok: true,
    ku_count: stats.totalKUs,
    outbox_ready: outboxReady,
    time_ms,
    db_read_ms: dbRead.p50 ?? 0,
    db_write_ms: dbWrite.p50 ?? 0,
    ws_clients: metrics.ws.clients,
    queue_len: metrics.gauges.queue_len
  });
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

async function checkConsistency() {
  const results = {
    db_only: [],
    fs_only: [],
    mismatches: 0,
    total_db: 0,
    total_fs: 0,
    consistent: true
  };

  try {
    // Get all KUs from database
    const dbStats = await storage.getStatistics();
    results.total_db = dbStats.totalKUs;

    // Get all KU files from filesystem
    const kusFiles = [];
    if (existsSync(KUS_DIR)) {
      const files = await readdir(KUS_DIR);
      for (const file of files) {
        if (file.endsWith('.json')) {
          kusFiles.push(file.replace('.json', ''));
        }
      }
    }
    results.total_fs = kusFiles.length;

    // Check for files without DB records
    for (const cid of kusFiles) {
      const dbRecord = await storage.retrieve(cid).catch(() => null);
      if (!dbRecord) {
        results.fs_only.push(cid);
      }
    }

    // For now, we can't easily iterate all DB records without modifying storage
    // This is a simplified check focusing on FS orphans
    results.mismatches = results.fs_only.length;
    results.consistent = results.mismatches === 0;

    return results;
  } catch (error) {
    throw new Error(`Consistency check failed: ${error.message}`);
  }
}

async function main() {
  await ensureDirs();
  await storage.initialize();
      // For tests: if using tmp-edges-graph.db, ensure a fresh edges db file
      try {
        if (basename(EDGES_DB_PATH).startsWith('tmp-edges-graph')) {
          try { await unlink(EDGES_DB_PATH) } catch {}
        }
      } catch {}

  await outbox.initialize();
  edgesStore.initialize();
      // Track timers from components if exposed later
      try { if (outbox && outbox._timers) for (const t of outbox._timers) toClear.add(t) } catch {}


  // Create server placeholder
  let broadcastEdge = () => {}; // Will be set after events server creation

  server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);

      if (req.method === 'POST' && url.pathname === '/edges') {
        const buf = await readBody(req);
        try {
          const { src, dst, type, pub_pem, verify } = JSON.parse(buf.toString('utf8')) || {};
          const allowed = new Set(['applies_to','verifies','supersedes','conflicts_with']);
          if (!allowed.has(type)) return sendJson(res, 400, { ok:false, error: 'invalid_type' });
          if (!src || !dst) return sendJson(res, 400, { ok:false, error: 'missing_cid' });
          let publisher_key_id = null;
          if (verify && pub_pem) {
            try {
              const { keyIdFromPubPEM } = await import('../ku/sign_v1.mjs');
              const kid = await keyIdFromPubPEM(pub_pem);
              const tr = await trustManager.isKeyTrusted(kid);
              if (!tr.trusted) return sendJson(res, 403, { ok:false, error: 'edge_untrusted', reason: tr.reason });
              publisher_key_id = kid;
            } catch (e) {
              const tm = await loadTrust().catch(()=>({mode:'warn'}));
              if (tm?.mode === 'enforce') return sendJson(res, 400, { ok:false, error: 'edge_verify_failed', reason: String(e) });
              // warn: proceed without publisher_key_id
            }
          }
          const changes = edgesStore.insert(src, dst, type, publisher_key_id);
          metrics.edgesInsertCount = (metrics.edgesInsertCount || 0) + (changes ? 1 : 0);
          try { broadcastEdge({ src, dst, edge_type: type }); } catch {}
          return sendJson(res, 200, { ok:true, stored: true, inserted: !!changes });
        } catch (e) {
          await appendLog({ evt:'edges_error', msg:String(e) })
          return sendJson(res, 400, { ok:false, error: 'bad_edges_request', reason: String(e) });
        }
      }
      if (req.method === 'GET' && url.pathname.startsWith('/edges/')) {
        const cid = decodeURIComponent(url.pathname.substring('/edges/'.length));
        const dir = url.searchParams.get('direction') || 'out';
        const type = url.searchParams.get('type') || null;
        let list;
        if (dir === 'in') list = edgesStore.listIncoming(cid, type);
        else list = edgesStore.listOutgoing(cid, type);
        return sendJson(res, 200, { edges: list });
      }
      if (req.method === 'GET' && url.pathname.startsWith('/graph/')) {
        const cid = decodeURIComponent(url.pathname.substring('/graph/'.length));
        const depth = Number(url.searchParams.get('depth') || 2);
        metrics.graphReqCount = (metrics.graphReqCount || 0) + 1;
        const vis = new Set([cid]); const q = [[cid,0]]; const out = [];
        while (q.length) {
          const [cur, d] = q.shift(); if (d === depth) continue;
          const edges = edgesStore.listOutgoing(cur);
          for (const e of edges) { out.push({ src: cur, dst: e.dst, type: e.type }); if (!vis.has(e.dst)) { vis.add(e.dst); q.push([e.dst, d+1]); } }
        }
        return sendJson(res, 200, { start: cid, depth, edges: out });
      }
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (req.method === 'GET' && url.pathname === '/live') {
        res.statusCode = 204; // No Content: fastest possible response
        res.end();
        return;
      }
      if (req.method === 'GET' && url.pathname === '/ready') {
        try {
          const stats = await storage.getStatistics();
          const dbRead = metrics.db.read.toJSON();
          const dbWrite = metrics.db.write.toJSON();
          return sendJson(res, 200, {
            ok: true,
            sqlite: 'open',
            db_read_ms: dbRead.p50 ?? 0,
            db_write_ms: dbWrite.p50 ?? 0,
            ws_clients: metrics.ws.clients,
            queue_len: metrics.gauges.queue_len
          });
        } catch (e) {
          return sendJson(res, 503, { ok: false, error: e.message });
        }
      }
      if (req.method === 'GET' && url.pathname === '/health') return handleHealth(req, res);
      if (req.method === 'POST' && url.pathname === '/publish') return handlePublish(req, res);
      if (req.method === 'POST' && url.pathname === '/verify') return handleVerify(req, res);
      if (req.method === 'GET' && url.pathname === '/metrics') {
        try {
          const fmt = url.searchParams.get('format');
          try { metrics.outbox.ready = outbox.getReady(1).length; } catch { metrics.outbox.ready = 0 }
          if (fmt === 'prom') {
            let prom = '';
            try { prom = typeof metrics.toProm === 'function' ? metrics.toProm() : '' } catch {}
            return sendText(res, 200, prom, { 'content-type': 'text/plain; version=0.0.4' });
          }
          let snap = {};
          try { snap = typeof metrics.snapshot === 'function' ? metrics.snapshot() : {} } catch {}
          return sendJson(res, 200, snap);
        } catch (e) {
          await appendLog({ evt: 'metrics_error', msg: String(e) });
          return sendText(res, 200, '# metrics temporarily unavailable\n', { 'content-type': 'text/plain; charset=utf-8' });
        }
      }
      if (req.method === 'GET' && url.pathname.startsWith('/ku/')) {
        const cid = decodeURIComponent(url.pathname.substring(4));
        const view = url.searchParams.get('view') || 'json';
        return handleGetKU(req, res, cid, view);
      }
      if (req.method === 'POST' && url.pathname === '/edges') {
        const buf = await readBody(req);
        try {
          const { src, dst, type, pub_pem, verify } = JSON.parse(buf.toString('utf8')) || {};
          const allowed = new Set(['applies_to','verifies','supersedes','conflicts_with']);
          if (!allowed.has(type)) return sendJson(res, 400, { error: 'invalid_type' });
          if (!src || !dst) return sendJson(res, 400, { error: 'missing_cid' });
          let publisher_key_id = null;
          if (verify && pub_pem) {
            const { keyIdFromPubPEM } = await import('../ku/sign_v1.mjs');
            const kid = await keyIdFromPubPEM(pub_pem);
            const tr = await trustManager.isKeyTrusted(kid);
            if (!tr.trusted) return sendJson(res, 403, { error: 'untrusted_key', reason: tr.reason });
            publisher_key_id = kid;
          }
          const changes = edgesStore.insert(src, dst, type, publisher_key_id);
          metrics.edgesInsertCount = (metrics.edgesInsertCount || 0) + (changes ? 1 : 0);
          if (changes) broadcastEdge({ src, dst, edge_type: type });
          return sendJson(res, 200, { stored: true, inserted: !!changes });
        } catch (e) {
          return sendJson(res, 400, { error: 'bad_request', message: e.message });
        }
      }
      if (req.method === 'GET' && url.pathname.startsWith('/edges/')) {
        const cid = decodeURIComponent(url.pathname.substring('/edges/'.length));
        const dir = url.searchParams.get('direction') || 'out';
        const type = url.searchParams.get('type') || null;
        let list;
        if (dir === 'in') list = edgesStore.listIncoming(cid, type);
        else list = edgesStore.listOutgoing(cid, type);
        return sendJson(res, 200, { edges: list });
      }
      if (req.method === 'GET' && url.pathname.startsWith('/graph/')) {
        const cid = decodeURIComponent(url.pathname.substring('/graph/'.length));
        const depth = Number(url.searchParams.get('depth') || 2);
        metrics.graphReqCount = (metrics.graphReqCount || 0) + 1;
        const vis = new Set([cid]); const q = [[cid,0]]; const out = [];
        while (q.length) {
          const [cur, d] = q.shift(); if (d === depth) continue;
          const edges = edgesStore.listOutgoing(cur);
          for (const e of edges) { out.push({ src: cur, dst: e.dst, type: e.type }); if (!vis.has(e.dst)) { vis.add(e.dst); q.push([e.dst, d+1]); } }
        }
        return sendJson(res, 200, { start: cid, depth, edges: out });
      }
      if (req.method === 'POST' && url.pathname === '/trust/reload') {
        try {
          await trustManager.reload();
          return sendJson(res, 200, { reloaded: true });
        } catch (error) {
          return sendJson(res, 500, { error: 'reload_failed', message: error.message });
        }
      }
      if (req.method === 'GET' && url.pathname === '/admin/consistency') {
        try {
          const consistencyResult = await checkConsistency();
          metrics.setConsistencyMismatches(consistencyResult.mismatches);
          return sendJson(res, 200, consistencyResult);
        } catch (error) {
          return sendJson(res, 500, { error: 'consistency_check_failed', message: error.message });
        }
      }
      if (req.method === 'POST' && url.pathname === '/admin/drain') {
        try {
          const ready = outbox.getReady(1000); // Get up to 1000 items
          let drained = 0;
          for (const item of ready) {
            outbox.markSent(item.seq);
            drained++;
            metrics.incrementOutboxDelivery();
          }
          await appendLog({ evt: 'admin_drain', drained });
          return sendJson(res, 200, { drained, broadcast_enabled: BROADCAST_ENABLED });
        } catch (error) {
          return sendJson(res, 500, { error: 'drain_failed', message: error.message });
        }
      }

      return sendJson(res, 404, { error: 'not_found' });

    } catch (e) {
      return sendJson(res, 500, { error: 'server_error' });
    }
  });

  // attach WS /events
  const authCfg = {
    origin: process.env.SGN_EVENTS_ORIGIN || undefined,
    bearer: process.env.SGN_EVENTS_BEARER || undefined,
  };
  // Auth is opt-in: only enforce checks if env set
  const wantAuthOrigin = !!process.env.SGN_EVENTS_ORIGIN;
  const wantAuthBearer = !!process.env.SGN_EVENTS_BEARER;
  const auth = {
    origin: wantAuthOrigin ? process.env.SGN_EVENTS_ORIGIN : undefined,
    bearer: wantAuthBearer ? process.env.SGN_EVENTS_BEARER : undefined,
  };
  const { wss, broadcastKU, broadcastEdge: _broadcastEdge, clients, close: eventsCloseFn } = createEventsServer({ server, path: '/events', auth, onLog: appendLog });
  eventsBroadcastKU = broadcastKU;
  broadcastEdge = _broadcastEdge; // Set the actual function
  eventsClose = eventsCloseFn;
  wss.on('connection', () => { metrics.ws.clients = clients.size });
  wss.on('close',       () => { metrics.ws.clients = clients.size });

  server.listen(PORT, () => {
    console.log(`SGN Daemon listening on http://localhost:${PORT}`);
    appendLog({ evt: 'daemon_listen', port: PORT });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => { console.error(err); process.exit(1); });
}
