import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)
const DAEMON = resolve(__dirname, '../src/daemon/daemon.mjs')
const CWD    = resolve(__dirname, '..')

import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import crypto from 'node:crypto'
import { signKU_v1 as signV1 } from '../src/ku/sign_v1.mjs'

const PORT = 8989
const DB   = './tmp-daemon-trust.db'
const URL  = `http://localhost:${PORT}`

async function post(path, body) {
  const r = await fetch(URL + path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  })
  return { status: r.status, json: await r.json() }
}

function genKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519')
  return {
    pub: publicKey.export({ type: 'spki', format: 'pem' }),
    priv: privateKey.export({ type: 'pkcs8', format: 'pem' })
  }
}

const baseKU = {
  type: 'ku.patch.migration',
  schema_id: 'ku.v1',
  content_type: 'application/json',
  payload: { title: 'Trust E2E', description: 'enforce/warn', patch: '---', severity: 'LOW', confidence: 0.9, affectedSystems: [] },
  parents: [], sources: [], tests: [], provenance: { agent_pubkey: null }, tags: []
}

let proc
before(async () => {
  try { await fs.rm(DB) } catch {}
  try { await fs.rm('trust.json') } catch {}
  proc = spawn(process.execPath, [DAEMON], {
    env: { ...process.env, SGN_HTTP_PORT: String(PORT), SGN_DB: DB },
    stdio: 'inherit',
    cwd: CWD,
  })
  // wait for health
  const t0 = Date.now()
  while (Date.now() - t0 < 4000) {
    try { const r = await fetch(`${URL}/health`); if (r.ok) break } catch {}
    await new Promise(r=>setTimeout(r,100))
  }
})

after(async () => {
  try { proc?.kill() } catch {}
  try { await fs.rm(DB) } catch {}
  try { await fs.rm('trust.json') } catch {}
})

test('verify: enforce=true → trusted true con key allowlist, false con key non allowlist', async () => {
  const A = genKeys() // allowed
  const signedA = await signV1(structuredClone(baseKU), A.priv, A.pub)
  // allowlist con key_id di A
  await fs.writeFile('trust.json', JSON.stringify({ mode: 'enforce', allow: [signedA.sig.key_id] }))

  // verify con chiave A → ok & trusted=true
  let { status, json } = await post('/verify', { ku: signedA, pub_pem: A.pub })
  assert.equal(status, 200)
  assert.equal(json.ok, true)
  assert.equal(json.trusted, true)

  // verify con chiave B (non allowlist) → ok & trusted=false
  const B = genKeys()
  const signedB = await signV1(structuredClone(baseKU), B.priv, B.pub)
  ;({ status, json } = await post('/verify', { ku: signedB, pub_pem: B.pub }))
  assert.equal(status, 200)
  assert.equal(json.ok, true)
  assert.equal(json.trusted, false)
})

test('publish?verify=true: enforce blocca non-allowlist; warn lascia passare', async () => {
  // ENFORCE: allow solo A
  const A = genKeys()
  const signedA = await signV1(structuredClone(baseKU), A.priv, A.pub)
  await fs.writeFile('trust.json', JSON.stringify({ mode: 'enforce', allow: [signedA.sig.key_id] }))

  // A → publish ok
  let res = await post('/publish', { ku: signedA, verify: true, pub_pem: A.pub })
  assert.equal(res.status, 200)
  assert.equal(res.json.stored, true)
  assert.equal(res.json.enqueued, true)

  // B → publish rifiutato (403)
  const B = genKeys()
  const signedB = await signV1(structuredClone(baseKU), B.priv, B.pub)
  res = await post('/publish', { ku: signedB, verify: true, pub_pem: B.pub })
  assert.equal(res.status, 403)
  assert.equal(res.json.error, 'untrusted_key')

  // WARN: rimuovi enforce → publish passa
  await fs.writeFile('trust.json', JSON.stringify({ mode: 'warn', allow: [] }))
  res = await post('/publish', { ku: signedB, verify: true, pub_pem: B.pub })
  assert.equal(res.status, 200)
  assert.equal(res.json.stored, true)
  assert.equal(res.json.enqueued, true)
})

