# AugmentCode TODO (execution guide)

- [ ] Feature PR #1: KU schema v0 + CLI
  - [x] Add src/ku/schema.mjs, cid.mjs, sign.mjs (Node crypto)
  - [x] CLI publish/fetch/verify + example KU
  - [ ] Unit tests (cid determinism, verify OK/FAIL)
  - [ ] README updates

- [ ] Feature PR #2: Outbox + Handshake
  - [ ] Topic sgn.ctrl.hello.v0, subscribe-before-publish
  - [ ] Outbox with retry/backoff + rate-limit
  - [ ] E2E 2 nodes (late subscriber)

- [ ] Feature PR #3: VSCode + Daemon
  - [ ] Daemon suggest API (fingerprint + index)
  - [ ] VSCode listeners + CodeActions + Apply→Run tests→Diff
  - [ ] Latency budget measurements (p50/p95)

- [ ] Storage & Indexing
  - [ ] sgn search --tag/--type
  - [ ] Bench 10k KUs insert/query

- [ ] CI & Benchmarks
  - [ ] GitHub Action “on test fail” → suggestions
  - [ ] Benchmark suite (20–30 migrazioni)

Notes:
- Keep licenses permissive (MIT/Apache-2.0)
- Favor portable deps (no native unless justified)

