import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// Istogrammi a bucket (ms): 10,50,100,200,500,1s,2s, +Inf
function hist(bk = [10, 50, 100, 200, 500, 1000, 2000, Infinity]) {
  return {
    b: bk,
    c: Array(bk.length).fill(0),
    n: 0,
    observe(ms) {
      this.n++;
      for (let i = 0; i < this.b.length; i++) {
        if (ms <= this.b[i]) { this.c[i]++; break; }
      }
    },
    quantile(p) { // stima quantile dai bucket
      if (this.n === 0) return null;
      const target = Math.max(1, Math.floor(this.n * p));
      let acc = 0;
      for (let i = 0; i < this.c.length; i++) {
        acc += this.c[i];
        if (acc >= target) return this.b[i] === Infinity ? null : this.b[i];
      }
      return null;
    },
    toJSON() { return { count: this.n, p50: this.quantile(0.5), p95: this.quantile(0.95) }; },
    // Add Prometheus histogram format
    toPromBuckets(name) {
      const lines = [];
      let cumulative = 0;
      for (let i = 0; i < this.b.length; i++) {
        cumulative += this.c[i];
        const le = this.b[i] === Infinity ? '+Inf' : this.b[i];
        lines.push(`${name}_bucket{le="${le}"} ${cumulative}`);
      }
      lines.push(`${name}_count ${this.n}`);
      lines.push(`${name}_sum ${this.n * (this.quantile(0.5) || 0)}`); // rough estimate
      return lines;
    }
  };
}

