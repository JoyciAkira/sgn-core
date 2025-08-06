import crypto from 'crypto'

// Enhanced Knowledge Unit Schema - Phase 1.2 Implementation
// Standardized structure for production-ready SGN

/**
 * Knowledge Unit Types
 */
export const KU_TYPES = {
  SECURITY_VULNERABILITY: 'security-vulnerability',
  PERFORMANCE_ISSUE: 'performance-issue',
  BEST_PRACTICE: 'best-practice',
  THREAT_INTEL: 'threat-intel',
  CONFIGURATION_ISSUE: 'configuration-issue',
  CODE_SMELL: 'code-smell',
  DEPENDENCY_ISSUE: 'dependency-issue'
}

/**
 * Severity Levels
 */
export const SEVERITY_LEVELS = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  INFO: 'INFO'
}

/**
 * Knowledge Unit Status
 */
export const KU_STATUS = {
  ACTIVE: 'active',
  DEPRECATED: 'deprecated',
  SUPERSEDED: 'superseded',
  UNDER_REVIEW: 'under-review'
}

/**
 * Enhanced Knowledge Unit Class
 */
import * as db from './db/db.mjs';
import { signMessage, verifySignature } from './crypto.mjs';

export class KnowledgeUnit {
  constructor(data = {}) {
    // Core Identity
    this.id = data.id || this.generateId()
    this.version = data.version || '1.2'
    this.hash = '' // Will be calculated
    this.status = data.status || KU_STATUS.ACTIVE
    
    // Signature properties
    this.signature = data.signature || null
    this.signatureAlgorithm = data.signatureAlgorithm || 'Ed25519'
    
    // Classification
    this.type = data.type || KU_TYPES.SECURITY_VULNERABILITY
    this.severity = data.severity || SEVERITY_LEVELS.MEDIUM
    this.confidence = this.validateConfidence(data.confidence || 0.8)
    this.priority = this.calculatePriority()
    
    // Content
    this.title = data.title || 'Untitled Knowledge Unit'
    this.description = data.description || ''
    this.solution = data.solution || ''
    this.references = Array.isArray(data.references) ? data.references : []
    this.examples = Array.isArray(data.examples) ? data.examples : []
    
    // Context
    this.affectedSystems = Array.isArray(data.affectedSystems) ? data.affectedSystems : []
    this.tags = Array.isArray(data.tags) ? data.tags : []
    this.categories = Array.isArray(data.categories) ? data.categories : []
    this.languages = Array.isArray(data.languages) ? data.languages : []
    this.frameworks = Array.isArray(data.frameworks) ? data.frameworks : []
    
    // External References
    this.cveIds = Array.isArray(data.cveIds) ? data.cveIds : []
    this.cweIds = Array.isArray(data.cweIds) ? data.cweIds : []
    this.osvIds = Array.isArray(data.osvIds) ? data.osvIds : [] // Open Source Vulnerability
    this.ghsaIds = Array.isArray(data.ghsaIds) ? data.ghsaIds : [] // GitHub Security Advisory
    
    // Provenance & Lifecycle
    this.discoveredBy = data.discoveredBy || 'SGN-Scanner'
    this.verifiedBy = Array.isArray(data.verifiedBy) ? data.verifiedBy : []
    this.reviewedBy = Array.isArray(data.reviewedBy) ? data.reviewedBy : []
    this.timestamp = data.timestamp || new Date().toISOString()
    this.lastModified = data.lastModified || this.timestamp
    this.expiresAt = data.expiresAt || null
    this.supersededBy = data.supersededBy || null
    
    // Quality Metrics
    this.accuracy = this.validateConfidence(data.accuracy || 0.8)
    this.completeness = this.validateConfidence(data.completeness || 0.7)
    this.relevance = this.validateConfidence(data.relevance || 0.8)
    this.impact = this.calculateImpact()
    
    // Network & Security
    this.signature = data.signature || null
    this.signatureAlgorithm = data.signatureAlgorithm || 'Ed25519'
    this.propagationPath = Array.isArray(data.propagationPath) ? data.propagationPath : []
    this.originPeer = data.originPeer || null
    this.networkVersion = data.networkVersion || '1.2'
    
    // Metadata
    this.metadata = {
      schemaVersion: '1.2',
      createdAt: this.timestamp,
      updatedAt: this.lastModified,
      size: 0, // Will be calculated
      checksum: '', // Will be calculated
      ...data.metadata
    }
    
    // Calculate derived fields
    this.calculateHash()
    this.calculateSize()
    this.calculateChecksum()
  }
  
