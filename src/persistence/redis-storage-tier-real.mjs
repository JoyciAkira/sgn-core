/**
 * Redis Storage Tier Implementation (REAL)
 * Phase 2: Multi-tier Persistence - Hot Cache Layer
 * 
 * Features:
 * - Real Redis connection
 * - TTL-based expiration
 * - LRU eviction policy
 * - High-performance key-value storage
 * - Reputation-based prioritization
 */

import { createClient } from 'redis';
import { StorageTier, CACHE_CONFIG } from './storage-tier-base.mjs';
import { reputationManager } from '../reputation-manager.mjs';

/**
 * Redis Storage Tier (REAL)
 * Provides high-speed in-memory caching with real Redis
 */
export class RedisStorageTierReal extends StorageTier {
  constructor(options = {}) {
    super('redis-real');
    
    // Redis connection options
    this.redisOptions = {
      url: options.url || 'redis://localhost:6379',
      database: options.database || 0,
      ...options
    };
    
    this.client = null;
    this.maxSize = CACHE_CONFIG.MAX_HOT_SIZE;
    this.defaultTTL = CACHE_CONFIG.HOT_TTL;
    
    // Performance metrics
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      stores: 0,
      totalRequests: 0,
      connectionErrors: 0
    };
  }
  
  /**
   * Initialize Redis storage tier
   */
  async initialize() {
    console.log("🔥 Initializing Redis Storage Tier (REAL)...");
    
    try {
      // Create Redis client
      this.client = createClient(this.redisOptions);
      
      // Handle connection events
      this.client.on('error', (err) => {
        console.error('Redis Client Error:', err);
        this.metrics.connectionErrors++;
      });
      
      this.client.on('connect', () => {
        console.log('✅ Connected to Redis server');
      });
      
      this.client.on('ready', () => {
        console.log('✅ Redis client ready');
      });
      
      // Connect to Redis
      await this.client.connect();
      
      // Test connection
      const pong = await this.client.ping();
      if (pong !== 'PONG') {
        throw new Error('Redis connection test failed');
      }
      
      // Configure Redis for optimal performance
      await this.configureRedis();
      
      // Start metrics collection
      this.startMetricsCollection();
      
      this.isInitialized = true;
      console.log("✅ Redis Storage Tier (REAL) initialized successfully");
      
    } catch (error) {
      console.error("❌ Failed to initialize Redis Storage Tier:", error);
      throw error;
    }
  }
  
  /**
   * Configure Redis for optimal performance
   */
  async configureRedis() {
    try {
      // Set memory policy for LRU eviction
      await this.client.configSet('maxmemory-policy', 'allkeys-lru');
      
      // Set reasonable memory limit (256MB)
      await this.client.configSet('maxmemory', '268435456');
      
      console.log("✅ Redis configured for optimal performance");
    } catch (error) {
      console.warn("⚠️ Could not configure Redis (may require admin privileges):", error.message);
    }
  }
  
  /**
   * Store Knowledge Unit in Redis
   * @param {KnowledgeUnit} ku - Knowledge Unit to store
   * @param {Object} options - Storage options
   */
  async store(ku, options = {}) {
    if (!this.isInitialized) {
      throw new Error("Redis storage tier not initialized");
    }
    
    this.metrics.stores++;
    this.metrics.totalRequests++;
    
    try {
      // Calculate TTL based on KU properties and reputation
      const ttl = this.calculateTTL(ku, options);
      
      // Prepare cache entry
      const cacheEntry = {
        ku: this.serializeKU(ku),
        timestamp: Date.now(),
        ttl: ttl,
        accessCount: 0,
        priority: this.calculatePriority(ku)
      };
      
      // Store in Redis with TTL
      const key = `sgn:ku:${ku.id}`;
      const value = JSON.stringify(cacheEntry);
      
      await this.client.setEx(key, ttl, value);
      
      // Store metadata for analytics
      const metaKey = `sgn:meta:${ku.id}`;
      const metadata = {
        type: ku.type,
        severity: ku.severity,
        confidence: ku.confidence,
        originPeer: ku.originPeer,
        storedAt: Date.now()
      };
      
      await this.client.setEx(metaKey, ttl, JSON.stringify(metadata));
      
      console.log(`🔥 Stored KU ${ku.id} in Redis (TTL: ${ttl}s)`);
      return { success: true, ttl };
      
    } catch (error) {
      console.error(`❌ Failed to store KU ${ku.id} in Redis:`, error);
      throw error;
    }
  }
  
  /**
   * Retrieve Knowledge Unit from Redis
   * @param {string} kuId - Knowledge Unit ID
   */
  async retrieve(kuId) {
    if (!this.isInitialized) {
      throw new Error("Redis storage tier not initialized");
    }
    
    this.metrics.totalRequests++;
    
    try {
      const key = `sgn:ku:${kuId}`;
      const value = await this.client.get(key);
      
      if (!value) {
        this.metrics.misses++;
        return null;
      }
      
      // Parse cache entry
      const cacheEntry = JSON.parse(value);
      
      // Update access statistics
      cacheEntry.accessCount++;
      cacheEntry.lastAccess = Date.now();
      
      // Update cache entry
      const ttl = await this.client.ttl(key);
      if (ttl > 0) {
        await this.client.setEx(key, ttl, JSON.stringify(cacheEntry));
      }
      
      this.metrics.hits++;
      
      // Deserialize and return KU
      const ku = this.deserializeKU(cacheEntry.ku);
      console.log(`🔥 Retrieved KU ${kuId} from Redis (TTL remaining: ${ttl}s)`);
      
      return ku;
      
    } catch (error) {
      console.error(`❌ Failed to retrieve KU ${kuId} from Redis:`, error);
      this.metrics.misses++;
      return null;
    }
  }
  
  /**
   * Search Knowledge Units in Redis
   * @param {Object} query - Search query
   * @param {Object} options - Search options
   */
  async search(query, options = {}) {
    if (!this.isInitialized) {
      throw new Error("Redis storage tier not initialized");
    }
    
    try {
      // Get all KU keys
      const keys = await this.client.keys('sgn:ku:*');
      const results = [];
      
      // Process keys in batches for performance
      const batchSize = 50;
      for (let i = 0; i < keys.length; i += batchSize) {
        const batch = keys.slice(i, i + batchSize);
        const values = await this.client.mGet(batch);
        
        for (let j = 0; j < batch.length; j++) {
          if (!values[j]) continue;
          
          try {
            const cacheEntry = JSON.parse(values[j]);
            const ku = this.deserializeKU(cacheEntry.ku);
            
            // Apply search filters
            if (this.matchesQuery(ku, query)) {
              results.push(ku);
            }
          } catch (parseError) {
            console.warn(`Failed to parse cached KU: ${batch[j]}`, parseError);
          }
        }
      }
      
      // Sort by priority and relevance
      results.sort((a, b) => {
        const scoreA = this.calculateSearchScore(a, query);
        const scoreB = this.calculateSearchScore(b, query);
        return scoreB - scoreA;
      });
      
      return results.slice(0, options.limit || 20);
      
    } catch (error) {
      console.error("❌ Failed to search Redis:", error);
      return [];
    }
  }
  
  /**
   * Get cache size
   */
  async size() {
    if (!this.isInitialized) return 0;
    
    try {
      const keys = await this.client.keys('sgn:ku:*');
      return keys.length;
    } catch (error) {
      console.error("Failed to get Redis size:", error);
      return 0;
    }
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
    
    return priority;
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
    
    return score;
  }
  
  /**
   * Serialize KU for storage
   * @param {KnowledgeUnit} ku 
   */
  serializeKU(ku) {
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
    return JSON.parse(serializedKU);
  }
  
  /**
   * Start metrics collection
   */
  startMetricsCollection() {
    setInterval(async () => {
      await this.logMetrics();
    }, 300000); // Every 5 minutes
  }
  
  /**
   * Log performance metrics
   */
  async logMetrics() {
    try {
      const info = await this.client.info('memory');
      const hitRate = (this.metrics.hits / this.metrics.totalRequests * 100).toFixed(1);
      const size = await this.size();
      
      console.log(`🔥 Redis Metrics - Size: ${size}, Hit Rate: ${hitRate}%, Memory: ${info.used_memory_human || 'N/A'}`);
    } catch (error) {
      console.warn("Failed to collect Redis metrics:", error);
    }
  }
  
  /**
   * Get detailed statistics
   */
  async getStatistics() {
    try {
      const info = await this.client.info();
      const size = await this.size();
      
      return {
        ...this.metrics,
        size,
        hitRate: this.metrics.hits / this.metrics.totalRequests,
        redisInfo: info,
        isReal: true
      };
    } catch (error) {
      return {
        ...this.metrics,
        size: 0,
        error: error.message,
        isReal: true
      };
    }
  }
  
  /**
   * Cleanup and close connection
   */
  async cleanup() {
    if (this.client) {
      await this.client.quit();
      console.log("✅ Redis connection closed");
    }
  }
}
