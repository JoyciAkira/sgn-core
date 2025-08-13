#!/usr/bin/env bash
set -euo pipefail

SGN_DAEMON="${SGN_DAEMON:-http://localhost:8787}"

red()  { printf "\033[31m%s\033[0m\n" "$*"; }
grn()  { printf "\033[32m%s\033[0m\n" "$*"; }
ylw()  { printf "\033[33m%s\033[0m\n" "$*"; }

echo "🔄 SGN Idempotency & Consistency Test"
echo "====================================="

# 1) Baseline metrics
echo "📊 Baseline metrics..."
METRICS_BEFORE="$(curl -fsS "$SGN_DAEMON/metrics?format=prom")"
PUBLISH_BEFORE="$(echo "$METRICS_BEFORE" | awk '/^sgn_http_publish_count /{print $2}' | tail -1)"
STORED_BEFORE="$(echo "$METRICS_BEFORE" | awk '/^sgn_db_ku_stored_total.*http_publish.*/{print $2}' | tail -1 || echo "0")"
DEDUP_BEFORE="$(echo "$METRICS_BEFORE" | awk '/^sgn_kus_deduplicated_total /{print $2}' | tail -1 || echo "0")"

echo "  publish_count: $PUBLISH_BEFORE"
echo "  stored_total: $STORED_BEFORE" 
echo "  dedup_total: $DEDUP_BEFORE"

# 2) Re-seed same repo (should trigger deduplication)
echo "🔄 Re-seeding same data (idempotency test)..."
node scripts/seed-from-github.mjs openai/openai-node --state=open --max=3

# 3) Check metrics after
METRICS_AFTER="$(curl -fsS "$SGN_DAEMON/metrics?format=prom")"
PUBLISH_AFTER="$(echo "$METRICS_AFTER" | awk '/^sgn_http_publish_count /{print $2}' | tail -1)"
STORED_AFTER="$(echo "$METRICS_AFTER" | awk '/^sgn_db_ku_stored_total.*http_publish.*/{print $2}' | tail -1 || echo "0")"
DEDUP_AFTER="$(echo "$METRICS_AFTER" | awk '/^sgn_kus_deduplicated_total /{print $2}' | tail -1 || echo "0")"

echo "📊 After metrics..."
echo "  publish_count: $PUBLISH_AFTER"
echo "  stored_total: $STORED_AFTER"
echo "  dedup_total: $DEDUP_AFTER"

# 4) Verify idempotency
PUBLISH_DIFF=$((PUBLISH_AFTER - PUBLISH_BEFORE))
STORED_DIFF=$((STORED_AFTER - STORED_BEFORE))
DEDUP_DIFF=$((DEDUP_AFTER - DEDUP_BEFORE))

echo "📈 Deltas..."
echo "  publish_requests: +$PUBLISH_DIFF"
echo "  new_stored: +$STORED_DIFF"
echo "  deduplicated: +$DEDUP_DIFF"

if [[ $DEDUP_DIFF -gt 0 ]]; then
  grn "✓ Deduplication working: $DEDUP_DIFF duplicates detected"
else
  ylw "⚠ No deduplication detected (might be new data)"
fi

# 5) Consistency check
echo "🔍 Consistency check..."
CONSISTENCY="$(curl -fsS "$SGN_DAEMON/admin/consistency")"
MISMATCHES="$(echo "$CONSISTENCY" | jq -r '.mismatches // 0')"
TOTAL_DB="$(echo "$CONSISTENCY" | jq -r '.total_db // 0')"
TOTAL_FS="$(echo "$CONSISTENCY" | jq -r '.total_fs // 0')"

echo "  DB records: $TOTAL_DB"
echo "  FS files: $TOTAL_FS"
echo "  Mismatches: $MISMATCHES"

if [[ "$MISMATCHES" -eq 0 ]]; then
  grn "✓ DB-FS consistency OK"
else
  red "✗ Consistency issues: $MISMATCHES mismatches"
fi

grn "🎯 Idempotency & Consistency test completed"
