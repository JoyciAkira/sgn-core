# PR #3 – Daemon HTTP/JSON-RPC + VSCode Alpha

## Avvio Daemon
```
SGN_DB=./sgn.db SGN_HTTP_PORT=8787 node sgn-poc/src/daemon/daemon.mjs
```

## Endpoint
- GET /health → { ok, ku_count, outbox_ready, time_ms }
- GET /ku/:cid[?view=dag-json|json] → KU
- POST /publish → { ku, verify?:bool, pub_pem?:string } → { cid, stored, enqueued }
- POST /verify → { ku, pub_pem } → { ok, reason?, trusted }

## VSCode
- Config: sgn.daemonUrl (default http://localhost:8787)
- Cmds: SGN: Publish Active KU | Verify Active KU | Open Health

## Performance (<200ms p50 locale)
- server http nativo; DB già aperto; encoding DAG-CBOR pre-warmed; outbox enqueue O(1)
- log JSONL asincroni; nessun await blocking su path critici

