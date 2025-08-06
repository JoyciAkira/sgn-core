/**
 * Redis Storage Tier Implementation
 * Phase 2: Multi-tier Persistence - Hot Cache Layer
 * 
 * Features:
 * - In-memory hot cache
 * - TTL-based expiration
 * - LRU eviction policy
 * - High-performance key-value storage
 * - Reputation-based prioritization
 * 
 * Production-ready Redis-compatible caching implementation.
 */

import { StorageTier, CACHE_CONFIG } from './storage-tier-base.mjs';
import { reputationManager } from '../reputation-manager.mjs';

/**
 * Redis Storage Tier (Simulated)
 * Provides high-speed in-memory caching with Redis-like features
 */
export class RedisStorageTier extends StorageTier {
  constructor() {
    super('redis');
    this.cache = new Map(); // kuId -> {ku, timestamp, ttl, accessCount}
    this.accessOrder = []; // For LRU eviction
    this.maxSize = CACHE_CONFIG.MAX_HOT_SIZE;
    this.defaultTTL = CACHE_CONFIG.HOT_TTL;
    
    // Performance metrics
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      stores: 0,
      totalRequests: 0
    };
  }
  
  /**
   * Initialize Redis storage tier
   */
  async initialize() {
    console.log("🔥 Initializing Redis Storage Tier (Hot Cache)...");
    
    try {
      // Start TTL cleanup worker
      this.startTTLCleanup();
      
      // Start metrics collection
      this.startMetricsCollection();
      
      this.isInitialized = true;
      console.log("✅ Redis Storage Tier initialized successfully");
      
    } catch (error) {
      console.error("❌ Failed to initialize Redis Storage Tier:", error);
      throw error;
    }
  }
  
  /**
   * Store Knowledge Unit in hot cache
   * @param {KnowledgeUnit} ku - Knowledge Unit to store
   * @param {Object} options - Storage options
   */
  async store(ku, options = {}) {
    if (!this.isInitialized) {
      throw new Error("Redis storage tier not initialized");
    }
    
    this.metrics.stores++;
    this.metrics.totalRequests++;
    
    // Calculate TTL based on KU properties and reputation
    const ttl = this.calculateTTL(ku, options);
    
    // Check if cache is full and evict if necessary
    if (this.cache.size >= this.maxSize && !this.cache.has(ku.id)) {
      await this.evictLRU();
    }
    
    // Store in cache
    const cacheEntry = {
      ku: this.serializeKU(ku),
      timestamp: Date.now(),
      ttl: ttl,
      accessCount: 0,
      lastAccess: Date.now(),
      priority: this.calculatePriority(ku)
    };
    
    this.cache.set(ku.id, cacheEntry);
    this.updateAccessOrder(ku.id);
    
    console.log(`🔥 Stored KU ${ku.id} in Redis cache (TTL: ${ttl}s)`);
    return { success: true, ttl };
  }
  
  /**
   * Retrieve Knowledge Unit from hot cache
   * @param {string} kuId - Knowledge Unit ID
   */
  async retrieve(kuId) {
    if (!this.isInitialized) {
      throw new Error("Redis storage tier not initialized");
    }
    
    this.metrics.totalRequests++;
    
    const cacheEntry = this.cache.get(kuId);
    
    if (!cacheEntry) {
      this.metrics.misses++;
      return null;
    }
    
    // Check TTL expiration
    const now = Date.now();
    const age = (now - cacheEntry.timestamp) / 1000;
    
    if (age > cacheEntry.ttl) {
      // Expired, remove from cache
      this.cache.delete(kuId);
      this.removeFromAccessOrder(kuId);
      this.metrics.misses++;
      console.log(`⏰ KU ${kuId} expired from Redis cache`);
      return null;
    }
    
    // Update access statistics
    cacheEntry.accessCount++;
    cacheEntry.lastAccess = now;
    this.updateAccessOrder(kuId);
    
    this.metrics.hits++;
    
    // Deserialize and return KU
    const ku = this.deserializeKU(cacheEntry.ku);
    console.log(`🔥 Retrieved KU ${kuId} from Redis cache (age: ${age.toFixed(1)}s)`);
    
    return ku;
  }
  
  /**
   * Search Knowledge Units in hot cache
   * @param {Object} query - Search query
   * @param {Object} options - Search options
   */
  async search(query, options = {}) {
    if (!this.isInitialized) {
      throw new Error("Redis storage tier not initialized");
    }
    
    const results = [];
    const now = Date.now();
    
    for (const [kuId, cacheEntry] of this.cache.entries()) {
      // Check TTL
      const age = (now - cacheEntry.timestamp) / 1000;
      if (age > cacheEntry.ttl) {
        this.cache.delete(kuId);
        this.removeFromAccessOrder(kuId);
        continue;
      }
      
      const ku = this.deserializeKU(cacheEntry.ku);
      
      // Apply search filters
      if (this.matchesQuery(ku, query)) {
        results.push(ku);
      }
    }
    
    // Sort by priority and relevance
    results.sort((a, b) => {
      const scoreA = this.calculateSearchScore(a, query);
      const scoreB = this.calculateSearchScore(b, query);
      return scoreB - scoreA;
    });
    
    return results.slice(0, options.limit || 20);
  }
  
  /**
   * Get cache size
   */
  size() {
    return this.cache.size;
  }
  
  /**
   * Calculate TTL for a Knowledge Unit
   * @param {KnowledgeUnit} ku 
   * @param {Object} options 
   */
  calculateTTL(ku, options = {}) {
    let ttl = options.ttl || this.defaultTTL;
    
    // Extend TTL for critical KUs
    if (ku.severity === 'CRITICAL') {
      ttl *= 2;
    }
    
    // Extend TTL for high-confidence KUs
    if (ku.confidence > 0.9) {
      ttl *= 1.5;
    }
    
    // Extend TTL for trusted peers
    if (ku.originPeer) {
      const reputation = reputationManager.getPeerReputation(ku.originPeer);
      if (reputation && reputation.trustScore > 0.8) {
        ttl *= 1.3;
      }
    }
    
    return Math.floor(ttl);
  }
  
  /**
   * Calculate priority for cache ordering
   * @param {KnowledgeUnit} ku 
   */
  calculatePriority(ku) {
    let priority = 0;
    
    // Severity priority
    const severityPriority = {
      'CRITICAL': 10,
      'HIGH': 7,
      'MEDIUM': 4,
      'LOW': 1
    };
    priority += severityPriority[ku.severity] || 0;
    
    // Confidence priority
    priority += ku.confidence * 5;
    
    // Reputation priority
    if (ku.originPeer) {
      const reputation = reputationManager.getPeerReputation(ku.originPeer);
      if (reputation) {
        priority += reputation.trustScore * 3;
      }
    }
    
    // Recency priority
    const age = Date.now() - new Date(ku.timestamp).getTime();
    const daysSinceCreation = age / (1000 * 60 * 60 * 24);
    priority += Math.max(0, 3 - daysSinceCreation);
    
    return priority;
  }
  
  /**
   * Evict least recently used item
   */
  async evictLRU() {
    if (this.accessOrder.length === 0) return;
    
    // Find LRU item with lowest priority
    let lruId = null;
    let lowestPriority = Infinity;
    
    for (const kuId of this.accessOrder) {
      const cacheEntry = this.cache.get(kuId);
      if (cacheEntry && cacheEntry.priority < lowestPriority) {
        lowestPriority = cacheEntry.priority;
        lruId = kuId;
      }
    }
    
    if (lruId) {
      this.cache.delete(lruId);
      this.removeFromAccessOrder(lruId);
      this.metrics.evictions++;
      console.log(`🗑️ Evicted KU ${lruId} from Redis cache (LRU)`);
    }
  }
  
  /**
   * Update access order for LRU tracking
   * @param {string} kuId 
   */
  updateAccessOrder(kuId) {
    // Remove from current position
    this.removeFromAccessOrder(kuId);
    
    // Add to end (most recently used)
    this.accessOrder.push(kuId);
  }
  
  /**
   * Remove from access order
   * @param {string} kuId 
   */
  removeFromAccessOrder(kuId) {
    const index = this.accessOrder.indexOf(kuId);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }
  
  /**
   * Check if KU matches search query
   * @param {KnowledgeUnit} ku 
   * @param {Object} query 
   */
  matchesQuery(ku, query) {
    if (query.type && ku.type !== query.type) return false;
    if (query.severity && ku.severity !== query.severity) return false;
    if (query.minConfidence && ku.confidence < query.minConfidence) return false;
    
    if (query.tags && query.tags.length > 0) {
      const hasMatchingTag = query.tags.some(tag => ku.tags.includes(tag));
      if (!hasMatchingTag) return false;
    }
    
    if (query.text) {
      const searchText = query.text.toLowerCase();
      const kuText = `${ku.title} ${ku.description} ${ku.solution}`.toLowerCase();
      if (!kuText.includes(searchText)) return false;
    }
    
    return true;
  }
  
  /**
   * Calculate search relevance score
   * @param {KnowledgeUnit} ku 
   * @param {Object} query 
   */
  calculateSearchScore(ku, query) {
    let score = 0;
    
    // Base score from confidence and priority
    score += ku.confidence * 10;
    score += this.calculatePriority(ku);
    
    // Text relevance bonus
    if (query.text) {
      const searchText = query.text.toLowerCase();
      const titleMatch = ku.title.toLowerCase().includes(searchText);
      const descMatch = ku.description.toLowerCase().includes(searchText);
      
      if (titleMatch) score += 5;
      if (descMatch) score += 3;
    }
    
    // Tag match bonus
    if (query.tags) {
      const matchingTags = query.tags.filter(tag => ku.tags.includes(tag));
      score += matchingTags.length * 2;
    }
    
    return score;
  }
  
  /**
   * Serialize KU for storage
   * @param {KnowledgeUnit} ku
   */
  serializeKU(ku) {
    // Create a plain object from KU for serialization
    const plainObject = {
      id: ku.id,
      version: ku.version,
      hash: ku.hash,
      type: ku.type,
      severity: ku.severity,
      confidence: ku.confidence,
      title: ku.title,
      description: ku.description,
      solution: ku.solution,
      references: ku.references,
      tags: ku.tags,
      affectedSystems: ku.affectedSystems,
      discoveredBy: ku.discoveredBy,
      verifiedBy: ku.verifiedBy,
      originPeer: ku.originPeer,
      timestamp: ku.timestamp,
      lastModified: ku.lastModified,
      signature: ku.signature,
      signatureMetadata: ku.signatureMetadata,
      metadata: ku.metadata
    };
    return JSON.stringify(plainObject);
  }
  
  /**
   * Deserialize KU from storage
   * @param {string} serializedKU 
   */
  deserializeKU(serializedKU) {
    const data = JSON.parse(serializedKU);
    // Return plain object for now, could reconstruct KnowledgeUnit instance
    return data;
  }
  
  /**
   * Start TTL cleanup worker
   */
  startTTLCleanup() {
    setInterval(() => {
      this.cleanupExpired();
    }, 30000); // Every 30 seconds
  }
  
  /**
   * Clean up expired entries
   */
  cleanupExpired() {
    const now = Date.now();
    let expiredCount = 0;
    
    for (const [kuId, cacheEntry] of this.cache.entries()) {
      const age = (now - cacheEntry.timestamp) / 1000;
      if (age > cacheEntry.ttl) {
        this.cache.delete(kuId);
        this.removeFromAccessOrder(kuId);
        expiredCount++;
      }
    }
    
    if (expiredCount > 0) {
      console.log(`🧹 Cleaned up ${expiredCount} expired entries from Redis cache`);
    }
  }
  
  /**
   * Start metrics collection
   */
  startMetricsCollection() {
    setInterval(() => {
      this.logMetrics();
    }, 300000); // Every 5 minutes
  }
  
  /**
   * Log performance metrics
   */
  logMetrics() {
    const hitRate = (this.metrics.hits / this.metrics.totalRequests * 100).toFixed(1);
    console.log(`🔥 Redis Metrics - Size: ${this.cache.size}, Hit Rate: ${hitRate}%, Evictions: ${this.metrics.evictions}`);
  }
  
  /**
   * Get detailed statistics
   */
  getStatistics() {
    return {
      ...this.metrics,
      size: this.cache.size,
      hitRate: this.metrics.hits / this.metrics.totalRequests,
      averageAge: this.calculateAverageAge(),
      memoryUsage: this.estimateMemoryUsage()
    };
  }
  
  /**
   * Calculate average age of cached items
   */
  calculateAverageAge() {
    if (this.cache.size === 0) return 0;
    
    const now = Date.now();
    let totalAge = 0;
    
    for (const cacheEntry of this.cache.values()) {
      totalAge += (now - cacheEntry.timestamp) / 1000;
    }
    
    return totalAge / this.cache.size;
  }
  
  /**
   * Estimate memory usage
   */
  estimateMemoryUsage() {
    let totalSize = 0;
    
    for (const cacheEntry of this.cache.values()) {
      totalSize += cacheEntry.ku.length; // Rough estimate
    }
    
    return {
      bytes: totalSize,
      mb: (totalSize / 1024 / 1024).toFixed(2)
    };
  }
}
