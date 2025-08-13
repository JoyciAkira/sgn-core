import { WebSocketServer } from 'ws'
import { metrics } from './metrics.mjs'

function makeBucket(rate=10, burst=20){
  let t=burst, last=Date.now()
  return { take(){
    const now=Date.now(), dt=(now-last)/1000; last=now
    t=Math.min(burst, t+dt*rate); if(t>=1){t-=1; return true} return false
  } }
}

const IDLE_MS = 5 * 60 * 1000; // 5 min
const PING_MS = 30 * 1000;

export function createEventsServer({ server, path='/events', auth, onLog }={}){
  const wss = new WebSocketServer({ server, path })
  const clients = new Map() // ws -> { bucket, lastSeen }
  const intervals = new Set()

  wss.on('connection', (ws, req)=>{
    // Optional auth: origin and bearer
    try {
      if (auth?.origin && req?.headers?.origin && req.headers.origin !== auth.origin) {
        try { ws.terminate() } catch {}
        return;
      }
      if (auth?.bearer) {
        const hdr = req?.headers?.authorization || ''
        if (!hdr.startsWith('Bearer ') || hdr.slice(7) !== auth.bearer) {
          try { ws.terminate() } catch {}
          return;
        }
      }
    } catch {}

    clients.set(ws, { bucket: makeBucket(10,20), lastSeen: Date.now() })

    ws.on('pong', () => {
      const st = clients.get(ws); if (st) st.lastSeen = Date.now()
    })

    ws.on('message', (buf)=>{
      const st = clients.get(ws); if (st) st.lastSeen = Date.now()
      try{
        const msg = JSON.parse(String(buf))
        const t = String(msg?.type||'')
        if ((t==='ack' || t==='KU_ACK') && msg?.cid) { metrics.net.acked++; onLog?.({ evt:'events_ack', cid: msg.cid }) }
      }catch{}
    })

    ws.on('close', ()=> clients.delete(ws))
  })

  // ping/pong + idle timeout
  const pingTimer = setInterval(() => {
    for (const [ws, st] of clients.entries()) {
      if (ws.readyState !== ws.OPEN) continue
      if (Date.now() - st.lastSeen > IDLE_MS) {
        try { ws.terminate() } catch {}
        clients.delete(ws)
        continue
      }
      try { ws.ping() } catch {}
    }
  }, PING_MS)

  function broadcastKU({ cid, dag_cbor_b64 }){
    for (const [ws, st] of clients.entries()){
      if (ws.readyState!==ws.OPEN) continue
      if (!st.bucket.take()) { metrics.events.drop++; onLog?.({ evt:'events_drop', reason:'backpressure' }); continue }
      ws.send(JSON.stringify({ type:'ku', cid, dag_cbor_b64 }))
      metrics.net.delivered++
      onLog?.({ evt:'events_send', cid })
    }
  }

  function broadcastEdge({ src, dst, edge_type }){
    for (const [ws, st] of clients.entries()){
      if (ws.readyState!==ws.OPEN) continue
      if (!st.bucket.take()) { metrics.events.drop++; onLog?.({ evt:'events_drop', reason:'backpressure' }); continue }
      ws.send(JSON.stringify({ type:'edge', src, dst, edge_type }))
      onLog?.({ evt:'events_send_edge', src, dst, edge_type })
    }
  }

  const healthTimer = setInterval(()=>{
    const payload = JSON.stringify({ type:'health', outbox_ready: metrics.outbox.ready, ts: Date.now() })
    for (const [ws, st] of clients.entries()){
      if (ws.readyState!==ws.OPEN) continue
      if (st.bucket.take()) ws.send(payload); else { metrics.events.drop++; onLog?.({ evt:'events_drop', reason:'health_backpressure' }) }
    }
  }, 1000)

  // track timers for close()
  intervals.add(pingTimer); intervals.add(healthTimer)

  function close(){
    for (const id of intervals) try { clearInterval(id) } catch {}
    try { for (const ws of wss.clients) ws.terminate() } catch {}
    try { wss.close() } catch {}
    onLog?.({ evt:'events_closed' })
  }

  wss.on('close', ()=> { close() })
  return { wss, broadcastKU, broadcastEdge, clients, close }
}

