# AugmentCode TODO (execution guide)

## Done / In progress

- [x] Feature PR #1: KU schema v0 + CLI (branch: feature/ku-schema-cli)
  - [x] src/ku/schema.mjs, cid.mjs, sign.mjs (Node crypto)
  - [x] CLI publish/fetch/verify + example KU
  - [x] Unit tests (cid determinism, verify OK/FAIL)
  - [x] README_CLI.md (CLI usage)

- [x] Feature PR A: DAG-CBOR + CIDv1 + Ed25519 + CLI + tests (branch: feature/dag-cbor-cidv1)
  - [x] Canonical bytes via dag-cbor (strip sig)
  - [x] CIDv1 (codec dag-cbor, multibase base32, multihash sha2-256)
  - [x] Signature header { alg: ed25519, prehash: none, context: sgn-ku-v1, key_id(base32 multihash), signature(base64url) }
  - [x] CLI subcommands: ku canonicalize | sign | verify | print --dag-json
  - [x] Property tests (CID invariance to key reordering/bool/null/num)
  - [x] Break-glass tests (tamper sig/key_id → verify FAIL)
  - [ ] Golden vectors (Node/Deno/Bun)
  - [ ] trust.json (enforce|warn) integration in CLI verify
  - [ ] CLI ku convert --from jcs --to dag-cbor (add aliases.legacy_cid_blake3)
  - [ ] Docs update: migration notes + examples

## Next up

- [ ] Feature PR B: Network robustness (Outbox persisted + Handshake signed + Dedup + ACK/Backoff)
  - [ ] Handshake challenge/response (nonce TTL 2–5 min) with Ed25519 verify
  - [ ] Dedup seen-set (LRU/Bloom) by CID; anti-replay window
  - [ ] Outbox persisted (SQLite WAL) with schema + recovery on restart
  - [ ] ACK + retry with exponential backoff; per-peer rate-limit
  - [ ] E2E 2-nodes with fault injection (drop/reorder/duplicate), delivery 100%, latency p50/p95 recorded

- [ ] Feature PR #3: VSCode + Daemon (instant suggestions <200ms p50)
  - [ ] Daemon HTTP/JSON-RPC: POST /publish, GET /ku/:cid, POST /verify, GET /health, WS /events
  - [ ] Fingerprint + index hot cache (offline-first)
  - [ ] VSCode: diagnostics → top-3 KUs → Apply → Run tests → Diff (dry-run preview)
  - [ ] Latency budget: p50 < 120ms, p95 < 250ms; logs JSONL

- [ ] Storage & Indexing upgrade
  - [ ] better-sqlite3 + PRAGMA (WAL, synchronous=NORMAL, cache_size, mmap_size)
  - [ ] Indices: (cid PK), (created_at), (publisher_key_id, created_at); edges(src_cid,dst_cid,type)
  - [ ] Bench reali su 10k KUs (insert/query), prepared statements & batch

- [ ] CI & Benchmarks
  - [ ] GitHub Action “on test fail” → suggestions SGN (Apply & rerun)
  - [ ] Benchmark suite (20–30 migrazioni: React, lodash, Webpack→Vite, Express) con KPI: MTTR↓, pass-rate↑

## How to run (quick)

- Tests: `npm test`
- CLI (new):
  - `npm run sgn -- ku canonicalize examples/ku-react18.json`
  - `npm run sgn -- ku sign examples/ku-react18.json keys/priv.pem keys/pub.pem`
  - `npm run sgn -- ku verify examples/ku-react18.json keys/pub.pem`
  - `npm run sgn -- ku print --dag-json examples/ku-react18.json`
- Network E2E (WIP): `node --test ./test/outbox-handshake-e2e.test.mjs`

Notes:

- Licenze: solo permissive (MIT/Apache-2.0) o built-in
- Test: sempre reali (filesystem, rete, DB), no mock/simulazioni
