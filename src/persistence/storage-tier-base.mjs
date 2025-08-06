/**
 * Base Storage Tier Class
 * Phase 2: Multi-tier Persistence
 * 
 * Base class for all storage tier implementations
 */

// Storage tier constants
export const STORAGE_TIERS = {
  HOT: 'redis',      // Frequently accessed, in-memory
  WARM: 'sqlite',    // Local persistent storage
  COLD: 'neo4j'      // Graph relationships, analytics
};

// Cache configuration
export const CACHE_CONFIG = {
  HOT_TTL: 3600,           // 1 hour for hot cache
  WARM_TTL: 86400,         // 24 hours for warm cache
  MAX_HOT_SIZE: 1000,      // Max KUs in hot cache
  MAX_WARM_SIZE: 10000,    // Max KUs in warm cache
  EVICTION_POLICY: 'LRU'   // Least Recently Used
};

/**
 * Base class for storage tiers
 */
export class StorageTier {
  constructor(name) {
    this.name = name;
    this.isInitialized = false;
  }
  
  async initialize() {
    throw new Error("initialize() must be implemented by subclass");
  }
  
  async store(ku) {
    throw new Error("store() must be implemented by subclass");
  }
  
  async retrieve(kuId) {
    throw new Error("retrieve() must be implemented by subclass");
  }
  
  async search(query, options) {
    throw new Error("search() must be implemented by subclass");
  }
  
  size() {
    throw new Error("size() must be implemented by subclass");
  }
}
