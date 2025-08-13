#!/usr/bin/env bash

SGN_DAEMON="${SGN_DAEMON:-http://localhost:8787}"

echo "🔍 SGN Live Metrics Monitor - $SGN_DAEMON"
echo "Press Ctrl+C to stop"
echo "========================================"

watch -n 0.5 "curl -s '$SGN_DAEMON/metrics?format=prom' | grep -E 'sgn_(http_publish_count|db_ku_stored_total|fs_kus_count|outbox_ready|outbox_deliveries_total|outbox_retries_total|kus_deduplicated_total|consistency_mismatches|db_write_ms_count|db_write_ms_sum|db_write_p50)' | sort"
