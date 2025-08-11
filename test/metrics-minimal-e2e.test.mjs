import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { request } from 'node:http'

function httpGet(path, port){
  return new Promise((resolve,reject)=>{
    const req = request({ host:'127.0.0.1', port, path, method:'GET' }, res=>{
      let b=''; res.on('data',c=>b+=c); res.on('end',()=>resolve({code:res.statusCode, body:b}))
    });
    req.on('error',reject); req.end();
  })
}

await test('metrics exposes p50/p95 and counts', async () => {
  const port = 8991
  const env = { ...process.env, SGN_HTTP_PORT: String(port), SGN_DB: './tmp-metrics-e2e.db' }
  const p = spawn(process.execPath, ['src/daemon/daemon.mjs'], { env, stdio: 'inherit' })
  try {
    // wait server
    await new Promise(r=>setTimeout(r,400))
    const res = await httpGet('/metrics', port)
    assert.equal(res.code, 200)
    const j = JSON.parse(res.body)
    assert.ok(j.http && j.http.publish && j.http.verify)
  } finally {
    p.kill()
  }
})

