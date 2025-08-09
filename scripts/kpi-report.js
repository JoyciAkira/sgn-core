#!/usr/bin/env node
import fs from 'node:fs'
const path = process.argv[2] || 'logs/sgn-daemon.jsonl'
const lines = fs.existsSync(path) ? fs.readFileSync(path,'utf8').trim().split('\n') : []
const evts = lines.map(l=>{ try{ return JSON.parse(l) } catch{ return null } }).filter(Boolean)

const lat = evts.filter(e=>e.evt==='publish' && typeof e.lat_ms==='number').map(e=>e.lat_ms).sort((a,b)=>a-b)
const q = p => lat.length? lat[Math.floor(lat.length*p)] : null
const sent = evts.filter(e=>e.evt==='publish').length
const ack  = evts.filter(e=>e.evt==='ack').length
const ded  = evts.filter(e=>e.evt==='dedup_drop').length

const rep = {
  ts: Date.now(),
  publish: { count: lat.length, p50_ms: q(0.5), p95_ms: q(0.95) },
  network: { sent, ack, delivery_rate: sent? ack/sent : null, dedup: ded }
}
const out = `reports/kpi-${new Date().toISOString().slice(0,10)}.json`
fs.mkdirSync('reports', { recursive: true })
fs.writeFileSync(out, JSON.stringify(rep,null,2))
console.log(out)

