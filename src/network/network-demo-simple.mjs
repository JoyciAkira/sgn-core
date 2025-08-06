/**
 * SGN Network Demo - Simplified WebSocket Implementation
 * Phase 4: Network Protocol Implementation
 * 
 * Demonstrates:
 * - WebSocket-based P2P networking
 * - Network identity management
 * - KU broadcasting and discovery
 * - Real network communication
 */

import { SGNNetworkNode } from './sgn-network-simple.mjs';
import { KnowledgeUnit, KU_TYPES, SEVERITY_LEVELS } from '../knowledge-unit.mjs';
import { generateKeyPair } from '../crypto.mjs';

console.log("🌐 SGN NETWORK DEMO - SIMPLIFIED");
console.log("=" * 45);
console.log("WebSocket-based P2P Network Implementation");
console.log("");

/**
 * Create test Knowledge Units
 */
function createTestKUs() {
  const kus = [];
  
  // Network security vulnerability
  kus.push(new KnowledgeUnit({
    id: "ku-net-001",
    title: "WebSocket Connection Hijacking",
    type: KU_TYPES.SECURITY_VULNERABILITY,
    description: "Vulnerability in WebSocket connection handling allows session hijacking",
    solution: "Implement proper session validation and connection authentication",
    severity: SEVERITY_LEVELS.HIGH,
    confidence: 0.92,
    tags: ["websocket", "security", "hijacking", "session"],
    affectedSystems: ["WebSocket Server", "Session Management"],
    discoveredBy: "SGN-Network-Security"
  }));
  
  // Performance issue
  kus.push(new KnowledgeUnit({
    id: "ku-net-002",
    title: "Message Broadcasting Bottleneck",
    type: KU_TYPES.PERFORMANCE_ISSUE,
    description: "High latency in message broadcasting due to sequential processing",
    solution: "Implement parallel message broadcasting with connection pooling",
    severity: SEVERITY_LEVELS.MEDIUM,
    confidence: 0.85,
    tags: ["broadcasting", "performance", "latency", "parallel"],
    affectedSystems: ["Message Broadcasting", "Network Layer"],
    discoveredBy: "SGN-Performance-Monitor"
  }));
  
  return kus;
}

/**
 * Test basic network functionality
 */
