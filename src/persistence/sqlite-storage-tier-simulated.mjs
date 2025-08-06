/**
 * SQLite Storage Tier Implementation (Simulated)
 * Phase 2: Multi-tier Persistence - Warm Storage Layer
 * 
 * Features:
 * - Simulated persistent local storage
 * - Advanced indexing and querying simulation
 * - Full-text search capabilities simulation
 * - Reputation integration
 * - Performance optimization simulation
 * 
 * Note: This is a SQLite-compatible simulation for development.
 * In production, replace with actual better-sqlite3 implementation.
 */

import { StorageTier } from './storage-tier-base.mjs';
import { reputationManager } from '../reputation-manager.mjs';

/**
 * SQLite Storage Tier (Simulated)
 * Provides persistent warm storage simulation with advanced querying capabilities
 */
export class SQLiteStorageTier extends StorageTier {
  constructor() {
    super('sqlite');
    
    // Simulated database storage
    this.tables = {
      knowledge_units: new Map(), // id -> row data
      peer_reputation: new Map(),
      ku_relationships: new Map()
    };
    
    // Simulated indexes
    this.indexes = {
      type: new Map(),           // type -> Set(ids)
      severity: new Map(),       // severity -> Set(ids)
      confidence: new Map(),     // confidence range -> Set(ids)
      originPeer: new Map(),     // peerId -> Set(ids)
      tags: new Map()            // tag -> Set(ids)
    };
    
    // Performance metrics
    this.metrics = {
      reads: 0,
      writes: 0,
      searches: 0,
      totalRequests: 0,
      averageQueryTime: 0
    };
  }
  
  /**
   * Initialize SQLite storage tier
   */
  async initialize() {
    console.log("🔶 Initializing SQLite Storage Tier (Warm Storage - Simulated)...");
    
    try {
      // Initialize simulated database structures
      this.initializeIndexes();
      
      this.isInitialized = true;
      console.log("✅ SQLite Storage Tier (Simulated) initialized successfully");
      
    } catch (error) {
      console.error("❌ Failed to initialize SQLite Storage Tier:", error);
      throw error;
    }
  }
  
  /**
   * Initialize indexes
   */
  initializeIndexes() {
    // Initialize index maps
    Object.keys(this.indexes).forEach(indexName => {
      this.indexes[indexName] = new Map();
    });
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
      
      // Create row data
      const rowData = {
        id: ku.id,
        version: ku.version || '1.2',
        hash: ku.hash,
        full_hash: ku.metadata?.fullHash || null,
        type: ku.type,
        severity: ku.severity,
        confidence: ku.confidence,
        priority: priority,
        title: ku.title,
        description: ku.description,
        solution: ku.solution,
        references: JSON.stringify(ku.references || []),
        tags: JSON.stringify(ku.tags || []),
        affected_systems: JSON.stringify(ku.affectedSystems || []),
        discovered_by: ku.discoveredBy,
        verified_by: JSON.stringify(ku.verifiedBy || []),
        origin_peer: ku.originPeer || null,
        timestamp: ku.timestamp,
        last_modified: ku.lastModified || ku.timestamp,
        expires_at: ku.expiresAt || null,
        signature: ku.signature || null,
        signature_metadata: ku.signatureMetadata ? JSON.stringify(ku.signatureMetadata) : null,
        accuracy: ku.accuracy || 0.8,
        completeness: ku.completeness || 0.7,
        relevance: ku.relevance || 0.8,
        impact: ku.impact || 0.5,
        propagation_path: JSON.stringify(ku.propagationPath || []),
        network_version: ku.networkVersion || '1.2',
        tier_history: JSON.stringify([{ tier: 'sqlite', timestamp: Date.now() }]),
        access_count: 0,
        last_access: new Date().toISOString(),
        cache_priority: cachePriority,
        created_at: new Date().toISOString()
      };
      
      // Store in simulated table
      this.tables.knowledge_units.set(ku.id, rowData);
      
      // Update indexes
      this.updateIndexes(ku.id, rowData);
      
      // Update metrics
      const queryTime = Date.now() - startTime;
      this.updateQueryTimeMetrics(queryTime);
      
      console.log(`🔶 Stored KU ${ku.id} in SQLite (simulated) (priority: ${priority})`);
      return { success: true, changes: 1 };
      
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
      const rowData = this.tables.knowledge_units.get(kuId);
      
      if (!rowData) {
        return null;
      }
      
      // Update access statistics
      rowData.access_count = (rowData.access_count || 0) + 1;
      rowData.last_access = new Date().toISOString();
      
      // Convert row to KU object
      const ku = this.rowToKU(rowData);
      
      // Update metrics
      const queryTime = Date.now() - startTime;
      this.updateQueryTimeMetrics(queryTime);
      
      console.log(`🔶 Retrieved KU ${kuId} from SQLite (simulated)`);
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
      let candidateIds = new Set();
      
      // Use indexes for efficient filtering
      if (query.type) {
        candidateIds = this.indexes.type.get(query.type) || new Set();
      } else {
        candidateIds = new Set(this.tables.knowledge_units.keys());
      }
      
      // Apply additional filters
      candidateIds = this.applyFilters(candidateIds, query);
      
      // Convert to KU objects and sort
      const results = Array.from(candidateIds)
        .map(id => {
          const rowData = this.tables.knowledge_units.get(id);
          return this.rowToKU(rowData);
        })
        .sort((a, b) => {
          // Sort by priority, confidence, access count
          if (a.priority !== b.priority) return b.priority - a.priority;
          if (a.confidence !== b.confidence) return b.confidence - a.confidence;
          return (b.metadata?.accessCount || 0) - (a.metadata?.accessCount || 0);
        })
        .slice(0, options.limit || 50);
      
      // Update metrics
      const queryTime = Date.now() - startTime;
      this.updateQueryTimeMetrics(queryTime);
      
      console.log(`🔍 SQLite (simulated) search returned ${results.length} results`);
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
    return this.tables.knowledge_units.size;
  }
  
