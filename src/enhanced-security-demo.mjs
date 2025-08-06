/**
 * SGN Enhanced Security System Demo
 * Phase 1: Enhanced Security Layer Implementation
 * 
 * Demonstrates:
 * - Enhanced cryptographic signatures
 * - Reputation management system
 * - Trust score calculation
 * - Tamper detection
 * - Advanced KU validation
 */

import { KnowledgeUnit, KU_TYPES, SEVERITY_LEVELS } from './knowledge-unit.mjs';
import { generateKeyPair, calculateTrustScore } from './crypto.mjs';
import { ReputationManager } from './reputation-manager.mjs';

console.log("🔐 SGN ENHANCED SECURITY SYSTEM DEMO");
console.log("=" * 60);
console.log("Phase 1: Enhanced Security Layer Implementation");
console.log("");

// Initialize components
const reputationManager = new ReputationManager();

// Generate key pairs for demo peers
console.log("🔑 Generating Ed25519 key pairs for demo peers...");
const aliceKeys = generateKeyPair();
const bobKeys = generateKeyPair();
const malloryKeys = generateKeyPair(); // Malicious peer

console.log(`✅ Alice Key ID: ${aliceKeys.keyId}`);
console.log(`✅ Bob Key ID: ${bobKeys.keyId}`);
console.log(`⚠️  Mallory Key ID: ${malloryKeys.keyId} (malicious)`);
console.log("");

// Create sample Knowledge Units
console.log("📦 Creating sample Knowledge Units...");

const kuXSS = new KnowledgeUnit({
  id: "ku-demo-xss-001",
  title: "XSS Vulnerability in React Components",
  type: KU_TYPES.SECURITY_VULNERABILITY,
  description: "Cross-site scripting vulnerability in dangerouslySetInnerHTML",
  solution: "Use DOMPurify.sanitize() before rendering HTML content",
  severity: SEVERITY_LEVELS.HIGH,
  confidence: 0.95,
  tags: ["react", "xss", "security", "frontend"],
  affectedSystems: ["React 16+", "Next.js", "Gatsby"]
});

const kuPerformance = new KnowledgeUnit({
  id: "ku-demo-perf-001", 
  title: "Memory Leak in Event Handlers",
  type: KU_TYPES.PERFORMANCE_ISSUE,
  description: "Event listeners not cleaned up in React useEffect",
  solution: "Return cleanup function: () => element.removeEventListener()",
  severity: SEVERITY_LEVELS.MEDIUM,
  confidence: 0.87,
  tags: ["memory", "performance", "cleanup"],
  affectedSystems: ["React", "Vue.js", "Angular"]
});

console.log(`✅ Created KU: ${kuXSS.id} (${kuXSS.type})`);
console.log(`✅ Created KU: ${kuPerformance.id} (${kuPerformance.type})`);
console.log("");

// Demonstrate enhanced signing
console.log("✍️  ENHANCED SIGNATURE DEMONSTRATION");
console.log("-" * 40);

console.log("Alice signs XSS vulnerability KU...");
const aliceSignature = kuXSS.sign(aliceKeys.privateKey, 'alice-peer-001');
console.log(`✅ Signature created: ${aliceSignature.signature.substring(0, 16)}...`);
console.log(`📊 Signature metadata: Algorithm=${aliceSignature.algorithm}, Timestamp=${aliceSignature.timestamp}`);

console.log("\nBob signs performance issue KU...");
const bobSignature = kuPerformance.sign(bobKeys.privateKey, 'bob-peer-001');
console.log(`✅ Signature created: ${bobSignature.signature.substring(0, 16)}...`);
console.log("");

// Demonstrate enhanced verification
console.log("🔍 ENHANCED VERIFICATION DEMONSTRATION");
console.log("-" * 40);

console.log("Verifying Alice's signature...");
const aliceVerification = kuXSS.verify(aliceKeys.publicKey, 'alice-peer-001');
console.log(`✅ Alice's signature valid: ${aliceVerification.isValid || aliceVerification}`);

console.log("Verifying Bob's signature...");
const bobVerification = kuPerformance.verify(bobKeys.publicKey, 'bob-peer-001');
console.log(`✅ Bob's signature valid: ${bobVerification.isValid || bobVerification}`);

// Demonstrate tamper detection
console.log("\n🚨 TAMPER DETECTION DEMONSTRATION");
console.log("-" * 40);

console.log("Mallory attempts to tamper with Alice's KU...");
const originalTitle = kuXSS.title;
kuXSS.title = "HACKED: Fake vulnerability by Mallory";

console.log("Verifying tampered KU...");
const tamperedVerification = kuXSS.verify(aliceKeys.publicKey, 'mallory-peer-001');
console.log(`❌ Tampered signature valid: ${tamperedVerification.isValid || tamperedVerification}`);

