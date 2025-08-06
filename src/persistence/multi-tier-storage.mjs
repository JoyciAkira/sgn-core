/**
 * SGN Multi-tier Persistence Layer
 * Phase 2: Multi-tier Persistence Implementation
 * 
 * Architecture:
 * - Tier 1: Redis (Hot Cache) - Frequently accessed KUs
 * - Tier 2: SQLite (Warm Storage) - Local persistent storage
 * - Tier 3: Neo4j (Cold Graph) - Knowledge relationships and analytics
 * 
 * Features:
 * - Intelligent caching with TTL
 * - Automatic tier migration
 * - Performance optimization
 * - Graph relationship mapping
 * - Reputation-based prioritization
 */

import { reputationManager } from '../reputation-manager.mjs';
import { STORAGE_TIERS, CACHE_CONFIG } from './storage-tier-base.mjs';

/**
 * Multi-tier Storage Manager
 * Orchestrates data flow between storage tiers
 */
export class MultiTierStorage {
  constructor() {
    this.tiers = new Map();
    this.accessStats = new Map(); // KU access statistics
    this.migrationQueue = [];
    this.isInitialized = false;
    
    // Performance metrics
    this.metrics = {
      hotHits: 0,
      warmHits: 0,
      coldHits: 0,
      misses: 0,
      migrations: 0,
      totalRequests: 0
    };
  }
  
  /**
   * Initialize all storage tiers
   */
  async initialize() {
    console.log("🏗️ Initializing Multi-tier Storage System...");
    
    try {
      // Initialize Redis tier (simulated for now)
      this.tiers.set(STORAGE_TIERS.HOT, new RedisStorageTier());
      await this.tiers.get(STORAGE_TIERS.HOT).initialize();
      
      // Initialize SQLite tier
      this.tiers.set(STORAGE_TIERS.WARM, new SQLiteStorageTier());
      await this.tiers.get(STORAGE_TIERS.WARM).initialize();
      
      // Initialize Neo4j tier (simulated for now)
      this.tiers.set(STORAGE_TIERS.COLD, new Neo4jStorageTier());
      await this.tiers.get(STORAGE_TIERS.COLD).initialize();
      
      this.isInitialized = true;
      console.log("✅ Multi-tier Storage System initialized successfully");
      
      // Start background processes
      this.startMigrationWorker();
      this.startMetricsCollector();
      
    } catch (error) {
      console.error("❌ Failed to initialize Multi-tier Storage:", error);
      throw error;
    }
  }
  
  /**
   * Store Knowledge Unit with intelligent tier placement
   * @param {KnowledgeUnit} ku - Knowledge Unit to store
   * @param {Object} options - Storage options
   */
  async store(ku, options = {}) {
    if (!this.isInitialized) {
      throw new Error("Storage system not initialized");
    }
    
    this.metrics.totalRequests++;
    
    // Determine initial tier based on KU properties and reputation
    const initialTier = this.determineInitialTier(ku, options);
    
    try {
      // Store in determined tier
      await this.tiers.get(initialTier).store(ku);
      
      // Update access statistics
      this.updateAccessStats(ku.id, 'store');
      
      // Store in warm tier as backup if not already there
      if (initialTier !== STORAGE_TIERS.WARM) {
        await this.tiers.get(STORAGE_TIERS.WARM).store(ku);
      }
      
      console.log(`📦 Stored KU ${ku.id} in ${initialTier} tier`);
      return { success: true, tier: initialTier };
      
    } catch (error) {
      console.error(`❌ Failed to store KU ${ku.id}:`, error);
      throw error;
    }
  }
  
