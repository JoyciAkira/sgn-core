/**
 * Simple Test Runner for SGN Enhanced Security
 * Tests core functionality without external dependencies
 */

import { KnowledgeUnit, KU_TYPES, SEVERITY_LEVELS } from '../src/knowledge-unit.mjs';
import { generateKeyPair, signMessage, verifySignature, calculateTrustScore } from '../src/crypto.mjs';
import { ReputationManager } from '../src/reputation-manager.mjs';

console.log("🧪 SGN ENHANCED SECURITY - SIMPLE TEST RUNNER");
console.log("=" * 60);

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`✅ PASS: ${message}`);
    testsPassed++;
  } else {
    console.log(`❌ FAIL: ${message}`);
    testsFailed++;
  }
}

function assertEqual(actual, expected, message) {
  if (actual === expected) {
    console.log(`✅ PASS: ${message}`);
    testsPassed++;
  } else {
    console.log(`❌ FAIL: ${message} (expected: ${expected}, got: ${actual})`);
    testsFailed++;
  }
}

// Test 1: Enhanced Key Generation
console.log("\n🔑 Test 1: Enhanced Key Generation");
console.log("-" * 40);

const keyPair = generateKeyPair();
assert(keyPair.publicKey && keyPair.publicKey.includes('-----BEGIN PUBLIC KEY-----'), 'Public key generated');
assert(keyPair.privateKey && keyPair.privateKey.includes('-----BEGIN PRIVATE KEY-----'), 'Private key generated');
assert(keyPair.keyId && keyPair.keyId.startsWith('key-'), 'Key ID generated');
assert(keyPair.algorithm === 'Ed25519', 'Algorithm is Ed25519');
assert(keyPair.timestamp, 'Timestamp present');

// Test 2: Enhanced Signature Creation
console.log("\n✍️ Test 2: Enhanced Signature Creation");
console.log("-" * 40);

const message = "test message for signing";
const signatureData = signMessage(message, keyPair.privateKey, { testField: "test value" });
assert(signatureData.signature, 'Signature created');
assert(signatureData.algorithm === 'Ed25519', 'Signature algorithm correct');
assert(signatureData.timestamp, 'Signature timestamp present');
assert(signatureData.messageHash, 'Message hash present');
assert(signatureData.testField === "test value", 'Custom metadata preserved');

// Test 3: Enhanced Signature Verification
console.log("\n🔍 Test 3: Enhanced Signature Verification");
console.log("-" * 40);

const verificationResult = verifySignature(message, signatureData, keyPair.publicKey);
assert(verificationResult.isValid === true, 'Signature verification successful');
assert(verificationResult.algorithm === 'Ed25519', 'Verification algorithm correct');
assert(verificationResult.messageIntegrity === true, 'Message integrity verified');

// Test 4: Tamper Detection
console.log("\n🚨 Test 4: Tamper Detection");
console.log("-" * 40);

const tamperedMessage = "tampered message";
const tamperedVerification = verifySignature(tamperedMessage, signatureData, keyPair.publicKey);
assert(tamperedVerification.isValid === false, 'Tampered message detected');
assert(tamperedVerification.messageIntegrity === false, 'Message integrity check failed');

// Test 5: Knowledge Unit Enhanced Features
console.log("\n📦 Test 5: Knowledge Unit Enhanced Features");
console.log("-" * 40);

const ku = new KnowledgeUnit({
  id: "test-ku-001",
  title: "Test Security Vulnerability",
  type: KU_TYPES.SECURITY_VULNERABILITY,
  description: "Test vulnerability for testing",
  solution: "Test solution",
  severity: SEVERITY_LEVELS.HIGH,
  confidence: 0.95,
  tags: ["test", "security"]
});

assert(ku.id === "test-ku-001", 'KU ID set correctly');
assert(ku.type === KU_TYPES.SECURITY_VULNERABILITY, 'KU type set correctly');
assert(ku.hash, 'KU hash calculated');
assert(ku.metadata.fullHash, 'KU full hash stored');

// Test 6: Enhanced KU Signing
console.log("\n✍️ Test 6: Enhanced KU Signing");
console.log("-" * 40);

const peerId = 'test-peer-001';
const kuSignatureData = ku.sign(keyPair.privateKey, peerId);
assert(kuSignatureData.signature, 'KU signature created');
assert(kuSignatureData.kuId === ku.id, 'KU ID in signature metadata');
assert(kuSignatureData.peerId === peerId, 'Peer ID in signature metadata');

// Test 7: Enhanced KU Verification
console.log("\n🔍 Test 7: Enhanced KU Verification");
console.log("-" * 40);

const kuVerificationResult = ku.verify(keyPair.publicKey, peerId);
// Handle both legacy boolean and enhanced object returns
const isValid = typeof kuVerificationResult === 'boolean' ? kuVerificationResult : kuVerificationResult.isValid;
assert(isValid === true, 'KU signature verification successful');

// Test 8: Reputation System
console.log("\n📊 Test 8: Reputation System");
console.log("-" * 40);

const reputationManager = new ReputationManager();
const testPeerId = 'test-reputation-peer';

// Initialize peer
const initialReputation = reputationManager.initializePeer(testPeerId);
assert(initialReputation.peerId === testPeerId, 'Peer initialized correctly');
assert(initialReputation.trustScore === 0.5, 'Initial trust score correct');

// Update reputation
const updatedReputation = reputationManager.updatePeerReputation(testPeerId, 'valid_signature');
assert(updatedReputation.validSignatures === 1, 'Valid signature count updated');
assert(updatedReputation.trustScore >= 0.5, 'Trust score improved');

// Test blacklisting
for (let i = 0; i < 10; i++) {
  reputationManager.updatePeerReputation(testPeerId, 'invalid_signature');
}
assert(reputationManager.isBlacklisted(testPeerId), 'Peer blacklisted after invalid signatures');

// Test 9: Trust Score Calculation
console.log("\n🎯 Test 9: Trust Score Calculation");
console.log("-" * 40);

const reputationData = {
  validSignatures: 10,
  invalidSignatures: 1,
  verifiedKUs: 5,
  spamReports: 0,
  qualityRatings: [0.8, 0.9],
  daysSinceFirstSeen: 30,
  lastActivity: new Date()
};

const trustScore = calculateTrustScore(reputationData);
assert(trustScore >= 0 && trustScore <= 1, 'Trust score in valid range');
assert(trustScore > 0.5, 'Trust score reflects good behavior');

// Test 10: KU Security Validation
console.log("\n🛡️ Test 10: KU Security Validation");
console.log("-" * 40);

const validationResult = ku.validateSecurity(peerId);
assert(validationResult.isValid === true, 'KU security validation passed');
assert(typeof validationResult.trustScore === 'number', 'Trust score included in validation');

// Test Results Summary
console.log("\n" + "=" * 60);
console.log("🎯 TEST RESULTS SUMMARY");
console.log("=" * 60);
console.log(`✅ Tests Passed: ${testsPassed}`);
console.log(`❌ Tests Failed: ${testsFailed}`);
console.log(`📊 Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);

if (testsFailed === 0) {
  console.log("\n🎉 ALL TESTS PASSED! SGN Enhanced Security is working perfectly!");
  console.log("✅ Ready for Phase 2: Multi-tier Persistence Layer");
} else {
  console.log(`\n⚠️  ${testsFailed} test(s) failed. Please review the issues above.`);
}

console.log("\n🚀 SGN Enhanced Security Test Suite Complete!");
