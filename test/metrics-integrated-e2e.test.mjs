import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'

const PORT = 8993
let proc

before(async () => {
  try { await fs.rm('./tmp-metrics.db') } catch {}
  proc = spawn(process.execPath, ['src/daemon/daemon.mjs'], {
    env: { ...process.env, SGN_HTTP_PORT: String(PORT), SGN_DB: './tmp-metrics.db' },
    stdio: 'inherit'
  })
  // Wait for /health to be ready
  for (let i=0;i<20;i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/health`)
      if (r.ok) break
    } catch {}
    await new Promise(r => setTimeout(r, 150))
  }
})

after(async () => { try { proc?.kill() } catch {} })

async function jget(p) {
  const r = await fetch(`http://localhost:${PORT}${p}`)
  return { status: r.status, json: await r.json() }
}
async function jpost(p, body) {
  const r = await fetch(`http://localhost:${PORT}${p}`, { method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify(body) })
  return { status: r.status, json: await r.json() }
}

test('metrics updates after publish/verify', async () => {
  const m0 = await jget('/metrics'); assert.equal(m0.status, 200)
  const ku = { type:'ku.patch', schema_id:'ku.v1', payload:{ title:'m1' }, parents:[], sources:[], tests:[], provenance:{ agent_pubkey:null }, tags:[] }
  let res = await jpost('/publish', { ku, verify:false }); assert.equal(res.status, 200)
  const m1 = await jget('/metrics'); assert.equal(m1.status, 200)
  assert.ok((m1.json.http.publish.count ?? 0) >= 1)
})

