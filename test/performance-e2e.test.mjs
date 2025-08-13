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
import fs from 'node:fs/promises'

let proc
const PORT = 8885
const DB = './tmp-performance.db'

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
  try { await fs.rm('./data', { recursive: true }) } catch {}
  
  proc = spawn(process.execPath, [DAEMON], {
    env: { ...process.env, SGN_HTTP_PORT: String(PORT), SGN_DB: DB },
    stdio: 'inherit', cwd: CWD,
  })
  await waitForHealth()
})

after(async () => {
  try { proc?.kill() } catch {}
  try { await fs.rm(DB) } catch {}
  try { await fs.rm('./data', { recursive: true }) } catch {}
})

test('operational endpoints: /live responds quickly', async () => {
  const start = Date.now()
  const res = await fetch(`http://localhost:${PORT}/live`)
  const end = Date.now()

  assert.equal(res.status, 204) // No Content for fastest response
  assert.ok(end - start < 20, `/live should respond in <20ms, got ${end - start}ms`)
})

test('operational endpoints: /ready includes system status', async () => {
  const start = Date.now()
  const res = await fetch(`http://localhost:${PORT}/ready`)
  const end = Date.now()
  const json = await res.json()
  
  assert.equal(res.status, 200)
  assert.ok(json.ok)
  assert.equal(json.sqlite, 'open')
  assert.ok(typeof json.db_read_ms === 'number')
  assert.ok(typeof json.db_write_ms === 'number')
  assert.ok(typeof json.ws_clients === 'number')
  assert.ok(typeof json.queue_len === 'number')
  assert.ok(end - start < 50, `/ready should respond in <50ms, got ${end - start}ms`)
})

test('performance: batch publish maintains reasonable latency', async () => {
  const COUNT = 100
  const results = []
  
  // Warm up
  for (let i = 0; i < 5; i++) {
    const ku = { type:'ku.patch', schema_id:'ku.v1', payload:{title:`warmup-${i}`}, parents:[], sources:[], tests:[], provenance:{agent_pubkey:null}, tags:[] }
    await jpost('/publish', { ku, verify: false })
  }
  
  // Benchmark
  const startTime = Date.now()
  for (let i = 0; i < COUNT; i++) {
    const ku = { type:'ku.patch', schema_id:'ku.v1', payload:{title:`perf-${i}`}, parents:[], sources:[], tests:[], provenance:{agent_pubkey:null}, tags:[] }
    const start = Date.now()
    const res = await jpost('/publish', { ku, verify: false })
    const end = Date.now()
    results.push({ status: res.status, latency: end - start })
  }
  const endTime = Date.now()
  
  // Analyze
  const latencies = results.filter(r => r.status === 200).map(r => r.latency).sort((a,b) => a-b)
  const p50 = latencies[Math.floor(latencies.length * 0.5)]
  const p95 = latencies[Math.floor(latencies.length * 0.95)]
  const totalTime = endTime - startTime
  const throughput = COUNT / totalTime * 1000
  
  console.log(`Performance: ${COUNT} requests in ${totalTime}ms (${throughput.toFixed(1)} req/s)`)
  console.log(`Latency p50: ${p50}ms, p95: ${p95}ms`)
  
  // Reasonable expectations for local testing
  assert.ok(p50 < 200, `p50 should be <200ms, got ${p50}ms`)
  assert.ok(p95 < 1000, `p95 should be <1000ms, got ${p95}ms`)
  assert.ok(results.every(r => r.status === 200), 'All requests should succeed')
})

test('metrics: db performance metrics are exposed', async () => {
  // Generate some DB activity
  const ku = { type:'ku.patch', schema_id:'ku.v1', payload:{title:'metrics-test'}, parents:[], sources:[], tests:[], provenance:{agent_pubkey:null}, tags:[] }
  await jpost('/publish', { ku, verify: false })
  
  const res = await fetch(`http://localhost:${PORT}/metrics?format=prom`)
  const text = await res.text()
  
  // Check DB metrics are present
  assert.ok(text.includes('sgn_db_read_p50'), 'Should include db_read_p50 metric')
  assert.ok(text.includes('sgn_db_write_p50'), 'Should include db_write_p50 metric')
  assert.ok(text.includes('sgn_db_read_p95'), 'Should include db_read_p95 metric')
  assert.ok(text.includes('sgn_db_write_p95'), 'Should include db_write_p95 metric')
  assert.ok(text.includes('sgn_outbox_queue_len'), 'Should include queue_len metric')
  
  // Check values are reasonable
  const dbReadP50 = Number((text.match(/^sgn_db_read_p50\s+(\d+(?:\.\d+)?)/m)||[])[1]||0)
  const dbWriteP50 = Number((text.match(/^sgn_db_write_p50\s+(\d+(?:\.\d+)?)/m)||[])[1]||0)
  
  assert.ok(dbReadP50 >= 0, 'db_read_p50 should be non-negative')
  assert.ok(dbWriteP50 >= 0, 'db_write_p50 should be non-negative')
})

test('health endpoint includes performance metrics', async () => {
  const res = await fetch(`http://localhost:${PORT}/health`)
  const json = await res.json()
  
  assert.equal(res.status, 200)
  assert.equal(json.status, 'healthy')
  assert.ok(typeof json.db_read_ms === 'number')
  assert.ok(typeof json.db_write_ms === 'number')
  assert.ok(typeof json.ws_clients === 'number')
  assert.ok(typeof json.queue_len === 'number')
})
