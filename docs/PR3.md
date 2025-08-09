# PR #3 — feat(daemon,ide): HTTP/JSON-RPC daemon + VSCode alpha, integrazione DAG-CBOR/CIDv1, outbox persistente

## Sintesi

- Daemon HTTP/JSON-RPC: `POST /publish`, `POST /verify`, `GET /ku/:cid?view=dag-json|json`, `GET /health`
- Reuse outbox SQLite (WAL), log JSONL
- Integrazione DAG-CBOR/CIDv1 + verify Ed25519 v1 + Trust v0
- VSCode alpha (Publish / Verify / Health)

## Come provare

```bash
npm i
npm run daemon:start
npm run daemon:health
```

Oppure avvio manuale:

```bash
SGN_DB=./sgn.db SGN_HTTP_PORT=8787 node sgn-poc/src/daemon/daemon.mjs
curl -s http://localhost:8787/health
```

## Acceptance

- p50 locale <200 ms sulle rotte base
- `POST /publish` persiste KU + enqueue → outbox (con `verify=true` applica Trust enforce/warn)
- `POST /verify` rispetta trust.json (mode enforce/warn) e ritorna sempre 200 con `trusted` boolean
- VSCode: comandi funzionanti su daemon locale

## CLI: sgn daemon start|health (snippet minimal)

Aggiungi in `src/cli/sgn.mjs`:

```js
if (cmd === 'daemon' && process.argv[3] === 'start') {
  const { spawn } = await import('node:child_process')
  const port = process.env.SGN_HTTP_PORT || '8787'
  const db = process.env.SGN_DB || './sgn.db'
  const p = spawn(process.execPath, ['sgn-poc/src/daemon/daemon.mjs'], {
    env: { ...process.env, SGN_HTTP_PORT: port, SGN_DB: db }, stdio: 'inherit'
  })
  p.on('exit', (code)=>process.exit(code ?? 0))
}

if (cmd === 'daemon' && process.argv[3] === 'health') {
  const http = await import('node:http')
  const req = http.request({ host:'localhost', port:process.env.SGN_HTTP_PORT||'8787', path:'/health' }, res=>{
    let b=''; res.on('data',c=>b+=c); res.on('end',()=>{ console.log(b); process.exit(0) })
  })
  req.on('error', (e)=>{ console.error(String(e)); process.exit(1) }); req.end()
}
```

Script suggeriti in `package.json` (root):

```json
{
  "daemon:start": "SGN_DB=./sgn.db SGN_HTTP_PORT=8787 node sgn-poc/src/daemon/daemon.mjs",
  "daemon:health": "curl -s http://localhost:8787/health"
}
```

## Esempio trust.json + test rapido

`trust.json`:

```json
{
  "mode": "enforce",
  "allow": [
    "bafkreiEXAMPLEKEYIDBASE32..."
  ]
}
```

### Flow di test (end-to-end)

Genera coppia chiavi + firma KU:

```bash
node -e "const c=require('node:crypto');const {publicKey,privateKey}=c.generateKeyPairSync('ed25519');require('fs').writeFileSync('keys/pub.pem',publicKey.export({type:'spki',format:'pem'}));require('fs').writeFileSync('keys/priv.pem',privateKey.export({type:'pkcs8',format:'pem'}));"
npm run sgn -- ku sign examples/ku-react18.json keys/priv.pem keys/pub.pem
```

Calcola key_id (già gestito dal tuo sign_v1): apri il file KU e copia `sig.key_id` in `trust.json` → `allow[]`.

Avvia daemon e verifica:

```bash
npm run daemon:start
curl -s -X POST http://localhost:8787/verify \
  -H 'Content-Type: application/json' \
  --data-binary @<(node -e "const fs=require('fs'); const ku=JSON.parse(fs.readFileSync('sgn-poc/examples/ku-react18.json','utf8')); const pub=fs.readFileSync('keys/pub.pem','utf8'); console.log(JSON.stringify({ku,pub_pem:pub}))")
# Atteso: {"ok":true,"trusted":true}
```

Prova con chiave NON allowlist (o mode:"warn"):

- In enforce: atteso 403 su `POST /publish?verify=true` o `trusted:false` su `POST /verify`.
- In warn: `ok:true`, `trusted:false`, log con livello WARNING.
