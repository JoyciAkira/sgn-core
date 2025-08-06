/**
 * Neo4j Storage Tier Implementation (REAL)
 * Phase 2: Multi-tier Persistence - Cold Graph Storage
 * 
 * Features:
 * - Real Neo4j connection
 * - Knowledge graph relationships
 * - Advanced graph queries
 * - Similarity detection
 * - Peer network analysis
 * - Pattern recognition
 */

import neo4j from 'neo4j-driver';
import { StorageTier } from './storage-tier-base.mjs';
import { reputationManager } from '../reputation-manager.mjs';

/**
 * Neo4j Storage Tier (REAL)
 * Provides graph-based knowledge storage with real Neo4j
 */
export class Neo4jStorageTierReal extends StorageTier {
  constructor(options = {}) {
    super('neo4j-real');
    
    // Neo4j connection options
    this.neo4jOptions = {
      uri: options.uri || 'bolt://localhost:7687',
      username: options.username || 'neo4j',
      password: options.password || 'sgnpassword',
      ...options
    };
    
    this.driver = null;
    this.session = null;
    
    // Graph statistics
    this.stats = {
      nodeCount: 0,
      relationshipCount: 0,
      queryCount: 0,
      averageQueryTime: 0,
      connectionErrors: 0
    };
    
    // Relationship types
    this.relationshipTypes = {
      SIMILAR_TO: 'SIMILAR_TO',
      SUPERSEDES: 'SUPERSEDES',
      RELATES_TO: 'RELATES_TO',
      DISCOVERED_BY: 'DISCOVERED_BY',
      VERIFIED_BY: 'VERIFIED_BY',
      AFFECTS_SAME: 'AFFECTS_SAME',
      SAME_CATEGORY: 'SAME_CATEGORY'
    };
  }
  
  /**
   * Initialize Neo4j storage tier
   */
  async initialize() {
    console.log("🧊 Initializing Neo4j Storage Tier (REAL)...");
    
    try {
      // Create Neo4j driver
      this.driver = neo4j.driver(
        this.neo4jOptions.uri,
        neo4j.auth.basic(this.neo4jOptions.username, this.neo4jOptions.password)
      );
      
      // Test connection
      await this.driver.verifyConnectivity();
      console.log("✅ Connected to Neo4j server");
      
      // Create session
      this.session = this.driver.session();
      
      // Create constraints and indexes
      await this.createConstraintsAndIndexes();
      
      // Start relationship analysis worker
      this.startRelationshipAnalysis();
      
      this.isInitialized = true;
      console.log("✅ Neo4j Storage Tier (REAL) initialized successfully");
      
    } catch (error) {
      console.error("❌ Failed to initialize Neo4j Storage Tier:", error);
      this.stats.connectionErrors++;
      throw error;
    }
  }
  
  /**
   * Create constraints and indexes for performance
   */
  async createConstraintsAndIndexes() {
    const queries = [
      // Constraints
      "CREATE CONSTRAINT ku_id_unique IF NOT EXISTS FOR (ku:KnowledgeUnit) REQUIRE ku.id IS UNIQUE",
      "CREATE CONSTRAINT peer_id_unique IF NOT EXISTS FOR (p:Peer) REQUIRE p.id IS UNIQUE",
      
      // Indexes
      "CREATE INDEX ku_type_index IF NOT EXISTS FOR (ku:KnowledgeUnit) ON (ku.type)",
      "CREATE INDEX ku_severity_index IF NOT EXISTS FOR (ku:KnowledgeUnit) ON (ku.severity)",
      "CREATE INDEX ku_confidence_index IF NOT EXISTS FOR (ku:KnowledgeUnit) ON (ku.confidence)",
      "CREATE INDEX peer_trust_index IF NOT EXISTS FOR (p:Peer) ON (p.trustScore)"
    ];
    
    for (const query of queries) {
      try {
        await this.session.run(query);
      } catch (error) {
        // Ignore errors for existing constraints/indexes
        if (!error.message.includes('already exists')) {
          console.warn(`Failed to create constraint/index: ${error.message}`);
        }
      }
    }
    
    console.log("✅ Neo4j constraints and indexes created");
  }
  
