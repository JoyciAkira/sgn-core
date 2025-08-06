/**
 * SQLite Storage Tier Implementation
 * Phase 2: Multi-tier Persistence - Warm Storage Layer
 * 
 * Features:
 * - Persistent local storage
 * - Advanced indexing and querying
 * - Full-text search capabilities
 * - Reputation integration
 * - Performance optimization
 * - Transaction support
 */

import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import { StorageTier } from './multi-tier-storage.mjs';
import { reputationManager } from '../reputation-manager.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * SQLite Storage Tier
 * Provides persistent warm storage with advanced querying capabilities
 */
export class SQLiteStorageTier extends StorageTier {
  constructor() {
    super('sqlite');
    this.db = null;
    this.dbPath = path.join(__dirname, '../db/sgn-multi-tier.db');
    
    // Performance metrics
    this.metrics = {
      reads: 0,
      writes: 0,
      searches: 0,
      totalRequests: 0,
      averageQueryTime: 0
    };
    
    // Prepared statements cache
    this.statements = new Map();
  }
  
  /**
   * Initialize SQLite storage tier
   */
  async initialize() {
    console.log("🔶 Initializing SQLite Storage Tier (Warm Storage)...");
    
    try {
      // Open database connection
      this.db = new Database(this.dbPath);
      
      // Configure database for performance
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = 10000');
      this.db.pragma('foreign_keys = ON');
      
      // Create tables and indexes
      this.createTables();
      this.createIndexes();
      this.createViews();
      
      // Prepare common statements
      this.prepareStatements();
      
      this.isInitialized = true;
      console.log("✅ SQLite Storage Tier initialized successfully");
      
    } catch (error) {
      console.error("❌ Failed to initialize SQLite Storage Tier:", error);
      throw error;
    }
  }
  