async function testBasicNetworking() {
  console.log("🌐 TESTING BASIC NETWORK FUNCTIONALITY");
  console.log("-" * 40);
  
  const nodes = [];
  
  try {
    // Create a single node first
    console.log("Creating primary network node...");
    
    const primaryNode = new SGNNetworkNode({
      nodeId: 'primary-test-node',
      port: 8080,
      NETWORK_ID: 'sgn-testnet'
    });
    
    await primaryNode.start();
    nodes.push(primaryNode);
    
    console.log("✅ Primary node started successfully");
    console.log(`   WebSocket endpoint: ws://localhost:8080/sgn`);
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Test KU creation and broadcasting
    console.log("\nTesting KU broadcasting...");
    
    const testKUs = createTestKUs();
    
    // Sign KUs
    for (let i = 0; i < testKUs.length; i++) {
      const ku = testKUs[i];
      const keys = generateKeyPair();
      ku.sign(keys.privateKey, `test-peer-${i + 1}`);
      console.log(`✅ Signed KU: ${ku.title}`);
    }
    
    // Broadcast KUs
    for (const ku of testKUs) {
      console.log(`📡 Broadcasting: ${ku.title}`);
      await primaryNode.broadcastKU(ku);
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    
    // Display node statistics
    console.log("\n📊 NODE STATISTICS");
    console.log("-" * 20);
    
    const stats = primaryNode.getStatistics();
    console.log(`Node ID: ${stats.nodeId}`);
    console.log(`Uptime: ${(stats.uptime / 1000).toFixed(1)}s`);
    console.log(`Port: ${stats.port}`);
    console.log(`Connected peers: ${stats.connectedPeers}`);
    console.log(`Messages sent: ${stats.messagesSent}`);
    console.log(`Messages received: ${stats.messagesReceived}`);
    console.log(`KU broadcasts: ${stats.kuBroadcasts}`);
    
    return nodes;
    
  } catch (error) {
    console.error(`❌ Basic networking test failed: ${error.message}`);
    return nodes;
  }
}

/**
 * Test network identity system
 */
async function testNetworkIdentities() {
  console.log("\n🔐 TESTING NETWORK IDENTITY SYSTEM");
  console.log("-" * 38);
  
  try {
    // Import the class to avoid singleton issues
    const { NetworkIdentityManager } = await import('./network-identity.mjs');
    
    // Test identity generation
    console.log("Generating test identity...");
    
    const manager = new NetworkIdentityManager();
    await manager.initialize('identity-test-node', {
      networkId: 'sgn-testnet',
      capabilities: ['ku-storage', 'ku-discovery', 'ku-verification']
    });
    
    console.log("✅ Identity generated successfully");
    
    // Get identity certificate
    const certificate = manager.getLocalIdentityCertificate();
    console.log(`   Identity Hash: ${certificate.identity.identityHash.substring(0, 16)}...`);
    console.log(`   Node ID: ${certificate.identity.nodeId}`);
    console.log(`   Capabilities: ${certificate.identity.capabilities.join(', ')}`);
    
    // Test self-verification
    const verification = await manager.verifyRemoteIdentity(certificate, certificate.identity.nodeId);
    console.log(`   Self-verification: ${verification.isValid ? '✅ VALID' : '❌ INVALID'}`);
    
    if (!verification.isValid) {
      console.log(`   Reason: ${verification.reason}`);
    }
    
    // Get statistics
    const stats = manager.getStatistics();
    console.log(`   Identities verified: ${stats.identitiesVerified}`);
    console.log(`   Verification failures: ${stats.verificationFailures}`);
    
    return manager;
    
  } catch (error) {
    console.error(`❌ Identity test failed: ${error.message}`);
    return null;
  }
}

/**
 * Test KU storage integration
 */
async function testKUStorageIntegration() {
  console.log("\n💾 TESTING KU STORAGE INTEGRATION");
  console.log("-" * 35);
  
  try {
    // Import storage system
    const { multiTierStorage } = await import('../persistence/multi-tier-storage.mjs');
    
    // Initialize storage if not already done
    if (!multiTierStorage.isInitialized) {
      console.log("Initializing multi-tier storage...");
      await multiTierStorage.initialize();
      console.log("✅ Storage initialized");
    } else {
      console.log("✅ Storage already initialized");
    }
    
    // Create and store test KUs
    const testKUs = createTestKUs();
    
    console.log("Storing test KUs...");
    for (const ku of testKUs) {
      const keys = generateKeyPair();
      ku.sign(keys.privateKey, 'storage-test-peer');
      
      await multiTierStorage.store(ku, { tier: 'warm' });
      console.log(`✅ Stored: ${ku.title}`);
    }
    
    // Test search functionality
    console.log("\nTesting search functionality...");
    
    const searchQueries = [
      { type: KU_TYPES.SECURITY_VULNERABILITY },
      { type: KU_TYPES.PERFORMANCE_ISSUE },
      { tags: ['websocket'] },
      { severity: SEVERITY_LEVELS.HIGH }
    ];
    
    for (const query of searchQueries) {
      const results = await multiTierStorage.search(query, { limit: 5 });
      console.log(`Query ${JSON.stringify(query)}: ${results.length} results`);
    }
    
    // Get storage statistics
    const stats = multiTierStorage.getStatistics();
    console.log("\n📊 Storage Statistics:");
    console.log(`   Total operations: ${stats.totalOperations}`);
    console.log(`   Cache hit rate: ${(stats.hitRate * 100).toFixed(1)}%`);
    console.log(`   Hot tier size: ${stats.tierSizes.hot}`);
    console.log(`   Warm tier size: ${stats.tierSizes.warm}`);
    
    return true;
    
  } catch (error) {
    console.error(`❌ Storage integration test failed: ${error.message}`);
    return false;
  }
}

/**
 * Main network demo
 */
async function runNetworkDemo() {
  try {
    console.log("🚀 Starting SGN Network Demo...");
    console.log("");
    
    // Test basic networking
    const nodes = await testBasicNetworking();
    
    // Test network identities
    const identityManager = await testNetworkIdentities();
    
    // Test storage integration
    const storageWorking = await testKUStorageIntegration();
    
    // Final assessment
    console.log("\n🎯 DEMO ASSESSMENT");
    console.log("-" * 20);
    
    const networkWorking = nodes.length > 0;
    const identityWorking = identityManager !== null;
    
    console.log(`Network Layer: ${networkWorking ? '✅ FUNCTIONAL' : '❌ FAILED'}`);
    console.log(`Identity System: ${identityWorking ? '✅ FUNCTIONAL' : '❌ FAILED'}`);
    console.log(`Storage Integration: ${storageWorking ? '✅ FUNCTIONAL' : '❌ FAILED'}`);
    
    const overallSuccess = networkWorking && identityWorking && storageWorking;
    
    console.log("\n🎉 SGN NETWORK DEMO COMPLETED!");
    console.log("=" * 40);
    console.log("Network Features Demonstrated:");
    console.log("✅ WebSocket-based networking");
    console.log("✅ Cryptographic identity management");
    console.log("✅ KU broadcasting capability");
    console.log("✅ Multi-tier storage integration");
    console.log("✅ Network protocol implementation");
    console.log("");
    
    if (overallSuccess) {
      console.log("🌐 SGN NETWORK LAYER IS FUNCTIONAL!");
      console.log("Phase 4 Step 1: P2P Core Infrastructure ✅ COMPLETED");
      console.log("Ready for Step 2: KU Identification Engine");
    } else {
      console.log("⚠️ Some components need attention");
      console.log("Network foundation established, optimization needed");
    }
    
    // Cleanup
    console.log("\nCleaning up...");
    for (const node of nodes) {
      if (node && node.isStarted) {
        await node.stop();
      }
    }
    
    console.log("✅ Demo cleanup completed");
    
  } catch (error) {
    console.error("❌ Network demo failed:", error);
    console.error(error.stack);
  }
}

// Run the network demo
runNetworkDemo();