  /**
   * Update indexes when storing data
   * @param {string} kuId 
   * @param {Object} rowData 
   */
  updateIndexes(kuId, rowData) {
    // Type index
    if (!this.indexes.type.has(rowData.type)) {
      this.indexes.type.set(rowData.type, new Set());
    }
    this.indexes.type.get(rowData.type).add(kuId);
    
    // Severity index
    if (!this.indexes.severity.has(rowData.severity)) {
      this.indexes.severity.set(rowData.severity, new Set());
    }
    this.indexes.severity.get(rowData.severity).add(kuId);
    
    // Origin peer index
    if (rowData.origin_peer) {
      if (!this.indexes.originPeer.has(rowData.origin_peer)) {
        this.indexes.originPeer.set(rowData.origin_peer, new Set());
      }
      this.indexes.originPeer.get(rowData.origin_peer).add(kuId);
    }
    
    // Tags index
    const tags = JSON.parse(rowData.tags || '[]');
    tags.forEach(tag => {
      if (!this.indexes.tags.has(tag)) {
        this.indexes.tags.set(tag, new Set());
      }
      this.indexes.tags.get(tag).add(kuId);
    });
  }
  
  /**
   * Apply filters to candidate IDs
   * @param {Set} candidateIds 
   * @param {Object} query 
   */
  applyFilters(candidateIds, query) {
    const filtered = new Set();
    
    for (const id of candidateIds) {
      const rowData = this.tables.knowledge_units.get(id);
      if (!rowData) continue;
      
      // Apply filters
      if (query.severity && rowData.severity !== query.severity) continue;
      if (query.minConfidence && rowData.confidence < query.minConfidence) continue;
      if (query.originPeer && rowData.origin_peer !== query.originPeer) continue;
      
      // Tag filter
      if (query.tags && query.tags.length > 0) {
        const rowTags = JSON.parse(rowData.tags || '[]');
        const hasMatchingTag = query.tags.some(tag => rowTags.includes(tag));
        if (!hasMatchingTag) continue;
      }
      
      // Text search (simple implementation)
      if (query.text) {
        const searchText = query.text.toLowerCase();
        const searchableText = `${rowData.title} ${rowData.description} ${rowData.solution}`.toLowerCase();
        if (!searchableText.includes(searchText)) continue;
      }
      
      filtered.add(id);
    }
    
    return filtered;
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
   * @param {Object} rowData 
   */
  rowToKU(rowData) {
    return {
      id: rowData.id,
      version: rowData.version,
      hash: rowData.hash,
      type: rowData.type,
      severity: rowData.severity,
      confidence: rowData.confidence,
      priority: rowData.priority,
      title: rowData.title,
      description: rowData.description,
      solution: rowData.solution,
      references: JSON.parse(rowData.references || '[]'),
      tags: JSON.parse(rowData.tags || '[]'),
      affectedSystems: JSON.parse(rowData.affected_systems || '[]'),
      discoveredBy: rowData.discovered_by,
      verifiedBy: JSON.parse(rowData.verified_by || '[]'),
      originPeer: rowData.origin_peer,
      timestamp: rowData.timestamp,
      lastModified: rowData.last_modified,
      expiresAt: rowData.expires_at,
      signature: rowData.signature,
      signatureMetadata: rowData.signature_metadata ? JSON.parse(rowData.signature_metadata) : null,
      accuracy: rowData.accuracy,
      completeness: rowData.completeness,
      relevance: rowData.relevance,
      impact: rowData.impact,
      propagationPath: JSON.parse(rowData.propagation_path || '[]'),
      networkVersion: rowData.network_version,
      metadata: {
        fullHash: rowData.full_hash,
        accessCount: rowData.access_count,
        lastAccess: rowData.last_access,
        cachePriority: rowData.cache_priority
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
    const totalKUs = this.tables.knowledge_units.size;
    let totalAccessCount = 0;
    let avgConfidence = 0;
    
    for (const rowData of this.tables.knowledge_units.values()) {
      totalAccessCount += rowData.access_count || 0;
      avgConfidence += rowData.confidence;
    }
    
    return {
      ...this.metrics,
      total_kus: totalKUs,
      avg_confidence: totalKUs > 0 ? avgConfidence / totalKUs : 0,
      avg_access_count: totalKUs > 0 ? totalAccessCount / totalKUs : 0,
      dbSize: totalKUs,
      simulated: true
    };
  }
}
