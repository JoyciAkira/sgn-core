# SGN Core — Socrate Global Network

[![License: MIT](https://img.shields.io/badge/License-MIT-black.svg)](#license)
![Status](https://img.shields.io/badge/status-PoC-blue)
![Node](https://img.shields.io/badge/node-%3E%3D20.x-informational)

**Developer-owned, privacy-first protocol for compounding knowledge without central servers.**

SGN Core enables teams to **publish, discover, and validate** compact Knowledge Units (KUs) —
bugfixes, security notes, playbooks — through a peer-to-peer gossip network with built-in
observability and real-time metrics.

> **Status:** Production-ready PoC with comprehensive monitoring, testing, and developer tools.

---

## Table of contents

- [Why SGN?](#why-sgn)
- [Architecture at a glance](#architecture-at-a-glance)
- [Quickstart (2 minutes)](#quickstart-2-minutes)
- [APIs](#apis)
- [Metrics (Prometheus)](#metrics-prometheus)
- [Repository layout](#repository-layout)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Why SGN?

- **Ship knowledge, not slides.** Treat fixes and best practices as **Knowledge Units** (KUs)
  that can be shared and consumed programmatically.
- **No central choke points.** P2P publish/subscribe (gossip) instead of permissioned hubs.
- **Observable by default.** Health, metrics, and consistency checks are built-in.
- **Plays well with code.** Seed KUs straight from GitHub PRs/issues (PoC script included).

---

## Architecture at a glance

```mermaid
flowchart LR
  A[Seeder / Client] -->|publish KU| B((HTTP API))
  B --> C[Store DB/FS]
  C --> D[Outbox Queue]
  D -->|gossipsub| E[(Peers)]
  E --> F[Receiver Node]
  F --> G[Persist + Verify]
  B --> H[/Metrics & Health/]
  B --> I[/Admin (Consistency)/]
```

**Core concepts:**

- **Knowledge Unit (KU)**: immutable payload with metadata (id/cid, title, tags, provenance, timestamps).
- **Publish path**: HTTP → persist (DB/FS) → outbox → gossip broadcast.
- **Receive path**: peer receives → validate → persist → expose via API.

## Quickstart (2 minutes)

**Prereqs:** Node.js ≥ 20.x, git, optionally jq, curl.

```bash
# 1) Clone & install
git clone https://github.com/JoyciAkira/sgn-core.git
cd sgn-core
npm install

# 2) Start the daemon (HTTP on :8787 by default)
npm start

# 3) Verify health and run smoke test
curl -s "http://localhost:8787/health" | jq .
npm run smoke

# 4) (Optional) Seed KUs from GitHub PRs
cp config/.env.example .env
# Edit .env with your GitHub token
node scripts/seed-from-github.mjs openai/openai-node --state=open --max=5

# 5) Explore metrics (Prometheus format)
curl -s "http://localhost:8787/metrics?format=prom" | head -40

# 6) Retrieve a KU by CID
CID="<your_cid_here>"  # Replace with actual CID from data/kus/
curl -s "http://localhost:8787/ku/$CID" | jq .
```

**Live monitoring:**

```bash
# Watch key metrics in real-time
npm run watch

# Run comprehensive tests
npm run test:idempotency
npm run consistency


## APIs

All endpoints are local PoC defaults.

- **GET /health** → `{ "status": "healthy", ... }`
- **GET /metrics?format=prom** → Prometheus exposition
- **GET /ku/{cid}** → returns a single Knowledge Unit by content id
- **GET /admin/consistency** → `{ total_db, total_fs, mismatches, db_only, fs_only, consistent }`

**Publishing (PoC seeder):**

```bash
node scripts/seed-from-github.mjs <owner/repo> --state=open --max=5
```

## Metrics (Prometheus)

Key series exposed by the daemon:

**HTTP & network:**

- `sgn_http_publish_count` (counter)
- `sgn_ws_clients` (gauge)
- `sgn_net_delivered`, `sgn_net_acked` (counters)

**DB / FS:**

- `sgn_db_ku_stored_total{source}` (counter; increments post-commit)
- `sgn_fs_kus_count` (gauge; files under data/kus/)
- `sgn_kus_deduplicated_total` (counter)

**Latency & queues:**

- `sgn_db_write_ms_bucket` (histogram) → derive p50/p95 with `histogram_quantile(...)`
- `sgn_outbox_ready` (gauge), plus `sgn_outbox_deliveries_total`, `sgn_outbox_retries_total`

You can scrape the daemon directly or point Prometheus at `http://localhost:8787/metrics?format=prom`.

## Repository layout

```bash
sgn-core/
├─ src/                # Core daemon and protocol implementation
├─ test/               # Comprehensive test suite (unit + E2E)
├─ scripts/            # Utilities (seeding, monitoring, benchmarks)
├─ config/             # Configuration templates (.env.example, etc.)
├─ docs/               # Documentation and technical guides
├─ examples/           # Sample KUs and usage patterns
├─ vscode-extension/   # VSCode integration for real-time notifications
├─ data/               # (Runtime) KU storage and databases
├─ logs/               # (Runtime) Daemon logs and metrics
├─ package.json        # Dependencies and npm scripts
├─ docker-compose.yml  # Container orchestration
└─ README.md           # This documentation
```

## Roadmap

### Phase 1 — Foundation Hardening

Real libp2p connectivity across peers; durable SQLite persistence; digital signatures & verification.

### Phase 2 — Production Architecture

DHT-backed routing; end-to-end security; smarter topic/label routing; backpressure & retries.

### Phase 3 — Advanced Features

AI-assisted validation/enrichment of KUs; global knowledge graph; real-time analytics & SLOs.

### Phase 4 — Ecosystem

Tools & SDKs; multi-platform clients; enterprise policies & tenancy.

See `docs/` for the living roadmap and technical guide.

## Contributing

We welcome issues, ideas, and PRs:

1. Open an issue describing the problem or proposal.
2. Fork, branch from `main`, and keep PRs small & focused.
3. Add tests (where applicable) and update docs.

Code of Conduct and Security Policy will be added as the project graduates from PoC.

## License

This project is licensed under the MIT License.
