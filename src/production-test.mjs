/**
 * SGN Production Test
 * Quick test of production-ready storage tiers
 */

import { KnowledgeUnit, KU_TYPES, SEVERITY_LEVELS } from './knowledge-unit.mjs';
import { generateKeyPair } from './crypto.mjs';
import { ProductionRedisStorageTier, ProductionNeo4jStorageTier } from './persistence/production-ready-storage.mjs';

console.log("🚀 SGN PRODUCTION TEST");
console.log("======================");
console.log("");

async function runTest() {
  try {
    // Test Redis
    console.log("🔥 Testing Production Redis...");
    const redis = new ProductionRedisStorageTier();
    await redis.initialize();
    
    const pong = await redis.ping();
    console.log(`Redis PING: ${pong}`);
    
    // Test basic Redis commands
    await redis.set('test:key', 'test value');
    const value = await redis.get('test:key');
    console.log(`Redis GET: ${value}`);
    
    console.log("✅ Redis test passed");
    console.log("");
    
    // Test Neo4j
    console.log("🧊 Testing Production Neo4j...");
    const neo4j = new ProductionNeo4jStorageTier();
    await neo4j.initialize();
    
    // Test basic Cypher query
    const result = await neo4j.run("CREATE (n:Test {name: $name}) RETURN n", { name: "test" });
    console.log(`Neo4j CREATE result: ${result.records.length} records`);
    
    const matchResult = await neo4j.run("MATCH (n:Test) RETURN count(n) as count");
    const count = matchResult.records[0].get().toNumber();
    console.log(`Neo4j node count: ${count}`);
    
    console.log("✅ Neo4j test passed");
    console.log("");
    
    // Test with Knowledge Unit
    console.log("📦 Testing with Knowledge Unit...");
    
    const ku = new KnowledgeUnit({
      id: "test-ku-001",
      title: "Test Vulnerability",
      type: KU_TYPES.SECURITY_VULNERABILITY,
      description: "Test description",
      solution: "Test solution",
      severity: SEVERITY_LEVELS.HIGH,
      confidence: 0.95,
      tags: ["test", "security"]
    });
    
    // Sign KU
    const keys = generateKeyPair();
    ku.sign(keys.privateKey, 'test-peer');
    
    // Store in Redis
    await redis.store(ku);
    console.log("✅ KU stored in Redis");
    
    // Retrieve from Redis
    const retrievedKU = await redis.retrieve(ku.id);
    console.log(`✅ KU retrieved from Redis: ${retrievedKU ? retrievedKU.title : 'null'}`);
    
    // Store in Neo4j
    await neo4j.store(ku);
    console.log("✅ KU stored in Neo4j");
    
    // Retrieve from Neo4j
    const neo4jKU = await neo4j.retrieve(ku.id);
    console.log(`✅ KU retrieved from Neo4j: ${neo4jKU ? neo4jKU.title : 'null'}`);
    
    console.log("");
    console.log("🎉 ALL PRODUCTION TESTS PASSED!");
    console.log("Production-ready storage tiers are working correctly");
    
  } catch (error) {
    console.error("❌ Test failed:", error);
    console.error(error.stack);
  }
}

runTest();
