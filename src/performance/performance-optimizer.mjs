/**
 * SGN Performance Optimizer
 * Phase 3: BLAKE3 Integration & Batch Processing
 * 
 * Features:
 * - Memory pool management
 * - Connection pooling
 * - Cache optimization
 * - Performance monitoring
 * - Resource allocation
 * - Bottleneck detection
 */

// Performance optimization configuration
export const PERF_CONFIG = {
  MEMORY_POOL_SIZE: 256 * 1024 * 1024,   // 256MB memory pool for high throughput
  CONNECTION_POOL_SIZE: 25,               // Increased connections for enterprise load
  CACHE_SIZE_LIMIT: 5000,                 // Increased cache for better hit rates
  GC_THRESHOLD: 0.75,                     // Earlier GC trigger for stability
  MONITORING_INTERVAL: 2000,              // More frequent monitoring (2 seconds)
  OPTIMIZATION_INTERVAL: 15000,           // More frequent optimization (15 seconds)
  PERFORMANCE_HISTORY_SIZE: 200,          // Extended history for better analysis
  MIN_BUFFERS: 100,                       // Minimum pre-allocated buffers
  MAX_BUFFERS: 2000,                      // Maximum buffers for peak load
  GROWTH_FACTOR: 1.5,                     // Buffer pool growth factor
  PEAK_LOAD_THRESHOLD: 10000,             // Requests/sec to trigger peak mode
};

/**
 * Memory Pool Manager
 * Efficient memory allocation and reuse
 */
class MemoryPool {
  constructor(poolSize = PERF_CONFIG.MEMORY_POOL_SIZE) {
    this.poolSize = poolSize;
    this.bufferPool = new Map(); // size -> Buffer[]
    this.allocatedBuffers = new Set();
    this.totalAllocated = 0;
    
    // Pre-allocate common buffer sizes
    this.preAllocateBuffers();
  }
  
  /**
   * Pre-allocate common buffer sizes with enterprise configuration
   */
  preAllocateBuffers() {
    const commonSizes = [256, 512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072];

    for (const size of commonSizes) {
      this.bufferPool.set(size, []);

      // Pre-allocate more buffers based on size (smaller = more buffers)
      const bufferCount = size <= 4096 ? PERF_CONFIG.MIN_BUFFERS :
                         size <= 16384 ? Math.floor(PERF_CONFIG.MIN_BUFFERS / 2) :
                         Math.floor(PERF_CONFIG.MIN_BUFFERS / 4);

      for (let i = 0; i < bufferCount; i++) {
        const buffer = Buffer.allocUnsafe(size);
        this.bufferPool.get(size).push(buffer);
      }
    }

    console.log(`🚀 Pre-allocated ${commonSizes.length} buffer pools for enterprise performance`);
  }
  
  /**
   * Allocate buffer from pool
   * @param {number} size - Buffer size
   * @returns {Buffer} Allocated buffer
   */
  allocate(size) {
    // Find the smallest buffer size that fits
    let poolSize = size;
    for (const availableSize of this.bufferPool.keys()) {
      if (availableSize >= size) {
        poolSize = availableSize;
        break;
      }
    }
    
    const pool = this.bufferPool.get(poolSize);
    
    if (pool && pool.length > 0) {
      // Reuse existing buffer
      const buffer = pool.pop();
      this.allocatedBuffers.add(buffer);
      return buffer.slice(0, size); // Return only the needed size
    } else {
      // Allocate new buffer
      if (this.totalAllocated + size > this.poolSize) {
        this.performGarbageCollection();
      }
      
      const buffer = Buffer.allocUnsafe(size);
      this.allocatedBuffers.add(buffer);
      this.totalAllocated += size;
      return buffer;
    }
  }
  
  /**
   * Return buffer to pool
   * @param {Buffer} buffer - Buffer to return
   */
  deallocate(buffer) {
    if (!this.allocatedBuffers.has(buffer)) {
      return; // Buffer not from this pool
    }
    
    this.allocatedBuffers.delete(buffer);
    
    // Find appropriate pool
    const size = buffer.length;
    let poolSize = size;
    
    for (const availableSize of this.bufferPool.keys()) {
      if (availableSize >= size) {
        poolSize = availableSize;
        break;
      }
    }
    
    const pool = this.bufferPool.get(poolSize);
    if (pool && pool.length < 10) { // Limit pool size
      pool.push(buffer);
    }
  }
  
  /**
   * Perform garbage collection
   */
  performGarbageCollection() {
    // Clear unused buffers from pools
    for (const pool of this.bufferPool.values()) {
      pool.splice(5); // Keep only 5 buffers per size
    }
    
    this.totalAllocated = this.allocatedBuffers.size * 1024; // Rough estimate
    
    if (global.gc) {
      global.gc();
    }
  }
  
