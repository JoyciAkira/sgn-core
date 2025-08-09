# SGN Tasks ↔ Branch/PR Mapping (Execution Map)

This map links major tasks to their branches/PRs and how to run/verify them locally. Keep it in sync.

- KU Core v0 + CLI
  - Branch: feature/ku-schema-cli
  - PR: feat(cli): KU schema v0 + CID(BLAKE3) + Ed25519 + minimal CLI
  - Status: Ready to merge (tests green)
  - Run:
    - CLI: npm run sgn -- publish --file examples/ku-react18.json
    - Tests: npm test

- DAG-CBOR + CIDv1 + Ed25519 + CLI + Tests (PR A)
  - Branch: feature/dag-cbor-cidv1
  - PR: feat(ku): DAG-CBOR + CIDv1 + Ed25519 signature; CLI ku canonicalize/sign/verify/print
  - Status: Open (tests green)
  - Run:
    - Canonicalize: npm run sgn -- ku canonicalize examples/ku-react18.json
    - Sign:        npm run sgn -- ku sign examples/ku-react18.json keys/priv.pem keys/pub.pem
    - Verify:      npm run sgn -- ku verify examples/ku-react18.json keys/pub.pem
    - dag-json:    npm run sgn -- ku print --dag-json examples/ku-react18.json
    - Tests:       npm test

- Network robustness (PR B)
  - Branch: feature/network-robustness (planned)
  - PR: feat(net): handshake signed + dedup + outbox persisted (SQLite WAL) + ACK/Backoff
  - Status: Planned
  - Run:
    - E2E (current WIP): node --test ./test/outbox-handshake-e2e.test.mjs
    - After implementation: node --test ./test/network-robustness-e2e.test.mjs (TBD)

- VSCode + Daemon alpha (instant suggestions)
  - Branch: feature/daemon-ide-alpha (planned)
  - PR: feat(ide): daemon /suggest + VSCode code-actions (apply→test→diff)
  - Status: Planned
  - Run: TBD (daemon bin + VSCode extension dev mode)

- Storage & Indexing upgrade
  - Branch: feature/sqlite-upgrade (planned)
  - PR: feat(storage): better-sqlite3 + PRAGMA + indices + edges PatchGraph
  - Status: Planned
  - Run: Bench 10k KUs (script TBD)

Notes
- Licenses: permissive only (MIT/Apache) or built-in
- Tests: always real (filesystem, network, DB), no mocks/simulations