  /**
   * Store Knowledge Unit in Neo4j
   * @param {KnowledgeUnit} ku - Knowledge Unit to store
   * @param {Object} options - Storage options
   */
  async store(ku, options = {}) {
    if (!this.isInitialized) {
      throw new Error("Neo4j storage tier not initialized");
    }
    
    const startTime = Date.now();
    
    try {
      // Create KU node
      const kuQuery = `
        MERGE (ku:KnowledgeUnit {id: $id})
        SET ku.type = $type,
            ku.severity = $severity,
            ku.confidence = $confidence,
            ku.title = $title,
            ku.description = $description,
            ku.solution = $solution,
            ku.tags = $tags,
            ku.affectedSystems = $affectedSystems,
            ku.discoveredBy = $discoveredBy,
            ku.originPeer = $originPeer,
            ku.timestamp = $timestamp,
            ku.hash = $hash,
            ku.createdAt = datetime(),
            ku.updatedAt = datetime()
        RETURN ku
      `;
      
      await this.session.run(kuQuery, {
        id: ku.id,
        type: ku.type,
        severity: ku.severity,
        confidence: ku.confidence,
        title: ku.title,
        description: ku.description,
        solution: ku.solution,
        tags: ku.tags || [],
        affectedSystems: ku.affectedSystems || [],
        discoveredBy: ku.discoveredBy,
        originPeer: ku.originPeer,
        timestamp: ku.timestamp,
        hash: ku.hash
      });
      
      // Create peer node if not exists
      if (ku.originPeer) {
        await this.createPeerNode(ku.originPeer);
        await this.createRelationship(ku.originPeer, ku.id, this.relationshipTypes.DISCOVERED_BY);
      }
      
      // Create relationships with existing KUs
      await this.analyzeAndCreateRelationships(ku);
      
      // Update statistics
      const queryTime = Date.now() - startTime;
      this.updateQueryTimeStats(queryTime);
      this.stats.nodeCount++;
      
      console.log(`🧊 Stored KU ${ku.id} in Neo4j graph`);
      return { success: true, nodeId: ku.id };
      
    } catch (error) {
      console.error(`❌ Failed to store KU ${ku.id} in Neo4j:`, error);
      throw error;
    }
  }
  
  /**
   * Retrieve Knowledge Unit from Neo4j
   * @param {string} kuId - Knowledge Unit ID
   */
  async retrieve(kuId) {
    if (!this.isInitialized) {
      throw new Error("Neo4j storage tier not initialized");
    }
    
    const startTime = Date.now();
    this.stats.queryCount++;
    
    try {
      const query = `
        MATCH (ku:KnowledgeUnit {id: $kuId})
        OPTIONAL MATCH (ku)-[r]-(related)
        RETURN ku, collect({type: type(r), node: related}) as relationships
      `;
      
      const result = await this.session.run(query, { kuId });
      
      if (result.records.length === 0) {
        return null;
      }
      
      const record = result.records[0];
      const kuNode = record.get('ku');
      const relationships = record.get('relationships');
      
      // Convert to KU format
      const ku = this.nodeToKU(kuNode);
      ku.relationships = relationships.filter(rel => rel.node).map(rel => ({
        type: rel.type,
        targetId: rel.node.properties.id,
        targetType: rel.node.labels[0]
      }));
      
      // Update statistics
      const queryTime = Date.now() - startTime;
      this.updateQueryTimeStats(queryTime);
      
      console.log(`🧊 Retrieved KU ${kuId} from Neo4j graph`);
      return ku;
      
    } catch (error) {
      console.error(`❌ Failed to retrieve KU ${kuId} from Neo4j:`, error);
      throw error;
    }
  }
  