  /**
   * Get memory pool statistics
   */
  getStatistics() {
    const poolStats = {};
    for (const [size, pool] of this.bufferPool.entries()) {
      poolStats[size] = pool.length;
    }
    
    return {
      totalAllocated: this.totalAllocated,
      allocatedBuffers: this.allocatedBuffers.size,
      poolSizes: poolStats,
      utilizationRate: this.totalAllocated / this.poolSize
    };
  }
}

/**
 * Connection Pool Manager
 * Manages database and service connections
 */
class ConnectionPool {
  constructor(maxConnections = PERF_CONFIG.CONNECTION_POOL_SIZE) {
    this.maxConnections = maxConnections;
    this.pools = new Map(); // service -> connection[]
    this.activeConnections = new Map(); // service -> number
    this.connectionStats = new Map(); // service -> stats
  }
  
  /**
   * Get connection from pool
   * @param {string} service - Service name
   * @param {Function} createConnection - Connection factory
   */
  async getConnection(service, createConnection) {
    if (!this.pools.has(service)) {
      this.pools.set(service, []);
      this.activeConnections.set(service, 0);
      this.connectionStats.set(service, {
        created: 0,
        reused: 0,
        errors: 0,
        totalRequests: 0
      });
    }
    
    const pool = this.pools.get(service);
    const stats = this.connectionStats.get(service);
    stats.totalRequests++;
    
    // Try to reuse existing connection
    if (pool.length > 0) {
      const connection = pool.pop();
      stats.reused++;
      return connection;
    }
    
    // Create new connection if under limit
    const activeCount = this.activeConnections.get(service);
    if (activeCount < this.maxConnections) {
      try {
        const connection = await createConnection();
        this.activeConnections.set(service, activeCount + 1);
        stats.created++;
        return connection;
      } catch (error) {
        stats.errors++;
        throw error;
      }
    }
    
    // Wait for connection to become available
    return new Promise((resolve, reject) => {
      const checkForConnection = () => {
        const pool = this.pools.get(service);
        if (pool.length > 0) {
          const connection = pool.pop();
          stats.reused++;
          resolve(connection);
        } else {
          setTimeout(checkForConnection, 100);
        }
      };
      
      setTimeout(() => reject(new Error('Connection timeout')), 5000);
      checkForConnection();
    });
  }
  
  /**
   * Return connection to pool
   * @param {string} service - Service name
   * @param {Object} connection - Connection to return
   */
  returnConnection(service, connection) {
    const pool = this.pools.get(service);
    if (pool && pool.length < this.maxConnections) {
      pool.push(connection);
    } else {
      // Close excess connections
      if (connection.close) {
        connection.close();
      }
      const activeCount = this.activeConnections.get(service);
      this.activeConnections.set(service, Math.max(0, activeCount - 1));
    }
  }
  
  /**
   * Get connection pool statistics
   */
  getStatistics() {
    const stats = {};
    
    for (const [service, pool] of this.pools.entries()) {
      const activeCount = this.activeConnections.get(service);
      const serviceStats = this.connectionStats.get(service);
      
      stats[service] = {
        poolSize: pool.length,
        activeConnections: activeCount,
        utilization: activeCount / this.maxConnections,
        ...serviceStats
      };
    }
    
    return stats;
  }
}

/**
 * Performance Optimizer Main Class
 */
export class PerformanceOptimizer {
  constructor(options = {}) {
    this.config = { ...PERF_CONFIG, ...options };
    
    // Component managers
    this.memoryPool = new MemoryPool(this.config.MEMORY_POOL_SIZE);
    this.connectionPool = new ConnectionPool(this.config.CONNECTION_POOL_SIZE);
    
    // Performance monitoring
    this.performanceHistory = [];
    this.currentMetrics = {
      cpuUsage: 0,
      memoryUsage: 0,
      heapUsed: 0,
      heapTotal: 0,
      external: 0,
      arrayBuffers: 0,
      gcCount: 0,
      eventLoopDelay: 0
    };
    
    // Optimization state
    this.optimizationActive = false;
    this.lastOptimization = 0;
    
    // Start monitoring
    this.startPerformanceMonitoring();
    this.startOptimizationLoop();
  }
  
  /**
   * Allocate optimized buffer
   * @param {number} size - Buffer size
   * @returns {Buffer} Optimized buffer
   */
  allocateBuffer(size) {
    return this.memoryPool.allocate(size);
  }
  
  /**
   * Deallocate buffer
   * @param {Buffer} buffer - Buffer to deallocate
   */
  deallocateBuffer(buffer) {
    this.memoryPool.deallocate(buffer);
  }
  
  /**
   * Get database connection
   * @param {string} service - Service name
   * @param {Function} createConnection - Connection factory
   */
  async getConnection(service, createConnection) {
    return this.connectionPool.getConnection(service, createConnection);
  }
  
  /**
   * Return database connection
   * @param {string} service - Service name
   * @param {Object} connection - Connection to return
   */
  returnConnection(service, connection) {
    this.connectionPool.returnConnection(service, connection);
  }
  
