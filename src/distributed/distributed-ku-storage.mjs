/**
 * Distributed Knowledge Unit Storage System
 * Phase 4: Distributed KU Operations
 * 
 * Features:
 * - Distributed KU storage across network nodes
 * - KU replication and redundancy
 * - Network-wide KU discovery and retrieval
 * - Consistency and synchronization
 * - Load balancing and performance optimization
 */

import { RealSQLiteStorageTier } from '../persistence/sqlite-real-storage.mjs';
import { SGNProtocolMessage, MESSAGE_TYPES } from '../network/sgn-p2p-protocol.mjs';

/**
 * Distributed Storage Configuration
 */
export const DISTRIBUTED_STORAGE_CONFIG = {
  // Replication settings
  REPLICATION_FACTOR: 3, // Number of nodes to replicate each KU
  MIN_REPLICAS: 2, // Minimum replicas required for availability
  
  // Consistency settings
  CONSISTENCY_LEVEL: 'QUORUM', // QUORUM, ALL, ONE
  SYNC_INTERVAL: 30000, // 30 seconds
  CONFLICT_RESOLUTION: 'TIMESTAMP', // TIMESTAMP, VERSION, MANUAL
  
  // Performance settings
  BATCH_SIZE: 10,
  REQUEST_TIMEOUT: 10000,
  RETRY_ATTEMPTS: 3,
  CACHE_TTL: 300000, // 5 minutes
  
  // Network settings
  MAX_CONCURRENT_REQUESTS: 5,
  DISCOVERY_TIMEOUT: 5000,
  HEALTH_CHECK_INTERVAL: 60000
};

/**
 * Distributed KU Storage Manager
 */
export class DistributedKUStorage {
  constructor(options = {}) {
    this.config = { ...DISTRIBUTED_STORAGE_CONFIG, ...options };
    this.nodeId = options.nodeId || `storage-node-${Date.now()}`;
    
    // Local storage
    this.localStorage = new RealSQLiteStorageTier({
      dbPath: options.dbPath || `distributed-ku-${this.nodeId}.db`
    });
    
    // Network components
    this.networkManager = options.networkManager; // P2P network manager
    this.connectedNodes = new Map(); // nodeId -> connection info
    
    // Distributed state
    this.kuReplicas = new Map(); // kuId -> [nodeIds] where KU is stored
    this.replicationQueue = new Set(); // KUs pending replication
    this.syncQueue = new Set(); // KUs pending synchronization
    
    // Request management
    this.pendingRequests = new Map(); // requestId -> request info
    this.requestCache = new Map(); // query hash -> cached results
    
    // Statistics
    this.stats = {
      localKUs: 0,
      distributedKUs: 0,
      replicationsPerformed: 0,
      requestsServed: 0,
      requestsForwarded: 0,
      cacheHits: 0,
      cacheMisses: 0,
      networkErrors: 0,
      syncOperations: 0
    };
  }
  
