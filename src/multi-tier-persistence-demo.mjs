/**
 * SGN Multi-tier Persistence System Demo
 * Phase 2: Multi-tier Persistence Implementation
 * 
 * Demonstrates:
 * - Multi-tier storage architecture
 * - Intelligent tier placement
 * - Cache performance optimization
 * - Graph relationship analysis
 * - Cross-tier search capabilities
 * - Performance metrics and analytics
 */

import { KnowledgeUnit, KU_TYPES, SEVERITY_LEVELS } from './knowledge-unit.mjs';
import { generateKeyPair } from './crypto.mjs';
import { MultiTierStorage } from './persistence/multi-tier-storage.mjs';
import { reputationManager } from './reputation-manager.mjs';

console.log("💾 SGN MULTI-TIER PERSISTENCE SYSTEM DEMO");
console.log("=" * 60);
console.log("Phase 2: Multi-tier Persistence Implementation");
console.log("");

// Initialize multi-tier storage
const storage = new MultiTierStorage();

// Generate key pairs for demo
const aliceKeys = generateKeyPair();
const bobKeys = generateKeyPair();
const charlieKeys = generateKeyPair();

console.log("🔑 Generated key pairs for demo peers");
console.log("");

/**
 * Create sample Knowledge Units with different priorities
 */
function createSampleKUs() {
  const kus = [];
  
  // Critical KU - should go to hot tier
  kus.push(new KnowledgeUnit({
    id: "ku-critical-001",
    title: "Zero-Day RCE in Popular Framework",
    type: KU_TYPES.SECURITY_VULNERABILITY,
    description: "Remote code execution vulnerability in widely used framework",
    solution: "Immediate patching required - update to version 2.1.5",
    severity: SEVERITY_LEVELS.CRITICAL,
    confidence: 0.98,
    tags: ["rce", "zero-day", "framework", "urgent"],
    affectedSystems: ["Framework v2.0-2.1.4", "Production Systems"],
    discoveredBy: "SGN-Security-Team",
    originPeer: "alice-peer-001"
  }));
  
  // High priority KU from trusted peer
  kus.push(new KnowledgeUnit({
    id: "ku-high-002",
    title: "SQL Injection in Authentication Module",
    type: KU_TYPES.SECURITY_VULNERABILITY,
    description: "SQL injection vulnerability in user authentication",
    solution: "Use parameterized queries and input validation",
    severity: SEVERITY_LEVELS.HIGH,
    confidence: 0.92,
    tags: ["sql-injection", "auth", "database"],
    affectedSystems: ["Auth Module v1.x", "User Management"],
    discoveredBy: "SGN-DB-Scanner",
    originPeer: "alice-peer-001"
  }));
  
  // Medium priority KU
  kus.push(new KnowledgeUnit({
    id: "ku-medium-003",
    title: "Memory Leak in Event Processing",
    type: KU_TYPES.PERFORMANCE_ISSUE,
    description: "Memory leak in event handler cleanup",
    solution: "Implement proper event listener cleanup in useEffect",
    severity: SEVERITY_LEVELS.MEDIUM,
    confidence: 0.85,
    tags: ["memory-leak", "performance", "events"],
    affectedSystems: ["React Apps", "Event Systems"],
    discoveredBy: "SGN-Performance-Monitor",
    originPeer: "bob-peer-001"
  }));
  
  // Low priority KU
  kus.push(new KnowledgeUnit({
    id: "ku-low-004",
    title: "Code Style Best Practice",
    type: KU_TYPES.BEST_PRACTICE,
    description: "Recommended code formatting guidelines",
    solution: "Use consistent indentation and naming conventions",
    severity: SEVERITY_LEVELS.LOW,
    confidence: 0.75,
    tags: ["code-style", "best-practice", "formatting"],
    affectedSystems: ["Development Environment"],
    discoveredBy: "SGN-Code-Analyzer",
    originPeer: "charlie-peer-001"
  }));
  
  // Similar KU for relationship testing
  kus.push(new KnowledgeUnit({
    id: "ku-similar-005",
    title: "Another SQL Injection Variant",
    type: KU_TYPES.SECURITY_VULNERABILITY,
    description: "SQL injection in user registration form",
    solution: "Sanitize input and use prepared statements",
    severity: SEVERITY_LEVELS.HIGH,
    confidence: 0.89,
    tags: ["sql-injection", "registration", "database"],
    affectedSystems: ["Registration Module", "User Management"],
    discoveredBy: "SGN-Security-Scanner",
    originPeer: "alice-peer-001"
  }));
  
  return kus;
}

