# Pilot M1 – Quickstart (2 settimane)

Obiettivi
- Δ fail→fix −30–50% su 2–3 repo pilota
- Affidabilità rete: delivery ≥99.9%, p50 <200ms, p95 <1s (locale/LAN)

Prerequisiti
- Daemon SGN in esecuzione sul team server/dev: `npm run daemon:start` (WAL on, log JSONL)
- trust.json distribuito tra i partecipanti (partire in `warn` per 24h, poi `enforce`)
- VSCode extension SGN installata sui dev coinvolti (Publish / Verify / Health)

## Quick Start & Debug

**Monitor real-time events** (dev/debug):
```bash
# Install wscat if needed: npm install -g wscat
wscat -c ws://localhost:8787/events
# You'll see: {"type":"health","outbox_ready":N,"ts":...}
# When KUs are published: {"type":"ku","cid":"..."}
# Send ack: {"type":"ack","cid":"bafyre..."}
```

**Metrics & KPI**:
```bash
curl http://localhost:8787/metrics          # JSON format
curl http://localhost:8787/metrics?format=prom  # Prometheus format
```

---

## 1) Chiave “bot” CI + trust

Genera coppia Ed25519 (effimera o dedicata al CI):

```bash
node -e "const c=require('crypto');const {publicKey,privateKey}=c.generateKeyPairSync('ed25519');require('fs').mkdirSync('keys',{recursive:true});require('fs').writeFileSync('keys/pub.pem',publicKey.export({type:'spki',format:'pem'}));require('fs').writeFileSync('keys/priv.pem',privateKey.export({type:'pkcs8',format:'pem'}));"
```

Calcola key_id (base32(multihash(sha2-256(SPKI DER))):

```bash
node --input-type=module -e "import fs from 'node:fs'; import {keyIdFromPubPEM} from './sgn-poc/src/ku/sign_v1.mjs'; (async()=>{const pem=fs.readFileSync('keys/pub.pem','utf8'); console.log(await keyIdFromPubPEM(pem));})();"
```

Aggiorna trust.json (inizio in warn):

```json
{
  "mode": "warn",
  "allow": [
    "<BOT_KEY_ID_BASE32>"
  ]
}
```

Aggiungi la public key del bot ai secret del repo pilota:
- ED25519_PRIV_PEM (private PEM)
- ED25519_PUB_PEM (public PEM)

---

## 2) Hook CI “on test fail” → KU-receipt firmata + publish

Aggiungi un job al workflow del repo pilota (estratto):

```yaml
jobs:
  test-and-publish-ku-receipt:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci

      - name: Run tests (capture logs)
        id: test
        run: |
          set -o pipefail
          npm test 2>&1 | tee test.log

      - name: On fail → build KU-receipt + sign + publish
        if: failure()
        env:
          ED25519_PRIV_PEM: ${{ secrets.ED25519_PRIV_PEM }}
          ED25519_PUB_PEM:  ${{ secrets.ED25519_PUB_PEM }}
          SGN_DAEMON_URL:   http://localhost:8787
        run: |
          node sgn-poc/scripts/build-ku-receipt.js \
            --title "CI fail: $GITHUB_REPOSITORY@$GITHUB_SHA" \
            --branch "${GITHUB_REF##*/}" \
            --commit "$GITHUB_SHA" \
            --log ./test.log \
            --out ./ku-receipt.json

          printf "%s" "$ED25519_PRIV_PEM" > ./bot_priv.pem
          printf "%s" "$ED25519_PUB_PEM"  > ./bot_pub.pem
          npm run sgn -- ku sign ./ku-receipt.json ./bot_priv.pem ./bot_pub.pem

          curl -s -X POST "$SGN_DAEMON_URL/publish" \
            -H 'Content-Type: application/json' \
            --data-binary @<(node -e 'const fs=require("fs");const ku=JSON.parse(fs.readFileSync("./ku-receipt.json","utf8"));const pub=fs.readFileSync("./bot_pub.pem","utf8");console.log(JSON.stringify({ku,verify:true,pub_pem:pub}))') \
            | tee publish.out.json

      - uses: actions/upload-artifact@v4
        if: failure()
        with: { name: ku-receipt, path: ./ku-receipt.json }
```

Nota: richiede il daemon raggiungibile dall’ambiente CI (localhost o URL di team).

---

## 3) KPI e monitoraggio

KPI rapidi da log JSONL (daemon):

- p50/p95 latenza publish
```bash
cat logs/sgn-daemon.jsonl \
| jq -r 'select(.evt=="publish" and .lat_ms!=null) | .lat_ms' \
| sort -n \
| awk 'BEGIN{c=0} {a[c++]=$1} END{p50=a[int(c*0.5)]; p95=a[int(c*0.95)]; print "p50="p50" ms, p95="p95" ms"}'
```

- delivery rate & dedup ratio
```bash
# delivered/acked
grep '"evt":"publish"' logs/sgn-daemon.jsonl | wc -l
grep '"evt":"ack"'     logs/sgn-daemon.jsonl | wc -l
# dedup
grep '"evt":"dedup_drop"' logs/sgn-daemon.jsonl | wc -l
```

KPI giornalieri automatici:
- Workflow: `.github/workflows/kpi.yml` (già presente nel core)
- Script: `sgn-poc/scripts/kpi-report.js` → carica artifact `reports/kpi-YYYY-MM-DD.json`

---

## 4) Rollout suggerito

- Oggi (T+0h): trust.json in `warn` 24h, CI hook attivo nei 2–3 repo
- Domani (T+24h): controlla log per `untrusted_key`, `rate_limited`, `ack_timeout`, `retry` → se pulito passa a `enforce`
- T+48h: checkpoint KPI (Δ fail→fix, delivery, dedup, p50/p95) e decisione proseguimento

---

## 5) VSCode alpha (dev)
- Impostazioni: `sgn.daemonUrl` (default `http://localhost:8787`)
- Comandi: "SGN: Publish Active KU", "SGN: Verify Active KU", "SGN: Open Daemon Health"
- Sicurezza: nessuna private key nell’estensione (firma via CLI/CI)

---

## Troubleshooting
- 403 `untrusted_key` su `/publish?verify=true`: aggiungi il `key_id` della chiave bot in trust.json → `allow[]`
- `/verify` in `enforce` → 200 `{ ok:true, trusted:false }`: chiave non allowlist (atteso in `warn`)
- `rate_limited`: riduci burst/throughput del client; verifica token bucket
- `ack_timeout`/`retry`: controlla reachability del peer, health del daemon
- Health: `curl -s http://localhost:8787/health | jq .`

