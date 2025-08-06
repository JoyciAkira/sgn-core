/**
 * SGN KU Identification Engine
 * Phase 4 Step 2: KU Identification Engine
 * 
 * Features:
 * - Contextual KU matching system
 * - Intelligent query processing
 * - Semantic analysis and scoring
 * - Real-time KU identification
 * - Integration with network layer
 */

import { blake3Hash } from '../crypto/blake3-hasher.mjs';
import { multiTierStorage } from '../persistence/multi-tier-storage.mjs';
import { reputationManager } from '../reputation-manager.mjs';
import { KU_TYPES, SEVERITY_LEVELS } from '../knowledge-unit.mjs';

// KU Identification Configuration
export const KU_IDENTIFICATION_CONFIG = {
  // Scoring weights
  EXACT_MATCH_WEIGHT: 1.0,
  PARTIAL_MATCH_WEIGHT: 0.7,
  SEMANTIC_MATCH_WEIGHT: 0.5,
  TAG_MATCH_WEIGHT: 0.8,
  SYSTEM_MATCH_WEIGHT: 0.6,
  
  // Confidence thresholds (more permissive)
  HIGH_CONFIDENCE_THRESHOLD: 0.6,
  MEDIUM_CONFIDENCE_THRESHOLD: 0.3,
  LOW_CONFIDENCE_THRESHOLD: 0.1,
  
  // Query processing
  MAX_QUERY_TERMS: 20,
  MIN_TERM_LENGTH: 3,
  STOP_WORDS: ['the', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by'],
  
  // Result limits
  MAX_RESULTS: 50,
  DEFAULT_RESULTS: 10,
  
  // Caching
  QUERY_CACHE_TTL: 300000, // 5 minutes
  CONTEXT_CACHE_TTL: 600000, // 10 minutes
};

/**
 * Context Analysis Engine
 * Analyzes context to understand what type of KU is needed
 */
export class ContextAnalysisEngine {
  constructor() {
    // Context patterns for different KU types
    this.contextPatterns = new Map([
      [KU_TYPES.SECURITY_VULNERABILITY, [
        'vulnerability', 'exploit', 'attack', 'breach', 'security', 'hack',
        'injection', 'xss', 'csrf', 'authentication', 'authorization',
        'privilege', 'escalation', 'buffer', 'overflow', 'malware'
      ]],
      [KU_TYPES.PERFORMANCE_ISSUE, [
        'slow', 'performance', 'latency', 'timeout', 'bottleneck',
        'memory', 'cpu', 'disk', 'network', 'optimization', 'speed',
        'response', 'throughput', 'scalability', 'load'
      ]],
      [KU_TYPES.BUG_REPORT, [
        'bug', 'error', 'exception', 'crash', 'failure', 'broken',
        'incorrect', 'wrong', 'unexpected', 'malfunction', 'defect'
      ]],
      [KU_TYPES.BEST_PRACTICE, [
        'best', 'practice', 'recommendation', 'guideline', 'standard',
        'pattern', 'convention', 'methodology', 'approach', 'strategy'
      ]],
      [KU_TYPES.CONFIGURATION_ISSUE, [
        'config', 'configuration', 'setting', 'parameter', 'option',
        'environment', 'deployment', 'setup', 'installation'
      ]]
    ]);
    
    // Severity indicators
    this.severityIndicators = new Map([
      [SEVERITY_LEVELS.CRITICAL, [
        'critical', 'urgent', 'emergency', 'immediate', 'severe',
        'production', 'outage', 'down', 'failure', 'catastrophic'
      ]],
      [SEVERITY_LEVELS.HIGH, [
        'high', 'important', 'significant', 'major', 'serious',
        'impact', 'affecting', 'widespread', 'multiple'
      ]],
      [SEVERITY_LEVELS.MEDIUM, [
        'medium', 'moderate', 'some', 'partial', 'limited',
        'occasional', 'intermittent', 'minor'
      ]],
      [SEVERITY_LEVELS.LOW, [
        'low', 'trivial', 'cosmetic', 'enhancement', 'nice',
        'future', 'suggestion', 'improvement'
      ]]
    ]);
    
    // System/technology patterns
    this.systemPatterns = new Map([
      ['web', ['http', 'https', 'web', 'browser', 'html', 'css', 'javascript', 'ajax']],
      ['database', ['sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'database', 'db']],
      ['network', ['tcp', 'udp', 'ip', 'dns', 'network', 'socket', 'connection']],
      ['api', ['api', 'rest', 'graphql', 'endpoint', 'service', 'microservice']],
      ['authentication', ['auth', 'login', 'password', 'token', 'session', 'oauth']],
      ['cloud', ['aws', 'azure', 'gcp', 'cloud', 'kubernetes', 'docker', 'container']]
    ]);
  }
  
  /**
   * Analyze context to determine KU requirements
   * @param {string} context - Context description or query
   * @returns {Object} Analysis results
   */
  analyzeContext(context) {
    const normalizedContext = context.toLowerCase();
    const words = this.extractWords(normalizedContext);
    
    const analysis = {
      originalContext: context,
      normalizedContext,
      words,
      kuTypeScores: new Map(),
      severityScores: new Map(),
      systemScores: new Map(),
      confidence: 0,
      suggestedKUType: null,
      suggestedSeverity: null,
      suggestedSystems: [],
      queryTerms: []
    };
    
    // Analyze KU type patterns
    this.analyzeKUTypes(words, analysis);
    
    // Analyze severity patterns
    this.analyzeSeverity(words, analysis);
    
    // Analyze system patterns
    this.analyzeSystems(words, analysis);
    
    // Extract query terms
    this.extractQueryTerms(words, analysis);
    
    // Calculate overall confidence
    this.calculateConfidence(analysis);
    
    return analysis;
  }
  
  /**
   * Extract words from context
   */
  extractWords(context) {
    return context
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(word => 
        word.length >= KU_IDENTIFICATION_CONFIG.MIN_TERM_LENGTH &&
        !KU_IDENTIFICATION_CONFIG.STOP_WORDS.includes(word)
      );
  }
  
  /**
   * Analyze KU type patterns
   */
  analyzeKUTypes(words, analysis) {
    for (const [kuType, patterns] of this.contextPatterns.entries()) {
      let score = 0;
      let matches = 0;
      
      for (const word of words) {
        for (const pattern of patterns) {
          if (word.includes(pattern) || pattern.includes(word)) {
            score += KU_IDENTIFICATION_CONFIG.EXACT_MATCH_WEIGHT;
            matches++;
          }
        }
      }
      
      if (matches > 0) {
        score = score / Math.max(words.length, patterns.length);
        analysis.kuTypeScores.set(kuType, score);
      }
    }
    
    // Find highest scoring KU type
    let maxScore = 0;
    for (const [kuType, score] of analysis.kuTypeScores.entries()) {
      if (score > maxScore) {
        maxScore = score;
        analysis.suggestedKUType = kuType;
      }
    }
  }
  
  /**
   * Analyze severity patterns
   */
  analyzeSeverity(words, analysis) {
    for (const [severity, indicators] of this.severityIndicators.entries()) {
      let score = 0;
      let matches = 0;
      
      for (const word of words) {
        for (const indicator of indicators) {
          if (word.includes(indicator) || indicator.includes(word)) {
            score += KU_IDENTIFICATION_CONFIG.EXACT_MATCH_WEIGHT;
            matches++;
          }
        }
      }
      
      if (matches > 0) {
        score = score / Math.max(words.length, indicators.length);
        analysis.severityScores.set(severity, score);
      }
    }
    
    // Find highest scoring severity
    let maxScore = 0;
    for (const [severity, score] of analysis.severityScores.entries()) {
      if (score > maxScore) {
        maxScore = score;
        analysis.suggestedSeverity = severity;
      }
    }
  }
  
  /**
   * Analyze system patterns
   */
  analyzeSystems(words, analysis) {
    for (const [system, patterns] of this.systemPatterns.entries()) {
      let score = 0;
      let matches = 0;
      
      for (const word of words) {
        for (const pattern of patterns) {
          if (word.includes(pattern) || pattern.includes(word)) {
            score += KU_IDENTIFICATION_CONFIG.SYSTEM_MATCH_WEIGHT;
            matches++;
          }
        }
      }
      
      if (matches > 0) {
        score = score / Math.max(words.length, patterns.length);
        analysis.systemScores.set(system, score);
      }
    }
    
    // Get top scoring systems
    const sortedSystems = Array.from(analysis.systemScores.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    
    analysis.suggestedSystems = sortedSystems.map(([system, score]) => ({
      system,
      score
    }));
  }
  
  /**
   * Extract query terms for search
   */
  extractQueryTerms(words, analysis) {
    // Remove common words and keep meaningful terms
    analysis.queryTerms = words
      .filter(word => word.length >= 4)
      .slice(0, KU_IDENTIFICATION_CONFIG.MAX_QUERY_TERMS);
  }
  
  /**
   * Calculate overall confidence
   */
  calculateConfidence(analysis) {
    let confidence = 0;
    let factors = 0;
    
    // KU type confidence
    if (analysis.kuTypeScores.size > 0) {
      const maxKUScore = Math.max(...analysis.kuTypeScores.values());
      confidence += maxKUScore;
      factors++;
    }
    
    // Severity confidence
    if (analysis.severityScores.size > 0) {
      const maxSeverityScore = Math.max(...analysis.severityScores.values());
      confidence += maxSeverityScore * 0.5; // Lower weight
      factors++;
    }
    
    // System confidence
    if (analysis.systemScores.size > 0) {
      const maxSystemScore = Math.max(...analysis.systemScores.values());
      confidence += maxSystemScore * 0.3; // Lower weight
      factors++;
    }
    
    analysis.confidence = factors > 0 ? confidence / factors : 0;
  }
}

/**
 * KU Matching Engine
 * Matches KUs to requirements based on context analysis
 */
export class KUMatchingEngine {
  constructor() {
    this.contextEngine = new ContextAnalysisEngine();
    this.queryCache = new Map();
  }
  
  /**
   * Find matching KUs for a given context
   * @param {string} context - Context or query description
   * @param {Object} options - Search options
   * @returns {Array} Matching KUs with scores
   */
  async findMatchingKUs(context, options = {}) {
    const cacheKey = blake3Hash(context + JSON.stringify(options));
    
    // Check cache first
    if (this.queryCache.has(cacheKey)) {
      const cached = this.queryCache.get(cacheKey);
      if (Date.now() - cached.timestamp < KU_IDENTIFICATION_CONFIG.QUERY_CACHE_TTL) {
        return cached.results;
      }
    }
    
    // Analyze context
    const analysis = this.contextEngine.analyzeContext(context);
    
    // Build search query
    const searchQuery = this.buildSearchQuery(analysis, options);
    
    // Search for KUs
    const candidates = await multiTierStorage.search(searchQuery, {
      limit: options.limit || KU_IDENTIFICATION_CONFIG.MAX_RESULTS
    });
    
    // Score and rank candidates
    const scoredResults = this.scoreKUCandidates(candidates, analysis, options);
    
    // Cache results
    this.queryCache.set(cacheKey, {
      results: scoredResults,
      timestamp: Date.now()
    });
    
    // Clean cache if too large
    if (this.queryCache.size > 1000) {
      this.cleanCache();
    }
    
    return scoredResults;
  }
  
  /**
   * Build search query from context analysis
   */
  buildSearchQuery(analysis, options) {
    const query = {};
    
    // Add KU type if confident
    if (analysis.suggestedKUType && analysis.confidence > KU_IDENTIFICATION_CONFIG.MEDIUM_CONFIDENCE_THRESHOLD) {
      query.type = analysis.suggestedKUType;
    }
    
    // Add severity if specified
    if (analysis.suggestedSeverity && analysis.confidence > KU_IDENTIFICATION_CONFIG.HIGH_CONFIDENCE_THRESHOLD) {
      query.severity = analysis.suggestedSeverity;
    }
    
    // Add query terms as tags
    if (analysis.queryTerms.length > 0) {
      query.tags = analysis.queryTerms.slice(0, 5); // Top 5 terms
    }
    
    // Add system filters
    if (analysis.suggestedSystems.length > 0) {
      const topSystem = analysis.suggestedSystems[0];
      if (topSystem.score > KU_IDENTIFICATION_CONFIG.MEDIUM_CONFIDENCE_THRESHOLD) {
        query.affectedSystems = [topSystem.system];
      }
    }
    
    // Add minimum confidence
    query.minConfidence = options.minConfidence || KU_IDENTIFICATION_CONFIG.LOW_CONFIDENCE_THRESHOLD;
    
    return query;
  }
  
  /**
   * Score KU candidates based on context match
   */
  scoreKUCandidates(candidates, analysis, options) {
    const scoredResults = [];
    
    for (const ku of candidates) {
      const score = this.calculateKUScore(ku, analysis);
      
      if (score >= KU_IDENTIFICATION_CONFIG.LOW_CONFIDENCE_THRESHOLD) {
        scoredResults.push({
          ku,
          score,
          matchReasons: this.getMatchReasons(ku, analysis),
          confidence: score
        });
      }
    }
    
    // Sort by score (highest first)
    scoredResults.sort((a, b) => b.score - a.score);
    
    // Limit results
    const limit = options.limit || KU_IDENTIFICATION_CONFIG.DEFAULT_RESULTS;
    return scoredResults.slice(0, limit);
  }
  
  /**
   * Calculate match score for a KU
   */
  calculateKUScore(ku, analysis) {
    let score = 0;
    let factors = 0;
    
    // Type match
    if (analysis.suggestedKUType && ku.type === analysis.suggestedKUType) {
      score += KU_IDENTIFICATION_CONFIG.EXACT_MATCH_WEIGHT;
      factors++;
    }
    
    // Severity match
    if (analysis.suggestedSeverity && ku.severity === analysis.suggestedSeverity) {
      score += KU_IDENTIFICATION_CONFIG.EXACT_MATCH_WEIGHT * 0.7;
      factors++;
    }
    
    // Tag matches
    if (analysis.queryTerms.length > 0 && ku.tags) {
      let tagMatches = 0;
      for (const term of analysis.queryTerms) {
        for (const tag of ku.tags) {
          if (tag.toLowerCase().includes(term.toLowerCase()) || 
              term.toLowerCase().includes(tag.toLowerCase())) {
            tagMatches++;
          }
        }
      }
      if (tagMatches > 0) {
        score += (tagMatches / Math.max(analysis.queryTerms.length, ku.tags.length)) * 
                 KU_IDENTIFICATION_CONFIG.TAG_MATCH_WEIGHT;
        factors++;
      }
    }
    
    // System matches
    if (analysis.suggestedSystems.length > 0 && ku.affectedSystems) {
      let systemMatches = 0;
      for (const { system } of analysis.suggestedSystems) {
        for (const affectedSystem of ku.affectedSystems) {
          if (affectedSystem.toLowerCase().includes(system.toLowerCase()) ||
              system.toLowerCase().includes(affectedSystem.toLowerCase())) {
            systemMatches++;
          }
        }
      }
      if (systemMatches > 0) {
        score += (systemMatches / Math.max(analysis.suggestedSystems.length, ku.affectedSystems.length)) *
                 KU_IDENTIFICATION_CONFIG.SYSTEM_MATCH_WEIGHT;
        factors++;
      }
    }
    
    // Text similarity (title and description)
    const textScore = this.calculateTextSimilarity(
      analysis.normalizedContext,
      (ku.title + ' ' + ku.description).toLowerCase()
    );
    if (textScore > 0) {
      score += textScore * KU_IDENTIFICATION_CONFIG.SEMANTIC_MATCH_WEIGHT;
      factors++;
    }
    
    // Reputation boost
    if (ku.originPeer) {
      const reputation = reputationManager.getPeerReputation(ku.originPeer);
      if (reputation && reputation.trustScore > 0.7) {
        score *= 1.1; // 10% boost for trusted peers
      }
    }
    
    // Confidence boost
    if (ku.confidence > 0.8) {
      score *= 1.05; // 5% boost for high confidence KUs
    }
    
    return factors > 0 ? score / factors : 0;
  }
  
  /**
   * Calculate text similarity using simple word overlap
   */
  calculateTextSimilarity(text1, text2) {
    const words1 = new Set(text1.split(/\s+/));
    const words2 = new Set(text2.split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }
  
  /**
   * Get match reasons for explanation
   */
  getMatchReasons(ku, analysis) {
    const reasons = [];
    
    if (analysis.suggestedKUType && ku.type === analysis.suggestedKUType) {
      reasons.push(`Type match: ${ku.type}`);
    }
    
    if (analysis.suggestedSeverity && ku.severity === analysis.suggestedSeverity) {
      reasons.push(`Severity match: ${ku.severity}`);
    }
    
    if (analysis.queryTerms.length > 0 && ku.tags) {
      const matchingTags = ku.tags.filter(tag =>
        analysis.queryTerms.some(term =>
          tag.toLowerCase().includes(term.toLowerCase())
        )
      );
      if (matchingTags.length > 0) {
        reasons.push(`Tag matches: ${matchingTags.join(', ')}`);
      }
    }
    
    return reasons;
  }
  
  /**
   * Clean query cache
   */
  cleanCache() {
    const now = Date.now();
    for (const [key, value] of this.queryCache.entries()) {
      if (now - value.timestamp > KU_IDENTIFICATION_CONFIG.QUERY_CACHE_TTL) {
        this.queryCache.delete(key);
      }
    }
  }
  
  /**
   * Get matching engine statistics
   */
  getStatistics() {
    return {
      cacheSize: this.queryCache.size,
      cacheHitRate: 0, // Would need to track hits/misses
      totalQueries: 0, // Would need to track
      averageResponseTime: 0 // Would need to track
    };
  }
}

/**
 * Distributed KU Discovery Protocol
 * Handles network-wide KU discovery and aggregation
 */
export class DistributedKUDiscovery {
  constructor(networkNode) {
    this.networkNode = networkNode;
    this.matchingEngine = new KUMatchingEngine();

    // Discovery state
    this.activeDiscoveries = new Map(); // discoveryId -> discovery info
    this.discoveryCache = new Map(); // query hash -> cached results
    this.peerCapabilities = new Map(); // peerId -> capabilities

    // Performance metrics
    this.metrics = {
      discoveriesInitiated: 0,
      discoveriesCompleted: 0,
      averageDiscoveryTime: 0,
      networkHits: 0,
      cacheHits: 0,
      totalResults: 0
    };
  }

  /**
   * Discover KUs across the network
   * @param {string} context - Context or query
   * @param {Object} options - Discovery options
   * @returns {Promise<Array>} Discovered KUs with network metadata
   */
  async discoverKUs(context, options = {}) {
    const discoveryId = `discovery-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    console.log(`🔍 Starting distributed KU discovery: ${discoveryId}`);
    console.log(`   Context: "${context}"`);

    try {
      // Check cache first
      const cacheKey = blake3Hash(context + JSON.stringify(options));
      if (this.discoveryCache.has(cacheKey)) {
        const cached = this.discoveryCache.get(cacheKey);
        if (Date.now() - cached.timestamp < KU_IDENTIFICATION_CONFIG.QUERY_CACHE_TTL) {
          this.metrics.cacheHits++;
          console.log(`✅ Cache hit for discovery: ${discoveryId}`);
          return cached.results;
        }
      }

      // Track active discovery
      this.activeDiscoveries.set(discoveryId, {
        context,
        options,
        startTime,
        responses: new Map(),
        completed: false
      });

      this.metrics.discoveriesInitiated++;

      // Local search first
      console.log(`🏠 Searching local storage...`);
      const localResults = await this.matchingEngine.findMatchingKUs(context, options);
      console.log(`   Local results: ${localResults.length}`);

      // Network search if connected to peers
      let networkResults = [];
      if (this.networkNode && this.networkNode.connectedPeers && this.networkNode.connectedPeers.size > 0) {
        console.log(`🌐 Searching network (${this.networkNode.connectedPeers.size} peers)...`);
        networkResults = await this.searchNetwork(discoveryId, context, options);
        console.log(`   Network results: ${networkResults.length}`);
        this.metrics.networkHits++;
      } else {
        console.log(`🏠 No network peers available, using local results only`);
      }

      // Combine and deduplicate results
      const combinedResults = this.combineResults(localResults, networkResults);
      console.log(`📊 Combined results: ${combinedResults.length}`);

      // Cache results
      this.discoveryCache.set(cacheKey, {
        results: combinedResults,
        timestamp: Date.now()
      });

      // Update metrics
      const discoveryTime = Date.now() - startTime;
      this.updateMetrics(discoveryTime, combinedResults.length);

      // Clean up
      this.activeDiscoveries.delete(discoveryId);

      console.log(`✅ Discovery completed: ${discoveryId} (${discoveryTime}ms)`);

      return combinedResults;

    } catch (error) {
      console.error(`❌ Discovery failed: ${discoveryId} - ${error.message}`);
      this.activeDiscoveries.delete(discoveryId);
      throw error;
    }
  }

  /**
   * Search network for KUs
   */
  async searchNetwork(discoveryId, context, options) {
    const networkResults = [];
    const searchPromises = [];

    // Send requests to all connected peers
    for (const [peerId, ws] of this.networkNode.connectedPeers.entries()) {
      const promise = this.requestKUFromPeer(peerId, discoveryId, context, options);
      searchPromises.push(promise);
    }

    // Wait for responses with timeout
    const timeout = options.timeout || 5000;
    const responses = await Promise.allSettled(
      searchPromises.map(p =>
        Promise.race([
          p,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), timeout)
          )
        ])
      )
    );

    // Process responses
    for (let i = 0; i < responses.length; i++) {
      const response = responses[i];
      if (response.status === 'fulfilled' && response.value) {
        networkResults.push(...response.value);
      }
    }

    return networkResults;
  }

  /**
   * Request KU from specific peer
   */
  async requestKUFromPeer(peerId, discoveryId, context, options) {
    try {
      // Analyze context to build query
      const analysis = this.matchingEngine.contextEngine.analyzeContext(context);
      const query = this.matchingEngine.buildSearchQuery(analysis, options);

      // Send request via network
      const results = await this.networkNode.requestKU({
        ...query,
        context: context,
        discoveryId: discoveryId,
        requesterId: this.networkNode.nodeId
      });

      // Add network metadata
      return (results || []).map(ku => ({
        ...ku,
        source: 'network',
        sourcePeer: peerId,
        discoveryId: discoveryId
      }));

    } catch (error) {
      console.warn(`Request to peer ${peerId} failed: ${error.message}`);
      return [];
    }
  }

  /**
   * Combine local and network results
   */
  combineResults(localResults, networkResults) {
    const combined = [];
    const seenKUs = new Set();

    // Add local results first (higher priority)
    for (const result of localResults) {
      const kuId = result.ku.id;
      if (!seenKUs.has(kuId)) {
        combined.push({
          ...result,
          source: 'local'
        });
        seenKUs.add(kuId);
      }
    }

    // Add network results (deduplicated)
    for (const result of networkResults) {
      const kuId = result.id || result.ku?.id;
      if (kuId && !seenKUs.has(kuId)) {
        combined.push({
          ku: result.ku || result,
          score: result.score || 0.5,
          source: 'network',
          sourcePeer: result.sourcePeer,
          confidence: result.confidence || result.ku?.confidence || 0.5
        });
        seenKUs.add(kuId);
      }
    }

    // Sort by score
    combined.sort((a, b) => (b.score || 0) - (a.score || 0));

    return combined;
  }

  /**
   * Update discovery metrics
   */
  updateMetrics(discoveryTime, resultCount) {
    this.metrics.discoveriesCompleted++;
    this.metrics.totalResults += resultCount;

    // Update average discovery time
    const totalDiscoveries = this.metrics.discoveriesCompleted;
    this.metrics.averageDiscoveryTime =
      (this.metrics.averageDiscoveryTime * (totalDiscoveries - 1) + discoveryTime) / totalDiscoveries;
  }

  /**
   * Get discovery statistics
   */
  getStatistics() {
    return {
      ...this.metrics,
      activeDiscoveries: this.activeDiscoveries.size,
      cacheSize: this.discoveryCache.size,
      cacheHitRate: this.metrics.cacheHits / Math.max(this.metrics.discoveriesInitiated, 1),
      averageResultsPerDiscovery: this.metrics.totalResults / Math.max(this.metrics.discoveriesCompleted, 1)
    };
  }
}

// Singleton instances
export const contextAnalysisEngine = new ContextAnalysisEngine();
export const kuMatchingEngine = new KUMatchingEngine();
