/**
 * Persistent outbox with SQLite WAL + ACK/Retry/Backoff
 */
import Database from 'better-sqlite3';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export class PersistentOutbox {
  constructor(dbPath = 'data/outbox.db') {
    this.dbPath = dbPath;
    this.db = null;
    this.retryIntervals = [1000, 2000, 5000, 10000, 30000]; // backoff ms
    this.maxRetries = 5;
  }

  async initialize() {
    const dir = dirname(this.dbPath);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS outbox (
        seq INTEGER PRIMARY KEY AUTOINCREMENT,
        cid TEXT NOT NULL,
        target_peer TEXT,
        message_json TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        next_try_at INTEGER NOT NULL,
        last_error TEXT,
        created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now') * 1000)
      );
      CREATE INDEX IF NOT EXISTS outbox_next_try ON outbox(next_try_at);
    `);

    this.insertStmt = this.db.prepare('INSERT INTO outbox (cid, target_peer, message_json, next_try_at) VALUES (?, ?, ?, ?)');
    this.selectReadyStmt = this.db.prepare('SELECT * FROM outbox WHERE next_try_at <= ? ORDER BY next_try_at LIMIT ?');
    this.updateRetryStmt = this.db.prepare('UPDATE outbox SET attempts = ?, next_try_at = ?, last_error = ? WHERE seq = ?');
    this.deleteStmt = this.db.prepare('DELETE FROM outbox WHERE seq = ?');
  }

  enqueue(cid, message, targetPeer = null) {
    const messageJson = JSON.stringify(message);
    const nextTryAt = Date.now();
    this.insertStmt.run(cid, targetPeer, messageJson, nextTryAt);
  }

  getReady(limit = 50) {
    return this.selectReadyStmt.all(Date.now(), limit);
  }

  markSent(seq) {
    this.deleteStmt.run(seq);
  }

  markFailed(seq, error) {
    const row = this.db.prepare('SELECT attempts FROM outbox WHERE seq = ?').get(seq);
    if (!row) return;
    
    const attempts = row.attempts + 1;
    if (attempts >= this.maxRetries) {
      this.deleteStmt.run(seq); // give up
      return;
    }
    
    const backoffMs = this.retryIntervals[Math.min(attempts - 1, this.retryIntervals.length - 1)];
    const nextTryAt = Date.now() + backoffMs;
    this.updateRetryStmt.run(attempts, nextTryAt, error, seq);
  }

  size() {
    return this.db.prepare('SELECT COUNT(*) as count FROM outbox').get().count;
  }

  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}
