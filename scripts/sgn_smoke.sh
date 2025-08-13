#!/usr/bin/env bash
set -euo pipefail

SGN_DAEMON="${SGN_DAEMON:-http://localhost:8787}"

red()  { printf "\033[31m%s\033[0m\n" "$*"; }
grn()  { printf "\033[32m%s\033[0m\n" "$*"; }
ylw()  { printf "\033[33m%s\033[0m\n" "$*"; }

fail() { red "✗ $*"; exit 1; }
pass() { grn "✓ $*"; }

echo "🔍 SGN Smoke Test - $SGN_DAEMON"
echo "=================================="

# 1) Health
HEALTH_JSON="$(curl -fsS "$SGN_DAEMON/health" || true)"
echo "$HEALTH_JSON" | jq . >/dev/null 2>&1 || fail "/health non è JSON valido"
STATUS="$(echo "$HEALTH_JSON" | jq -r '.status // empty')"
[[ "$STATUS" == "ok" || "$STATUS" == "healthy" ]] && pass "Health OK ($STATUS)" || ylw "Health: $STATUS"

# 2) Metriche chiave
METRICS="$(curl -fsS "$SGN_DAEMON/metrics?format=prom")"
PUBLISH="$(echo "$METRICS" | awk '/^sgn_http_publish_count /{print $2}' | tail -1)"
OUTBOX_READY="$(echo "$METRICS" | awk '/^sgn_outbox_ready /{print $2}' | tail -1)"
DB_W_P50="$(echo "$METRICS" | awk '/^sgn_db_write_p50 /{print $2}' | tail -1)"
DB_W_P95="$(echo "$METRICS" | awk '/^sgn_db_write_p95 /{print $2}' | tail -1)"

[[ -n "$PUBLISH" ]] && pass "publish_count=$PUBLISH" || fail "sgn_http_publish_count assente"
echo "outbox_ready=$OUTBOX_READY"
echo "db_write_p50=$DB_W_P50 ms, db_write_p95=$DB_W_P95 ms"

# 3) Filesystem: conteggio KUs
if [[ -d "data/kus" ]]; then
  KUS_FS="$(find data/kus -type f -name '*.json' | wc -l | tr -d ' ')"
  [[ "$KUS_FS" -gt 0 ]] && pass "KUs salvati su FS: $KUS_FS" || fail "Nessun KU in data/kus"
else
  ylw "Directory data/kus non trovata (skip FS check)"
fi

# 4) Retrieval per CID
CID_FILE="$(ls -1 data/kus/*.json 2>/dev/null | head -1 || true)"
if [[ -n "$CID_FILE" ]]; then
  CID="$(basename "$CID_FILE" .json)"
  TITLE="$(curl -fsS "$SGN_DAEMON/ku/$CID" | jq -r '.payload.title // empty')"
  [[ -n "$TITLE" ]] && pass "GET /ku/$CID → title: $TITLE" || fail "GET /ku/$CID senza title"
fi

# 5) Outbox: drenaggio
if [[ "$OUTBOX_READY" =~ ^[0-9]+$ ]]; then
  if [[ "$OUTBOX_READY" -eq 0 ]]; then
    pass "Outbox drenata (0 ready)"
  else
    ylw "Outbox non vuota ($OUTBOX_READY). Verifica che il worker/broadcaster sia attivo."
  fi
fi

grn "🚀 Smoke test completato"
