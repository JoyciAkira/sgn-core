/**
 * SGN Reputation Manager
 * Phase 1: Enhanced Security Layer
 * 
 * Manages peer reputation, trust scores, and security metrics
 * for the Secure Gossip Network
 */

import { calculateTrustScore, updateReputation, REPUTATION_CONSTANTS } from './crypto.mjs';

export class ReputationManager {
  constructor() {
    this.peerReputations = new Map(); // peerId -> reputation data
    this.blacklistedPeers = new Set();
    this.trustedPeers = new Set();
    this.reputationHistory = new Map(); // peerId -> history array
    
    // Configuration
    this.config = {
      minTrustThreshold: 0.3,
      blacklistThreshold: 0.1,
      trustedThreshold: 0.8,
      maxHistoryEntries: 1000,
      cleanupInterval: 24 * 60 * 60 * 1000, // 24 hours
    };
    
    // Start periodic cleanup
    this.startCleanupTimer();
  }
  
  /**
   * Initialize reputation for a new peer
   * @param {string} peerId - Peer identifier
   * @param {Object} initialData - Initial reputation data
   */
  initializePeer(peerId, initialData = {}) {
    if (this.peerReputations.has(peerId)) {
      return this.peerReputations.get(peerId);
    }
    
    const reputation = {
      peerId,
      trustScore: REPUTATION_CONSTANTS.INITIAL_TRUST_SCORE,
      validSignatures: 0,
      invalidSignatures: 0,
      verifiedKUs: 0,
      spamReports: 0,
      qualityRatings: [],
      firstSeen: new Date().toISOString(),
      lastActivity: new Date().toISOString(),
      ...initialData
    };
    
    this.peerReputations.set(peerId, reputation);
    this.reputationHistory.set(peerId, []);
    
    return reputation;
  }
  
  /**
   * Get peer reputation data
   * @param {string} peerId 
   * @returns {Object|null} Reputation data or null if peer not found
   */
  getPeerReputation(peerId) {
    return this.peerReputations.get(peerId) || null;
  }
  
  /**
   * Update peer reputation based on action
   * @param {string} peerId 
   * @param {string} action 
   * @param {*} actionData 
   * @returns {Object} Updated reputation
   */
  updatePeerReputation(peerId, action, actionData = null) {
    let reputation = this.peerReputations.get(peerId);
    if (!reputation) {
      reputation = this.initializePeer(peerId);
    }
    
    const oldTrustScore = reputation.trustScore;
    const updatedReputation = updateReputation(reputation, action, actionData);
    
    // Store in reputation map
    this.peerReputations.set(peerId, updatedReputation);
    
    // Add to history
    this.addToHistory(peerId, {
      action,
      actionData,
      oldTrustScore,
      newTrustScore: updatedReputation.trustScore,
      timestamp: new Date().toISOString()
    });
    
    // Update peer status based on new trust score
    this.updatePeerStatus(peerId, updatedReputation.trustScore);
    
    return updatedReputation;
  }
  
  /**
   * Add entry to peer reputation history
   * @param {string} peerId 
   * @param {Object} historyEntry 
   */
  addToHistory(peerId, historyEntry) {
    let history = this.reputationHistory.get(peerId) || [];
    history.push(historyEntry);
    
    // Limit history size
    if (history.length > this.config.maxHistoryEntries) {
      history = history.slice(-this.config.maxHistoryEntries);
    }
    
    this.reputationHistory.set(peerId, history);
  }
  
  /**
   * Update peer status based on trust score
   * @param {string} peerId 
   * @param {number} trustScore 
   */
  updatePeerStatus(peerId, trustScore) {
    // Remove from all status sets first
    this.blacklistedPeers.delete(peerId);
    this.trustedPeers.delete(peerId);
    
    // Add to appropriate set
    if (trustScore <= this.config.blacklistThreshold) {
      this.blacklistedPeers.add(peerId);
      console.warn(`🚫 Peer ${peerId} blacklisted (trust: ${trustScore.toFixed(3)})`);
    } else if (trustScore >= this.config.trustedThreshold) {
      this.trustedPeers.add(peerId);
      console.log(`✅ Peer ${peerId} marked as trusted (trust: ${trustScore.toFixed(3)})`);
    }
  }
  
