#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const DAEMON = resolve(__dirname, '../src/daemon/daemon.mjs')
const CWD = resolve(__dirname, '..')

const PORT = 8999
const COUNT = process.argv[2] ? Number(process.argv[2]) : 1000
const BATCH_SIZE = 50

console.log(`🚀 Benchmarking ${COUNT} publish requests (batches of ${BATCH_SIZE})`)

async function waitForHealth() {
  const t0 = Date.now()
  while (Date.now() - t0 < 5000) {
    try { 
      const r = await fetch(`http://localhost:${PORT}/health`)
      if (r.ok) return
    } catch {}
    await new Promise(r=>setTimeout(r,100))
  }
  throw new Error('daemon not healthy in time')
}

async function publishKU(i) {
  const ku = {
    type: 'ku.patch',
    schema_id: 'ku.v1',
    payload: { title: `bench-${i}`, content: `Benchmark KU ${i}` },
    parents: [],
    sources: [],
    tests: [],
    provenance: { agent_pubkey: null },
    tags: [`bench:${i}`]
  }
  
  const start = Date.now()
  try {
    const r = await fetch(`http://localhost:${PORT}/publish`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ku, verify: false })
    })
    const end = Date.now()
    const json = await r.json()
    return { status: r.status, latency: end - start, cid: json.cid }
  } catch (e) {
    return { status: 0, latency: Date.now() - start, error: e.message }
  }
}

async function getMetrics() {
  try {
    const r = await fetch(`http://localhost:${PORT}/metrics?format=prom`)
    const text = await r.text()
    const p50 = Number((text.match(/^sgn_http_publish_p50\s+(\d+(?:\.\d+)?)/m)||[])[1]||0)
    const p95 = Number((text.match(/^sgn_http_publish_p95\s+(\d+(?:\.\d+)?)/m)||[])[1]||0)
    const delivered = Number((text.match(/^sgn_net_delivered\s+(\d+)/m)||[])[1]||0)
    const acked = Number((text.match(/^sgn_net_acked\s+(\d+)/m)||[])[1]||0)
    const dbReadP50 = Number((text.match(/^sgn_db_read_p50\s+(\d+(?:\.\d+)?)/m)||[])[1]||0)
    const dbWriteP50 = Number((text.match(/^sgn_db_write_p50\s+(\d+(?:\.\d+)?)/m)||[])[1]||0)
    const dbReadP95 = Number((text.match(/^sgn_db_read_p95\s+(\d+(?:\.\d+)?)/m)||[])[1]||0)
    const dbWriteP95 = Number((text.match(/^sgn_db_write_p95\s+(\d+(?:\.\d+)?)/m)||[])[1]||0)
    return { p50, p95, delivered, acked, dbReadP50, dbWriteP50, dbReadP95, dbWriteP95 }
  } catch {
    return { p50: 0, p95: 0, delivered: 0, acked: 0, dbReadP50: 0, dbWriteP50: 0, dbReadP95: 0, dbWriteP95: 0 }
  }
}

async function main() {
  // Start daemon
  console.log('Starting daemon...')
  const proc = spawn(process.execPath, [DAEMON], {
    env: { ...process.env, SGN_HTTP_PORT: String(PORT), SGN_DB: `./tmp-bench-${Date.now()}.db` },
    stdio: 'inherit',
    cwd: CWD
  })
  
  try {
    await waitForHealth()
    console.log('✅ Daemon ready')
    
    // Warm up
    console.log('Warming up...')
    await Promise.all(Array.from({length: 10}, (_, i) => publishKU(`warmup-${i}`)))
    
    // Benchmark
    console.log(`Starting benchmark: ${COUNT} requests`)
    const startTime = Date.now()
    const results = []
    
    for (let i = 0; i < COUNT; i += BATCH_SIZE) {
      const batch = []
      const batchEnd = Math.min(i + BATCH_SIZE, COUNT)
      
      for (let j = i; j < batchEnd; j++) {
        batch.push(publishKU(j))
      }
      
      const batchResults = await Promise.all(batch)
      results.push(...batchResults)
      
      if ((i + BATCH_SIZE) % 200 === 0) {
        console.log(`Progress: ${Math.min(i + BATCH_SIZE, COUNT)}/${COUNT}`)
      }
    }
    
    const endTime = Date.now()
    const totalTime = endTime - startTime
    
    // Analyze results
    const latencies = results.filter(r => r.status === 200).map(r => r.latency).sort((a,b) => a-b)
    const errors = results.filter(r => r.status !== 200)
    
    const p50 = latencies[Math.floor(latencies.length * 0.5)] || 0
    const p95 = latencies[Math.floor(latencies.length * 0.95)] || 0
    const p99 = latencies[Math.floor(latencies.length * 0.99)] || 0
    
    console.log('\n📊 Benchmark Results:')
    console.log(`Total time: ${totalTime}ms`)
    console.log(`Throughput: ${(COUNT / totalTime * 1000).toFixed(1)} req/s`)
    console.log(`Success rate: ${((COUNT - errors.length) / COUNT * 100).toFixed(1)}%`)
    console.log(`Latency p50: ${p50}ms`)
    console.log(`Latency p95: ${p95}ms`)
    console.log(`Latency p99: ${p99}ms`)
    if (errors.length > 0) console.log(`Errors: ${errors.length}`)
    
    // Get daemon metrics
    const metrics = await getMetrics()
    console.log('\n📈 Daemon Metrics:')
    console.log(`HTTP publish p50: ${metrics.p50}ms`)
    console.log(`HTTP publish p95: ${metrics.p95}ms`)
    console.log(`DB read p50: ${metrics.dbReadP50}ms`)
    console.log(`DB write p50: ${metrics.dbWriteP50}ms`)
    console.log(`DB read p95: ${metrics.dbReadP95}ms`)
    console.log(`DB write p95: ${metrics.dbWriteP95}ms`)
    console.log(`Delivered: ${metrics.delivered}`)
    console.log(`Acked: ${metrics.acked}`)
    console.log(`Delivery rate: ${metrics.delivered ? (metrics.acked / metrics.delivered).toFixed(3) : 'N/A'}`)
    
    // Acceptance criteria
    console.log('\n✅ Acceptance Criteria:')
    const p50Pass = p50 < 150
    const p95Pass = p95 < 800
    const deliveryPass = metrics.delivered === 0 || (metrics.acked / metrics.delivered) >= 0.999
    const errorPass = errors.length === 0
    
    console.log(`p50 < 150ms: ${p50Pass ? '✅' : '❌'} (${p50}ms)`)
    console.log(`p95 < 800ms: ${p95Pass ? '✅' : '❌'} (${p95}ms)`)
    console.log(`delivery ≥ 99.9%: ${deliveryPass ? '✅' : '❌'} (${metrics.delivered ? (metrics.acked / metrics.delivered * 100).toFixed(1) : 'N/A'}%)`)
    console.log(`no 5xx errors: ${errorPass ? '✅' : '❌'} (${errors.length} errors)`)
    
    const allPass = p50Pass && p95Pass && deliveryPass && errorPass
    console.log(`\n🎯 Overall: ${allPass ? '✅ PASS' : '❌ FAIL'}`)
    
    process.exit(allPass ? 0 : 1)
    
  } finally {
    try { proc.kill() } catch {}
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error)
}
