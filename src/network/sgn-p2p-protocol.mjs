/**
 * SGN P2P Protocol Implementation
 * Phase 3: Network Protocol Implementation
 * 
 * Defines the complete P2P protocol for SGN nodes:
 * - Message types and formats
 * - Protocol versioning
 * - Request/response patterns
 * - Error handling
 * - Flow control
 */

/**
 * SGN Protocol Version
 */
export const SGN_PROTOCOL_VERSION = '1.0.0';

/**
 * Message Types
 */
export const MESSAGE_TYPES = {
  // Connection management
  WELCOME: 'welcome',
  PEER_HANDSHAKE: 'peer-handshake',
  HANDSHAKE_ACK: 'handshake-ack',
  PING: 'ping',
  PONG: 'pong',
  DISCONNECT: 'disconnect',
  
  // KU operations
  KU_REQUEST: 'ku-request',
  KU_RESPONSE: 'ku-response',
  KU_BROADCAST: 'ku-broadcast',
  KU_ANNOUNCE: 'ku-announce',
  
  // Peer discovery
  PEER_DISCOVERY: 'peer-discovery',
  PEER_LIST: 'peer-list',
  PEER_INFO: 'peer-info',
  
  // Network operations
  NETWORK_STATUS: 'network-status',
  BOOTSTRAP_REQUEST: 'bootstrap-request',
  BOOTSTRAP_RESPONSE: 'bootstrap-response',
  
  // Error handling
  ERROR: 'error',
  PROTOCOL_ERROR: 'protocol-error'
};

/**
 * Error Codes
 */
export const ERROR_CODES = {
  INVALID_MESSAGE: 1001,
  UNSUPPORTED_VERSION: 1002,
  AUTHENTICATION_FAILED: 1003,
  RATE_LIMIT_EXCEEDED: 1004,
  RESOURCE_NOT_FOUND: 1005,
  INTERNAL_ERROR: 1006,
  PROTOCOL_VIOLATION: 1007,
  CONNECTION_TIMEOUT: 1008
};

/**
 * Protocol Message Factory
 */
export class SGNProtocolMessage {
  /**
   * Create welcome message
   */
  static welcome(nodeId, capabilities = []) {
    return {
      type: MESSAGE_TYPES.WELCOME,
      version: SGN_PROTOCOL_VERSION,
      nodeId: nodeId,
      timestamp: Date.now(),
      serverInfo: {
        version: SGN_PROTOCOL_VERSION,
        capabilities: capabilities
      }
    };
  }
  
  /**
   * Create peer handshake message
   */
  static peerHandshake(peerId, publicKey, signature = null) {
    return {
      type: MESSAGE_TYPES.PEER_HANDSHAKE,
      version: SGN_PROTOCOL_VERSION,
      peerId: peerId,
      publicKey: publicKey,
      signature: signature,
      timestamp: Date.now(),
      capabilities: ['ku-request', 'ku-response', 'peer-discovery']
    };
  }
  
  /**
   * Create handshake acknowledgment
   */
  static handshakeAck(nodeId, status, error = null) {
    return {
      type: MESSAGE_TYPES.HANDSHAKE_ACK,
      version: SGN_PROTOCOL_VERSION,
      nodeId: nodeId,
      status: status, // 'accepted' or 'rejected'
      error: error,
      timestamp: Date.now()
    };
  }
  
  /**
   * Create KU request message
   */
  static kuRequest(requestId, query, requesterPeerId) {
    return {
      type: MESSAGE_TYPES.KU_REQUEST,
      version: SGN_PROTOCOL_VERSION,
      requestId: requestId,
      requesterPeerId: requesterPeerId,
      query: query,
      timestamp: Date.now(),
      ttl: 30000 // 30 seconds TTL
    };
  }
  
  /**
   * Create KU response message
   */
  static kuResponse(requestId, results, responderPeerId) {
    return {
      type: MESSAGE_TYPES.KU_RESPONSE,
      version: SGN_PROTOCOL_VERSION,
      requestId: requestId,
      responderPeerId: responderPeerId,
      results: results,
      resultCount: results.length,
      timestamp: Date.now()
    };
  }
  