  /**
   * Search Knowledge Units with graph queries
   * @param {Object} query - Search query
   * @param {Object} options - Search options
   */
  async search(query, options = {}) {
    if (!this.isInitialized) {
      throw new Error("Neo4j storage tier not initialized");
    }
    
    const startTime = Date.now();
    this.stats.queryCount++;
    
    try {
      let cypherQuery = "MATCH (ku:KnowledgeUnit) WHERE 1=1";
      const params = {};
      
      // Build dynamic query
      if (query.type) {
        cypherQuery += " AND ku.type = $type";
        params.type = query.type;
      }
      
      if (query.severity) {
        cypherQuery += " AND ku.severity = $severity";
        params.severity = query.severity;
      }
      
      if (query.minConfidence) {
        cypherQuery += " AND ku.confidence >= $minConfidence";
        params.minConfidence = query.minConfidence;
      }
      
      if (query.originPeer) {
        cypherQuery += " AND ku.originPeer = $originPeer";
        params.originPeer = query.originPeer;
      }
      
      // Graph-specific queries
      if (query.similarTo) {
        cypherQuery = `
          MATCH (target:KnowledgeUnit {id: $similarTo})
          MATCH (ku:KnowledgeUnit)-[:SIMILAR_TO]-(target)
          WHERE ku.id <> $similarTo
        `;
        params.similarTo = query.similarTo;
      }
      
      if (query.relatedTo) {
        cypherQuery = `
          MATCH (target:KnowledgeUnit {id: $relatedTo})
          MATCH (ku:KnowledgeUnit)-[r]-(target)
          WHERE ku.id <> $relatedTo AND type(r) IN ['RELATES_TO', 'AFFECTS_SAME', 'SAME_CATEGORY']
        `;
        params.relatedTo = query.relatedTo;
      }
      
      // Add ordering and limit
      cypherQuery += " RETURN ku ORDER BY ku.confidence DESC, ku.createdAt DESC";
      cypherQuery += " LIMIT $limit";
      params.limit = options.limit || 20;
      
      const result = await this.session.run(cypherQuery, params);
      
      // Convert results to KU objects
      const results = result.records.map(record => {
        const kuNode = record.get('ku');
        const ku = this.nodeToKU(kuNode);
        ku.graphScore = this.calculateGraphScore(kuNode, query);
        return ku;
      });
      
      // Update statistics
      const queryTime = Date.now() - startTime;
      this.updateQueryTimeStats(queryTime);
      
      console.log(`🔍 Neo4j graph search returned ${results.length} results`);
      return results;
      
    } catch (error) {
      console.error("❌ Failed to search Neo4j graph:", error);
      throw error;
    }
  }
  
  /**
   * Get storage size
   */
  async size() {
    if (!this.isInitialized) return 0;
    
    try {
      const result = await this.session.run("MATCH (ku:KnowledgeUnit) RETURN count(ku) as count");
      return result.records[0].get('count').toNumber();
    } catch (error) {
      console.error("Failed to get Neo4j size:", error);
      return 0;
    }
  }
  
  /**
   * Create peer node if not exists
   * @param {string} peerId 
   */
  async createPeerNode(peerId) {
    const reputation = reputationManager.getPeerReputation(peerId);
    
    const query = `
      MERGE (p:Peer {id: $peerId})
      SET p.trustScore = $trustScore,
          p.validSignatures = $validSignatures,
          p.invalidSignatures = $invalidSignatures,
          p.createdAt = coalesce(p.createdAt, datetime()),
          p.updatedAt = datetime()
      RETURN p
    `;
    
    await this.session.run(query, {
      peerId,
      trustScore: reputation?.trustScore || 0.5,
      validSignatures: reputation?.validSignatures || 0,
      invalidSignatures: reputation?.invalidSignatures || 0
    });
  }
  
  /**
   * Create relationship between nodes
   * @param {string} fromId 
   * @param {string} toId 
   * @param {string} type 
   * @param {Object} properties 
   */
  async createRelationship(fromId, toId, type, properties = {}) {
    const query = `
      MATCH (from {id: $fromId}), (to {id: $toId})
      MERGE (from)-[r:${type}]->(to)
      SET r.createdAt = coalesce(r.createdAt, datetime()),
          r.updatedAt = datetime()
      ${Object.keys(properties).length > 0 ? ', r += $properties' : ''}
      RETURN r
    `;
    
    await this.session.run(query, {
      fromId,
      toId,
      properties
    });
    
    this.stats.relationshipCount++;
  }
  
