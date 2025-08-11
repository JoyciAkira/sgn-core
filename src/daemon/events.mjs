import { WebSocketServer } from 'ws'
import { metrics } from './metrics.mjs'

function bucket(rate=10, burst=20){
  let t=burst, last=Date.now()
  return { take(){
    const now=Date.now(), dt=(now-last)/1000; last=now
    t=Math.min(burst, t+dt*rate); if(t>=1){t-=1; return true} return false
  } }
}

export function createEventsServer({ server, path='/events' }={}){
  const wss = new WebSocketServer({ server, path })
  const clients = new Map() // ws -> {bucket}

  wss.on('connection', (ws)=>{
    clients.set(ws, { bucket: bucket(10,20) })
    ws.on('close', ()=> clients.delete(ws))
    ws.on('message', (buf)=>{
      try{
        const msg = JSON.parse(String(buf))
        const t = String(msg?.type||'')
        if ((t==='ack' || t==='KU_ACK') && msg?.cid) metrics.net.acked++
      }catch{}
    })
  })

  function broadcastKU({ cid, dag_cbor_b64 }){
    for (const [ws, st] of clients.entries()){
      if (ws.readyState!==ws.OPEN) continue
      if (!st.bucket.take()) continue // backpressure: non droppiamo KU, solo rallentiamo
      ws.send(JSON.stringify({ type:'ku', cid, dag_cbor_b64 }))
      metrics.net.delivered++
    }
  }

  const healthTimer = setInterval(()=>{
    const payload = JSON.stringify({ type:'health', outbox_ready: metrics.outbox.ready, ts: Date.now() })
    for (const [ws, st] of clients.entries()){
      if (ws.readyState!==ws.OPEN) continue
      if (st.bucket.take()) ws.send(payload); else metrics.events.drop++
    }
  }, 1000)

  wss.on('close', ()=> clearInterval(healthTimer))
  return { wss, broadcastKU }
}