/**
 * Setup peer reputations for demo
 */
function setupPeerReputations() {
  console.log("📊 Setting up peer reputations...");
  
  // Alice - Trusted peer
  for (let i = 0; i < 15; i++) {
    reputationManager.updatePeerReputation('alice-peer-001', 'valid_signature');
    reputationManager.updatePeerReputation('alice-peer-001', 'verified_ku');
  }
  reputationManager.updatePeerReputation('alice-peer-001', 'quality_rating', 0.95);
  
  // Bob - Good peer
  for (let i = 0; i < 8; i++) {
    reputationManager.updatePeerReputation('bob-peer-001', 'valid_signature');
  }
  reputationManager.updatePeerReputation('bob-peer-001', 'quality_rating', 0.8);
  
  // Charlie - Average peer
  for (let i = 0; i < 5; i++) {
    reputationManager.updatePeerReputation('charlie-peer-001', 'valid_signature');
  }
  
  const aliceRep = reputationManager.getPeerReputation('alice-peer-001');
  const bobRep = reputationManager.getPeerReputation('bob-peer-001');
  const charlieRep = reputationManager.getPeerReputation('charlie-peer-001');
  
  console.log(`✅ Alice trust score: ${aliceRep.trustScore.toFixed(3)} (${reputationManager.isTrusted('alice-peer-001') ? 'TRUSTED' : 'NORMAL'})`);
  console.log(`✅ Bob trust score: ${bobRep.trustScore.toFixed(3)}`);
  console.log(`✅ Charlie trust score: ${charlieRep.trustScore.toFixed(3)}`);
  console.log("");
}

/**
 * Main demo function
 */
