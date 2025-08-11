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
    toJSON() { return { count: this.n, p50: this.quantile(0.5), p95: this.quantile(0.95) }; }
  };
}

export const metrics = {
  http: { publish: hist(), verify: hist() },
  net: { delivered: 0, acked: 0, dedup: 0 },
  events: { drop: 0 },
  outbox: { ready: 0 },
  snapshot() {
    const http = {
      publish: this.http.publish.toJSON(),
      verify: this.http.verify.toJSON(),
    };
    const delivered = this.net.delivered, acked = this.net.acked, dedup = this.net.dedup;
    const delivery_rate = delivered ? acked / delivered : null;
    const dedup_ratio = delivered ? dedup / delivered : null;
    return { time_ms: Date.now(), http, net: { delivered, acked, retry: 0, dedup_ratio }, outbox: { ready: this.outbox.ready }, events: { drop: this.events.drop } };
  },
  toProm() {
    const s = this.snapshot();
    const lines = [];
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
    lines.push('# HELP sgn_outbox_ready ready items');
    lines.push('# TYPE sgn_outbox_ready gauge');
    lines.push(`sgn_outbox_ready ${s.outbox.ready}`);
    return lines.join('\n') + '\n';
  }
};

export function sinceNs() { return process.hrtime.bigint(); }
export function tookMs(t0) { return Number((process.hrtime.bigint() - t0) / 1000000n); }

