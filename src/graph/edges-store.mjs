import Database from 'better-sqlite3'
import { existsSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

const EDGE_TYPES = new Set(['applies_to','verifies','supersedes','conflicts_with'])

export class EdgesStore {
  constructor(dbPath = 'data/edges.db') {
    this.dbPath = dbPath
    this.db = null
    this.stmt = {}
  }

  initialize() {
    const dir = dirname(this.dbPath)
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    this.db = new Database(this.dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('cache_size = -20000')
    this.db.exec(`
CREATE TABLE IF NOT EXISTS edges (
  src_cid TEXT NOT NULL,
  dst_cid TEXT NOT NULL,
  type    TEXT NOT NULL CHECK (type IN ('applies_to','verifies','supersedes','conflicts_with')),
  created_at INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  publisher_key_id TEXT,
  PRIMARY KEY (src_cid, dst_cid, type)
);
CREATE INDEX IF NOT EXISTS edges_dst ON edges (dst_cid, type, created_at DESC);
CREATE INDEX IF NOT EXISTS edges_src ON edges (src_cid, type, created_at DESC);
`)
    this.stmt.insert = this.db.prepare('INSERT OR IGNORE INTO edges (src_cid, dst_cid, type, publisher_key_id) VALUES (?,?,?,?)')
    this.stmt.listOut = this.db.prepare('SELECT dst_cid as dst, type, created_at, publisher_key_id FROM edges WHERE src_cid=?' )
    this.stmt.listOutType = this.db.prepare('SELECT dst_cid as dst, type, created_at, publisher_key_id FROM edges WHERE src_cid=? AND type=?')
    this.stmt.listIn = this.db.prepare('SELECT src_cid as src, type, created_at, publisher_key_id FROM edges WHERE dst_cid=?')
    this.stmt.listInType = this.db.prepare('SELECT src_cid as src, type, created_at, publisher_key_id FROM edges WHERE dst_cid=? AND type=?')
    this.stmt.countExact = this.db.prepare('SELECT COUNT(*) as n FROM edges WHERE src_cid=? AND dst_cid=? AND type=?')
  }

  validateType(type) {
    return EDGE_TYPES.has(type)
  }

  insert(src, dst, type, publisher_key_id = null) {
    if (!this.validateType(type)) throw new Error('invalid_type')
    const info = this.stmt.insert.run(src, dst, type, publisher_key_id)
    return info.changes // 1 if inserted, 0 if duplicate
  }

  listOutgoing(src, type = null) {
    return type ? this.stmt.listOutType.all(src, type) : this.stmt.listOut.all(src)
  }

  listIncoming(dst, type = null) {
    return type ? this.stmt.listInType.all(dst, type) : this.stmt.listIn.all(dst)
  }

  listNeighbors(cid) {
    const out = this.listOutgoing(cid)
    const inn = this.listIncoming(cid)
    return { out, in: inn }
  }

  count(src, dst, type) { return this.stmt.countExact.get(src, dst, type).n }
}
