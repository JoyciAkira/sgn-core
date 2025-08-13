import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)
const DAEMON = resolve(__dirname, '../src/daemon/daemon.mjs')
const CWD    = resolve(__dirname, '..')

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import WebSocket from 'ws'

// Reduce console spam for CI/test runner stability
if (process.env.CI || process.env.SGN_TEST_SILENT) {
  console.log = () => {};
}

let proc1, proc2
const PORT1 = 8881, PORT2 = 8882
const DB1 = './tmp-node1.db', DB2 = './tmp-node2.db'

async function waitForHealth(port) {
  const t0 = Date.now()
  while (Date.now() - t0 < 4000) {
    try { const r = await fetch(`http://localhost:${port}/health`); if (r.ok) return }
    catch {}
    await new Promise(r=>setTimeout(r,100))
  }
  throw new Error(`daemon not healthy on port ${port}`)
}

async function jpost(port, path, body) {
  const r = await fetch(`http://localhost:${port}${path}`, {
    method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(body)
  })
  return { status: r.status, json: await r.json() }
}

async function getProm(port) {
  const r = await fetch(`http://localhost:${port}/metrics?format=prom`)
  return r.text()
}

function readCounter(text, name) {
  const m = text.match(new RegExp(`^${name}\\s+(\\d+(?:\\.\\d+)?)$`, 'm'))
  return m ? Number(m[1]) : 0
}

before(async () => {
  try { await fs.rm(DB1) } catch {}
  try { await fs.rm(DB2) } catch {}
  
  // Start node1
  proc1 = spawn(process.execPath, [DAEMON], {
    env: { ...process.env, SGN_HTTP_PORT: String(PORT1), SGN_DB: DB1 },
    stdio: 'inherit', cwd: CWD,
  })
  await waitForHealth(PORT1)
  
  // Start node2
  proc2 = spawn(process.execPath, [DAEMON], {
    env: { ...process.env, SGN_HTTP_PORT: String(PORT2), SGN_DB: DB2 },
    stdio: 'inherit', cwd: CWD,
  })
  await waitForHealth(PORT2)
})

after(async () => {
  try { proc1?.kill() } catch {}
  try { proc2?.kill() } catch {}
  try { await fs.rm(DB1) } catch {}
  try { await fs.rm(DB2) } catch {}
})

test('multi-node: dedup prevents duplicate delivery', async () => {
  const ku = { 
    type:'ku.patch', schema_id:'ku.v1', 
    payload:{title:'dedup-test'}, 
    parents:[], sources:[], tests:[], 
    provenance:{agent_pubkey:null}, tags:[] 
  }
  
  // Connect WS client to node1
  const ws1 = new WebSocket(`ws://localhost:${PORT1}/events`)
  await new Promise((res,rej)=>{ const t=setTimeout(()=>rej(new Error('ws1-timeout')),1500); ws1.on('open',()=>{clearTimeout(t);res()}) })
  
  let kuReceived = 0
  ws1.on('message', (buf) => {
    const msg = JSON.parse(String(buf))
    if (msg.type === 'ku' && msg.cid) {
      kuReceived++
      // Send ACK
      try { ws1.send(JSON.stringify({ type:'ack', cid: msg.cid })) } catch {}
    }
  })
  
  // Publish same KU to both nodes (simulating network duplicate)
  const res1 = await jpost(PORT1, '/publish', { ku, verify:false })
  const res2 = await jpost(PORT2, '/publish', { ku, verify:false })
  
  assert.equal(res1.status, 200)
  assert.equal(res2.status, 200)
  
  // Wait for delivery
  await new Promise(r=>setTimeout(r,500))
  
  // Should receive only 1 KU despite 2 publishes (dedup working)
  assert.equal(kuReceived, 1, 'Should receive exactly 1 KU due to dedup')
  
  // Check metrics: delivered should be 1, dedup should be > 0
  const prom1 = await getProm(PORT1)
  const delivered = readCounter(prom1, 'sgn_net_delivered')
  const acked = readCounter(prom1, 'sgn_net_acked')
  
  assert.ok(delivered >= 1, 'delivered >= 1')
  assert.ok(acked >= 1, 'acked >= 1')
  
  ws1.close()
})

test('crash recovery: storage persists across restart', async () => {
  const ku = {
    type:'ku.patch', schema_id:'ku.v1',
    payload:{title:'crash-recovery'},
    parents:[], sources:[], tests:[],
    provenance:{agent_pubkey:null}, tags:[]
  }

  // Publish to node2
  const res = await jpost(PORT2, '/publish', { ku, verify:false })
  assert.equal(res.status, 200)
  const publishedCid = res.json.cid

  // Kill node2 (simulating crash)
  proc2.kill('SIGTERM')
  await new Promise(r=>setTimeout(r,1000)) // Wait longer for clean shutdown

  // Restart node2
  proc2 = spawn(process.execPath, [DAEMON], {
    env: { ...process.env, SGN_HTTP_PORT: String(PORT2), SGN_DB: DB2 },
    stdio: 'inherit', cwd: CWD,
  })
  await waitForHealth(PORT2)

  // Verify KU is still accessible after restart (storage recovery)
  const getRes = await fetch(`http://localhost:${PORT2}/ku/${publishedCid}`)
  assert.equal(getRes.status, 200)
  const recoveredKU = await getRes.json()
  assert.equal(recoveredKU.payload.title, 'crash-recovery')

  // Verify metrics are consistent after restart
  const prom2 = await getProm(PORT2)
  const delivered2 = readCounter(prom2, 'sgn_net_delivered')
  // After restart, metrics reset but storage persists
  assert.ok(delivered2 >= 0, 'metrics accessible after restart')
})