  /**
   * Retrieve Knowledge Unit with tier-aware lookup
   * @param {string} kuId - Knowledge Unit ID
   * @param {Object} options - Retrieval options
   */
  async retrieve(kuId, options = {}) {
    if (!this.isInitialized) {
      throw new Error("Storage system not initialized");
    }
    
    this.metrics.totalRequests++;
    
    // Try hot tier first
    let ku = await this.tiers.get(STORAGE_TIERS.HOT).retrieve(kuId);
    if (ku) {
      this.metrics.hotHits++;
      this.updateAccessStats(kuId, 'hit_hot');
      console.log(`🔥 Hot cache hit for KU ${kuId}`);
      return { ku, tier: STORAGE_TIERS.HOT, cached: true };
    }
    
    // Try warm tier
    ku = await this.tiers.get(STORAGE_TIERS.WARM).retrieve(kuId);
    if (ku) {
      this.metrics.warmHits++;
      this.updateAccessStats(kuId, 'hit_warm');
      
      // Promote to hot tier if frequently accessed
      if (this.shouldPromoteToHot(kuId)) {
        await this.tiers.get(STORAGE_TIERS.HOT).store(ku);
        console.log(`⬆️ Promoted KU ${kuId} to hot tier`);
      }
      
      console.log(`🔶 Warm storage hit for KU ${kuId}`);
      return { ku, tier: STORAGE_TIERS.WARM, cached: false };
    }
    
    // Try cold tier
    ku = await this.tiers.get(STORAGE_TIERS.COLD).retrieve(kuId);
    if (ku) {
      this.metrics.coldHits++;
      this.updateAccessStats(kuId, 'hit_cold');
      
      // Store in warm tier for faster future access
      await this.tiers.get(STORAGE_TIERS.WARM).store(ku);
      
      console.log(`🧊 Cold storage hit for KU ${kuId}`);
      return { ku, tier: STORAGE_TIERS.COLD, cached: false };
    }
    
    // Not found in any tier
    this.metrics.misses++;
    console.log(`❌ KU ${kuId} not found in any tier`);
    return { ku: null, tier: null, cached: false };
  }
  
  /**
   * Search across all tiers with intelligent result merging
   * @param {Object} query - Search query
   * @param {Object} options - Search options
   */
  async search(query, options = {}) {
    const results = new Map(); // kuId -> {ku, tier, score}
    
    // Search hot tier first (fastest)
    const hotResults = await this.tiers.get(STORAGE_TIERS.HOT).search(query, options);
    hotResults.forEach(ku => {
      results.set(ku.id, { ku, tier: STORAGE_TIERS.HOT, score: this.calculateRelevanceScore(ku, query) });
    });
    
    // Search warm tier
    const warmResults = await this.tiers.get(STORAGE_TIERS.WARM).search(query, options);
    warmResults.forEach(ku => {
      if (!results.has(ku.id)) {
        results.set(ku.id, { ku, tier: STORAGE_TIERS.WARM, score: this.calculateRelevanceScore(ku, query) });
      }
    });
    
    // Search cold tier if needed
    if (options.includeGraph) {
      const coldResults = await this.tiers.get(STORAGE_TIERS.COLD).search(query, options);
      coldResults.forEach(ku => {
        if (!results.has(ku.id)) {
          results.set(ku.id, { ku, tier: STORAGE_TIERS.COLD, score: this.calculateRelevanceScore(ku, query) });
        }
      });
    }
    
    // Sort by relevance score and return
    return Array.from(results.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, options.limit || 50);
  }
  
  /**
   * Determine initial storage tier for a KU
   * @param {KnowledgeUnit} ku 
   * @param {Object} options 
   */
  determineInitialTier(ku, options = {}) {
    // High priority KUs go to hot tier
    if (ku.severity === 'CRITICAL' || ku.confidence > 0.9) {
      return STORAGE_TIERS.HOT;
    }
    
    // Check peer reputation
    if (ku.originPeer) {
      const reputation = reputationManager.getPeerReputation(ku.originPeer);
      if (reputation && reputation.trustScore > 0.8) {
        return STORAGE_TIERS.HOT;
      }
    }
    
    // Default to warm tier
    return STORAGE_TIERS.WARM;
  }
  
