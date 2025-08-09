/**
 * Dedup seen-set (LRU) for CID anti-replay
 */
export class DedupSeenSet {
  constructor(maxSize = 10000, windowMs = 60 * 60 * 1000) { // 1 hour window
    this.maxSize = maxSize;
    this.windowMs = windowMs;
    this.seen = new Map(); // cid -> timestamp
  }

  hasSeen(cid) {
    this.cleanup();
    return this.seen.has(cid);
  }

  markSeen(cid) {
    this.cleanup();
    this.seen.set(cid, Date.now());
    // LRU eviction if over maxSize
    if (this.seen.size > this.maxSize) {
      const firstKey = this.seen.keys().next().value;
      this.seen.delete(firstKey);
    }
  }

  cleanup() {
    const cutoff = Date.now() - this.windowMs;
    for (const [cid, timestamp] of this.seen.entries()) {
      if (timestamp < cutoff) {
        this.seen.delete(cid);
      }
    }
  }

  size() {
    this.cleanup();
    return this.seen.size;
  }
}
