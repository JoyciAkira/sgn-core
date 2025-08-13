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

let proc
const PORT = 8884
const DB = './tmp-edges-graph.db'
const TRUST_FILE = './tmp-edges-trust.json'

async function waitForHealth() {
  const t0 = Date.now()
  while (Date.now() - t0 < 4000) {
    try { const r = await fetch(`http://localhost:${PORT}/health`); if (r.ok) return }
    catch {}
    await new Promise(r=>setTimeout(r,100))
  }
  throw new Error('daemon not healthy')
}

async function jpost(path, body) {
  const r = await fetch(`http://localhost:${PORT}${path}`, {
    method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(body)
  })
  return { status: r.status, json: await r.json() }
}

before(async () => {
  try { await fs.rm(DB) } catch {}
  try { await fs.rm(TRUST_FILE) } catch {}
  try { await fs.rm('./data', { recursive: true }) } catch {}
  
  proc = spawn(process.execPath, [DAEMON], {
    env: { ...process.env, SGN_HTTP_PORT: String(PORT), SGN_DB: DB, SGN_TRUST: TRUST_FILE },
    stdio: 'inherit', cwd: CWD,
  })
  await waitForHealth()
})

after(async () => {
  try { proc?.kill() } catch {}
  try { await fs.rm(DB) } catch {}
  try { await fs.rm(TRUST_FILE) } catch {}
  try { await fs.rm('./data', { recursive: true }) } catch {}
})

test('edges: POST /edges stores edge and returns inserted status', async () => {
  const edge = { src: 'bafyreiabc123', dst: 'bafyreidef456', type: 'verifies' }
  const res = await jpost('/edges', edge)
  
  assert.equal(res.status, 200)
  assert.ok(res.json.stored)
  assert.ok(res.json.inserted)
  
  // Second insert should be idempotent
  const res2 = await jpost('/edges', edge)
  assert.equal(res2.status, 200)
  assert.ok(res2.json.stored)
  assert.ok(!res2.json.inserted) // Already exists
})

test('edges: GET /edges/:cid lists outgoing and incoming edges', async () => {
  const src = 'bafyreisrc789'
  const dst1 = 'bafyreidst111'
  const dst2 = 'bafyreidst222'
  
  // Add edges
  await jpost('/edges', { src, dst: dst1, type: 'applies_to' })
  await jpost('/edges', { src, dst: dst2, type: 'supersedes' })
  await jpost('/edges', { src: dst1, dst: src, type: 'conflicts_with' })
  
  // List outgoing
  const outRes = await fetch(`http://localhost:${PORT}/edges/${src}?direction=out`)
  const outData = await outRes.json()
  assert.equal(outData.edges.length, 2)
  assert.ok(outData.edges.some(e => e.dst === dst1 && e.type === 'applies_to'))
  assert.ok(outData.edges.some(e => e.dst === dst2 && e.type === 'supersedes'))
  
  // List incoming
  const inRes = await fetch(`http://localhost:${PORT}/edges/${src}?direction=in`)
  const inData = await inRes.json()
  assert.equal(inData.edges.length, 1)
  assert.equal(inData.edges[0].src, dst1)
  assert.equal(inData.edges[0].type, 'conflicts_with')
})

test('edges: GET /graph/:cid returns BFS traversal', async () => {
  const root = 'bafyreiroot000'
  const child1 = 'bafyreichild01'
  const child2 = 'bafyreichild02'
  const grandchild = 'bafyreigrand01'
  
  // Build graph: root -> child1 -> grandchild, root -> child2
  await jpost('/edges', { src: root, dst: child1, type: 'applies_to' })
  await jpost('/edges', { src: root, dst: child2, type: 'verifies' })
  await jpost('/edges', { src: child1, dst: grandchild, type: 'supersedes' })
  
  const graphRes = await fetch(`http://localhost:${PORT}/graph/${root}?depth=2`)
  const graphData = await graphRes.json()
  
  assert.equal(graphData.start, root)
  assert.equal(graphData.depth, 2)
  assert.equal(graphData.edges.length, 3)
  
  // Check edges are present
  assert.ok(graphData.edges.some(e => e.src === root && e.dst === child1 && e.type === 'applies_to'))
  assert.ok(graphData.edges.some(e => e.src === root && e.dst === child2 && e.type === 'verifies'))
  assert.ok(graphData.edges.some(e => e.src === child1 && e.dst === grandchild && e.type === 'supersedes'))
})

test('edges: invalid type returns 400', async () => {
  const res = await jpost('/edges', { src: 'bafyreiabc', dst: 'bafyreidef', type: 'invalid_type' })
  assert.equal(res.status, 400)
  assert.equal(res.json.error, 'invalid_type')
})

test.skip('edges: events broadcast edge on insert', async () => {
  // Use unique CIDs for this test
  const uniqueSrc = `bafyreitest${Date.now()}src`
  const uniqueDst = `bafyreitest${Date.now()}dst`

  const ws = new WebSocket(`ws://localhost:${PORT}/events`)
  await new Promise((res,rej)=>{ const t=setTimeout(()=>rej(new Error('ws-timeout')),1500); ws.on('open',()=>{clearTimeout(t);res()}) })

  let edgeReceived = false
  ws.on('message', (buf) => {
    const msg = JSON.parse(String(buf))
    if (msg.type === 'edge' && msg.src === uniqueSrc && msg.dst === uniqueDst) {
      edgeReceived = true
      // Send ACK
      try { ws.send(JSON.stringify({ type:'ack', cid: `${msg.src}-${msg.dst}` })) } catch {}
    }
  })

  // Insert edge - should trigger broadcast
  const edgeRes = await jpost('/edges', { src: uniqueSrc, dst: uniqueDst, type: 'verifies' })

  // Wait for event
  await new Promise(r=>setTimeout(r,300))

  assert.ok(edgeReceived, 'Should receive edge event via WebSocket')
  ws.close()
})

test('edges: metrics increment on insert', async () => {
  const promRes = await fetch(`http://localhost:${PORT}/metrics?format=prom`)
  const promText = await promRes.text()
  const beforeCount = Number((promText.match(/^sgn_edges_insert_count\s+(\d+)/m)||[])[1]||0)
  
  // Insert new edge
  await jpost('/edges', { src: 'bafyreimetrics1', dst: 'bafyreimetrics2', type: 'applies_to' })
  
  const promRes2 = await fetch(`http://localhost:${PORT}/metrics?format=prom`)
  const promText2 = await promRes2.text()
  const afterCount = Number((promText2.match(/^sgn_edges_insert_count\s+(\d+)/m)||[])[1]||0)
  
  assert.ok(afterCount > beforeCount, 'edges_insert_count should increment')
})