export const metrics = {
  http: { publish: hist(), verify: hist() },
  db: { read: hist(), write: hist() },
  net: { delivered: 0, acked: 0, dedup: 0 },
  events: { drop: 0 },
  outbox: { ready: 0, deliveries: 0, retries: 0, stalled: 0 },
  edgesInsertCount: 0,
  graphReqCount: 0,
  gauges: { queue_len: 0, ws_clients: 0 },

  // New advanced metrics
  ku: { stored_total: 0, deduplicated_total: 0 },
  fs: { kus_count: 0 },
  consistency: { mismatches: 0 },

  ws: { clients: 0 },
  snapshot() {
    const http = {
      publish: this.http.publish.toJSON(),
      verify: this.http.verify.toJSON(),
    };
    const delivered = this.net.delivered, acked = this.net.acked, dedup = this.net.dedup;
    const delivery_rate = delivered ? acked / delivered : null;
    const dedup_ratio = delivered ? dedup / delivered : null;
    return { time_ms: Date.now(), http, net: { delivered, acked, retry: 0, dedup_ratio }, outbox: { ready: this.outbox.ready }, ws: { clients: this.ws.clients }, events: { drop: this.events.drop } };
  },
  toProm() {
    // Update filesystem count dynamically
    this.updateFsKusCount();

    const s = this.snapshot();
    const lines = [];
    // include WS clients gauge
    lines.push('# HELP sgn_ws_clients connected websocket clients');
    lines.push('# TYPE sgn_ws_clients gauge');
    lines.push(`sgn_ws_clients ${s.ws.clients}`);
    lines.push('# HELP sgn_http_publish_count publish requests');
    lines.push('# TYPE sgn_http_publish_count counter');
    lines.push(`sgn_http_publish_count ${this.http.publish.n}`);
    lines.push('# HELP sgn_http_publish_p50 milliseconds');
    lines.push('# TYPE sgn_http_publish_p50 gauge');
    lines.push(`sgn_http_publish_p50 ${s.http.publish.p50 ?? 0}`);
    lines.push('# HELP sgn_http_publish_p95 milliseconds');
    lines.push('# TYPE sgn_http_publish_p95 gauge');
    lines.push(`sgn_http_publish_p95 ${s.http.publish.p95 ?? 0}`);
    lines.push('# HELP sgn_http_verify_count verify requests');
    lines.push('# TYPE sgn_http_verify_count counter');
    lines.push(`sgn_http_verify_count ${this.http.verify.n}`);
    lines.push('# HELP sgn_net_delivered delivered messages');
    lines.push('# TYPE sgn_net_delivered counter');
    lines.push(`sgn_net_delivered ${s.net.delivered}`);
    lines.push('# HELP sgn_net_acked acknowledged messages');
    lines.push('# TYPE sgn_net_acked counter');
    lines.push(`sgn_net_acked ${s.net.acked}`);
    lines.push('# HELP sgn_net_dedup_ratio dedup ratio');
    lines.push('# TYPE sgn_net_dedup_ratio gauge');
    lines.push(`sgn_net_dedup_ratio ${s.net.dedup_ratio ?? 0}`);
    lines.push('# HELP sgn_events_drop dropped events (health)');
    lines.push('# TYPE sgn_events_drop counter');
    lines.push(`sgn_events_drop ${s.events.drop}`);
    lines.push('# HELP sgn_edges_insert_count inserted graph edges');
    lines.push('# TYPE sgn_edges_insert_count counter');
    lines.push(`sgn_edges_insert_count ${this.edgesInsertCount || 0}`);
    lines.push('# HELP sgn_graph_req_count graph requests');
    lines.push('# TYPE sgn_graph_req_count counter');
    lines.push(`sgn_graph_req_count ${this.graphReqCount || 0}`);
    lines.push('# HELP sgn_outbox_ready ready items');
    lines.push('# TYPE sgn_outbox_ready gauge');
    lines.push(`sgn_outbox_ready ${s.outbox.ready}`);

    // DB performance metrics as histograms
    lines.push('# HELP sgn_db_read_ms database read duration milliseconds');
    lines.push('# TYPE sgn_db_read_ms histogram');
    lines.push(...this.db.read.toPromBuckets('sgn_db_read_ms'));

    lines.push('# HELP sgn_db_write_ms database write duration milliseconds');
    lines.push('# TYPE sgn_db_write_ms histogram');
    lines.push(...this.db.write.toPromBuckets('sgn_db_write_ms'));

    // Keep legacy gauges for compatibility
    const dbRead = this.db.read.toJSON();
    const dbWrite = this.db.write.toJSON();
    lines.push('# HELP sgn_db_read_p50 database read p50 milliseconds (legacy)');
    lines.push('# TYPE sgn_db_read_p50 gauge');
    lines.push(`sgn_db_read_p50 ${dbRead.p50 ?? 0}`);
    lines.push('# HELP sgn_db_write_p50 database write p50 milliseconds (legacy)');
    lines.push('# TYPE sgn_db_write_p50 gauge');
    lines.push(`sgn_db_write_p50 ${dbWrite.p50 ?? 0}`);

    // Additional gauges
    lines.push('# HELP sgn_outbox_queue_len outbox queue length');
    lines.push('# TYPE sgn_outbox_queue_len gauge');
    lines.push(`sgn_outbox_queue_len ${this.gauges?.queue_len || 0}`);

    // New advanced metrics
    lines.push('# HELP sgn_db_ku_stored_total total KUs stored in database');
    lines.push('# TYPE sgn_db_ku_stored_total counter');
    lines.push(`sgn_db_ku_stored_total{source="http_publish"} ${this.ku.stored_total}`);

    lines.push('# HELP sgn_fs_kus_count number of KU JSON files on filesystem');
    lines.push('# TYPE sgn_fs_kus_count gauge');
    lines.push(`sgn_fs_kus_count ${this.fs.kus_count}`);

    lines.push('# HELP sgn_outbox_deliveries_total total outbox deliveries');
    lines.push('# TYPE sgn_outbox_deliveries_total counter');
    lines.push(`sgn_outbox_deliveries_total ${this.outbox.deliveries}`);

    lines.push('# HELP sgn_outbox_retries_total total outbox retries');
    lines.push('# TYPE sgn_outbox_retries_total counter');
    lines.push(`sgn_outbox_retries_total ${this.outbox.retries}`);

    lines.push('# HELP sgn_outbox_stalled stalled outbox items');
    lines.push('# TYPE sgn_outbox_stalled gauge');
    lines.push(`sgn_outbox_stalled ${this.outbox.stalled}`);

    lines.push('# HELP sgn_kus_deduplicated_total deduplicated KUs (attempted re-imports)');
    lines.push('# TYPE sgn_kus_deduplicated_total counter');
    lines.push(`sgn_kus_deduplicated_total ${this.ku.deduplicated_total}`);

    lines.push('# HELP sgn_consistency_mismatches DB-FS consistency mismatches');
    lines.push('# TYPE sgn_consistency_mismatches gauge');
    lines.push(`sgn_consistency_mismatches ${this.consistency.mismatches}`);

    return lines.join('\n') + '\n';
  },

  // Helper methods for advanced metrics
  updateFsKusCount() {
    try {
      const fs = require('fs');
      const path = require('path');
      // Use absolute path from env or resolve relative to current working directory
      const kusDir = process.env.SGN_KUS_DIR || path.resolve(process.cwd(), 'data/kus');
      if (fs.existsSync(kusDir)) {
        const files = fs.readdirSync(kusDir).filter(f => f.endsWith('.json'));
        this.fs.kus_count = files.length;
      } else {
        this.fs.kus_count = 0;
      }
    } catch (error) {
      // Log error for debugging
      console.warn(`Failed to update FS KUs count: ${error.message}`);
      this.fs.kus_count = 0;
    }
  },

  incrementKuStored(source = 'http_publish') {
    this.ku.stored_total++;
  },

  incrementDeduplication() {
    this.ku.deduplicated_total++;
  },

  incrementOutboxDelivery() {
    this.outbox.deliveries++;
  },

  incrementOutboxRetry() {
    this.outbox.retries++;
  },

  setOutboxStalled(count) {
    this.outbox.stalled = count;
  },

  // DB write timing helper
  startDbWriteTimer() {
    return Date.now();
  },

  endDbWriteTimer(startTime) {
    const duration = Date.now() - startTime;
    this.db.write.observe(duration);
    return duration;
  },

  setConsistencyMismatches(count) {
    this.consistency.mismatches = count;
  }
};

export function sinceNs() { return process.hrtime.bigint(); }
export function tookMs(t0) { return Number((process.hrtime.bigint() - t0) / 1000000n); }