  /**
   * Initialize distributed storage
   */
  async initialize() {
    console.log('🗄️ Initializing Distributed KU Storage...');
    console.log(`   Node ID: ${this.nodeId}`);
    console.log(`   Replication factor: ${this.config.REPLICATION_FACTOR}`);
    console.log(`   Consistency level: ${this.config.CONSISTENCY_LEVEL}`);
    
    try {
      // Initialize local storage
      await this.localStorage.initialize();
      
      // Load existing KU metadata
      await this.loadKUMetadata();
      
      // Start background processes
      this.startSynchronization();
      this.startHealthMonitoring();
      
      console.log('✅ Distributed KU Storage initialized');
      console.log(`   Local KUs: ${this.stats.localKUs}`);
      
    } catch (error) {
      console.error(`❌ Failed to initialize distributed storage: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Store KU with distributed replication
   */
  async storeKU(ku) {
    console.log(`💾 Storing KU distributedly: ${ku.id}`);
    
    try {
      // Store locally first
      await this.localStorage.store(ku);
      this.stats.localKUs++;
      
      // Add to replication queue
      this.replicationQueue.add(ku.id);
      
      // Perform immediate replication if network available
      if (this.networkManager && this.connectedNodes.size > 0) {
        await this.replicateKU(ku);
      }
      
      console.log(`✅ KU stored locally: ${ku.id}`);
      return true;
      
    } catch (error) {
      console.error(`❌ Failed to store KU: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Replicate KU to other nodes
   */
  async replicateKU(ku) {
    const targetNodes = this.selectReplicationNodes(ku.id);
    
    if (targetNodes.length === 0) {
      console.log(`⚠️ No nodes available for replication: ${ku.id}`);
      return;
    }
    
    console.log(`🔄 Replicating KU to ${targetNodes.length} nodes: ${ku.id}`);
    
    const replicationPromises = targetNodes.map(nodeId => 
      this.sendKUToNode(ku, nodeId)
    );
    
    try {
      const results = await Promise.allSettled(replicationPromises);
      
      let successCount = 0;
      for (let i = 0; i < results.length; i++) {
        const result = results[i];
        const nodeId = targetNodes[i];
        
        if (result.status === 'fulfilled') {
          successCount++;
          this.recordKUReplica(ku.id, nodeId);
          console.log(`✅ KU replicated to node: ${nodeId}`);
        } else {
          console.warn(`❌ Failed to replicate to node ${nodeId}: ${result.reason.message}`);
          this.stats.networkErrors++;
        }
      }
      
      this.stats.replicationsPerformed++;
      this.replicationQueue.delete(ku.id);
      
      console.log(`✅ KU replication completed: ${successCount}/${targetNodes.length} nodes`);
      
    } catch (error) {
      console.error(`❌ KU replication failed: ${error.message}`);
    }
  }
  
  /**
   * Select nodes for KU replication
   */
  selectReplicationNodes(kuId) {
    const availableNodes = Array.from(this.connectedNodes.keys())
      .filter(nodeId => nodeId !== this.nodeId);
    
    if (availableNodes.length === 0) {
      return [];
    }
    
    // Simple selection: take first N available nodes
    // In production, this would use consistent hashing or other algorithms
    const targetCount = Math.min(this.config.REPLICATION_FACTOR - 1, availableNodes.length);
    return availableNodes.slice(0, targetCount);
  }
  
  /**
   * Send KU to specific node
   */
  async sendKUToNode(ku, nodeId) {
    const connection = this.connectedNodes.get(nodeId);
    if (!connection || !connection.websocket) {
      throw new Error(`No connection to node: ${nodeId}`);
    }
    
    const broadcastMessage = SGNProtocolMessage.kuBroadcast(ku, this.nodeId);
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('KU send timeout'));
      }, this.config.REQUEST_TIMEOUT);
      
      try {
        connection.websocket.send(JSON.stringify(broadcastMessage));
        clearTimeout(timeout);
        resolve();
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }
  
  /**
   * Record KU replica location
   */
  recordKUReplica(kuId, nodeId) {
    if (!this.kuReplicas.has(kuId)) {
      this.kuReplicas.set(kuId, new Set());
    }
    this.kuReplicas.get(kuId).add(nodeId);
  }
  
  /**
   * Search for KUs across the distributed network
   */
  async searchKUs(query) {
    console.log(`🔍 Distributed KU search: ${JSON.stringify(query)}`);
    
    // Check cache first
    const cacheKey = this.generateCacheKey(query);
    if (this.requestCache.has(cacheKey)) {
      console.log('💨 Cache hit for KU search');
      this.stats.cacheHits++;
      return this.requestCache.get(cacheKey);
    }
    
    this.stats.cacheMisses++;
    
    try {
      // Search locally first
      const localResults = await this.localStorage.search(query);
      console.log(`📍 Local search results: ${localResults.length}`);
      
      // Search network if needed
      let networkResults = [];
      if (this.connectedNodes.size > 0 && localResults.length < 10) {
        networkResults = await this.searchNetworkKUs(query);
        console.log(`🌐 Network search results: ${networkResults.length}`);
      }
      
      // Combine and deduplicate results
      const allResults = this.combineSearchResults(localResults, networkResults);
      
      // Cache results
      this.requestCache.set(cacheKey, allResults);
      setTimeout(() => {
        this.requestCache.delete(cacheKey);
      }, this.config.CACHE_TTL);
      
      console.log(`✅ Distributed search completed: ${allResults.length} total results`);
      return allResults;
      
    } catch (error) {
      console.error(`❌ Distributed search failed: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Search KUs across network nodes
   */
  async searchNetworkKUs(query) {
    const searchPromises = Array.from(this.connectedNodes.keys()).map(nodeId => 
      this.requestKUsFromNode(query, nodeId)
    );
    
    try {
      const results = await Promise.allSettled(searchPromises);
      
      const networkResults = [];
      for (const result of results) {
        if (result.status === 'fulfilled' && result.value) {
          networkResults.push(...result.value);
        } else if (result.status === 'rejected') {
          this.stats.networkErrors++;
        }
      }
      
      return networkResults;
      
    } catch (error) {
      console.error(`❌ Network search failed: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Request KUs from specific node
   */
  async requestKUsFromNode(query, nodeId) {
    const connection = this.connectedNodes.get(nodeId);
    if (!connection || !connection.websocket) {
      throw new Error(`No connection to node: ${nodeId}`);
    }
    
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const requestMessage = SGNProtocolMessage.kuRequest(requestId, query, this.nodeId);
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error('KU request timeout'));
      }, this.config.DISCOVERY_TIMEOUT);
      
      // Store pending request
      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout,
        nodeId,
        query,
        timestamp: Date.now()
      });
      
