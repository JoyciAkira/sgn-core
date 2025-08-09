# SGN PatchGraph MVP Roadmap (Engineering)

Goals (Phase: PatchGraph & Migrations)
- MTTR −30% su bug/migrazioni ripetitive su benchmark pubblici
- Apply-and-pass ≥ 85% (alpha) sui top-3 suggerimenti
- Latenza IDE: p50 < 120ms, p95 < 250ms (suggerimenti)
- Provenance: 100% KUs patch con test+fonti+firma

Tracks
1) KU Core
- KU schema v0 (JSON; JSON-LD/PROV ready)
- CID BLAKE3 deterministico
- Ed25519 sign/verify (Node crypto, PEM)
- CLI sgn publish/fetch/verify

2) P2P Delivery
- Topic sgn.kus.v0 / sgn.ctrl.hello.v0
- Subscribe-before-publish
- Outbox con retry/backoff; flush on first subscriber

3) Storage & Index
- SQLite tier con indici (type/tags/created_at)
- Query sgn search --tag/--type
- Edges per PatchGraph

4) IDE & Daemon
- Daemon suggest API (fingerprint + indice caldo)
- VSCode extension: diagnostics→top-3 KUs→Apply→Run tests→Diff

5) CI & Benchmarks
- GitHub Action: su test fail → suggerimenti SGN
- Benchmark pubblici (20–30 migrazioni)
- Metriche: MTTR, pass rate, tempo-to-merge simulato

Quality Gates
- Unit/E2E per ogni PR; artefatti log/metrics
- “Receipts” obbligatorie per KUs di patch (test, fonti, firma)
- Licenze permissive (MIT/Apache-2.0) per ogni dipendenza/seed

