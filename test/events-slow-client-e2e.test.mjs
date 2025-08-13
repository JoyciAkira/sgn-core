import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)
const DAEMON = resolve(__dirname, '../src/daemon/daemon.mjs')
const CWD    = resolve(__dirname, '..')

import { test, before, after } from 'node:test'

// Reduce console spam for CI/test runner stability
if (process.env.CI || process.env.SGN_TEST_SILENT) {
  console.log = () => {};
}
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'

let proc, WebSocket
const PORT = 8997

async function waitForHealth() {
  const t0 = Date.now()
  while (Date.now() - t0 < 4000) {
    try { const r = await fetch(`http://localhost:${PORT}/health`); if (r.ok) return }
    catch {}
    await new Promise(r=>setTimeout(r,100))
  }
  throw new Error('daemon not healthy in time')
}

before(async () => {
  WebSocket = (await import('ws')).default
  proc = spawn(process.execPath, [DAEMON], {
    env: { ...process.env, SGN_HTTP_PORT: String(PORT), SGN_DB: './tmp-events-slow.db' },
    stdio: 'inherit',
    cwd: CWD,
  })
  await waitForHealth()
})

after(async () => { try { proc?.kill() } catch {} })

async function jpostRetry(p, body, tries=5) {
  let d = 120;
  for (let i = 0; i < tries; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}${p}`, {
        method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(body)
      })
      if (r.status === 200 || r.status === 403) return { status: r.status, json: await r.json() }
    } catch {}
    if (i < tries - 1) {
      await new Promise(r => setTimeout(r, d));
      d = Math.min(800, d * 1.6 + Math.random() * 40);
    }
  }
  throw new Error('jpostRetry exhausted')
}

async function jpost(p, body) { return jpostRetry(p, body, 3) }

test('slow client: receive ku, health keeps flowing, ack after delay', async () => {
  const ws = new WebSocket(`ws://localhost:${PORT}/events`)
  await new Promise((res,rej)=>{ const t=setTimeout(()=>rej(new Error('ws-timeout')),1500); ws.on('open',()=>{clearTimeout(t);res()}) })
  let healthCount = 0, kuCid
  ws.on('message', (buf) => {
    const msg = JSON.parse(String(buf))
    if (msg.type === 'health') healthCount++
    if (msg.type === 'ku' && msg.cid && !kuCid) {
      kuCid = msg.cid
      setTimeout(() => {
        ws.send(JSON.stringify({ type:'ack', cid: kuCid }))
      }, 1200)
    }
  })

  const ku = { type:'ku.patch', schema_id:'ku.v1', payload:{title:'slow'}, parents:[], sources:[], tests:[], provenance:{agent_pubkey:null}, tags:[] }
  const res = await jpost('/publish', { ku, verify:false })
  assert.equal(res.status, 200)

  const t0 = Date.now()
  let acked = 0, delivered = 0
  while (Date.now() - t0 < 5000) {
    const prom = await fetch(`http://localhost:${PORT}/metrics?format=prom`).then(r=>r.text())
    acked = Number((prom.match(/^sgn_net_acked\s+(\d+)/m)||[])[1]||0)
    delivered = Number((prom.match(/^sgn_net_delivered\s+(\d+)/m)||[])[1]||0)
    if (acked >= 1 && delivered >= 1) break
    await new Promise(r=>setTimeout(r,150))
  }
  assert.ok(delivered >= 1, 'delivered >= 1')
  assert.ok(acked >= 1, 'acked >= 1')
  assert.ok(healthCount >= 1, 'health must have arrived while delaying ack')
  ws.close()
})