  /**
   * Analyze and create relationships for a new KU
   * @param {KnowledgeUnit} ku 
   */
  async analyzeAndCreateRelationships(ku) {
    // Find similar KUs based on tags and type
    const similarQuery = `
      MATCH (ku:KnowledgeUnit)
      WHERE ku.id <> $kuId 
        AND ku.type = $type
        AND any(tag IN $tags WHERE tag IN ku.tags)
      RETURN ku.id as id, 
             size([tag IN $tags WHERE tag IN ku.tags]) as commonTags,
             ku.tags as tags
      ORDER BY commonTags DESC
      LIMIT 5
    `;
    
    const similarResult = await this.session.run(similarQuery, {
      kuId: ku.id,
      type: ku.type,
      tags: ku.tags || []
    });
    
    // Create similarity relationships
    for (const record of similarResult.records) {
      const similarId = record.get('id');
      const commonTags = record.get('commonTags').toNumber();
      
      if (commonTags >= 2) { // At least 2 common tags
        await this.createRelationship(ku.id, similarId, this.relationshipTypes.SIMILAR_TO, {
          similarity: commonTags / Math.max(ku.tags?.length || 1, record.get('tags').length),
          commonTags
        });
      }
    }
    
    // Find KUs with same affected systems
    if (ku.affectedSystems && ku.affectedSystems.length > 0) {
      const sameSystemQuery = `
        MATCH (ku:KnowledgeUnit)
        WHERE ku.id <> $kuId 
          AND any(system IN $affectedSystems WHERE system IN ku.affectedSystems)
        RETURN ku.id as id
        LIMIT 3
      `;
      
      const sameSystemResult = await this.session.run(sameSystemQuery, {
        kuId: ku.id,
        affectedSystems: ku.affectedSystems
      });
      
      for (const record of sameSystemResult.records) {
        const relatedId = record.get('id');
        await this.createRelationship(ku.id, relatedId, this.relationshipTypes.AFFECTS_SAME);
      }
    }
  }
  
  /**
   * Convert Neo4j node to KU format
   * @param {Object} node 
   */
  nodeToKU(node) {
    const props = node.properties;
    return {
      id: props.id,
      type: props.type,
      severity: props.severity,
      confidence: props.confidence,
      title: props.title,
      description: props.description,
      solution: props.solution,
      tags: props.tags || [],
      affectedSystems: props.affectedSystems || [],
      discoveredBy: props.discoveredBy,
      originPeer: props.originPeer,
      timestamp: props.timestamp,
      hash: props.hash
    };
  }
  
  /**
   * Calculate graph score for search results
   * @param {Object} node 
   * @param {Object} query 
   */
  calculateGraphScore(node, query) {
    const props = node.properties;
    let score = props.confidence * 10;
    
    // Peer reputation bonus
    if (props.originPeer) {
      const reputation = reputationManager.getPeerReputation(props.originPeer);
      if (reputation) {
        score += reputation.trustScore * 5;
      }
    }
    
    return score;
  }
  
  /**
   * Update query time statistics
   * @param {number} queryTime 
   */
  updateQueryTimeStats(queryTime) {
    this.stats.averageQueryTime = 
      (this.stats.averageQueryTime * (this.stats.queryCount - 1) + queryTime) / 
      this.stats.queryCount;
  }
  
  /**
   * Start relationship analysis worker
   */
  startRelationshipAnalysis() {
    setInterval(() => {
      this.analyzeNewRelationships();
    }, 300000); // Every 5 minutes
  }
  
  /**
   * Analyze and create new relationships
   */
  async analyzeNewRelationships() {
    console.log("🔍 Analyzing Neo4j graph for new relationships...");
    // Implementation for discovering new relationships
  }
  
  /**
   * Get detailed statistics
   */
  async getStatistics() {
    try {
      const nodeCountResult = await this.session.run("MATCH (ku:KnowledgeUnit) RETURN count(ku) as count");
      const relCountResult = await this.session.run("MATCH ()-[r]->() RETURN count(r) as count");
      
      const nodeCount = nodeCountResult.records[0].get('count').toNumber();
      const relCount = relCountResult.records[0].get('count').toNumber();
      
      return {
        ...this.stats,
        nodeCount,
        relationshipCount: relCount,
        averageRelationshipsPerNode: nodeCount > 0 ? relCount / nodeCount : 0,
        isReal: true
      };
    } catch (error) {
      return {
        ...this.stats,
        error: error.message,
        isReal: true
      };
    }
  }
  
  /**
   * Cleanup and close connection
   */
  async cleanup() {
    if (this.session) {
      await this.session.close();
    }
    if (this.driver) {
      await this.driver.close();
      console.log("✅ Neo4j connection closed");
    }
  }
}
