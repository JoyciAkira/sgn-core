/**
 * SGN Batch Processing System
 * Phase 3: BLAKE3 Integration & Batch Processing
 * 
 * Features:
 * - High-volume KU processing
 * - Parallel signature verification
 * - Bulk storage operations
 * - Queue management
 * - Memory optimization
 * - Performance monitoring
 */

import { blake3BatchHash } from '../crypto/blake3-hasher.mjs';
import { verifySignature } from '../crypto.mjs';
import { reputationManager } from '../reputation-manager.mjs';

// Batch processing configuration
export const BATCH_CONFIG = {
  DEFAULT_BATCH_SIZE: 100,
  MAX_BATCH_SIZE: 1000,
  PARALLEL_WORKERS: 4,
  QUEUE_SIZE_LIMIT: 10000,
  MEMORY_THRESHOLD: 128 * 1024 * 1024, // 128MB
  PROCESSING_TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000 // 1 second
};

/**
 * Batch Processing Queue Item
 */
class BatchItem {
  constructor(data, type, options = {}) {
    this.id = `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.data = data;
    this.type = type; // 'hash', 'verify', 'store', 'validate'
    this.options = options;
    this.status = 'pending';
    this.result = null;
    this.error = null;
    this.attempts = 0;
    this.createdAt = Date.now();
    this.processedAt = null;
  }
}

/**
 * Batch Processor Class
 * Handles high-volume operations with parallel processing
 */
export class BatchProcessor {
  constructor(options = {}) {
    this.config = { ...BATCH_CONFIG, ...options };
    
    // Processing queues
    this.queues = {
      hash: [],
      verify: [],
      store: [],
      validate: []
    };
    
    // Worker management
    this.workers = new Map();
    this.activeJobs = 0;
    this.isProcessing = false;
    
    // Performance metrics
    this.metrics = {
      totalProcessed: 0,
      totalErrors: 0,
      averageProcessingTime: 0,
      throughputPerSecond: 0,
      queueSizes: {},
      workerUtilization: 0,
      memoryUsage: 0
    };
    
    // Start processing loop
    this.startProcessingLoop();
    this.startMetricsCollection();
  }
  
  /**
   * Add items to batch processing queue
   * @param {Array|Object} items - Items to process
   * @param {string} type - Processing type
   * @param {Object} options - Processing options
   */
  async addToBatch(items, type, options = {}) {
    const itemsArray = Array.isArray(items) ? items : [items];
    const batchItems = [];
    
    // Check queue size limits
    if (this.getTotalQueueSize() + itemsArray.length > this.config.QUEUE_SIZE_LIMIT) {
      throw new Error(`Queue size limit exceeded. Current: ${this.getTotalQueueSize()}, Adding: ${itemsArray.length}, Limit: ${this.config.QUEUE_SIZE_LIMIT}`);
    }
    
    // Create batch items
    for (const item of itemsArray) {
      const batchItem = new BatchItem(item, type, options);
      batchItems.push(batchItem);
      
      if (!this.queues[type]) {
        this.queues[type] = [];
      }
      this.queues[type].push(batchItem);
    }
    
    console.log(`📦 Added ${batchItems.length} items to ${type} batch queue`);
    
    // Trigger processing if not already running
    if (!this.isProcessing) {
      this.processQueues();
    }
    
    return batchItems.map(item => item.id);
  }
  
  /**
   * Process all queues
   */
  async processQueues() {
    if (this.isProcessing) return;
    
    this.isProcessing = true;
    console.log("🔄 Starting batch processing...");
    
    try {
      // Process each queue type
      for (const [queueType, queue] of Object.entries(this.queues)) {
        if (queue.length > 0) {
          await this.processQueue(queueType, queue);
        }
      }
    } catch (error) {
      console.error("❌ Batch processing error:", error);
    } finally {
      this.isProcessing = false;
      
      // Schedule next processing cycle if queues not empty
      if (this.getTotalQueueSize() > 0) {
        setTimeout(() => this.processQueues(), 100);
      }
    }
  }
  
  /**
   * Process specific queue
   * @param {string} queueType 
   * @param {Array} queue 
   */
  async processQueue(queueType, queue) {
    const batchSize = Math.min(queue.length, this.config.DEFAULT_BATCH_SIZE);
    const batch = queue.splice(0, batchSize);
    
    console.log(`⚡ Processing ${batch.length} items from ${queueType} queue`);
    
    const startTime = Date.now();
    
    try {
      // Process batch based on type
      switch (queueType) {
        case 'hash':
          await this.processBatchHash(batch);
          break;
        case 'verify':
          await this.processBatchVerify(batch);
          break;
        case 'store':
          await this.processBatchStore(batch);
          break;
        case 'validate':
          await this.processBatchValidate(batch);
          break;
        default:
          throw new Error(`Unknown queue type: ${queueType}`);
      }
      
      // Update metrics
      const processingTime = Date.now() - startTime;
      this.updateMetrics(batch.length, processingTime, 0);
      
      console.log(`✅ Processed ${batch.length} ${queueType} items in ${processingTime}ms`);
      
    } catch (error) {
      console.error(`❌ Failed to process ${queueType} batch:`, error);
      
      // Mark items as failed and retry if possible
      for (const item of batch) {
        item.attempts++;
        item.error = error.message;
        
        if (item.attempts < this.config.RETRY_ATTEMPTS) {
          item.status = 'retry';
          // Add back to queue for retry
          setTimeout(() => {
            this.queues[queueType].push(item);
          }, this.config.RETRY_DELAY * item.attempts);
        } else {
          item.status = 'failed';
        }
      }
      
      this.updateMetrics(0, 0, batch.length);
    }
  }
  
  /**
   * Process batch hash operations
   * @param {Array} batch 
   */
  async processBatchHash(batch) {
    const dataArray = batch.map(item => item.data);
    const options = batch[0]?.options || {};
    
    // Use BLAKE3 batch hashing
    const results = await blake3BatchHash(dataArray, {
      ...options,
      parallel: true,
      batchSize: this.config.DEFAULT_BATCH_SIZE
    });
    
    // Update batch items with results
    for (let i = 0; i < batch.length; i++) {
      const item = batch[i];
      const result = results[i];
      
      item.result = {
        hash: result.hash,
        size: result.size,
        algorithm: 'BLAKE3'
      };
      item.status = 'completed';
      item.processedAt = Date.now();
    }
  }
  
  /**
   * Process batch signature verification
   * @param {Array} batch 
   */
  async processBatchVerify(batch) {
    const verificationPromises = batch.map(async (item) => {
      const { message, signature, publicKey, peerId } = item.data;
      
      try {
        const result = verifySignature(message, signature, publicKey);
        
        // Update reputation if peerId provided
        if (peerId) {
          const action = result.isValid ? 'valid_signature' : 'invalid_signature';
          reputationManager.updatePeerReputation(peerId, action);
        }
        
        item.result = result;
        item.status = 'completed';
        item.processedAt = Date.now();
        
      } catch (error) {
        item.error = error.message;
        item.status = 'failed';
        item.processedAt = Date.now();
      }
    });
    
    await Promise.all(verificationPromises);
  }
  
  /**
   * Process batch storage operations
   * @param {Array} batch 
   */
  async processBatchStore(batch) {
    // Group by storage tier
    const tierGroups = {};
    
    for (const item of batch) {
      const tier = item.options.tier || 'warm';
      if (!tierGroups[tier]) {
        tierGroups[tier] = [];
      }
      tierGroups[tier].push(item);
    }
    
    // Process each tier group
    for (const [tier, items] of Object.entries(tierGroups)) {
      await this.processTierBatch(tier, items);
    }
  }
  
  /**
   * Process batch for specific storage tier
   * @param {string} tier 
   * @param {Array} items 
   */
  async processTierBatch(tier, items) {
    // This would integrate with the multi-tier storage system
    // For now, simulate the operation
    
    for (const item of items) {
      try {
        // Simulate storage operation
        await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
        
        item.result = {
          stored: true,
          tier: tier,
          timestamp: Date.now()
        };
        item.status = 'completed';
        item.processedAt = Date.now();
        
      } catch (error) {
        item.error = error.message;
        item.status = 'failed';
        item.processedAt = Date.now();
      }
    }
  }
  
  /**
   * Process batch validation operations
   * @param {Array} batch 
   */
  async processBatchValidate(batch) {
    for (const item of batch) {
      try {
        const ku = item.data;
        
        // Perform KU validation
        const validation = {
          hasRequiredFields: !!(ku.id && ku.type && ku.title && ku.description),
          hasValidHash: !!(ku.hash && ku.hash.length > 0),
          hasValidSignature: !!(ku.signature),
          confidenceInRange: ku.confidence >= 0 && ku.confidence <= 1,
          isValid: true
        };
        
        validation.isValid = Object.values(validation).every(v => v === true);
        
        item.result = validation;
        item.status = 'completed';
        item.processedAt = Date.now();
        
      } catch (error) {
        item.error = error.message;
        item.status = 'failed';
        item.processedAt = Date.now();
      }
    }
  }
  
  /**
   * Get batch processing results
   * @param {Array} batchIds 
   */
  getBatchResults(batchIds) {
    const results = [];
    
    for (const queueType of Object.keys(this.queues)) {
      for (const item of this.queues[queueType]) {
        if (batchIds.includes(item.id)) {
          results.push({
            id: item.id,
            type: item.type,
            status: item.status,
            result: item.result,
            error: item.error,
            processingTime: item.processedAt ? item.processedAt - item.createdAt : null
          });
        }
      }
    }
    
    return results;
  }
  
  /**
   * Get total queue size across all queues
   */
  getTotalQueueSize() {
    return Object.values(this.queues).reduce((total, queue) => total + queue.length, 0);
  }
  
  /**
   * Update performance metrics
   * @param {number} processed 
   * @param {number} processingTime 
   * @param {number} errors 
   */
  updateMetrics(processed, processingTime, errors) {
    this.metrics.totalProcessed += processed;
    this.metrics.totalErrors += errors;
    
    if (processed > 0 && processingTime > 0) {
      // Update average processing time
      const totalTime = this.metrics.averageProcessingTime * (this.metrics.totalProcessed - processed) + processingTime;
      this.metrics.averageProcessingTime = totalTime / this.metrics.totalProcessed;
      
      // Update throughput
      this.metrics.throughputPerSecond = (processed / processingTime) * 1000;
    }
    
    // Update queue sizes
    for (const [queueType, queue] of Object.entries(this.queues)) {
      this.metrics.queueSizes[queueType] = queue.length;
    }
  }
  
  /**
   * Start processing loop
   */
  startProcessingLoop() {
    setInterval(() => {
      if (!this.isProcessing && this.getTotalQueueSize() > 0) {
        this.processQueues();
      }
    }, 1000); // Check every second
  }
  
  /**
   * Start metrics collection
   */
  startMetricsCollection() {
    setInterval(() => {
      this.collectMetrics();
    }, 5000); // Every 5 seconds
  }
  
  /**
   * Collect system metrics
   */
  collectMetrics() {
    const memoryUsage = process.memoryUsage();
    this.metrics.memoryUsage = memoryUsage.heapUsed;
    this.metrics.workerUtilization = this.activeJobs / this.config.PARALLEL_WORKERS;
  }
  
  /**
   * Get comprehensive statistics
   */
  getStatistics() {
    return {
      ...this.metrics,
      totalQueueSize: this.getTotalQueueSize(),
      isProcessing: this.isProcessing,
      activeJobs: this.activeJobs,
      successRate: this.metrics.totalProcessed / (this.metrics.totalProcessed + this.metrics.totalErrors),
      memoryUsageMB: (this.metrics.memoryUsage / 1024 / 1024).toFixed(2)
    };
  }
  
  /**
   * Clear all queues and reset metrics
   */
  reset() {
    for (const queueType of Object.keys(this.queues)) {
      this.queues[queueType] = [];
    }
    
    this.metrics = {
      totalProcessed: 0,
      totalErrors: 0,
      averageProcessingTime: 0,
      throughputPerSecond: 0,
      queueSizes: {},
      workerUtilization: 0,
      memoryUsage: 0
    };
    
    this.activeJobs = 0;
    this.isProcessing = false;
  }
}

// Singleton instance
export const batchProcessor = new BatchProcessor();

/**
 * Streaming Processor for Real-time KU Processing
 * Handles continuous streams of Knowledge Units
 */
export class StreamingProcessor {
  constructor(options = {}) {
    this.config = { ...BATCH_CONFIG, ...options };

    // Streaming state
    this.streams = new Map(); // streamId -> stream config
    this.processors = new Map(); // streamId -> processor function
    this.buffers = new Map(); // streamId -> buffer
    this.metrics = new Map(); // streamId -> metrics

    // Real-time processing
    this.isStreaming = false;
    this.streamingInterval = null;
  }

  /**
   * Create new processing stream
   * @param {string} streamId - Unique stream identifier
   * @param {Object} config - Stream configuration
   * @param {Function} processor - Processing function
   */
  createStream(streamId, config, processor) {
    this.streams.set(streamId, {
      id: streamId,
      bufferSize: config.bufferSize || 100,
      flushInterval: config.flushInterval || 1000,
      processingType: config.type || 'validate',
      options: config.options || {},
      createdAt: Date.now()
    });

    this.processors.set(streamId, processor);
    this.buffers.set(streamId, []);
    this.metrics.set(streamId, {
      itemsProcessed: 0,
      itemsBuffered: 0,
      processingTime: 0,
      errors: 0,
      throughput: 0
    });

    console.log(`🌊 Created stream: ${streamId}`);

    // Start streaming if not already active
    if (!this.isStreaming) {
      this.startStreaming();
    }
  }

  /**
   * Add item to stream
   * @param {string} streamId - Stream identifier
   * @param {Object} item - Item to process
   */
  addToStream(streamId, item) {
    const buffer = this.buffers.get(streamId);
    const stream = this.streams.get(streamId);
    const metrics = this.metrics.get(streamId);

    if (!buffer || !stream || !metrics) {
      throw new Error(`Stream not found: ${streamId}`);
    }

    buffer.push({
      data: item,
      timestamp: Date.now(),
      id: `${streamId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    });

