/**
 * Real SQLite Storage Implementation
 * Phase 4: Elimination of All Simulations
 * 
 * Features:
 * - Actual SQLite database with better-sqlite3
 * - Real SQL operations and indexing
 * - Full-text search capabilities
 * - Performance optimization
 * - Enterprise-grade reliability
 */

import Database from 'better-sqlite3';
import { blake3Hash } from '../crypto/blake3-hasher.mjs';
import { reputationManager } from '../reputation-manager.mjs';

/**
 * Real SQLite Storage Tier
 * Actual SQLite database implementation
 */
export class RealSQLiteStorageTier {
  constructor(options = {}) {
    this.dbPath = options.dbPath || 'sgn-knowledge.db';
    this.db = null;
    this.isInitialized = false;
    
    // Performance metrics
    this.metrics = {
      totalOperations: 0,
      insertOperations: 0,
      selectOperations: 0,
      updateOperations: 0,
      deleteOperations: 0,
      averageQueryTime: 0,
      totalQueryTime: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
    
    // Prepared statements cache
    this.statements = new Map();
  }
  
  /**
   * Initialize SQLite database
   */
  async initialize() {
    if (this.isInitialized) return;
    
    console.log(`📊 Initializing Real SQLite Storage: ${this.dbPath}`);
    
    try {
      // Create database connection
      this.db = new Database(this.dbPath);
      
      // Enable WAL mode for better performance
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('synchronous = NORMAL');
      this.db.pragma('cache_size = 10000');
      this.db.pragma('temp_store = MEMORY');
      
      // Create tables
      this.createTables();
      
      // Create indexes
      this.createIndexes();
      
      // Prepare common statements
      this.prepareStatements();
      
      this.isInitialized = true;
      console.log('✅ Real SQLite Storage initialized successfully');
      
    } catch (error) {
      console.error(`❌ Failed to initialize SQLite: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Create database tables
   */
  createTables() {
    // Knowledge Units table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_units (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        description TEXT NOT NULL,
        solution TEXT,
        severity TEXT NOT NULL,
        confidence REAL NOT NULL,
        tags TEXT, -- JSON array
        affected_systems TEXT, -- JSON array
        discovered_by TEXT,
        origin_peer TEXT,
        hash TEXT NOT NULL,
        signature TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        access_count INTEGER DEFAULT 0,
        last_accessed INTEGER,
        reputation_score REAL DEFAULT 0.5
      )
    `);
    
    // Full-text search table
    this.db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS ku_fts USING fts5(
        id,
        title,
        description,
        solution,
        tags,
        content='knowledge_units',
        content_rowid='rowid'
      )
    `);
    
    // Metadata table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ku_metadata (
        ku_id TEXT PRIMARY KEY,
        tier TEXT NOT NULL,
        priority INTEGER DEFAULT 50,
        ttl INTEGER,
        created_at INTEGER NOT NULL,
        accessed_at INTEGER,
        FOREIGN KEY (ku_id) REFERENCES knowledge_units (id)
      )
    `);
    
    // Performance tracking table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS performance_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation TEXT NOT NULL,
        duration_ms INTEGER NOT NULL,
        timestamp INTEGER NOT NULL,
        details TEXT
      )
    `);
  }
  
  /**
   * Create database indexes
   */
  createIndexes() {
    const indexes = [
      'CREATE INDEX IF NOT EXISTS idx_ku_type ON knowledge_units(type)',
      'CREATE INDEX IF NOT EXISTS idx_ku_severity ON knowledge_units(severity)',
      'CREATE INDEX IF NOT EXISTS idx_ku_confidence ON knowledge_units(confidence)',
      'CREATE INDEX IF NOT EXISTS idx_ku_created_at ON knowledge_units(created_at)',
      'CREATE INDEX IF NOT EXISTS idx_ku_access_count ON knowledge_units(access_count)',
      'CREATE INDEX IF NOT EXISTS idx_ku_origin_peer ON knowledge_units(origin_peer)',
      'CREATE INDEX IF NOT EXISTS idx_metadata_tier ON ku_metadata(tier)',
      'CREATE INDEX IF NOT EXISTS idx_metadata_priority ON ku_metadata(priority)',
      'CREATE INDEX IF NOT EXISTS idx_metadata_ttl ON ku_metadata(ttl)'
    ];
    
    for (const indexSql of indexes) {
      this.db.exec(indexSql);
    }
  }
  
  /**
   * Prepare common SQL statements
   */
  prepareStatements() {
    // Insert KU
    this.statements.set('insertKU', this.db.prepare(`
      INSERT OR REPLACE INTO knowledge_units (
        id, title, type, description, solution, severity, confidence,
        tags, affected_systems, discovered_by, origin_peer, hash, signature,
        created_at, updated_at, reputation_score
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `));
    
    // Insert metadata
    this.statements.set('insertMetadata', this.db.prepare(`
      INSERT OR REPLACE INTO ku_metadata (ku_id, tier, priority, ttl, created_at, accessed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `));
    
    // Select KU by ID
    this.statements.set('selectKU', this.db.prepare(`
      SELECT * FROM knowledge_units WHERE id = ?
    `));
    
    // Update access count
    this.statements.set('updateAccess', this.db.prepare(`
      UPDATE knowledge_units 
      SET access_count = access_count + 1, last_accessed = ?
      WHERE id = ?
    `));
    
    // Search KUs
    this.statements.set('searchKUs', this.db.prepare(`
      SELECT ku.*, meta.tier, meta.priority
      FROM knowledge_units ku
      LEFT JOIN ku_metadata meta ON ku.id = meta.ku_id
      WHERE 1=1
    `));
    
    // Full-text search
    this.statements.set('ftsSearch', this.db.prepare(`
      SELECT ku.*, meta.tier, meta.priority, fts.rank
      FROM ku_fts fts
      JOIN knowledge_units ku ON ku.id = fts.id
      LEFT JOIN ku_metadata meta ON ku.id = meta.ku_id
      WHERE ku_fts MATCH ?
      ORDER BY fts.rank
      LIMIT ?
    `));
  }
  
  /**
   * Store Knowledge Unit
   */
  async store(ku, options = {}) {
    const startTime = Date.now();
    
    try {
      const now = Date.now();
      const tier = options.tier || 'warm';
      const priority = this.calculatePriority(ku, options);
      const ttl = options.ttl || this.calculateTTL(ku);
      
      // Calculate reputation score
      const reputationScore = ku.originPeer ? 
        reputationManager.getPeerReputation(ku.originPeer)?.trustScore || 0.5 : 0.5;
      
      // Begin transaction
      const transaction = this.db.transaction(() => {
        // Insert KU
        this.statements.get('insertKU').run(
          ku.id,
          ku.title,
          ku.type,
          ku.description,
          ku.solution || null,
          ku.severity,
          ku.confidence,
          JSON.stringify(ku.tags || []),
          JSON.stringify(ku.affectedSystems || []),
          ku.discoveredBy || null,
          ku.originPeer || null,
          ku.hash,
          ku.signature || null,
          now,
          now,
          reputationScore
        );
        
        // Insert metadata
        this.statements.get('insertMetadata').run(
          ku.id,
          tier,
          priority,
          ttl,
          now,
          now
        );
        
        // Update FTS index
        this.db.exec(`
          INSERT OR REPLACE INTO ku_fts (id, title, description, solution, tags)
          VALUES ('${ku.id}', '${ku.title}', '${ku.description}', '${ku.solution || ''}', '${(ku.tags || []).join(' ')}')
        `);
      });
      
      transaction();
      
      // Update metrics
      const duration = Date.now() - startTime;
      this.updateMetrics('insert', duration);
      
      console.log(`💾 Stored KU in Real SQLite: ${ku.id} (${duration}ms)`);
      return true;
      
    } catch (error) {
      console.error(`❌ SQLite store error: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Retrieve Knowledge Unit by ID
   */
  async retrieve(kuId) {
    const startTime = Date.now();
    
    try {
      const row = this.statements.get('selectKU').get(kuId);
      
      if (!row) {
        this.metrics.cacheMisses++;
        return null;
      }
      
      // Update access count
      this.statements.get('updateAccess').run(Date.now(), kuId);
      
      // Convert row to KU object
      const ku = this.rowToKU(row);
      
      // Update metrics
      const duration = Date.now() - startTime;
      this.updateMetrics('select', duration);
      this.metrics.cacheHits++;
      
      console.log(`📖 Retrieved KU from Real SQLite: ${kuId} (${duration}ms)`);
      return ku;
      
    } catch (error) {
      console.error(`❌ SQLite retrieve error: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Search Knowledge Units
   */
  async search(query, options = {}) {
    const startTime = Date.now();
    
    try {
      const limit = options.limit || 10;
      let results = [];
      
      // Full-text search if query has text
      if (typeof query === 'string' || query.text) {
        const searchText = typeof query === 'string' ? query : query.text;
        const rows = this.statements.get('ftsSearch').all(searchText, limit);
        results = rows.map(row => this.rowToKU(row));
      } else {
        // Structured search
        results = await this.structuredSearch(query, options);
      }
      
      // Update metrics
      const duration = Date.now() - startTime;
      this.updateMetrics('select', duration);
      
      console.log(`🔍 SQLite search returned ${results.length} results (${duration}ms)`);
      return results;
      
    } catch (error) {
      console.error(`❌ SQLite search error: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Structured search implementation
   */
  async structuredSearch(query, options) {
    let sql = `
      SELECT ku.*, meta.tier, meta.priority
      FROM knowledge_units ku
      LEFT JOIN ku_metadata meta ON ku.id = meta.ku_id
      WHERE 1=1
    `;
    const params = [];
    
    // Add conditions based on query
    if (query.type) {
      sql += ' AND ku.type = ?';
      params.push(query.type);
    }
    
    if (query.severity) {
      sql += ' AND ku.severity = ?';
      params.push(query.severity);
    }
    
    if (query.minConfidence) {
      sql += ' AND ku.confidence >= ?';
      params.push(query.minConfidence);
    }
    
    if (query.tags && query.tags.length > 0) {
      const tagConditions = query.tags.map(() => 'ku.tags LIKE ?').join(' OR ');
      sql += ` AND (${tagConditions})`;
      for (const tag of query.tags) {
        params.push(`%"${tag}"%`);
      }
    }
    
    if (query.affectedSystems && query.affectedSystems.length > 0) {
      const systemConditions = query.affectedSystems.map(() => 'ku.affected_systems LIKE ?').join(' OR ');
      sql += ` AND (${systemConditions})`;
      for (const system of query.affectedSystems) {
        params.push(`%"${system}"%`);
      }
    }
    
    // Order by relevance
    sql += ' ORDER BY ku.confidence DESC, ku.access_count DESC, ku.created_at DESC';
    
    // Limit results
    const limit = options.limit || 10;
    sql += ' LIMIT ?';
    params.push(limit);
    
    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params);
    
    return rows.map(row => this.rowToKU(row));
  }
  
  /**
   * Convert database row to KU object
   */
  rowToKU(row) {
    return {
      id: row.id,
      title: row.title,
      type: row.type,
      description: row.description,
      solution: row.solution,
      severity: row.severity,
      confidence: row.confidence,
      tags: JSON.parse(row.tags || '[]'),
      affectedSystems: JSON.parse(row.affected_systems || '[]'),
      discoveredBy: row.discovered_by,
      originPeer: row.origin_peer,
      hash: row.hash,
      signature: row.signature,
      createdAt: new Date(row.created_at).toISOString(),
      updatedAt: new Date(row.updated_at).toISOString(),
      accessCount: row.access_count,
      lastAccessed: row.last_accessed ? new Date(row.last_accessed).toISOString() : null,
      reputationScore: row.reputation_score,
      tier: row.tier,
      priority: row.priority
    };
  }
  
  /**
   * Calculate storage priority
   */
  calculatePriority(ku, options) {
    let priority = 50; // Base priority
    
    // Severity boost
    const severityBoost = {
      'CRITICAL': 40,
      'HIGH': 30,
      'MEDIUM': 20,
      'LOW': 10
    };
    priority += severityBoost[ku.severity] || 0;
    
    // Confidence boost
    priority += Math.floor(ku.confidence * 20);
    
    // Reputation boost
    if (ku.originPeer) {
      const reputation = reputationManager.getPeerReputation(ku.originPeer);
      if (reputation) {
        priority += Math.floor(reputation.trustScore * 10);
      }
    }
    
    return Math.min(priority, 100);
  }
  
  /**
   * Calculate TTL based on KU properties
   */
  calculateTTL(ku) {
    const baseTTL = 24 * 60 * 60 * 1000; // 24 hours
    
    // Critical KUs live longer
    if (ku.severity === 'CRITICAL') {
      return baseTTL * 7; // 7 days
    } else if (ku.severity === 'HIGH') {
      return baseTTL * 3; // 3 days
    }
    
    return baseTTL;
  }
  
  /**
   * Update performance metrics
   */
  updateMetrics(operation, duration) {
    this.metrics.totalOperations++;
    this.metrics[`${operation}Operations`]++;
    this.metrics.totalQueryTime += duration;
    this.metrics.averageQueryTime = this.metrics.totalQueryTime / this.metrics.totalOperations;
    
    // Log performance data
    this.db.prepare(`
      INSERT INTO performance_log (operation, duration_ms, timestamp, details)
      VALUES (?, ?, ?, ?)
    `).run(operation, duration, Date.now(), null);
  }
  
  /**
   * Get storage statistics
   */
  getStatistics() {
    const kuCount = this.db.prepare('SELECT COUNT(*) as count FROM knowledge_units').get().count;
    const avgConfidence = this.db.prepare('SELECT AVG(confidence) as avg FROM knowledge_units').get().avg;
    const topTypes = this.db.prepare(`
      SELECT type, COUNT(*) as count 
      FROM knowledge_units 
      GROUP BY type 
      ORDER BY count DESC 
      LIMIT 5
    `).all();
    
    return {
      ...this.metrics,
      totalKUs: kuCount,
      averageConfidence: avgConfidence,
      topTypes: topTypes,
      hitRate: this.metrics.cacheHits / Math.max(this.metrics.cacheHits + this.metrics.cacheMisses, 1),
      dbPath: this.dbPath,
      isReal: true
    };
  }
  
  /**
   * Close database connection
   */
  async close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
      console.log('✅ Real SQLite connection closed');
    }
  }
}