  /**
   * Save the KnowledgeUnit to the database
   */
  save() {
    try {
      // Convert to database-compatible format
      const dbObj = {
        id: this.id,
        version: this.version,
        hash: this.hash,
        type: this.type,
        severity: this.severity,
        confidence: this.confidence,
        title: this.title,
        description: this.description,
        solution: this.solution,
        references: this.references,
        tags: this.tags,
        discovered_by: this.discoveredBy,
        timestamp: this.timestamp,
        expires_at: this.expiresAt,
        signature: this.signature,
        reputation_score: this.metadata.reputationScore || 0.5
      };
      
      // Check if this KU exists in the database
      const existing = db.getKUById(this.id);
      if (existing) {
        db.updateKU(dbObj);
      } else {
        db.insertKU(dbObj);
      }
      
      return true;
    } catch (error) {
      console.error(`Error saving KnowledgeUnit ${this.id}:`, error);
      return false;
    }
  }
  
  /**
   * Load a KnowledgeUnit from the database by ID
   */
  static load(id) {
    try {
      const dbObj = db.getKUById(id);
      if (!dbObj) return null;
      
      // Convert from database format to KnowledgeUnit properties
      return new KnowledgeUnit({
        id: dbObj.id,
        version: dbObj.version,
        hash: dbObj.hash,
        type: dbObj.type,
        severity: dbObj.severity,
        confidence: dbObj.confidence,
        title: dbObj.title,
        description: dbObj.description,
        solution: dbObj.solution,
        references: dbObj.references,
        tags: dbObj.tags,
        discoveredBy: dbObj.discovered_by,
        timestamp: dbObj.timestamp,
        expiresAt: dbObj.expires_at,
        signature: dbObj.signature,
        reputationScore: dbObj.reputation_score
      });
    } catch (error) {
      console.error(`Error loading KnowledgeUnit ${id}:`, error);
      return null;
    }
  }
  
  /**
   * Generate unique KU ID
   */
  generateId() {
    const timestamp = Date.now()
    const random = Math.random().toString(36).substring(2, 8)
    return `ku-${timestamp}-${random}`
  }
  
  /**
   * Validate confidence score (0.0 - 1.0)
   */
  validateConfidence(value) {
    const num = parseFloat(value)
    if (isNaN(num) || num < 0 || num > 1) {
      return 0.5 // Default fallback
    }
    return Math.round(num * 100) / 100 // Round to 2 decimals
  }
  
  /**
   * Calculate priority based on severity and confidence
   */
  calculatePriority() {
    const severityWeights = {
      [SEVERITY_LEVELS.CRITICAL]: 10,
      [SEVERITY_LEVELS.HIGH]: 8,
      [SEVERITY_LEVELS.MEDIUM]: 5,
      [SEVERITY_LEVELS.LOW]: 3,
      [SEVERITY_LEVELS.INFO]: 1
    }
    
    const severityWeight = severityWeights[this.severity] || 5
    const priority = Math.round(severityWeight * this.confidence * 10) / 10
    
    return Math.min(priority, 10) // Cap at 10
  }
  
  /**
   * Calculate impact score
   */
  calculateImpact() {
    let impact = 0
    
    // Base impact from severity
    const severityImpact = {
      [SEVERITY_LEVELS.CRITICAL]: 1.0,
      [SEVERITY_LEVELS.HIGH]: 0.8,
      [SEVERITY_LEVELS.MEDIUM]: 0.5,
      [SEVERITY_LEVELS.LOW]: 0.3,
      [SEVERITY_LEVELS.INFO]: 0.1
    }
    
    impact = severityImpact[this.severity] || 0.5
    
    // Adjust based on affected systems count
    if (this.affectedSystems.length > 5) impact += 0.2
    else if (this.affectedSystems.length > 2) impact += 0.1
    
    // Adjust based on confidence
    impact *= this.confidence
    
    return Math.min(Math.round(impact * 100) / 100, 1.0)
  }
  
  /**
   * Calculate content hash using SHA-256
   */
  calculateHash() {
    const contentForHash = {
      id: this.id,
      type: this.type,
      severity: this.severity,
      title: this.title,
      description: this.description,
      solution: this.solution,
      affectedSystems: this.affectedSystems.sort(),
      tags: this.tags.sort(),
      timestamp: this.timestamp
    }
    
    const contentString = JSON.stringify(contentForHash, null, 0)
    this.hash = crypto.createHash('sha256').update(contentString).digest('hex').substring(0, 16)
    
    return this.hash
  }
  