    metrics.itemsBuffered++;

    // Flush if buffer is full
    if (buffer.length >= stream.bufferSize) {
      this.flushStream(streamId);
    }
  }

  /**
   * Flush stream buffer
   * @param {string} streamId - Stream identifier
   */
  async flushStream(streamId) {
    const buffer = this.buffers.get(streamId);
    const stream = this.streams.get(streamId);
    const processor = this.processors.get(streamId);
    const metrics = this.metrics.get(streamId);

    if (!buffer || buffer.length === 0) return;

    const items = buffer.splice(0); // Clear buffer
    const startTime = Date.now();

    try {
      // Process items
      if (processor) {
        await processor(items, stream.options);
      } else {
        // Use batch processor
        const batchIds = await batchProcessor.addToBatch(
          items.map(item => item.data),
          stream.processingType,
          stream.options
        );

        // Wait for processing to complete
        await this.waitForBatchCompletion(batchIds);
      }

      // Update metrics
      const processingTime = Date.now() - startTime;
      metrics.itemsProcessed += items.length;
      metrics.itemsBuffered -= items.length;
      metrics.processingTime += processingTime;
      metrics.throughput = metrics.itemsProcessed / (metrics.processingTime / 1000);

      console.log(`🌊 Flushed ${items.length} items from stream ${streamId} in ${processingTime}ms`);

    } catch (error) {
      metrics.errors++;
      console.error(`❌ Stream processing error for ${streamId}:`, error);

      // Re-add items to buffer for retry
      buffer.unshift(...items);
    }
  }

  /**
   * Wait for batch processing completion
   * @param {Array} batchIds - Batch IDs to wait for
   */
  async waitForBatchCompletion(batchIds) {
    return new Promise((resolve) => {
      const checkCompletion = () => {
        const results = batchProcessor.getBatchResults(batchIds);
        const completed = results.filter(r => r.status === 'completed' || r.status === 'failed');

        if (completed.length === batchIds.length) {
          resolve(results);
        } else {
          setTimeout(checkCompletion, 100);
        }
      };

      checkCompletion();
    });
  }

  /**
   * Start streaming processing
   */
  startStreaming() {
    if (this.isStreaming) return;

    this.isStreaming = true;
    console.log("🌊 Starting streaming processor...");

    this.streamingInterval = setInterval(() => {
      // Flush streams based on time intervals
      for (const [streamId, stream] of this.streams.entries()) {
        const buffer = this.buffers.get(streamId);
        if (buffer && buffer.length > 0) {
          const oldestItem = buffer[0];
          const age = Date.now() - oldestItem.timestamp;

          if (age >= stream.flushInterval) {
            this.flushStream(streamId);
          }
        }
      }
    }, 100); // Check every 100ms
  }

  /**
   * Stop streaming processing
   */
  stopStreaming() {
    if (!this.isStreaming) return;

    this.isStreaming = false;

    if (this.streamingInterval) {
      clearInterval(this.streamingInterval);
      this.streamingInterval = null;
    }

    // Flush all remaining buffers
    for (const streamId of this.streams.keys()) {
      this.flushStream(streamId);
    }

    console.log("🌊 Streaming processor stopped");
  }

  /**
   * Get stream statistics
   * @param {string} streamId - Stream identifier (optional)
   */
  getStreamStatistics(streamId = null) {
    if (streamId) {
      const stream = this.streams.get(streamId);
      const metrics = this.metrics.get(streamId);
      const buffer = this.buffers.get(streamId);

      return {
        stream,
        metrics,
        bufferSize: buffer ? buffer.length : 0,
        isActive: this.isStreaming
      };
    }

    // Return all streams
    const allStats = {};
    for (const streamId of this.streams.keys()) {
      allStats[streamId] = this.getStreamStatistics(streamId);
    }

    return {
      streams: allStats,
      totalStreams: this.streams.size,
      isStreaming: this.isStreaming
    };
  }

  /**
   * Remove stream
   * @param {string} streamId - Stream identifier
   */
  removeStream(streamId) {
    // Flush remaining items
    this.flushStream(streamId);

    // Remove stream data
    this.streams.delete(streamId);
    this.processors.delete(streamId);
    this.buffers.delete(streamId);
    this.metrics.delete(streamId);

    console.log(`🗑️ Removed stream: ${streamId}`);

    // Stop streaming if no streams left
    if (this.streams.size === 0) {
      this.stopStreaming();
    }
  }
}

// Singleton streaming processor
export const streamingProcessor = new StreamingProcessor();
