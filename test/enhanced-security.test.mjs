/**
 * Enhanced Security System Tests
 * Phase 1: Enhanced Security Layer
 * 
 * Tests for:
 * - Enhanced cryptographic functions
 * - Reputation management
 * - Trust score calculation
 * - Tamper detection
 * - Advanced KU validation
 */

import assert from 'assert';
import { KnowledgeUnit, KU_TYPES, SEVERITY_LEVELS } from '../src/knowledge-unit.mjs';
import { 
  generateKeyPair, 
  signMessage, 
  verifySignature, 
  enhancedHash,
  calculateTrustScore,
  updateReputation,
  detectTampering,
  REPUTATION_CONSTANTS
} from '../src/crypto.mjs';
import { ReputationManager } from '../src/reputation-manager.mjs';

describe('Enhanced Security System', () => {
  let keyPair1, keyPair2;
  let ku;
  let reputationManager;

  before(() => {
    // Generate test key pairs
    keyPair1 = generateKeyPair();
    keyPair2 = generateKeyPair();
    
    // Create test KU
    ku = new KnowledgeUnit({
      id: "test-ku-001",
      title: "Test XSS Vulnerability",
      type: KU_TYPES.SECURITY_VULNERABILITY,
      description: "Test vulnerability for security testing",
      solution: "Use proper input sanitization",
      severity: SEVERITY_LEVELS.HIGH,
      confidence: 0.95,
      tags: ["xss", "security", "test"]
    });
    
    // Create reputation manager instance
    reputationManager = new ReputationManager();
  });

  describe('Enhanced Cryptographic Functions', () => {
    it('should generate enhanced key pair with metadata', () => {
      const keyPair = generateKeyPair();
      
      assert.ok(keyPair.publicKey);
      assert.ok(keyPair.privateKey);
      assert.ok(keyPair.keyId);
      assert.ok(keyPair.timestamp);
      assert.strictEqual(keyPair.algorithm, 'Ed25519');
      assert(keyPair.keyId.startsWith('key-'));
    });

    it('should create enhanced signature with metadata', () => {
      const message = "test message";
      const signatureData = signMessage(message, keyPair1.privateKey, {
        testField: "test value"
      });
      
      assert.ok(signatureData.signature);
      assert.strictEqual(signatureData.algorithm, 'Ed25519');
      assert.ok(signatureData.timestamp);
      assert.ok(signatureData.messageHash);
      assert.strictEqual(signatureData.testField, "test value");
    });

    it('should verify enhanced signature with detailed result', () => {
      const message = "test message";
      const signatureData = signMessage(message, keyPair1.privateKey);
      const verificationResult = verifySignature(message, signatureData, keyPair1.publicKey);
      
      assert.strictEqual(verificationResult.isValid, true);
      assert.strictEqual(verificationResult.algorithm, 'Ed25519');
      assert.ok(verificationResult.timestamp);
      assert.strictEqual(verificationResult.messageIntegrity, true);
    });

    it('should detect message tampering', () => {
      const originalMessage = "original message";
      const tamperedMessage = "tampered message";
      const signatureData = signMessage(originalMessage, keyPair1.privateKey);
      const verificationResult = verifySignature(tamperedMessage, signatureData, keyPair1.publicKey);
      
      assert.strictEqual(verificationResult.isValid, false);
      assert.strictEqual(verificationResult.messageIntegrity, false);
    });

    it('should use enhanced hashing', () => {
      const data = "test data";
      const hash1 = enhancedHash(data, 'sha256');
      const hash2 = enhancedHash(data, 'sha256');
      
      assert.strictEqual(hash1, hash2);
      assert.strictEqual(hash1.length, 64); // SHA-256 hex length
    });
  });

  describe('Reputation Management', () => {
    it('should initialize peer with default reputation', () => {
      const peerId = 'test-peer-001';
      const reputation = reputationManager.initializePeer(peerId);
      
      assert.strictEqual(reputation.peerId, peerId);
      assert.strictEqual(reputation.trustScore, REPUTATION_CONSTANTS.INITIAL_TRUST_SCORE);
      assert.strictEqual(reputation.validSignatures, 0);
      assert.strictEqual(reputation.invalidSignatures, 0);
      assert.ok(reputation.firstSeen);
      assert.ok(reputation.lastActivity);
    });

    it('should update reputation for valid signature', () => {
      const peerId = 'test-peer-002';
      const updatedReputation = reputationManager.updatePeerReputation(peerId, 'valid_signature');
      
      assert.strictEqual(updatedReputation.validSignatures, 1);
      assert(updatedReputation.trustScore >= REPUTATION_CONSTANTS.INITIAL_TRUST_SCORE);
    });

    it('should penalize invalid signatures', () => {
      const peerId = 'test-peer-003';
      reputationManager.initializePeer(peerId);
      const updatedReputation = reputationManager.updatePeerReputation(peerId, 'invalid_signature');
      
      assert.strictEqual(updatedReputation.invalidSignatures, 1);
      assert(updatedReputation.trustScore < REPUTATION_CONSTANTS.INITIAL_TRUST_SCORE);
    });

    it('should blacklist peers with low trust scores', () => {
      const peerId = 'test-peer-004';
      reputationManager.initializePeer(peerId);
      
      // Generate multiple invalid signatures to lower trust score
      for (let i = 0; i < 10; i++) {
        reputationManager.updatePeerReputation(peerId, 'invalid_signature');
      }
      
      assert(reputationManager.isBlacklisted(peerId));
      assert(!reputationManager.meetsMinimumTrust(peerId));
    });

    it('should mark peers as trusted with high trust scores', () => {
      const peerId = 'test-peer-005';
      reputationManager.initializePeer(peerId);
      
      // Generate multiple valid signatures and verifications
      for (let i = 0; i < 20; i++) {
        reputationManager.updatePeerReputation(peerId, 'valid_signature');
        reputationManager.updatePeerReputation(peerId, 'verified_ku');
      }
      
      assert(reputationManager.isTrusted(peerId));
      assert(reputationManager.meetsMinimumTrust(peerId));
    });

    it('should calculate trust score correctly', () => {
      const reputationData = {
        validSignatures: 10,
        invalidSignatures: 1,
        verifiedKUs: 5,
        spamReports: 0,
        qualityRatings: [0.8, 0.9, 0.7],
        daysSinceFirstSeen: 30,
        lastActivity: new Date()
      };
      
      const trustScore = calculateTrustScore(reputationData);
      
      assert(trustScore >= 0 && trustScore <= 1);
      assert(trustScore > REPUTATION_CONSTANTS.INITIAL_TRUST_SCORE);
    });

    it('should provide reputation statistics', () => {
      const stats = reputationManager.getStatistics();
      
      assert(typeof stats.totalPeers === 'number');
      assert(typeof stats.blacklistedPeers === 'number');
      assert(typeof stats.trustedPeers === 'number');
      assert(typeof stats.averageTrustScore === 'number');
      assert(stats.averageTrustScore >= 0 && stats.averageTrustScore <= 1);
    });
  });

  describe('Enhanced KU Security', () => {
    it('should sign KU with enhanced signature', () => {
      const peerId = 'test-signer-001';
      const signatureData = ku.sign(keyPair1.privateKey, peerId);
      
      assert.ok(signatureData.signature);
      assert.strictEqual(signatureData.kuId, ku.id);
      assert.strictEqual(signatureData.kuType, ku.type);
      assert.strictEqual(signatureData.peerId, peerId);
    });

    it('should verify KU with enhanced verification', () => {
      const peerId = 'test-verifier-001';
      ku.sign(keyPair1.privateKey, peerId);
      const verificationResult = ku.verify(keyPair1.publicKey, peerId);
      
      // Handle both legacy boolean and enhanced object returns
      if (typeof verificationResult === 'boolean') {
        assert.strictEqual(verificationResult, true);
      } else {
        assert.strictEqual(verificationResult.isValid, true);
        assert.ok(verificationResult.tamperCheck);
        assert.strictEqual(verificationResult.tamperCheck.isTampered, false);
      }
    });

    it('should detect KU tampering', () => {
      ku.sign(keyPair1.privateKey);
      const originalTitle = ku.title;
      
      // Tamper with KU
      ku.title = "Modified Title";
      
      const tamperResult = detectTampering(ku, ku.hash);
      assert.strictEqual(tamperResult.isTampered, true);
      assert(tamperResult.issues.length > 0);
      
      // Restore original
      ku.title = originalTitle;
    });

    it('should validate KU security comprehensively', () => {
      const peerId = 'test-validator-001';
      reputationManager.initializePeer(peerId);
      
      const validationResult = ku.validateSecurity(peerId);
      
      assert.strictEqual(validationResult.isValid, true);
      assert.strictEqual(validationResult.issues.length, 0);
      assert(typeof validationResult.trustScore === 'number');
    });

    it('should use enhanced hashing in KU', () => {
      const originalHash = ku.hash;
      ku.calculateHash();
      
      assert.ok(ku.hash);
      assert.ok(ku.metadata.fullHash);
      assert.strictEqual(ku.metadata.fullHash.length, 64); // SHA-256 full hash
      assert.strictEqual(ku.hash.length, 16); // Short hash for compatibility
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete KU lifecycle with reputation tracking', () => {
      const senderPeerId = 'sender-001';
      const verifierPeerId = 'verifier-001';
      
      // Create and sign KU
      const testKU = new KnowledgeUnit({
        title: "Integration Test KU",
        type: KU_TYPES.SECURITY_VULNERABILITY,
        description: "Test for integration",
        solution: "Test solution",
        severity: SEVERITY_LEVELS.MEDIUM
      });
      
      // Sign KU
      testKU.sign(keyPair1.privateKey, senderPeerId);
      
      // Verify KU
      const verificationResult = testKU.verify(keyPair1.publicKey, verifierPeerId);
      
      // Check reputation updates
      const senderReputation = reputationManager.getPeerReputation(senderPeerId);
      const verifierReputation = reputationManager.getPeerReputation(verifierPeerId);
      
      assert.ok(senderReputation);
      assert.ok(verifierReputation);
      assert(senderReputation.validSignatures > 0);
      assert(verifierReputation.validSignatures > 0);
    });
  });
});

console.log('🧪 Enhanced Security Tests Ready');
console.log('Run with: node tests/enhanced-security.test.mjs');