  /**
   * Update access statistics for a KU
   * @param {string} kuId 
   * @param {string} action 
   */
  updateAccessStats(kuId, action) {
    if (!this.accessStats.has(kuId)) {
      this.accessStats.set(kuId, {
        accessCount: 0,
        lastAccess: Date.now(),
        hotHits: 0,
        warmHits: 0,
        coldHits: 0
      });
    }
    
    const stats = this.accessStats.get(kuId);
    stats.accessCount++;
    stats.lastAccess = Date.now();
    
    if (action.includes('hit_')) {
      const tier = action.split('_')[1];
      stats[`${tier}Hits`]++;
    }
  }
  
  /**
   * Check if KU should be promoted to hot tier
   * @param {string} kuId 
   */
  shouldPromoteToHot(kuId) {
    const stats = this.accessStats.get(kuId);
    if (!stats) return false;
    
    // Promote if accessed frequently in recent time
    const recentAccesses = stats.accessCount;
    const timeSinceLastAccess = Date.now() - stats.lastAccess;
    
    return recentAccesses > 5 && timeSinceLastAccess < 3600000; // 1 hour
  }
  
  /**
   * Calculate relevance score for search results
   * @param {KnowledgeUnit} ku 
   * @param {Object} query 
   */
  calculateRelevanceScore(ku, query) {
    let score = 0;
    
    // Base score from confidence
    score += ku.confidence * 10;
    
    // Severity bonus
    const severityBonus = {
      'CRITICAL': 5,
      'HIGH': 3,
      'MEDIUM': 1,
      'LOW': 0
    };
    score += severityBonus[ku.severity] || 0;
    
    // Reputation bonus
    if (ku.originPeer) {
      const reputation = reputationManager.getPeerReputation(ku.originPeer);
      if (reputation) {
        score += reputation.trustScore * 5;
      }
    }
    
    // Recency bonus
    const age = Date.now() - new Date(ku.timestamp).getTime();
    const daysSinceCreation = age / (1000 * 60 * 60 * 24);
    score += Math.max(0, 5 - daysSinceCreation); // Newer is better
    
    return score;
  }
  
  /**
   * Start background migration worker
   */
  startMigrationWorker() {
    setInterval(() => {
      this.processMigrationQueue();
    }, 60000); // Every minute
  }
  
  /**
   * Start metrics collection
   */
  startMetricsCollector() {
    setInterval(() => {
      this.logMetrics();
    }, 300000); // Every 5 minutes
  }
  
  /**
   * Process migration queue
   */
  async processMigrationQueue() {
    // Implementation for tier migration logic
    console.log("🔄 Processing tier migrations...");
  }
  
  /**
   * Log performance metrics
   */
  logMetrics() {
    const hitRate = ((this.metrics.hotHits + this.metrics.warmHits + this.metrics.coldHits) / this.metrics.totalRequests * 100).toFixed(1);
    console.log(`📊 Storage Metrics - Hit Rate: ${hitRate}%, Hot: ${this.metrics.hotHits}, Warm: ${this.metrics.warmHits}, Cold: ${this.metrics.coldHits}`);
  }
  
  /**
   * Get storage statistics
   */
  getStatistics() {
    return {
      ...this.metrics,
      hitRate: (this.metrics.hotHits + this.metrics.warmHits + this.metrics.coldHits) / this.metrics.totalRequests,
      tierSizes: {
        hot: this.tiers.get(STORAGE_TIERS.HOT)?.size() || 0,
        warm: this.tiers.get(STORAGE_TIERS.WARM)?.size() || 0,
        cold: this.tiers.get(STORAGE_TIERS.COLD)?.size() || 0
      }
    };
  }
}

// Import storage tier implementations
import { RedisStorageTier } from './redis-storage-tier.mjs';
import { SQLiteStorageTier } from './sqlite-storage-tier-simulated.mjs';
import { Neo4jStorageTier } from './neo4j-storage-tier.mjs';

// Export tier implementations
export { RedisStorageTier, SQLiteStorageTier, Neo4jStorageTier };