  /**
   * Create KU broadcast message
   */
  static kuBroadcast(ku, broadcasterPeerId) {
    return {
      type: MESSAGE_TYPES.KU_BROADCAST,
      version: SGN_PROTOCOL_VERSION,
      broadcasterPeerId: broadcasterPeerId,
      ku: ku,
      timestamp: Date.now(),
      ttl: 60000 // 1 minute TTL
    };
  }
  
  /**
   * Create peer discovery request
   */
  static peerDiscovery(requesterPeerId, maxPeers = 10) {
    return {
      type: MESSAGE_TYPES.PEER_DISCOVERY,
      version: SGN_PROTOCOL_VERSION,
      requesterPeerId: requesterPeerId,
      maxPeers: maxPeers,
      timestamp: Date.now()
    };
  }
  
  /**
   * Create peer list response
   */
  static peerList(peers, responderPeerId) {
    return {
      type: MESSAGE_TYPES.PEER_LIST,
      version: SGN_PROTOCOL_VERSION,
      responderPeerId: responderPeerId,
      peers: peers,
      peerCount: peers.length,
      timestamp: Date.now()
    };
  }
  
  /**
   * Create error message
   */
  static error(errorCode, errorMessage, originalMessage = null) {
    return {
      type: MESSAGE_TYPES.ERROR,
      version: SGN_PROTOCOL_VERSION,
      errorCode: errorCode,
      errorMessage: errorMessage,
      originalMessage: originalMessage,
      timestamp: Date.now()
    };
  }
  
  /**
   * Create ping message
   */
  static ping(peerId) {
    return {
      type: MESSAGE_TYPES.PING,
      version: SGN_PROTOCOL_VERSION,
      peerId: peerId,
      timestamp: Date.now()
    };
  }
  
  /**
   * Create pong message
   */
  static pong(peerId, originalTimestamp) {
    return {
      type: MESSAGE_TYPES.PONG,
      version: SGN_PROTOCOL_VERSION,
      peerId: peerId,
      originalTimestamp: originalTimestamp,
      timestamp: Date.now()
    };
  }
}

/**
 * Protocol Message Validator
 */
export class SGNProtocolValidator {
  /**
   * Validate message structure
   */
  static validateMessage(message) {
    const errors = [];
    
    // Check required fields
    if (!message.type) {
      errors.push('Missing message type');
    }
    
    if (!message.version) {
      errors.push('Missing protocol version');
    }
    
    if (!message.timestamp) {
      errors.push('Missing timestamp');
    }
    
    // Check protocol version compatibility
    if (message.version && !this.isVersionCompatible(message.version)) {
      errors.push(`Unsupported protocol version: ${message.version}`);
    }
    
    // Check message type
    if (message.type && !Object.values(MESSAGE_TYPES).includes(message.type)) {
      errors.push(`Unknown message type: ${message.type}`);
    }
    
    // Type-specific validation
    if (errors.length === 0) {
      const typeErrors = this.validateMessageType(message);
      errors.push(...typeErrors);
    }
    
    return {
      valid: errors.length === 0,
      errors: errors
    };
  }
  
  /**
   * Check protocol version compatibility
   */
  static isVersionCompatible(version) {
    // For now, only support exact version match
    // In future, implement semantic versioning compatibility
    return version === SGN_PROTOCOL_VERSION;
  }
  
  /**
   * Validate specific message types
   */
  static validateMessageType(message) {
    const errors = [];
    
    switch (message.type) {
      case MESSAGE_TYPES.PEER_HANDSHAKE:
        if (!message.peerId) errors.push('Missing peerId in handshake');
        if (!message.publicKey) errors.push('Missing publicKey in handshake');
        break;
        
      case MESSAGE_TYPES.KU_REQUEST:
        if (!message.requestId) errors.push('Missing requestId in KU request');
        if (!message.query) errors.push('Missing query in KU request');
        if (!message.requesterPeerId) errors.push('Missing requesterPeerId in KU request');
        break;
        
      case MESSAGE_TYPES.KU_RESPONSE:
        if (!message.requestId) errors.push('Missing requestId in KU response');
        if (!message.results) errors.push('Missing results in KU response');
        if (!message.responderPeerId) errors.push('Missing responderPeerId in KU response');
        break;
        
      case MESSAGE_TYPES.KU_BROADCAST:
        if (!message.ku) errors.push('Missing KU in broadcast');
        if (!message.broadcasterPeerId) errors.push('Missing broadcasterPeerId in broadcast');
        break;
        
      case MESSAGE_TYPES.PEER_DISCOVERY:
        if (!message.requesterPeerId) errors.push('Missing requesterPeerId in peer discovery');
        break;
        
      case MESSAGE_TYPES.PEER_LIST:
        if (!message.peers) errors.push('Missing peers in peer list');
        if (!message.responderPeerId) errors.push('Missing responderPeerId in peer list');
        break;
    }
    
    return errors;
  }
  