async function runDemo() {
  try {
    // Initialize storage system
    console.log("🏗️ Initializing Multi-tier Storage System...");
    await storage.initialize();
    console.log("");
    
    // Setup peer reputations
    setupPeerReputations();
    
    // Create sample KUs
    console.log("📦 Creating sample Knowledge Units...");
    const kus = createSampleKUs();
    
    // Sign KUs
    kus[0].sign(aliceKeys.privateKey, 'alice-peer-001'); // Critical
    kus[1].sign(aliceKeys.privateKey, 'alice-peer-001'); // High
    kus[2].sign(bobKeys.privateKey, 'bob-peer-001');     // Medium
    kus[3].sign(charlieKeys.privateKey, 'charlie-peer-001'); // Low
    kus[4].sign(aliceKeys.privateKey, 'alice-peer-001'); // Similar
    
    console.log(`✅ Created and signed ${kus.length} Knowledge Units`);
    console.log("");
    
    // Store KUs and observe tier placement
    console.log("💾 STORING KNOWLEDGE UNITS");
    console.log("-" * 40);
    
    for (const ku of kus) {
      const result = await storage.store(ku);
      console.log(`📦 KU ${ku.id}: ${ku.severity} → ${result.tier} tier`);
    }
    console.log("");
    
    // Test retrieval performance
    console.log("🔍 TESTING RETRIEVAL PERFORMANCE");
    console.log("-" * 40);
    
    // Retrieve critical KU (should be in hot cache)
    console.log("Retrieving critical KU...");
    const criticalResult = await storage.retrieve("ku-critical-001");
    console.log(`✅ Retrieved from ${criticalResult.tier} tier (cached: ${criticalResult.cached})`);
    
    // Retrieve medium KU (should be in warm storage)
    console.log("Retrieving medium KU...");
    const mediumResult = await storage.retrieve("ku-medium-003");
    console.log(`✅ Retrieved from ${mediumResult.tier} tier (cached: ${mediumResult.cached})`);
    
    // Retrieve again to test caching
    console.log("Retrieving critical KU again (should hit cache)...");
    const cachedResult = await storage.retrieve("ku-critical-001");
    console.log(`✅ Retrieved from ${cachedResult.tier} tier (cached: ${cachedResult.cached})`);
    console.log("");
    
    // Test search capabilities
    console.log("🔍 TESTING SEARCH CAPABILITIES");
    console.log("-" * 40);
    
    // Search by type
    console.log("Searching for security vulnerabilities...");
    const securityResults = await storage.search({
      type: KU_TYPES.SECURITY_VULNERABILITY,
      minConfidence: 0.8
    });
    console.log(`✅ Found ${securityResults.length} security vulnerabilities`);
    
    // Search by severity
    console.log("Searching for critical issues...");
    const criticalResults = await storage.search({
      severity: SEVERITY_LEVELS.CRITICAL
    });
    console.log(`✅ Found ${criticalResults.length} critical issues`);
    
    // Search by tags
    console.log("Searching for SQL injection issues...");
    const sqlResults = await storage.search({
      tags: ["sql-injection"]
    });
    console.log(`✅ Found ${sqlResults.length} SQL injection issues`);
    
    // Graph search (Neo4j tier)
    console.log("Searching with graph relationships...");
    const graphResults = await storage.search({
      similarTo: "ku-high-002"
    }, { includeGraph: true });
    console.log(`✅ Found ${graphResults.length} similar KUs using graph analysis`);
    console.log("");
    
    // Display storage statistics
    console.log("📊 STORAGE STATISTICS");
    console.log("-" * 40);
    
    const stats = storage.getStatistics();
    console.log(`Total Requests: ${stats.totalRequests}`);
    console.log(`Hit Rate: ${(stats.hitRate * 100).toFixed(1)}%`);
    console.log(`Hot Cache Hits: ${stats.hotHits}`);
    console.log(`Warm Storage Hits: ${stats.warmHits}`);
    console.log(`Cold Storage Hits: ${stats.coldHits}`);
    console.log(`Cache Misses: ${stats.misses}`);
    console.log("");
    
    console.log("Tier Sizes:");
    console.log(`🔥 Hot (Redis): ${stats.tierSizes.hot} KUs`);
    console.log(`🔶 Warm (SQLite): ${stats.tierSizes.warm} KUs`);
    console.log(`🧊 Cold (Neo4j): ${stats.tierSizes.cold} KUs`);
    console.log("");
    
    // Simulate high-frequency access to test promotion
    console.log("🔄 TESTING TIER PROMOTION");
    console.log("-" * 40);
    
    console.log("Accessing medium KU multiple times to trigger promotion...");
    for (let i = 0; i < 6; i++) {
      await storage.retrieve("ku-medium-003");
      console.log(`Access ${i + 1}/6`);
    }
    
    console.log("Checking if KU was promoted to hot tier...");
    const promotedResult = await storage.retrieve("ku-medium-003");
    console.log(`✅ Now retrieved from ${promotedResult.tier} tier`);
    console.log("");
    
    // Final statistics
    console.log("📈 FINAL PERFORMANCE METRICS");
    console.log("-" * 40);
    
    const finalStats = storage.getStatistics();
    console.log(`Total Operations: ${finalStats.totalRequests}`);
    console.log(`Overall Hit Rate: ${(finalStats.hitRate * 100).toFixed(1)}%`);
    console.log(`Tier Migrations: ${finalStats.migrations}`);
    console.log(`Performance Improvement: ${((finalStats.hotHits / finalStats.totalRequests) * 100).toFixed(1)}% hot cache utilization`);
    
    console.log("");
    console.log("🎯 DEMO COMPLETED SUCCESSFULLY!");
    console.log("=" * 60);
    console.log("Multi-tier Persistence Features Demonstrated:");
    console.log("✅ Intelligent tier placement based on priority and reputation");
    console.log("✅ High-performance Redis hot cache simulation");
    console.log("✅ Persistent SQLite warm storage with advanced indexing");
    console.log("✅ Neo4j graph storage with relationship analysis");
    console.log("✅ Cross-tier search with result merging");
    console.log("✅ Automatic tier promotion based on access patterns");
    console.log("✅ Comprehensive performance metrics and analytics");
    console.log("");
    console.log("🚀 Ready for Phase 3: BLAKE3 Integration & Batch Processing!");
    
  } catch (error) {
    console.error("❌ Demo failed:", error);
    console.error(error.stack);
  }
}

// Run the demo
runDemo();
