import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
let proc, WebSocket
const PORT = 8995

async function waitForHealth(port, timeoutMs=3000, stepMs=100) {
  const t0 = Date.now()
  while (Date.now() - t0 < timeoutMs) {
    try {
      const r = await fetch(`http://localhost:${port}/health`)
      if (r.ok) return true
    } catch {}
    await new Promise(r => setTimeout(r, stepMs))
  }
  throw new Error('daemon not healthy in time')
}

before(async () => {
  WebSocket = (await import('ws')).default
  proc = spawn(process.execPath, ['src/daemon/daemon.mjs'], {
    env: { ...process.env, SGN_HTTP_PORT: String(PORT), SGN_DB: './tmp-events.db' },
    stdio: 'inherit'
  })
  await waitForHealth(PORT, 4000, 100) // evita ECONNREFUSED
})
after(async ()=>{
  try{
    proc?.kill()
    await new Promise(r => setTimeout(r, 100)) // wait for clean shutdown
  }catch{}
})

async function jpost(p, body){
  const r = await fetch(`http://localhost:${PORT}${p}`, {
    method:'POST', headers:{'content-type':'application/json'},
    body: JSON.stringify(body)
  })
  return { status: r.status, json: await r.json() }
}

test('events: receive ku then ack, metrics reflect it', async () => {
  const ws = new WebSocket(`ws://localhost:${PORT}/events`)
  await new Promise((res,rej)=>{ const t=setTimeout(()=>rej(new Error('ws-timeout')),1500); ws.on('open',()=>{clearTimeout(t);res()}) })

  const gotKU = new Promise((resolve)=> ws.on('message', (buf)=>{
    try {
      const msg = JSON.parse(String(buf))
      if (msg.type==='ku' && msg.cid){
        ws.send(JSON.stringify({ type:'ack', cid: msg.cid }))
        resolve(msg.cid)
      }
    } catch {}
  }))

  const ku = { type:'ku.patch', schema_id:'ku.v1', payload:{title:'ev1'}, parents:[], sources:[], tests:[], provenance:{agent_pubkey:null}, tags:[] }
  const res = await jpost('/publish', { ku, verify:false })
  assert.equal(res.status, 200)

  const cid = await Promise.race([gotKU, new Promise((_,rej)=>setTimeout(()=>rej(new Error('no-ku')),1200))])
  assert.ok(cid)

  const prom = await fetch(`http://localhost:${PORT}/metrics?format=prom`).then(r=>r.text())
  const acked = Number((prom.match(/^sgn_net_acked\s+(\d+)/m)||[])[1]||0)
  const delivered = Number((prom.match(/^sgn_net_delivered\s+(\d+)/m)||[])[1]||0)
  assert.ok(delivered >= 1)
  assert.ok(acked >= 1)
  ws.close()
})
