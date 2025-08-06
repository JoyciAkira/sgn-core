/**
 * SGN Network Identity Management
 * Phase 4: Network Protocol Implementation
 * 
 * Features:
 * - Permanent cryptographic identities for nodes
 * - Identity verification and revocation
 * - Cross-node identity validation
 * - Integration with reputation system
 */

import { generateKeyPair, signMessage, verifySignature } from '../crypto.mjs';
import { blake3Hash } from '../crypto/blake3-hasher.mjs';
import { reputationManager } from '../reputation-manager.mjs';

// Network Identity Configuration
export const IDENTITY_CONFIG = {
  IDENTITY_VERSION: '1.0.0',
  SIGNATURE_ALGORITHM: 'Ed25519',
  HASH_ALGORITHM: 'BLAKE3',
  
  // Identity lifecycle
  IDENTITY_TTL: 365 * 24 * 60 * 60 * 1000, // 1 year
  RENEWAL_THRESHOLD: 30 * 24 * 60 * 60 * 1000, // 30 days before expiry
  REVOCATION_THRESHOLD: 0.1, // Revoke if trust score < 0.1
  
  // Verification settings
  VERIFICATION_TIMEOUT: 5000, // 5 seconds
  MAX_VERIFICATION_ATTEMPTS: 3,
  VERIFICATION_CACHE_TTL: 60 * 60 * 1000, // 1 hour
  
  // Identity storage
  IDENTITY_STORE_PREFIX: 'sgn:identity:',
  REVOCATION_STORE_PREFIX: 'sgn:revoked:',
  VERIFICATION_STORE_PREFIX: 'sgn:verified:'
};

/**
 * Network Identity Class
 * Represents a cryptographic identity for an SGN node
 */
export class NetworkIdentity {
  constructor(options = {}) {
    this.nodeId = options.nodeId || `sgn-node-${Date.now()}`;
    this.version = IDENTITY_CONFIG.IDENTITY_VERSION;
    this.algorithm = IDENTITY_CONFIG.SIGNATURE_ALGORITHM;
    
    // Cryptographic components
    this.keyPair = null;
    this.publicKey = null;
    this.privateKey = null;
    this.identityHash = null;
    
    // Identity metadata
    this.createdAt = new Date().toISOString();
    this.expiresAt = null;
    this.isRevoked = false;
    this.revokedAt = null;
    this.revokedReason = null;
    
    // Network information
    this.networkId = options.networkId || 'sgn-mainnet';
    this.capabilities = options.capabilities || ['ku-storage', 'ku-discovery', 'ku-verification'];
    
    // Verification status
    this.isVerified = false;
    this.verifiedBy = new Set();
    this.verificationAttempts = 0;
    this.lastVerificationAt = null;
  }
  
