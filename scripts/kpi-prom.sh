#!/usr/bin/env bash
PORT=${1:-8787}
curl -s "http://localhost:${PORT}/metrics?format=prom" \
  | awk '/sgn_net_(delivered|acked)|sgn_http_publish_(p50|p95)|sgn_ws_clients|sgn_events_drop/'