  /**
   * Create database tables
   */
  createTables() {
    // Enhanced knowledge_units table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_units (
        id TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        hash TEXT NOT NULL UNIQUE,
        full_hash TEXT,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        confidence REAL NOT NULL CHECK(confidence BETWEEN 0.0 AND 1.0),
        priority INTEGER DEFAULT 0,
        
        -- Content
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        solution TEXT NOT NULL,
        references TEXT, -- JSON array
        tags TEXT,       -- JSON array
        affected_systems TEXT, -- JSON array
        
        -- Provenance
        discovered_by TEXT NOT NULL,
        verified_by TEXT, -- JSON array
        origin_peer TEXT,
        
        -- Timestamps
        timestamp TEXT NOT NULL,
        last_modified TEXT,
        expires_at TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        
        -- Security
        signature TEXT,
        signature_metadata TEXT, -- JSON
        
        -- Quality metrics
        accuracy REAL DEFAULT 0.8,
        completeness REAL DEFAULT 0.7,
        relevance REAL DEFAULT 0.8,
        impact REAL DEFAULT 0.5,
        
        -- Network
        propagation_path TEXT, -- JSON array
        network_version TEXT DEFAULT '1.2',
        
        -- Storage metadata
        tier_history TEXT, -- JSON array of tier movements
        access_count INTEGER DEFAULT 0,
        last_access DATETIME DEFAULT CURRENT_TIMESTAMP,
        cache_priority REAL DEFAULT 0.5
      );
    `);
    
    // Reputation data table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS peer_reputation (
        peer_id TEXT PRIMARY KEY,
        trust_score REAL NOT NULL,
        valid_signatures INTEGER DEFAULT 0,
        invalid_signatures INTEGER DEFAULT 0,
        verified_kus INTEGER DEFAULT 0,
        spam_reports INTEGER DEFAULT 0,
        quality_ratings TEXT, -- JSON array
        first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_activity DATETIME DEFAULT CURRENT_TIMESTAMP,
        reputation_history TEXT -- JSON array
      );
    `);
    
    // Search and analytics tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ku_relationships (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        source_ku_id TEXT NOT NULL,
        target_ku_id TEXT NOT NULL,
        relationship_type TEXT NOT NULL, -- 'similar', 'supersedes', 'related'
        strength REAL DEFAULT 0.5,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (source_ku_id) REFERENCES knowledge_units(id),
        FOREIGN KEY (target_ku_id) REFERENCES knowledge_units(id)
      );
    `);
  }
  
  /**
   * Create database indexes for performance
   */
  createIndexes() {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_ku_type_severity ON knowledge_units(type, severity)',
      'CREATE INDEX IF NOT EXISTS idx_ku_confidence ON knowledge_units(confidence DESC)',
      'CREATE INDEX IF NOT EXISTS idx_ku_timestamp ON knowledge_units(timestamp DESC)',
      'CREATE INDEX IF NOT EXISTS idx_ku_origin_peer ON knowledge_units(origin_peer)',
      'CREATE INDEX IF NOT EXISTS idx_ku_priority ON knowledge_units(priority DESC)',
      'CREATE INDEX IF NOT EXISTS idx_ku_access_count ON knowledge_units(access_count DESC)',
      'CREATE INDEX IF NOT EXISTS idx_ku_last_access ON knowledge_units(last_access DESC)',
      'CREATE INDEX IF NOT EXISTS idx_reputation_trust ON peer_reputation(trust_score DESC)',
      'CREATE INDEX IF NOT EXISTS idx_relationships_source ON ku_relationships(source_ku_id)',
      'CREATE INDEX IF NOT EXISTS idx_relationships_target ON ku_relationships(target_ku_id)'
    ];
    
    indexes.forEach(indexSQL => {
      this.db.exec(indexSQL);
    });
    
    // Full-text search index
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ku_fts USING fts5(
        id UNINDEXED,
        title,
        description,
        solution,
        tags,
        content='knowledge_units',
        content_rowid='rowid'
      );
    `);
    
    // Triggers to maintain FTS index
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS ku_fts_insert AFTER INSERT ON knowledge_units BEGIN
        INSERT INTO ku_fts(id, title, description, solution, tags)
        VALUES (new.id, new.title, new.description, new.solution, new.tags);
      END;
    `);
    
    this.db.exec(`
      CREATE TRIGGER IF NOT EXISTS ku_fts_update AFTER UPDATE ON knowledge_units BEGIN
        UPDATE ku_fts SET title=new.title, description=new.description, 
                         solution=new.solution, tags=new.tags WHERE id=new.id;
      END;
    `);
  }
  
  /**
   * Create database views for analytics
   */
  createViews() {
    // KU statistics view
    this.db.exec(`
      CREATE VIEW IF NOT EXISTS ku_stats AS
      SELECT
        type,
        severity,
        COUNT(*) as total_count,
        AVG(confidence) as avg_confidence,
        AVG(priority) as avg_priority,
        MAX(timestamp) as latest_timestamp,
        AVG(access_count) as avg_access_count
      FROM knowledge_units
      GROUP BY type, severity;
    `);
    
    // Peer performance view
    this.db.exec(`
      CREATE VIEW IF NOT EXISTS peer_performance AS
      SELECT
        pr.peer_id,
        pr.trust_score,
        COUNT(ku.id) as contributed_kus,
        AVG(ku.confidence) as avg_ku_confidence,
        AVG(ku.access_count) as avg_ku_popularity
      FROM peer_reputation pr
      LEFT JOIN knowledge_units ku ON pr.peer_id = ku.origin_peer
      GROUP BY pr.peer_id, pr.trust_score;
    `);
  }
  
  /**
   * Prepare common SQL statements
   */
  prepareStatements() {
    this.statements.set('insertKU', this.db.prepare(`
      INSERT OR REPLACE INTO knowledge_units (
        id, version, hash, full_hash, type, severity, confidence, priority,
        title, description, solution, references, tags, affected_systems,
        discovered_by, verified_by, origin_peer, timestamp, last_modified,
        expires_at, signature, signature_metadata, accuracy, completeness,
        relevance, impact, propagation_path, network_version, tier_history,
        access_count, cache_priority
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `));
    
    this.statements.set('selectKU', this.db.prepare(`
      SELECT * FROM knowledge_units WHERE id = ?
    `));
    
    this.statements.set('updateAccess', this.db.prepare(`
      UPDATE knowledge_units 
      SET access_count = access_count + 1, last_access = CURRENT_TIMESTAMP 
      WHERE id = ?
    `));
    
    this.statements.set('searchByType', this.db.prepare(`
      SELECT * FROM knowledge_units 
      WHERE type = ? AND confidence >= ? 
      ORDER BY priority DESC, confidence DESC 
      LIMIT ?
    `));
  }
  
  /**
   * Store Knowledge Unit in warm storage
   * @param {KnowledgeUnit} ku - Knowledge Unit to store
   * @param {Object} options - Storage options
   */
  async store(ku, options = {}) {
    if (!this.isInitialized) {
      throw new Error("SQLite storage tier not initialized");
    }
    
    const startTime = Date.now();
    this.metrics.writes++;
    this.metrics.totalRequests++;
    
    try {
      // Calculate priority and cache metrics
      const priority = this.calculateStoragePriority(ku);
      const cachePriority = this.calculateCachePriority(ku);
      
      // Prepare data for storage
      const stmt = this.statements.get('insertKU');
      const result = stmt.run(
        ku.id,
        ku.version || '1.2',
        ku.hash,
        ku.metadata?.fullHash || null,
        ku.type,
        ku.severity,
        ku.confidence,
        priority,
        ku.title,
        ku.description,
        ku.solution,
        JSON.stringify(ku.references || []),
        JSON.stringify(ku.tags || []),
        JSON.stringify(ku.affectedSystems || []),
        ku.discoveredBy,
        JSON.stringify(ku.verifiedBy || []),
        ku.originPeer || null,
        ku.timestamp,
        ku.lastModified || ku.timestamp,
        ku.expiresAt || null,
        ku.signature || null,
        ku.signatureMetadata ? JSON.stringify(ku.signatureMetadata) : null,
        ku.accuracy || 0.8,
        ku.completeness || 0.7,
        ku.relevance || 0.8,
        ku.impact || 0.5,
        JSON.stringify(ku.propagationPath || []),
        ku.networkVersion || '1.2',
        JSON.stringify([{ tier: 'sqlite', timestamp: Date.now() }]),
        0, // initial access count
        cachePriority
      );
      
      // Update metrics
      const queryTime = Date.now() - startTime;
      this.updateQueryTimeMetrics(queryTime);
      
      console.log(`🔶 Stored KU ${ku.id} in SQLite (priority: ${priority})`);
      return { success: true, changes: result.changes };
      
    } catch (error) {
      console.error(`❌ Failed to store KU ${ku.id} in SQLite:`, error);
      throw error;
    }
  }
  
  /**
   * Retrieve Knowledge Unit from warm storage
   * @param {string} kuId - Knowledge Unit ID
   */
  async retrieve(kuId) {
    if (!this.isInitialized) {
      throw new Error("SQLite storage tier not initialized");
    }
    
    const startTime = Date.now();
    this.metrics.reads++;
    this.metrics.totalRequests++;
    
    try {
      const stmt = this.statements.get('selectKU');
      const row = stmt.get(kuId);
      
      if (!row) {
        return null;
      }
      
      // Update access statistics
      const updateStmt = this.statements.get('updateAccess');
      updateStmt.run(kuId);
      
      // Convert row to KU object
      const ku = this.rowToKU(row);
      
      // Update metrics
      const queryTime = Date.now() - startTime;
      this.updateQueryTimeMetrics(queryTime);
      
      console.log(`🔶 Retrieved KU ${kuId} from SQLite`);
      return ku;
      
    } catch (error) {
      console.error(`❌ Failed to retrieve KU ${kuId} from SQLite:`, error);
      throw error;
    }
  }
  
  /**
   * Search Knowledge Units in warm storage
   * @param {Object} query - Search query
   * @param {Object} options - Search options
   */
  async search(query, options = {}) {
    if (!this.isInitialized) {
      throw new Error("SQLite storage tier not initialized");
    }
    
    const startTime = Date.now();
    this.metrics.searches++;
    this.metrics.totalRequests++;
    
    try {
      let sql = 'SELECT * FROM knowledge_units WHERE 1=1';
      const params = [];
      
      // Build dynamic query
      if (query.type) {
        sql += ' AND type = ?';
        params.push(query.type);
      }
      
      if (query.severity) {
        sql += ' AND severity = ?';
        params.push(query.severity);
      }
      
      if (query.minConfidence) {
        sql += ' AND confidence >= ?';
        params.push(query.minConfidence);
      }
      
      if (query.originPeer) {
        sql += ' AND origin_peer = ?';
        params.push(query.originPeer);
      }
      
      if (query.tags && query.tags.length > 0) {
        const tagConditions = query.tags.map(() => 'tags LIKE ?').join(' OR ');
        sql += ` AND (${tagConditions})`;
        query.tags.forEach(tag => params.push(`%"${tag}"%`));
      }
      
      // Full-text search
      if (query.text) {
        sql = `
          SELECT ku.* FROM knowledge_units ku
          JOIN ku_fts fts ON ku.id = fts.id
          WHERE fts MATCH ?
        `;
        params.unshift(query.text);
      }
      
      // Add ordering and limit
      sql += ' ORDER BY priority DESC, confidence DESC, access_count DESC';
      sql += ' LIMIT ?';
      params.push(options.limit || 50);
      
      const stmt = this.db.prepare(sql);
      const rows = stmt.all(...params);
      
      // Convert rows to KU objects
      const results = rows.map(row => this.rowToKU(row));
      
      // Update metrics
      const queryTime = Date.now() - startTime;
      this.updateQueryTimeMetrics(queryTime);
      
      console.log(`🔍 SQLite search returned ${results.length} results`);
      return results;
      
    } catch (error) {
      console.error("❌ Failed to search SQLite:", error);
      throw error;
    }
  }
  
  /**
   * Get storage size
   */
  size() {
    if (!this.isInitialized) return 0;
    
    const stmt = this.db.prepare('SELECT COUNT(*) as count FROM knowledge_units');
    const result = stmt.get();
    return result.count;
  }
  
  /**
   * Calculate storage priority for a KU
   * @param {KnowledgeUnit} ku 
   */
  calculateStoragePriority(ku) {
    let priority = 0;
    
    // Severity priority
    const severityPriority = { 'CRITICAL': 100, 'HIGH': 70, 'MEDIUM': 40, 'LOW': 10 };
    priority += severityPriority[ku.severity] || 0;
    
    // Confidence priority
    priority += ku.confidence * 50;
    
    // Reputation priority
    if (ku.originPeer) {
      const reputation = reputationManager.getPeerReputation(ku.originPeer);
      if (reputation) {
        priority += reputation.trustScore * 30;
      }
    }
    
    return Math.floor(priority);
  }
  
  /**
   * Calculate cache priority for a KU
   * @param {KnowledgeUnit} ku 
   */
  calculateCachePriority(ku) {
    let priority = ku.confidence;
    
    if (ku.severity === 'CRITICAL') priority += 0.3;
    if (ku.severity === 'HIGH') priority += 0.2;
    
    return Math.min(1.0, priority);
  }
  
  /**
   * Convert database row to KU object
   * @param {Object} row 
   */
  rowToKU(row) {
    return {
      id: row.id,
      version: row.version,
      hash: row.hash,
      type: row.type,
      severity: row.severity,
      confidence: row.confidence,
      priority: row.priority,
      title: row.title,
      description: row.description,
      solution: row.solution,
      references: JSON.parse(row.references || '[]'),
      tags: JSON.parse(row.tags || '[]'),
      affectedSystems: JSON.parse(row.affected_systems || '[]'),
      discoveredBy: row.discovered_by,
      verifiedBy: JSON.parse(row.verified_by || '[]'),
      originPeer: row.origin_peer,
      timestamp: row.timestamp,
      lastModified: row.last_modified,
      expiresAt: row.expires_at,
      signature: row.signature,
      signatureMetadata: row.signature_metadata ? JSON.parse(row.signature_metadata) : null,
      accuracy: row.accuracy,
      completeness: row.completeness,
      relevance: row.relevance,
      impact: row.impact,
      propagationPath: JSON.parse(row.propagation_path || '[]'),
      networkVersion: row.network_version,
      metadata: {
        fullHash: row.full_hash,
        accessCount: row.access_count,
        lastAccess: row.last_access,
        cachePriority: row.cache_priority
      }
    };
  }
  
  /**
   * Update query time metrics
   * @param {number} queryTime 
   */
  updateQueryTimeMetrics(queryTime) {
    this.metrics.averageQueryTime = 
      (this.metrics.averageQueryTime * (this.metrics.totalRequests - 1) + queryTime) / 
      this.metrics.totalRequests;
  }
  
  /**
   * Get detailed statistics
   */
  getStatistics() {
    const dbStats = this.db.prepare(`
      SELECT 
        COUNT(*) as total_kus,
        AVG(confidence) as avg_confidence,
        AVG(access_count) as avg_access_count,
        MAX(last_access) as latest_access
      FROM knowledge_units
    `).get();
    
    return {
      ...this.metrics,
      ...dbStats,
      dbSize: this.size(),
      dbPath: this.dbPath
    };
  }
}