  /**
   * Check if peer is blacklisted
   * @param {string} peerId 
   * @returns {boolean}
   */
  isBlacklisted(peerId) {
    return this.blacklistedPeers.has(peerId);
  }
  
  /**
   * Check if peer is trusted
   * @param {string} peerId 
   * @returns {boolean}
   */
  isTrusted(peerId) {
    return this.trustedPeers.has(peerId);
  }
  
  /**
   * Check if peer meets minimum trust threshold
   * @param {string} peerId 
   * @returns {boolean}
   */
  meetsMinimumTrust(peerId) {
    const reputation = this.peerReputations.get(peerId);
    if (!reputation) return false;
    return reputation.trustScore >= this.config.minTrustThreshold;
  }
  
  /**
   * Get reputation statistics
   * @returns {Object} Statistics summary
   */
  getStatistics() {
    const totalPeers = this.peerReputations.size;
    const blacklistedCount = this.blacklistedPeers.size;
    const trustedCount = this.trustedPeers.size;
    
    let totalTrustScore = 0;
    let totalSignatures = 0;
    let totalVerifications = 0;
    
    for (const reputation of this.peerReputations.values()) {
      totalTrustScore += reputation.trustScore;
      totalSignatures += (reputation.validSignatures || 0) + (reputation.invalidSignatures || 0);
      totalVerifications += reputation.verifiedKUs || 0;
    }
    
    return {
      totalPeers,
      blacklistedPeers: blacklistedCount,
      trustedPeers: trustedCount,
      averageTrustScore: totalPeers > 0 ? totalTrustScore / totalPeers : 0,
      totalSignatures,
      totalVerifications,
      blacklistRate: totalPeers > 0 ? blacklistedCount / totalPeers : 0,
      trustRate: totalPeers > 0 ? trustedCount / totalPeers : 0
    };
  }
  
  /**
   * Get top trusted peers
   * @param {number} limit - Maximum number of peers to return
   * @returns {Array} Array of peer reputation objects
   */
  getTopTrustedPeers(limit = 10) {
    return Array.from(this.peerReputations.values())
      .sort((a, b) => b.trustScore - a.trustScore)
      .slice(0, limit);
  }
  
  /**
   * Clean up old reputation data
   */
  cleanup() {
    const now = Date.now();
    const maxAge = 30 * 24 * 60 * 60 * 1000; // 30 days
    
    for (const [peerId, reputation] of this.peerReputations.entries()) {
      const lastActivity = new Date(reputation.lastActivity).getTime();
      if (now - lastActivity > maxAge) {
        this.peerReputations.delete(peerId);
        this.reputationHistory.delete(peerId);
        this.blacklistedPeers.delete(peerId);
        this.trustedPeers.delete(peerId);
        console.log(`🧹 Cleaned up reputation data for inactive peer: ${peerId}`);
      }
    }
  }
  
  /**
   * Start periodic cleanup timer
   */
  startCleanupTimer() {
    setInterval(() => {
      this.cleanup();
    }, this.config.cleanupInterval);
  }
  
  /**
   * Export reputation data for persistence
   * @returns {Object} Serializable reputation data
   */
  exportData() {
    return {
      peerReputations: Object.fromEntries(this.peerReputations),
      blacklistedPeers: Array.from(this.blacklistedPeers),
      trustedPeers: Array.from(this.trustedPeers),
      reputationHistory: Object.fromEntries(this.reputationHistory),
      timestamp: new Date().toISOString()
    };
  }
  
  /**
   * Import reputation data from persistence
   * @param {Object} data - Reputation data to import
   */
  importData(data) {
    if (data.peerReputations) {
      this.peerReputations = new Map(Object.entries(data.peerReputations));
    }
    if (data.blacklistedPeers) {
      this.blacklistedPeers = new Set(data.blacklistedPeers);
    }
    if (data.trustedPeers) {
      this.trustedPeers = new Set(data.trustedPeers);
    }
    if (data.reputationHistory) {
      this.reputationHistory = new Map(Object.entries(data.reputationHistory));
    }
    
    console.log(`📥 Imported reputation data for ${this.peerReputations.size} peers`);
  }
}

// Singleton instance
export const reputationManager = new ReputationManager();