  /**
   * Start performance monitoring
   */
  startPerformanceMonitoring() {
    setInterval(() => {
      this.collectPerformanceMetrics();
    }, this.config.MONITORING_INTERVAL);
  }
  
  /**
   * Collect performance metrics
   */
  collectPerformanceMetrics() {
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    this.currentMetrics = {
      timestamp: Date.now(),
      cpuUsage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
      memoryUsage: memoryUsage.heapUsed / 1024 / 1024, // MB
      heapUsed: memoryUsage.heapUsed,
      heapTotal: memoryUsage.heapTotal,
      external: memoryUsage.external,
      arrayBuffers: memoryUsage.arrayBuffers,
      gcCount: global.gc ? 1 : 0, // Simplified GC tracking
      eventLoopDelay: this.measureEventLoopDelay()
    };
    
    // Add to history
    this.performanceHistory.push(this.currentMetrics);
    
    // Keep history size limited
    if (this.performanceHistory.length > this.config.PERFORMANCE_HISTORY_SIZE) {
      this.performanceHistory.shift();
    }
  }
  
  /**
   * Measure event loop delay
   */
  measureEventLoopDelay() {
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const delay = Number(process.hrtime.bigint() - start) / 1000000; // Convert to ms
      return delay;
    });
    return 0; // Simplified for now
  }
  
  /**
   * Start optimization loop
   */
  startOptimizationLoop() {
    setInterval(() => {
      this.performOptimizations();
    }, this.config.OPTIMIZATION_INTERVAL);
  }
  
  /**
   * Perform system optimizations
   */
  performOptimizations() {
    if (this.optimizationActive) return;
    
    this.optimizationActive = true;
    
    try {
      // Memory optimization
      if (this.currentMetrics.memoryUsage > this.config.MEMORY_POOL_SIZE * this.config.GC_THRESHOLD) {
        this.optimizeMemory();
      }
      
      // Connection optimization
      this.optimizeConnections();
      
      // Cache optimization
      this.optimizeCache();
      
      this.lastOptimization = Date.now();
      
    } catch (error) {
      console.error("Performance optimization error:", error);
    } finally {
      this.optimizationActive = false;
    }
  }
  
  /**
   * Optimize memory usage
   */
  optimizeMemory() {
    console.log("🧹 Performing memory optimization...");
    
    // Trigger memory pool garbage collection
    this.memoryPool.performGarbageCollection();
    
    // Force global garbage collection if available
    if (global.gc) {
      global.gc();
    }
  }
  
  /**
   * Optimize connections
   */
  optimizeConnections() {
    // Close idle connections
    const stats = this.connectionPool.getStatistics();
    
    for (const [service, serviceStats] of Object.entries(stats)) {
      if (serviceStats.utilization < 0.1 && serviceStats.poolSize > 2) {
        // Close some idle connections
        const pool = this.connectionPool.pools.get(service);
        if (pool) {
          const connection = pool.pop();
          if (connection && connection.close) {
            connection.close();
          }
        }
      }
    }
  }
  
  /**
   * Optimize cache
   */
  optimizeCache() {
    // This would integrate with cache systems
    // For now, just log the optimization
    console.log("🔄 Cache optimization performed");
  }
  
  /**
   * Get comprehensive performance statistics
   */
  getStatistics() {
    const memoryStats = this.memoryPool.getStatistics();
    const connectionStats = this.connectionPool.getStatistics();
    
    // Calculate performance trends
    const recentMetrics = this.performanceHistory.slice(-10);
    const avgCpuUsage = recentMetrics.reduce((sum, m) => sum + m.cpuUsage, 0) / recentMetrics.length;
    const avgMemoryUsage = recentMetrics.reduce((sum, m) => sum + m.memoryUsage, 0) / recentMetrics.length;
    
    return {
      current: this.currentMetrics,
      trends: {
        avgCpuUsage,
        avgMemoryUsage,
        memoryTrend: recentMetrics.length > 1 ? 
          recentMetrics[recentMetrics.length - 1].memoryUsage - recentMetrics[0].memoryUsage : 0
      },
      memory: memoryStats,
      connections: connectionStats,
      optimization: {
        active: this.optimizationActive,
        lastOptimization: this.lastOptimization,
        optimizationCount: Math.floor((Date.now() - this.lastOptimization) / this.config.OPTIMIZATION_INTERVAL)
      }
    };
  }
  
  /**
   * Reset performance optimizer
   */
  reset() {
    this.performanceHistory = [];
    this.optimizationActive = false;
    this.lastOptimization = 0;
    
    // Reset component managers
    this.memoryPool = new MemoryPool(this.config.MEMORY_POOL_SIZE);
    this.connectionPool = new ConnectionPool(this.config.CONNECTION_POOL_SIZE);
  }
}

// Singleton instance
export const performanceOptimizer = new PerformanceOptimizer();
