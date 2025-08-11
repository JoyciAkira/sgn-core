import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'

const PORT = 8994
let proc

before(async () => {
  try { await fs.rm('./tmp-metrics-prom.db') } catch {}
  proc = spawn(process.execPath, ['src/daemon/daemon.mjs'], {
    env: { ...process.env, SGN_HTTP_PORT: String(PORT), SGN_DB: './tmp-metrics-prom.db' },
    stdio: 'inherit'
  })
  await new Promise(r => setTimeout(r, 350))
})

after(async () => { try { proc?.kill() } catch {} })

async function getProm() {
  const r = await fetch(`http://localhost:${PORT}/metrics?format=prom`)
  return { status: r.status, text: await r.text() }
}
async function jpost(p, body) {
  const r = await fetch(`http://localhost:${PORT}${p}`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(body) })
  return { status: r.status, json: await r.json() }
}

function readCounter(text, name) {
  const m = text.match(new RegExp(`^${name}\\s+(\\d+(?:\\.\\d+)?)$`, 'm'))
  return m ? Number(m[1]) : null
}

test('prometheus exposition increments after publish', async () => {
  const p0 = await getProm(); assert.equal(p0.status, 200)
  const c0 = readCounter(p0.text, 'sgn_http_publish_count') || 0

  const ku = { type:'ku.patch', schema_id:'ku.v1', payload:{ title:'prome2e' }, parents:[], sources:[], tests:[], provenance:{ agent_pubkey:null }, tags:[] }
  let res = await jpost('/publish', { ku, verify:false }); assert.equal(res.status, 200)

  const p1 = await getProm(); assert.equal(p1.status, 200)
  const c1 = readCounter(p1.text, 'sgn_http_publish_count') || 0
  assert.ok(c1 >= c0 + 1)
  // basic presence of gauges
  assert.ok(p1.text.includes('sgn_http_publish_p50'))
  assert.ok(p1.text.includes('sgn_http_publish_p95'))
})