  /**
   * Generate new cryptographic identity
   */
  async generate() {
    console.log(`🔑 Generating network identity for node: ${this.nodeId}`);
    
    try {
      // Generate Ed25519 key pair
      this.keyPair = generateKeyPair();
      this.publicKey = this.keyPair.publicKey;
      this.privateKey = this.keyPair.privateKey;
      
      // Calculate expiry
      this.expiresAt = new Date(Date.now() + IDENTITY_CONFIG.IDENTITY_TTL).toISOString();
      
      // Generate identity hash
      this.identityHash = this.calculateIdentityHash();
      
      console.log(`✅ Network identity generated`);
      console.log(`   Node ID: ${this.nodeId}`);
      console.log(`   Key ID: ${this.keyPair.keyId}`);
      console.log(`   Identity Hash: ${this.identityHash}`);
      console.log(`   Expires: ${this.expiresAt}`);
      
      return this;
      
    } catch (error) {
      console.error(`❌ Failed to generate network identity: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Calculate identity hash using BLAKE3
   */
  calculateIdentityHash() {
    const identityData = {
      nodeId: this.nodeId,
      publicKey: this.publicKey,
      createdAt: this.createdAt,
      expiresAt: this.expiresAt,
      networkId: this.networkId,
      capabilities: this.capabilities.sort(),
      version: this.version,
      algorithm: this.algorithm
    };
    
    const identityString = JSON.stringify(identityData, null, 0);
    return blake3Hash(identityString);
  }
  
  /**
   * Sign identity certificate
   */
  signIdentity() {
    if (!this.privateKey) {
      throw new Error('Private key not available for signing');
    }
    
    const identityData = this.getIdentityData();
    const signature = signMessage(JSON.stringify(identityData), this.privateKey, this.nodeId);
    
    return {
      identity: identityData,
      signature: signature,
      signedAt: new Date().toISOString()
    };
  }
  
  /**
   * Verify identity certificate
   */
  static verifyIdentityCertificate(certificate) {
    try {
      const { identity, signature, signedAt } = certificate;
      
      // Verify signature
      const isValidSignature = verifySignature(
        JSON.stringify(identity),
        signature,
        identity.publicKey
      );
      
      if (!isValidSignature.isValid) {
        return {
          isValid: false,
          reason: 'Invalid signature',
          details: isValidSignature
        };
      }
      
      // Check expiry
      const now = new Date();
      const expiresAt = new Date(identity.expiresAt);
      
      if (now > expiresAt) {
        return {
          isValid: false,
          reason: 'Identity expired',
          expiresAt: identity.expiresAt
        };
      }
      
      // Verify identity hash
      const expectedHash = NetworkIdentity.calculateStaticIdentityHash(identity);
      if (expectedHash !== identity.identityHash) {
        return {
          isValid: false,
          reason: 'Identity hash mismatch',
          expected: expectedHash,
          actual: identity.identityHash
        };
      }
      
      return {
        isValid: true,
        identity: identity,
        verifiedAt: new Date().toISOString()
      };
      
    } catch (error) {
      return {
        isValid: false,
        reason: 'Verification error',
        error: error.message
      };
    }
  }
  
  /**
   * Calculate identity hash statically
   */
  static calculateStaticIdentityHash(identityData) {
    const hashData = {
      nodeId: identityData.nodeId,
      publicKey: identityData.publicKey,
      createdAt: identityData.createdAt,
      expiresAt: identityData.expiresAt,
      networkId: identityData.networkId,
      capabilities: identityData.capabilities.sort(),
      version: identityData.version,
      algorithm: identityData.algorithm
    };
    
    const identityString = JSON.stringify(hashData, null, 0);
    return blake3Hash(identityString);
  }
  
  /**
   * Get identity data for sharing
   */
  getIdentityData() {
    return {
      nodeId: this.nodeId,
      publicKey: this.publicKey,
      identityHash: this.identityHash,
      createdAt: this.createdAt,
      expiresAt: this.expiresAt,
      networkId: this.networkId,
      capabilities: this.capabilities,
      version: this.version,
      algorithm: this.algorithm,
      isRevoked: this.isRevoked,
      revokedAt: this.revokedAt,
      revokedReason: this.revokedReason
    };
  }
  
  /**
   * Check if identity needs renewal
   */
  needsRenewal() {
    if (this.isRevoked) return false;
    
    const now = new Date();
    const expiresAt = new Date(this.expiresAt);
    const renewalTime = new Date(expiresAt.getTime() - IDENTITY_CONFIG.RENEWAL_THRESHOLD);
    
    return now > renewalTime;
  }
  
  /**
   * Renew identity (extend expiry)
   */
  async renew() {
    if (this.isRevoked) {
      throw new Error('Cannot renew revoked identity');
    }
    
    console.log(`🔄 Renewing network identity: ${this.nodeId}`);
    
    // Extend expiry
    this.expiresAt = new Date(Date.now() + IDENTITY_CONFIG.IDENTITY_TTL).toISOString();
    
    // Recalculate identity hash
    this.identityHash = this.calculateIdentityHash();
    
    console.log(`✅ Identity renewed until: ${this.expiresAt}`);
    
    return this;
  }
  
  /**
   * Revoke identity
   */
  revoke(reason = 'Manual revocation') {
    console.log(`🚫 Revoking network identity: ${this.nodeId} - ${reason}`);
    
    this.isRevoked = true;
    this.revokedAt = new Date().toISOString();
    this.revokedReason = reason;
    
    // Clear private key for security
    this.privateKey = null;
    
    console.log(`✅ Identity revoked: ${this.nodeId}`);
  }
  
  /**
   * Check if identity should be auto-revoked based on reputation
   */
  shouldAutoRevoke() {
    const reputation = reputationManager.getPeerReputation(this.nodeId);
    
    if (!reputation) return false;
    
    return reputation.trustScore < IDENTITY_CONFIG.REVOCATION_THRESHOLD;
  }
  
  /**
   * Serialize identity for storage
   */
  serialize() {
    return JSON.stringify({
      nodeId: this.nodeId,
      version: this.version,
      algorithm: this.algorithm,
      publicKey: this.publicKey,
      identityHash: this.identityHash,
      createdAt: this.createdAt,
      expiresAt: this.expiresAt,
      networkId: this.networkId,
      capabilities: this.capabilities,
      isRevoked: this.isRevoked,
      revokedAt: this.revokedAt,
      revokedReason: this.revokedReason,
      isVerified: this.isVerified,
      verifiedBy: Array.from(this.verifiedBy),
      verificationAttempts: this.verificationAttempts,
      lastVerificationAt: this.lastVerificationAt
    });
  }
  
  /**
   * Deserialize identity from storage
   */
  static deserialize(data) {
    const parsed = JSON.parse(data);
    const identity = new NetworkIdentity({
      nodeId: parsed.nodeId,
      networkId: parsed.networkId,
      capabilities: parsed.capabilities
    });
    
    // Restore properties
    Object.assign(identity, parsed);
    identity.verifiedBy = new Set(parsed.verifiedBy || []);
    
    return identity;
  }
}

/**
 * Network Identity Manager
 * Manages identities for the local node and tracks remote identities
 */
export class NetworkIdentityManager {
  constructor(options = {}) {
    this.config = { ...IDENTITY_CONFIG, ...options };
    
    // Local identity
    this.localIdentity = null;
    
    // Remote identities cache
    this.remoteIdentities = new Map();
    this.verificationCache = new Map();
    this.revocationList = new Set();
    
    // Performance metrics
    this.metrics = {
      identitiesVerified: 0,
      verificationFailures: 0,
      identitiesRevoked: 0,
      cacheHits: 0,
      cacheMisses: 0
    };
  }
  
  /**
   * Initialize identity manager with local identity
   */
  async initialize(nodeId, options = {}) {
    console.log(`🔐 Initializing Network Identity Manager for: ${nodeId}`);
    
    // Generate local identity
    this.localIdentity = new NetworkIdentity({
      nodeId,
      ...options
    });
    
    await this.localIdentity.generate();
    
    console.log(`✅ Network Identity Manager initialized`);
    return this;
  }
  
  /**
   * Get local identity certificate
   */
  getLocalIdentityCertificate() {
    if (!this.localIdentity) {
      throw new Error('Local identity not initialized');
    }
    
    return this.localIdentity.signIdentity();
  }
  
  /**
   * Verify remote identity certificate
   */
  async verifyRemoteIdentity(certificate, peerId) {
    const cacheKey = `${peerId}-${certificate.identity.identityHash}`;
    
    // Check cache first
    if (this.verificationCache.has(cacheKey)) {
      this.metrics.cacheHits++;
      return this.verificationCache.get(cacheKey);
    }
    
    this.metrics.cacheMisses++;
    
    // Verify certificate
    const verification = NetworkIdentity.verifyIdentityCertificate(certificate);
    
    // Cache result
    this.verificationCache.set(cacheKey, verification);
    
    // Update metrics
    if (verification.isValid) {
      this.metrics.identitiesVerified++;
      
      // Store remote identity
      const identity = NetworkIdentity.deserialize(JSON.stringify(certificate.identity));
      this.remoteIdentities.set(peerId, identity);
      
      // Update reputation for valid identity
      reputationManager.updatePeerReputation(peerId, 'valid_identity');
      
    } else {
      this.metrics.verificationFailures++;
      
      // Update reputation for invalid identity
      reputationManager.updatePeerReputation(peerId, 'invalid_identity');
    }
    
    // Clean cache periodically
    if (this.verificationCache.size > 1000) {
      this.cleanVerificationCache();
    }
    
    return verification;
  }
  
  /**
   * Check if peer identity is revoked
   */
  isIdentityRevoked(peerId) {
    return this.revocationList.has(peerId);
  }
  
  /**
   * Revoke peer identity
   */
  revokeIdentity(peerId, reason) {
    console.log(`🚫 Revoking identity: ${peerId} - ${reason}`);
    
    this.revocationList.add(peerId);
    this.metrics.identitiesRevoked++;
    
    // Remove from remote identities
    this.remoteIdentities.delete(peerId);
    
    // Clear verification cache for this peer
    for (const [key, value] of this.verificationCache.entries()) {
      if (key.startsWith(peerId)) {
        this.verificationCache.delete(key);
      }
    }
    
    // Update reputation
    reputationManager.updatePeerReputation(peerId, 'identity_revoked');
  }
  
  /**
   * Clean verification cache
   */
  cleanVerificationCache() {
    const now = Date.now();
    const ttl = this.config.VERIFICATION_CACHE_TTL;
    
    for (const [key, value] of this.verificationCache.entries()) {
      if (value.verifiedAt && now - new Date(value.verifiedAt).getTime() > ttl) {
        this.verificationCache.delete(key);
      }
    }
  }
  
  /**
   * Get identity manager statistics
   */
  getStatistics() {
    return {
      ...this.metrics,
      localIdentity: this.localIdentity ? {
        nodeId: this.localIdentity.nodeId,
        identityHash: this.localIdentity.identityHash,
        isRevoked: this.localIdentity.isRevoked,
        needsRenewal: this.localIdentity.needsRenewal()
      } : null,
      remoteIdentities: this.remoteIdentities.size,
      verificationCacheSize: this.verificationCache.size,
      revocationListSize: this.revocationList.size
    };
  }
}

// Singleton instance
export const networkIdentityManager = new NetworkIdentityManager();