  /**
   * Calculate KU size in bytes
   */
  calculateSize() {
    const jsonString = JSON.stringify(this.toJSON())
    this.metadata.size = Buffer.byteLength(jsonString, 'utf8')
    return this.metadata.size
  }
  
  /**
   * Calculate checksum for integrity verification
   */
  calculateChecksum() {
    const jsonString = JSON.stringify(this.toJSON(), null, 0)
    this.metadata.checksum = crypto.createHash('md5').update(jsonString).digest('hex')
    return this.metadata.checksum
  }
  
  /**
   * Validate KU structure and content
   */
  validate() {
    const errors = []
    
    // Required fields
    if (!this.id) errors.push('ID is required')
    if (!this.title || this.title.trim().length === 0) errors.push('Title is required')
    if (!this.description || this.description.trim().length < 10) errors.push('Description must be at least 10 characters')
    if (!this.solution || this.solution.trim().length < 10) errors.push('Solution must be at least 10 characters')
    
    // Valid enums
    if (!Object.values(KU_TYPES).includes(this.type)) errors.push('Invalid type')
    if (!Object.values(SEVERITY_LEVELS).includes(this.severity)) errors.push('Invalid severity')
    if (!Object.values(KU_STATUS).includes(this.status)) errors.push('Invalid status')
    
    // Confidence ranges
    if (this.confidence < 0 || this.confidence > 1) errors.push('Confidence must be between 0 and 1')
    if (this.accuracy < 0 || this.accuracy > 1) errors.push('Accuracy must be between 0 and 1')
    
    // Content length limits
    if (this.title.length > 200) errors.push('Title too long (max 200 characters)')
    if (this.description.length > 5000) errors.push('Description too long (max 5000 characters)')
    if (this.solution.length > 10000) errors.push('Solution too long (max 10000 characters)')
    
    // Array limits
    if (this.tags.length > 20) errors.push('Too many tags (max 20)')
    if (this.affectedSystems.length > 50) errors.push('Too many affected systems (max 50)')
    
    return {
      isValid: errors.length === 0,
      errors: errors
    }
  }
  
  /**
   * Add tag if not already present
   */
  addTag(tag) {
    if (typeof tag === 'string' && tag.trim() && !this.tags.includes(tag.trim().toLowerCase())) {
      this.tags.push(tag.trim().toLowerCase())
      this.lastModified = new Date().toISOString()
      this.calculateHash()
    }
  }
  
  /**
   * Add affected system if not already present
   */
  addAffectedSystem(system) {
    if (typeof system === 'string' && system.trim() && !this.affectedSystems.includes(system.trim())) {
      this.affectedSystems.push(system.trim())
      this.lastModified = new Date().toISOString()
      this.calculateHash()
    }
  }
  
  /**
   * Add verification by peer
   */
  addVerification(peerId, timestamp = null) {
    const verification = {
      peerId: peerId,
      timestamp: timestamp || new Date().toISOString()
    }
    
    // Check if already verified by this peer
    const existingIndex = this.verifiedBy.findIndex(v => v.peerId === peerId)
    if (existingIndex >= 0) {
      this.verifiedBy[existingIndex] = verification
    } else {
      this.verifiedBy.push(verification)
    }
    
    this.lastModified = new Date().toISOString()
    this.calculateHash()
  }
  
  /**
   * Check if KU is expired
   */
  isExpired() {
    if (!this.expiresAt) return false
    return new Date() > new Date(this.expiresAt)
  }
  
  /**
   * Check if KU is superseded
   */
  isSuperseded() {
    return this.status === KU_STATUS.SUPERSEDED && this.supersededBy !== null
  }
  
  /**
   * Get age in days
   */
  getAgeInDays() {
    const now = new Date()
    const created = new Date(this.timestamp)
    const diffTime = Math.abs(now - created)
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
  }
  
  /**
   * Convert to JSON for serialization
   */
  toJSON() {
    return {
      // Core Identity
      id: this.id,
      version: this.version,
      hash: this.hash,
      status: this.status,
      
      // Classification
      type: this.type,
      severity: this.severity,
      confidence: this.confidence,
      priority: this.priority,
      
      // Content
      title: this.title,
      description: this.description,
      solution: this.solution,
      references: this.references,
      examples: this.examples,
      
      // Context
      affectedSystems: this.affectedSystems,
      tags: this.tags,
      categories: this.categories,
      languages: this.languages,
      frameworks: this.frameworks,
      
      // External References
      cveIds: this.cveIds,
      cweIds: this.cweIds,
      osvIds: this.osvIds,
      ghsaIds: this.ghsaIds,
      
      // Provenance & Lifecycle
      discoveredBy: this.discoveredBy,
      verifiedBy: this.verifiedBy,
      reviewedBy: this.reviewedBy,
      timestamp: this.timestamp,
      lastModified: this.lastModified,
      expiresAt: this.expiresAt,
      supersededBy: this.supersededBy,
      
      // Quality Metrics
      accuracy: this.accuracy,
      completeness: this.completeness,
      relevance: this.relevance,
      impact: this.impact,
      
      // Network & Security
      signature: this.signature,
      signatureAlgorithm: this.signatureAlgorithm,
      propagationPath: this.propagationPath,
      originPeer: this.originPeer,
      networkVersion: this.networkVersion,
      
      // Metadata
      metadata: this.metadata
    }
  }
  
