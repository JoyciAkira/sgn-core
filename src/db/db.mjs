import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, 'sgn-poc.db');

let db;

function openDatabase() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    // Enable foreign keys
    db.pragma('foreign_keys = ON');
  }
  return db;
}

function createTableIfNotExists() {
  const db = openDatabase();
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_units (
      id TEXT PRIMARY KEY,
      version TEXT NOT NULL,
      hash TEXT NOT NULL UNIQUE,
      type TEXT CHECK(type IN ('vulnerability', 'solution', 'alert')),
      severity TEXT CHECK(severity IN ('critical', 'high', 'medium', 'low')),
      confidence REAL CHECK(confidence BETWEEN 0.0 AND 1.0),
      title TEXT NOT NULL,
      description TEXT,
      solution TEXT,
      references JSONB,
      tags TEXT[] DEFAULT '{}',
      discovered_by TEXT NOT NULL,
      timestamp TIMESTAMPTZ DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      expires_at TIMESTAMPTZ,
      signature TEXT NOT NULL,
      reputation_score REAL DEFAULT 0.5
    );
  `);
}

function createIndexes() {
  const db = openDatabase();
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_type_severity ON knowledge_units(type, severity);
    CREATE INDEX IF NOT EXISTS idx_confidence ON knowledge_units(confidence DESC);
  `);
}

export function initDB() {
  createTableIfNotExists();
  createIndexes();
}

export function insertKU(ku) {
  const db = openDatabase();
  const stmt = db.prepare(`
    INSERT INTO knowledge_units (
      id, version, hash, type, severity, confidence, title, 
      description, solution, references, tags, discovered_by, 
      timestamp, expires_at, signature, reputation_score
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
    )
  `);
  
  // Convert references and tags to JSON strings
  const references = JSON.stringify(ku.references);
  const tags = JSON.stringify(ku.tags);
  
  stmt.run(
    ku.id,
    ku.version,
    ku.hash,
    ku.type,
    ku.severity,
    ku.confidence,
    ku.title,
    ku.description,
    ku.solution,
    references,
    tags,
    ku.discoveredBy,
    ku.timestamp,
    ku.expiresAt,
    ku.signature,
    ku.reputationScore
  );
}

export function getKUById(id) {
  const db = openDatabase();
  const stmt = db.prepare('SELECT * FROM knowledge_units WHERE id = ?');
  const row = stmt.get(id);
  
  if (!row) return null;
  
  // Convert JSON strings back to arrays
  row.references = JSON.parse(row.references);
  row.tags = JSON.parse(row.tags);
  
  return row;
}

export function getAllKUs() {
  const db = openDatabase();
  const stmt = db.prepare('SELECT * FROM knowledge_units');
  const rows = stmt.all();
  
  return rows.map(row => {
    row.references = JSON.parse(row.references);
    row.tags = JSON.parse(row.tags);
    return row;
  });
}

export function updateKU(ku) {
  const db = openDatabase();
  const stmt = db.prepare(`
    UPDATE knowledge_units SET
      version = ?,
      hash = ?,
      type = ?,
      severity = ?,
      confidence = ?,
      title = ?,
      description = ?,
      solution = ?,
      references = ?,
      tags = ?,
      discovered_by = ?,
      timestamp = ?,
      expires_at = ?,
      signature = ?,
      reputation_score = ?
    WHERE id = ?
  `);
  
  // Convert references and tags to JSON strings
  const references = JSON.stringify(ku.references);
  const tags = JSON.stringify(ku.tags);
  
  stmt.run(
    ku.version,
    ku.hash,
    ku.type,
    ku.severity,
    ku.confidence,
    ku.title,
    ku.description,
    ku.solution,
    references,
    tags,
    ku.discoveredBy,
    ku.timestamp,
    ku.expiresAt,
    ku.signature,
    ku.reputationScore,
    ku.id
  );
}

export function deleteKU(id) {
  const db = openDatabase();
  const stmt = db.prepare('DELETE FROM knowledge_units WHERE id = ?');
  stmt.run(id);
}

// Initialize database on import
initDB();