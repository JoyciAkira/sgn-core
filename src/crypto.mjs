import crypto from 'crypto';

/**
 * SGN Enhanced Cryptographic Security Module
 * Phase 1: Enhanced Security Layer Implementation
 *
 * Features:
 * - Ed25519 digital signatures
 * - Enhanced hashing (SHA-256 + future BLAKE3 support)
 * - Reputation system integration
 * - Tamper detection
 * - Trust score calculation
 */

// Reputation constants
export const REPUTATION_CONSTANTS = {
  INITIAL_TRUST_SCORE: 0.5,
  MIN_TRUST_SCORE: 0.0,
  MAX_TRUST_SCORE: 1.0,
  TRUST_DECAY_RATE: 0.01, // Daily decay
  VERIFICATION_BONUS: 0.05,
  INVALID_SIGNATURE_PENALTY: -0.1,
  SPAM_PENALTY: -0.2,
  QUALITY_BONUS: 0.03
};

/**
 * Generate Ed25519 key pair with enhanced metadata
 * @returns {Object} { publicKey, privateKey, keyId, timestamp } in PEM format
 */
export function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const keyId = generateKeyId(publicKey);

  return {
    publicKey: publicKey.export({ type: 'spki', format: 'pem' }),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    keyId,
    timestamp: new Date().toISOString(),
    algorithm: 'Ed25519'
  };
}

/**
 * Generate unique key identifier from public key
 * @param {crypto.KeyObject} publicKey
 * @returns {string} Short key identifier
 */
function generateKeyId(publicKey) {
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' });
  const hash = crypto.createHash('sha256').update(publicKeyPem).digest('hex');
  return `key-${hash.substring(0, 12)}`;
}

/**
 * Enhanced message signing with metadata
 * @param {string|Buffer} message
 * @param {string} privateKeyPem
 * @param {Object} metadata - Additional signing metadata
 * @returns {Object} Enhanced signature object
 */
export function signMessage(message, privateKeyPem, metadata = {}) {
  const privateKey = crypto.createPrivateKey({
    key: privateKeyPem,
    format: 'pem',
    type: 'pkcs8'
  });

  const signature = crypto.sign(null, Buffer.from(message), privateKey);

  return {
    signature: signature.toString('hex'),
    algorithm: 'Ed25519',
    timestamp: new Date().toISOString(),
    messageHash: crypto.createHash('sha256').update(message).digest('hex').substring(0, 16),
    ...metadata
  };
}

/**
 * Enhanced signature verification with tamper detection
 * @param {string|Buffer} message
 * @param {string|Object} signatureData - Signature hex string or enhanced signature object
 * @param {string} publicKeyPem
 * @returns {Object} Verification result with details
 */