  /**
   * Check message TTL
   */
  static isMessageExpired(message) {
    if (!message.ttl) return false;
    
    const age = Date.now() - message.timestamp;
    return age > message.ttl;
  }
}

/**
 * Protocol Statistics Tracker
 */
export class SGNProtocolStats {
  constructor() {
    this.stats = {
      messagesReceived: 0,
      messagesSent: 0,
      bytesReceived: 0,
      bytesSent: 0,
      errorCount: 0,
      messageTypes: new Map(),
      protocolErrors: new Map(),
      averageMessageSize: 0,
      peakMessageRate: 0,
      lastMessageTime: null
    };
    
    this.messageRateWindow = [];
    this.windowSize = 60; // 60 seconds
  }
  
  /**
   * Record received message
   */
  recordReceived(message, size) {
    this.stats.messagesReceived++;
    this.stats.bytesReceived += size;
    this.stats.lastMessageTime = Date.now();
    
    // Track message types
    const type = message.type;
    this.stats.messageTypes.set(type, (this.stats.messageTypes.get(type) || 0) + 1);
    
    // Update average message size
    this.stats.averageMessageSize = this.stats.bytesReceived / this.stats.messagesReceived;
    
    // Track message rate
    this.updateMessageRate();
  }
  
  /**
   * Record sent message
   */
  recordSent(message, size) {
    this.stats.messagesSent++;
    this.stats.bytesSent += size;
    
    // Track message types
    const type = message.type;
    this.stats.messageTypes.set(type, (this.stats.messageTypes.get(type) || 0) + 1);
    
    // Update average message size
    const totalMessages = this.stats.messagesReceived + this.stats.messagesSent;
    const totalBytes = this.stats.bytesReceived + this.stats.bytesSent;
    this.stats.averageMessageSize = totalBytes / totalMessages;
  }
  
  /**
   * Record protocol error
   */
  recordError(errorCode, errorMessage) {
    this.stats.errorCount++;
    this.stats.protocolErrors.set(errorCode, (this.stats.protocolErrors.get(errorCode) || 0) + 1);
  }
  
  /**
   * Update message rate tracking
   */
  updateMessageRate() {
    const now = Date.now();
    this.messageRateWindow.push(now);
    
    // Remove old entries (older than window size)
    const cutoff = now - (this.windowSize * 1000);
    this.messageRateWindow = this.messageRateWindow.filter(time => time > cutoff);
    
    // Calculate current rate
    const currentRate = this.messageRateWindow.length / this.windowSize;
    if (currentRate > this.stats.peakMessageRate) {
      this.stats.peakMessageRate = currentRate;
    }
  }
  
  /**
   * Get protocol statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      messageTypes: Object.fromEntries(this.stats.messageTypes),
      protocolErrors: Object.fromEntries(this.stats.protocolErrors),
      currentMessageRate: this.messageRateWindow.length / this.windowSize,
      errorRate: this.stats.errorCount / Math.max(this.stats.messagesReceived, 1)
    };
  }
  
  /**
   * Reset statistics
   */
  reset() {
    this.stats = {
      messagesReceived: 0,
      messagesSent: 0,
      bytesReceived: 0,
      bytesSent: 0,
      errorCount: 0,
      messageTypes: new Map(),
      protocolErrors: new Map(),
      averageMessageSize: 0,
      peakMessageRate: 0,
      lastMessageTime: null
    };
    this.messageRateWindow = [];
  }
}