      try {
        connection.websocket.send(JSON.stringify(requestMessage));
        this.stats.requestsForwarded++;
      } catch (error) {
        clearTimeout(timeout);
        this.pendingRequests.delete(requestId);
        reject(error);
      }
    });
  }
  
  /**
   * Handle incoming KU request
   */
  async handleKURequest(requestId, query, requesterNodeId) {
    console.log(`📨 Handling KU request from ${requesterNodeId}: ${JSON.stringify(query)}`);
    
    try {
      // Search local storage
      const results = await this.localStorage.search(query);
      
      // Send response
      const connection = this.connectedNodes.get(requesterNodeId);
      if (connection && connection.websocket) {
        const responseMessage = SGNProtocolMessage.kuResponse(requestId, results, this.nodeId);
        connection.websocket.send(JSON.stringify(responseMessage));
        
        this.stats.requestsServed++;
        console.log(`✅ Sent ${results.length} KUs to ${requesterNodeId}`);
      }
      
    } catch (error) {
      console.error(`❌ Failed to handle KU request: ${error.message}`);
    }
  }
  
  /**
   * Handle incoming KU response
   */
  handleKUResponse(requestId, results, responderNodeId) {
    const pendingRequest = this.pendingRequests.get(requestId);
    if (!pendingRequest) {
      console.warn(`⚠️ Received response for unknown request: ${requestId}`);
      return;
    }
    
    console.log(`📦 Received ${results.length} KUs from ${responderNodeId}`);
    
    clearTimeout(pendingRequest.timeout);
    this.pendingRequests.delete(requestId);
    pendingRequest.resolve(results);
  }
  
  /**
   * Handle incoming KU broadcast
   */
  async handleKUBroadcast(ku, broadcasterNodeId) {
    console.log(`📡 Received KU broadcast from ${broadcasterNodeId}: ${ku.id}`);
    
    try {
      // Check if we already have this KU
      const existingKU = await this.localStorage.get(ku.id);
      if (existingKU) {
        console.log(`ℹ️ KU already exists locally: ${ku.id}`);
        return;
      }
      
      // Store the broadcasted KU
      await this.localStorage.store(ku);
      this.stats.localKUs++;
      
      // Record replica location
      this.recordKUReplica(ku.id, broadcasterNodeId);
      this.recordKUReplica(ku.id, this.nodeId);
      
      console.log(`✅ Stored broadcasted KU: ${ku.id}`);
      
    } catch (error) {
      console.error(`❌ Failed to handle KU broadcast: ${error.message}`);
    }
  }
  
  /**
   * Combine and deduplicate search results
   */
  combineSearchResults(localResults, networkResults) {
    const seenKUs = new Set();
    const combinedResults = [];
    
    // Add local results first (they have priority)
    for (const ku of localResults) {
      if (!seenKUs.has(ku.id)) {
        seenKUs.add(ku.id);
        combinedResults.push({ ...ku, source: 'local' });
      }
    }
    
    // Add network results
    for (const ku of networkResults) {
      if (!seenKUs.has(ku.id)) {
        seenKUs.add(ku.id);
        combinedResults.push({ ...ku, source: 'network' });
      }
    }
    
    return combinedResults;
  }
  
  /**
   * Generate cache key for query
   */
  generateCacheKey(query) {
    return JSON.stringify(query);
  }
  
  /**
   * Load KU metadata from local storage
   */
  async loadKUMetadata() {
    try {
      const allKUs = await this.localStorage.getAll();
      this.stats.localKUs = allKUs.length;
      
      // Initialize replica tracking for local KUs
      for (const ku of allKUs) {
        this.recordKUReplica(ku.id, this.nodeId);
      }
      
      console.log(`📊 Loaded metadata for ${allKUs.length} local KUs`);
      
    } catch (error) {
      console.warn(`⚠️ Failed to load KU metadata: ${error.message}`);
    }
  }
  
  /**
   * Start background synchronization
   */
  startSynchronization() {
    setInterval(() => {
      this.performSynchronization();
    }, this.config.SYNC_INTERVAL);
  }
  
  /**
   * Perform background synchronization
   */
  async performSynchronization() {
    if (this.replicationQueue.size === 0 || this.connectedNodes.size === 0) {
      return;
    }
    
    console.log(`🔄 Performing background synchronization: ${this.replicationQueue.size} KUs pending`);
    
    const kuIds = Array.from(this.replicationQueue).slice(0, this.config.BATCH_SIZE);
    
    for (const kuId of kuIds) {
      try {
        const ku = await this.localStorage.get(kuId);
        if (ku) {
          await this.replicateKU(ku);
        }
      } catch (error) {
        console.error(`❌ Sync failed for KU ${kuId}: ${error.message}`);
      }
    }
    
    this.stats.syncOperations++;
  }
  
  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    setInterval(() => {
      this.performHealthCheck();
    }, this.config.HEALTH_CHECK_INTERVAL);
  }
  
  /**
   * Perform health check
   */
  performHealthCheck() {
    console.log('💓 Performing distributed storage health check...');
    
    // Clean up expired cache entries
    const now = Date.now();
    for (const [key, entry] of this.requestCache.entries()) {
      if (now - entry.timestamp > this.config.CACHE_TTL) {
        this.requestCache.delete(key);
      }
    }
    
    // Clean up expired pending requests
    for (const [requestId, request] of this.pendingRequests.entries()) {
      if (now - request.timestamp > this.config.REQUEST_TIMEOUT) {
        clearTimeout(request.timeout);
        this.pendingRequests.delete(requestId);
        request.reject(new Error('Request expired'));
      }
    }
  }
  
  /**
   * Register network connection
   */
  registerNetworkConnection(nodeId, websocket) {
    this.connectedNodes.set(nodeId, {
      nodeId,
      websocket,
      connectedAt: Date.now(),
      lastSeen: Date.now()
    });
    
    console.log(`🔗 Registered network connection: ${nodeId}`);
  }
  
  /**
   * Unregister network connection
   */
  unregisterNetworkConnection(nodeId) {
    this.connectedNodes.delete(nodeId);
    console.log(`🔌 Unregistered network connection: ${nodeId}`);
  }
  
  /**
   * Get storage statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      connectedNodes: this.connectedNodes.size,
      replicationQueueSize: this.replicationQueue.size,
      syncQueueSize: this.syncQueue.size,
      pendingRequests: this.pendingRequests.size,
      cacheSize: this.requestCache.size,
      totalReplicas: Array.from(this.kuReplicas.values()).reduce((sum, replicas) => sum + replicas.size, 0)
    };
  }
  
  /**
   * Shutdown distributed storage
   */
  async shutdown() {
    console.log('🛑 Shutting down distributed storage...');
    
    // Clear all timers and pending operations
    this.replicationQueue.clear();
    this.syncQueue.clear();
    
    // Clear pending requests
    for (const request of this.pendingRequests.values()) {
      clearTimeout(request.timeout);
      request.reject(new Error('Storage shutting down'));
    }
    this.pendingRequests.clear();
    
    // Close local storage
    if (this.localStorage) {
      await this.localStorage.close();
    }
    
    console.log('✅ Distributed storage shutdown complete');
  }
}