export function verifySignature(message, signatureData, publicKeyPem) {
  try {
    const publicKey = crypto.createPublicKey({
      key: publicKeyPem,
      format: 'pem',
      type: 'spki'
    });

    // Handle both legacy hex strings and enhanced signature objects
    const signatureHex = typeof signatureData === 'string' ? signatureData : signatureData.signature;

    const isValid = crypto.verify(
      null,
      Buffer.from(message),
      publicKey,
      Buffer.from(signatureHex, 'hex')
    );

    // Enhanced verification result
    const result = {
      isValid,
      timestamp: new Date().toISOString(),
      algorithm: 'Ed25519'
    };

    // Additional checks for enhanced signature objects
    if (typeof signatureData === 'object') {
      const currentMessageHash = crypto.createHash('sha256').update(message).digest('hex').substring(0, 16);
      result.messageIntegrity = signatureData.messageHash === currentMessageHash;
      result.signatureAge = Date.now() - new Date(signatureData.timestamp).getTime();
    }

    return result;

  } catch (error) {
    return {
      isValid: false,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Enhanced hashing function (SHA-256 with future BLAKE3 support)
 * @param {string|Buffer} data
 * @param {string} algorithm - 'sha256' or 'blake3' (when available)
 * @returns {string} Hash in hex format
 */
export function enhancedHash(data, algorithm = 'sha256') {
  switch (algorithm) {
    case 'sha256':
      return crypto.createHash('sha256').update(data).digest('hex');
    case 'blake3':
      // TODO: Implement BLAKE3 when dependency is available
      console.warn('BLAKE3 not available, falling back to SHA-256');
      return crypto.createHash('sha256').update(data).digest('hex');
    default:
      throw new Error(`Unsupported hash algorithm: ${algorithm}`);
  }
}

/**
 * Calculate trust score for a peer based on reputation metrics
 * @param {Object} reputationData - Peer reputation data
 * @returns {number} Trust score between 0.0 and 1.0
 */
export function calculateTrustScore(reputationData) {
  const {
    validSignatures = 0,
    invalidSignatures = 0,
    verifiedKUs = 0,
    spamReports = 0,
    qualityRatings = [],
    daysSinceFirstSeen = 1,
    lastActivity = new Date()
  } = reputationData;

  // Base trust score
  let trustScore = REPUTATION_CONSTANTS.INITIAL_TRUST_SCORE;

  // Signature accuracy bonus/penalty
  const totalSignatures = validSignatures + invalidSignatures;
  if (totalSignatures > 0) {
    const signatureAccuracy = validSignatures / totalSignatures;
    trustScore += (signatureAccuracy - 0.5) * 0.3; // ±0.15 max impact
  }

  // Verification activity bonus
  trustScore += Math.min(verifiedKUs * REPUTATION_CONSTANTS.VERIFICATION_BONUS, 0.2);

  // Spam penalty
  trustScore += spamReports * REPUTATION_CONSTANTS.SPAM_PENALTY;

  // Quality bonus
  if (qualityRatings.length > 0) {
    const avgQuality = qualityRatings.reduce((a, b) => a + b, 0) / qualityRatings.length;
    trustScore += (avgQuality - 0.5) * REPUTATION_CONSTANTS.QUALITY_BONUS * qualityRatings.length;
  }

  // Time-based decay
  const daysSinceActivity = (Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24);
  const decayFactor = Math.max(0, 1 - (daysSinceActivity * REPUTATION_CONSTANTS.TRUST_DECAY_RATE));
  trustScore *= decayFactor;

  // Clamp to valid range
  return Math.max(
    REPUTATION_CONSTANTS.MIN_TRUST_SCORE,
    Math.min(REPUTATION_CONSTANTS.MAX_TRUST_SCORE, trustScore)
  );
}

/**
 * Update peer reputation based on action
 * @param {Object} currentReputation - Current reputation data
 * @param {string} action - Action type: 'valid_signature', 'invalid_signature', 'spam', 'quality_rating'
 * @param {*} actionData - Additional data for the action
 * @returns {Object} Updated reputation data
 */
export function updateReputation(currentReputation, action, actionData = null) {
  const updated = { ...currentReputation };
  updated.lastActivity = new Date().toISOString();

  switch (action) {
    case 'valid_signature':
      updated.validSignatures = (updated.validSignatures || 0) + 1;
      break;

    case 'invalid_signature':
      updated.invalidSignatures = (updated.invalidSignatures || 0) + 1;
      break;

    case 'verified_ku':
      updated.verifiedKUs = (updated.verifiedKUs || 0) + 1;
      break;

    case 'spam_report':
      updated.spamReports = (updated.spamReports || 0) + 1;
      break;

    case 'quality_rating':
      if (typeof actionData === 'number' && actionData >= 0 && actionData <= 1) {
        updated.qualityRatings = updated.qualityRatings || [];
        updated.qualityRatings.push(actionData);
        // Keep only last 50 ratings
        if (updated.qualityRatings.length > 50) {
          updated.qualityRatings = updated.qualityRatings.slice(-50);
        }
      }
      break;

    default:
      console.warn(`Unknown reputation action: ${action}`);
  }

  // Recalculate trust score
  updated.trustScore = calculateTrustScore(updated);

  return updated;
}

/**
 * Detect potential tampering in Knowledge Unit
 * @param {Object} ku - Knowledge Unit object
 * @param {string} expectedHash - Expected hash value
 * @returns {Object} Tamper detection result
 */
export function detectTampering(ku, expectedHash) {
  const result = {
    isTampered: false,
    issues: [],
    timestamp: new Date().toISOString()
  };

  // Recalculate hash and compare
  const currentHash = ku.calculateHash ? ku.calculateHash() : null;
  if (currentHash && currentHash !== expectedHash) {
    result.isTampered = true;
    result.issues.push('Hash mismatch detected');
  }

  // Check for missing required fields
  const requiredFields = ['id', 'type', 'title', 'signature'];
  for (const field of requiredFields) {
    if (!ku[field]) {
      result.isTampered = true;
      result.issues.push(`Missing required field: ${field}`);
    }
  }

  // Check timestamp validity
  if (ku.timestamp) {
    const kuTime = new Date(ku.timestamp);
    const now = new Date();
    if (kuTime > now) {
      result.isTampered = true;
      result.issues.push('Future timestamp detected');
    }
  }

  return result;
}