// Restore original
kuXSS.title = originalTitle;
kuXSS.calculateHash();
console.log("✅ KU restored to original state");
console.log("");

// Demonstrate reputation system
console.log("📊 REPUTATION SYSTEM DEMONSTRATION");
console.log("-" * 40);

// Simulate Alice's good behavior
console.log("Simulating Alice's good behavior...");
for (let i = 0; i < 10; i++) {
  reputationManager.updatePeerReputation('alice-peer-001', 'valid_signature');
  reputationManager.updatePeerReputation('alice-peer-001', 'verified_ku');
}
reputationManager.updatePeerReputation('alice-peer-001', 'quality_rating', 0.9);

// Simulate Bob's mixed behavior
console.log("Simulating Bob's mixed behavior...");
for (let i = 0; i < 8; i++) {
  reputationManager.updatePeerReputation('bob-peer-001', 'valid_signature');
}
for (let i = 0; i < 2; i++) {
  reputationManager.updatePeerReputation('bob-peer-001', 'invalid_signature');
}

// Simulate Mallory's malicious behavior
console.log("Simulating Mallory's malicious behavior...");
for (let i = 0; i < 15; i++) {
  reputationManager.updatePeerReputation('mallory-peer-001', 'invalid_signature');
}
for (let i = 0; i < 5; i++) {
  reputationManager.updatePeerReputation('mallory-peer-001', 'spam_report');
}

// Display reputation results
console.log("\n📈 REPUTATION RESULTS:");
const aliceRep = reputationManager.getPeerReputation('alice-peer-001');
const bobRep = reputationManager.getPeerReputation('bob-peer-001');
const malloryRep = reputationManager.getPeerReputation('mallory-peer-001');

console.log(`✅ Alice Trust Score: ${aliceRep.trustScore.toFixed(3)} (${reputationManager.isTrusted('alice-peer-001') ? 'TRUSTED' : 'NORMAL'})`);
console.log(`⚠️  Bob Trust Score: ${bobRep.trustScore.toFixed(3)} (${reputationManager.meetsMinimumTrust('bob-peer-001') ? 'ACCEPTABLE' : 'LOW TRUST'})`);
console.log(`❌ Mallory Trust Score: ${malloryRep.trustScore.toFixed(3)} (${reputationManager.isBlacklisted('mallory-peer-001') ? 'BLACKLISTED' : 'NORMAL'})`);

// Display network statistics
console.log("\n📊 NETWORK STATISTICS:");
const stats = reputationManager.getStatistics();
console.log(`Total Peers: ${stats.totalPeers}`);
console.log(`Trusted Peers: ${stats.trustedPeers} (${(stats.trustRate * 100).toFixed(1)}%)`);
console.log(`Blacklisted Peers: ${stats.blacklistedPeers} (${(stats.blacklistRate * 100).toFixed(1)}%)`);
console.log(`Average Trust Score: ${stats.averageTrustScore.toFixed(3)}`);
console.log(`Total Signatures: ${stats.totalSignatures}`);
console.log(`Total Verifications: ${stats.totalVerifications}`);

// Demonstrate security validation
console.log("\n🛡️  SECURITY VALIDATION DEMONSTRATION");
console.log("-" * 40);

console.log("Validating Alice's KU security...");
const aliceValidation = kuXSS.validateSecurity('alice-peer-001');
console.log(`✅ Alice's KU valid: ${aliceValidation.isValid}`);
console.log(`📊 Trust score: ${aliceValidation.trustScore.toFixed(3)}`);

console.log("\nValidating KU from blacklisted peer...");
const malloryValidation = kuPerformance.validateSecurity('mallory-peer-001');
console.log(`❌ Mallory's KU valid: ${malloryValidation.isValid}`);
console.log(`⚠️  Issues: ${malloryValidation.issues.join(', ')}`);

// Demonstrate enhanced hashing
console.log("\n🔐 ENHANCED HASHING DEMONSTRATION");
console.log("-" * 40);

console.log("KU Hash Information:");
console.log(`Short Hash: ${kuXSS.hash}`);
console.log(`Full Hash: ${kuXSS.metadata.fullHash.substring(0, 32)}...`);
console.log(`Hash Algorithm: SHA-256 (BLAKE3 ready)`);

console.log("\n🎯 DEMO COMPLETED SUCCESSFULLY!");
console.log("=" * 60);
console.log("Enhanced Security Layer Features Demonstrated:");
console.log("✅ Enhanced Ed25519 signatures with metadata");
console.log("✅ Comprehensive reputation management");
console.log("✅ Trust score calculation and peer classification");
console.log("✅ Tamper detection and integrity verification");
console.log("✅ Advanced KU security validation");
console.log("✅ Enhanced hashing with BLAKE3 readiness");
console.log("✅ Network statistics and monitoring");
console.log("");
console.log("🚀 Ready for Phase 2: Multi-tier Persistence Layer!");