  /**
   * Create KU from JSON
   */
  static fromJSON(json) {
    return new KnowledgeUnit(json)
  }
  
  /**
   * Sign the knowledge unit using a private key
   * @param {string} privateKeyPem - PEM formatted private key
   * @returns {string} The generated signature
   */
  sign(privateKeyPem) {
    if (!this.hash) {
      this.calculateHash();
    }
    
    this.signature = signMessage(this.hash, privateKeyPem);
    return this.signature;
  }
  
  /**
   * Verify the knowledge unit's signature using a public key
   * @param {string} publicKeyPem - PEM formatted public key
   * @returns {boolean} True if signature is valid, false otherwise
   */
  verify(publicKeyPem) {
    if (!this.signature) {
      console.error(`Signature not set for KnowledgeUnit ${this.id}`);
      return false;
    }
    
    if (!this.hash) {
      this.calculateHash();
    }
    
    return verifySignature(this.hash, this.signature, publicKeyPem);
  }
  
  /**
   * Create a sample KU for testing
   */
  static createSample(type = KU_TYPES.SECURITY_VULNERABILITY) {
    const samples = {
      [KU_TYPES.SECURITY_VULNERABILITY]: {
        title: "XSS Vulnerability in React dangerouslySetInnerHTML",
        description: "Cross-site scripting vulnerability in React components using dangerouslySetInnerHTML without proper sanitization. Attackers can inject malicious scripts that execute in the user's browser context.",
        solution: "Use DOMPurify.sanitize() to clean HTML content before rendering: const cleanHTML = DOMPurify.sanitize(userInput); return <div dangerouslySetInnerHTML={{__html: cleanHTML}} />",
        severity: SEVERITY_LEVELS.HIGH,
        confidence: 0.95,
        affectedSystems: ["React 16+", "Next.js", "Gatsby"],
        tags: ["react", "xss", "security", "frontend", "sanitization"],
        cveIds: ["CVE-2025-0001"],
        references: ["https://owasp.org/www-community/attacks/xss/", "https://reactjs.org/docs/dom-elements.html#dangerouslysetinnerhtml"]
      },
      [KU_TYPES.PERFORMANCE_ISSUE]: {
        title: "Memory Leak in Event Handlers",
        description: "Memory leak caused by event listeners not being properly cleaned up in React useEffect hooks. This leads to accumulating event listeners and increased memory usage over time.",
        solution: "Always return cleanup function: useEffect(() => { const handler = (e) => {...}; element.addEventListener('click', handler); return () => element.removeEventListener('click', handler); }, [])",
        severity: SEVERITY_LEVELS.MEDIUM,
        confidence: 0.87,
        affectedSystems: ["React", "Vue.js", "Angular"],
        tags: ["memory-leak", "performance", "react", "useeffect", "cleanup"]
      }
    }
    
    const sampleData = samples[type] || samples[KU_TYPES.SECURITY_VULNERABILITY]
    return new KnowledgeUnit({
      type: type,
      discoveredBy: 'SGN-Sample-Generator',
      ...sampleData
    })
  }
}

/**
 * KU Factory for creating different types of Knowledge Units
 */
export class KUFactory {
  static createSecurityVulnerability(data) {
    return new KnowledgeUnit({
      type: KU_TYPES.SECURITY_VULNERABILITY,
      ...data
    })
  }
  
  static createPerformanceIssue(data) {
    return new KnowledgeUnit({
      type: KU_TYPES.PERFORMANCE_ISSUE,
      ...data
    })
  }
  
  static createBestPractice(data) {
    return new KnowledgeUnit({
      type: KU_TYPES.BEST_PRACTICE,
      severity: SEVERITY_LEVELS.INFO,
      ...data
    })
  }
  
  static createThreatIntel(data) {
    return new KnowledgeUnit({
      type: KU_TYPES.THREAT_INTEL,
      ...data
    })
  }
}

export default KnowledgeUnit
