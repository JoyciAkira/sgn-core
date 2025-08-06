/**
 * SGN Network - Simplified Implementation
 * Phase 4: Network Protocol Implementation
 *
 * Features:
 * - WebSocket-based P2P networking
 * - Network identity management
 * - KU request/response protocol
 * - Peer discovery system
 * - Integration with existing SGN components
 */

import { WebSocketServer, WebSocket } from 'ws';
import { createServer } from 'http';
import { networkIdentityManager } from './network-identity.mjs';
import { multiTierStorage } from '../persistence/multi-tier-storage.mjs';
import { reputationManager } from '../reputation-manager.mjs';
import { blake3Hash } from '../crypto/blake3-hasher.mjs';

// Network Configuration
export const NETWORK_CONFIG = {
  PROTOCOL_VERSION: '1.0.0',
  NETWORK_ID: 'sgn-mainnet',
  
  // Connection settings
  MAX_CONNECTIONS: 50,
  CONNECTION_TIMEOUT: 10000,
  HEARTBEAT_INTERVAL: 30000,
  
  // Message types
  MESSAGE_TYPES: {
    HANDSHAKE: 'handshake',
    IDENTITY_EXCHANGE: 'identity_exchange',
    KU_BROADCAST: 'ku_broadcast',
    KU_REQUEST: 'ku_request',
    KU_RESPONSE: 'ku_response',
    PEER_DISCOVERY: 'peer_discovery',
    HEARTBEAT: 'heartbeat'
  },
  
  // Discovery settings
  DISCOVERY_INTERVAL: 60000,
  PEER_ANNOUNCEMENT_INTERVAL: 120000,
  
  // Default bootstrap peers
  BOOTSTRAP_PEERS: [
    'ws://localhost:8001',
    'ws://localhost:8002'
  ]
};

/**
 * SGN Network Node - Simplified WebSocket Implementation
 */
export class SGNNetworkNode {
  constructor(options = {}) {
    this.config = { ...NETWORK_CONFIG, ...options };
    this.nodeId = options.nodeId || `sgn-node-${Date.now()}`;
    this.port = options.port || 8000;
    
    // Network state
    this.isStarted = false;
    this.server = null;
    this.wsServer = null;
    this.connections = new Map(); // peerId -> WebSocket
    this.peerInfo = new Map(); // peerId -> peer metadata
    
    // Message handling
    this.messageHandlers = new Map();
    this.pendingRequests = new Map();
    this.messageQueue = [];
    
    // Performance metrics
    this.metrics = {
      connectionsEstablished: 0,
      messagesReceived: 0,
      messagesSent: 0,
      peersDiscovered: 0,
      kusShared: 0,
      kusReceived: 0,
      uptime: 0
    };
    
    this.startTime = Date.now();
    
    // Setup message handlers
    this.setupMessageHandlers();
  }
  
  /**
   * Start the SGN network node
   */
  async start() {
    if (this.isStarted) {
      throw new Error('SGN Network Node already started');
    }
    
    console.log(`🌐 Starting SGN Network Node: ${this.nodeId}`);
    console.log(`   Port: ${this.port}`);
    console.log(`   Protocol Version: ${this.config.PROTOCOL_VERSION}`);
    
    try {
      // Initialize identity manager
      await networkIdentityManager.initialize(this.nodeId, {
        networkId: this.config.NETWORK_ID,
        capabilities: ['ku-storage', 'ku-discovery', 'ku-verification']
      });
      
      // Initialize storage
      if (!multiTierStorage.isInitialized) {
        await multiTierStorage.initialize();
      }
      
      // Create HTTP server
      this.server = createServer();
      
      // Create WebSocket server
      this.wsServer = new WebSocketServer({ 
        server: this.server,
        path: '/sgn'
      });
      
      // Setup WebSocket event handlers
      this.setupWebSocketHandlers();
      
      // Start HTTP server
      await new Promise((resolve, reject) => {
        this.server.listen(this.port, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      this.isStarted = true;
      
      // Start background processes
      this.startHeartbeat();
      this.startPeerDiscovery();
      
      // Connect to bootstrap peers
      await this.connectToBootstrapPeers();
      
      console.log(`✅ SGN Network Node started successfully`);
      console.log(`   Listening on: ws://localhost:${this.port}/sgn`);
      console.log(`   Node Identity: ${networkIdentityManager.localIdentity.identityHash.substring(0, 16)}...`);
      
      return this;
      
    } catch (error) {
      console.error(`❌ Failed to start SGN Network Node: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Setup WebSocket event handlers
   */
  setupWebSocketHandlers() {
    this.wsServer.on('connection', (ws, request) => {
      console.log(`🔗 New connection from ${request.socket.remoteAddress}`);
      
      // Setup connection handlers
      ws.on('message', (data) => {
        this.handleMessage(ws, data);
      });
      
      ws.on('close', () => {
        this.handleDisconnection(ws);
      });
      
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
      });
      
      // Send handshake
      this.sendHandshake(ws);
    });
  }
  
  /**
   * Setup message handlers
   */
  setupMessageHandlers() {
    const types = this.config.MESSAGE_TYPES;
    
    this.messageHandlers.set(types.HANDSHAKE, this.handleHandshake.bind(this));
    this.messageHandlers.set(types.IDENTITY_EXCHANGE, this.handleIdentityExchange.bind(this));
    this.messageHandlers.set(types.KU_BROADCAST, this.handleKUBroadcast.bind(this));
    this.messageHandlers.set(types.KU_REQUEST, this.handleKURequest.bind(this));
    this.messageHandlers.set(types.KU_RESPONSE, this.handleKUResponse.bind(this));
    this.messageHandlers.set(types.PEER_DISCOVERY, this.handlePeerDiscovery.bind(this));
    this.messageHandlers.set(types.HEARTBEAT, this.handleHeartbeat.bind(this));
  }
  
  /**
   * Handle incoming messages
   */
  async handleMessage(ws, data) {
    try {
      const message = JSON.parse(data.toString());
      this.metrics.messagesReceived++;
      
      // Validate message structure
      if (!message.type || !message.timestamp) {
        console.warn('Invalid message structure received');
        return;
      }
      
      // Get message handler
      const handler = this.messageHandlers.get(message.type);
      if (handler) {
        await handler(ws, message);
      } else {
        console.warn(`Unknown message type: ${message.type}`);
      }
      
    } catch (error) {
      console.error('Error handling message:', error);
    }
  }
  
  /**
   * Send handshake to new connection
   */
  async sendHandshake(ws) {
    const handshake = {
      type: this.config.MESSAGE_TYPES.HANDSHAKE,
      nodeId: this.nodeId,
      protocolVersion: this.config.PROTOCOL_VERSION,
      networkId: this.config.NETWORK_ID,
      timestamp: new Date().toISOString()
    };
    
    this.sendMessage(ws, handshake);
  }
  
  /**
   * Handle handshake messages
   */
  async handleHandshake(ws, message) {
    console.log(`🤝 Handshake from ${message.nodeId}`);
    
    // Validate protocol compatibility
    if (message.protocolVersion !== this.config.PROTOCOL_VERSION) {
      console.warn(`Protocol version mismatch: ${message.protocolVersion} vs ${this.config.PROTOCOL_VERSION}`);
      ws.close(1002, 'Protocol version mismatch');
      return;
    }
    
    // Validate network ID
    if (message.networkId !== this.config.NETWORK_ID) {
      console.warn(`Network ID mismatch: ${message.networkId} vs ${this.config.NETWORK_ID}`);
      ws.close(1002, 'Network ID mismatch');
      return;
    }
    
    // Store peer info
    this.peerInfo.set(message.nodeId, {
      nodeId: message.nodeId,
      protocolVersion: message.protocolVersion,
      networkId: message.networkId,
      connectedAt: Date.now(),
      lastSeen: Date.now()
    });
    
    this.connections.set(message.nodeId, ws);
    this.metrics.connectionsEstablished++;
    
    // Send identity exchange
    await this.sendIdentityExchange(ws);
    
    console.log(`✅ Peer connected: ${message.nodeId}`);
  }
  
  /**
   * Send identity exchange
   */
  async sendIdentityExchange(ws) {
    const certificate = networkIdentityManager.getLocalIdentityCertificate();
    
    const identityMessage = {
      type: this.config.MESSAGE_TYPES.IDENTITY_EXCHANGE,
      certificate: certificate,
      timestamp: new Date().toISOString()
    };
    
    this.sendMessage(ws, identityMessage);
  }
  
  /**
   * Handle identity exchange messages
   */
  async handleIdentityExchange(ws, message) {
    try {
      const certificate = message.certificate;
      const peerId = certificate.identity.nodeId;
      
      console.log(`🔐 Identity exchange from ${peerId}`);
      
      // Verify identity certificate
      const verification = await networkIdentityManager.verifyRemoteIdentity(certificate, peerId);
      
      if (verification.isValid) {
        console.log(`✅ Identity verified for ${peerId}`);
        
        // Update peer info with verified identity
        const peerInfo = this.peerInfo.get(peerId);
        if (peerInfo) {
          peerInfo.identity = certificate.identity;
          peerInfo.identityVerified = true;
        }
        
        // Update reputation for valid identity
        reputationManager.updatePeerReputation(peerId, 'valid_identity');
        
      } else {
        console.warn(`❌ Identity verification failed for ${peerId}: ${verification.reason}`);
        
        // Update reputation for invalid identity
        reputationManager.updatePeerReputation(peerId, 'invalid_identity');
        
        // Close connection to unverified peer
        ws.close(1008, 'Identity verification failed');
      }
      
    } catch (error) {
      console.error('Error handling identity exchange:', error);
    }
  }
  
  /**
   * Handle KU broadcast messages
   */
  async handleKUBroadcast(ws, message) {
    try {
      const ku = message.ku;
      const fromPeer = message.fromPeer;
      
      console.log(`📦 KU broadcast from ${fromPeer}: ${ku.title}`);
      
      // Validate KU integrity
      if (message.hash) {
        const expectedHash = blake3Hash(JSON.stringify(ku));
        if (expectedHash !== message.hash) {
          console.warn(`⚠️ Hash mismatch in KU broadcast from ${fromPeer}`);
          reputationManager.updatePeerReputation(fromPeer, 'invalid_message');
          return;
        }
      }
      
      // Store KU
      await multiTierStorage.store(ku, { fromPeer });
      this.metrics.kusReceived++;
      
      // Update reputation for valid KU
      reputationManager.updatePeerReputation(fromPeer, 'valid_ku');
      
      console.log(`💾 Stored KU ${ku.id} from ${fromPeer}`);
      
    } catch (error) {
      console.error('Error handling KU broadcast:', error);
    }
  }
  
  /**
   * Handle KU request messages
   */
  async handleKURequest(ws, message) {
    try {
      const query = message.query;
      const requestId = message.requestId;
      const fromPeer = message.fromPeer;
      
      console.log(`🔍 KU request from ${fromPeer}: ${JSON.stringify(query)}`);
      
      // Search for matching KUs
      const results = await multiTierStorage.search(query, { limit: 10 });
      
      // Send response
      const response = {
        type: this.config.MESSAGE_TYPES.KU_RESPONSE,
        requestId: requestId,
        results: results,
        fromPeer: this.nodeId,
        timestamp: new Date().toISOString()
      };
      
      this.sendMessage(ws, response);
      
      console.log(`📨 Sent ${results.length} KU results to ${fromPeer}`);
      
    } catch (error) {
      console.error('Error handling KU request:', error);
    }
  }
  
  /**
   * Handle KU response messages
   */
  async handleKUResponse(ws, message) {
    const requestId = message.requestId;
    const results = message.results;
    const fromPeer = message.fromPeer;
    
    console.log(`📨 KU response from ${fromPeer}: ${results.length} results`);
    
    // Handle pending request
    if (this.pendingRequests.has(requestId)) {
      const pendingRequest = this.pendingRequests.get(requestId);
      pendingRequest.resolve(results);
      this.pendingRequests.delete(requestId);
    }
  }
  
  /**
   * Handle peer discovery messages
   */
  async handlePeerDiscovery(ws, message) {
    const peers = message.peers;
    const fromPeer = message.fromPeer;
    
    console.log(`🔍 Peer discovery from ${fromPeer}: ${peers.length} peers`);
    
    // Process discovered peers
    for (const peer of peers) {
      if (peer.nodeId !== this.nodeId && !this.connections.has(peer.nodeId)) {
        console.log(`🆕 Discovered new peer: ${peer.nodeId} at ${peer.address}`);
        this.metrics.peersDiscovered++;
        
        // Attempt to connect to new peer
        if (peer.address && this.connections.size < this.config.MAX_CONNECTIONS) {
          this.connectToPeer(peer.address).catch(error => {
            console.warn(`Failed to connect to discovered peer ${peer.nodeId}: ${error.message}`);
          });
        }
      }
    }
  }
  
  /**
   * Handle heartbeat messages
   */
  async handleHeartbeat(ws, message) {
    const fromPeer = message.fromPeer;
    
    // Update last seen time
    const peerInfo = this.peerInfo.get(fromPeer);
    if (peerInfo) {
      peerInfo.lastSeen = Date.now();
    }
    
    // Send heartbeat response
    const response = {
      type: this.config.MESSAGE_TYPES.HEARTBEAT,
      fromPeer: this.nodeId,
      timestamp: new Date().toISOString()
    };
    
    this.sendMessage(ws, response);
  }
  
  /**
   * Handle connection disconnection
   */
  handleDisconnection(ws) {
    // Find and remove peer
    for (const [peerId, connection] of this.connections.entries()) {
      if (connection === ws) {
        console.log(`🔌 Peer disconnected: ${peerId}`);
        this.connections.delete(peerId);
        this.peerInfo.delete(peerId);
        break;
      }
    }
  }
  
  /**
   * Send message to WebSocket connection
   */
  sendMessage(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
      this.metrics.messagesSent++;
    }
  }
  
  /**
   * Broadcast message to all connected peers
   */
  broadcastMessage(message) {
    for (const [peerId, ws] of this.connections.entries()) {
      this.sendMessage(ws, message);
    }
  }
  
  /**
   * Connect to bootstrap peers
   */
  async connectToBootstrapPeers() {
    console.log('🔗 Connecting to bootstrap peers...');
    
    for (const peerAddress of this.config.BOOTSTRAP_PEERS) {
      if (peerAddress.includes(this.port.toString())) {
        continue; // Skip self
      }
      
      try {
        await this.connectToPeer(peerAddress);
      } catch (error) {
        console.warn(`Failed to connect to bootstrap peer ${peerAddress}: ${error.message}`);
      }
    }
  }
  
  /**
   * Connect to a specific peer
   */
  async connectToPeer(address) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(address + '/sgn');
      
      ws.on('open', () => {
        console.log(`🔗 Connected to peer: ${address}`);
        resolve(ws);
      });
      
      ws.on('message', (data) => {
        this.handleMessage(ws, data);
      });
      
      ws.on('close', () => {
        this.handleDisconnection(ws);
      });
      
      ws.on('error', (error) => {
        reject(error);
      });
      
      // Timeout
      setTimeout(() => {
        if (ws.readyState !== WebSocket.OPEN) {
          ws.close();
          reject(new Error('Connection timeout'));
        }
      }, this.config.CONNECTION_TIMEOUT);
    });
  }
  
  /**
   * Start heartbeat process
   */
  startHeartbeat() {
    setInterval(() => {
      const heartbeat = {
        type: this.config.MESSAGE_TYPES.HEARTBEAT,
        fromPeer: this.nodeId,
        timestamp: new Date().toISOString()
      };
      
      this.broadcastMessage(heartbeat);
    }, this.config.HEARTBEAT_INTERVAL);
  }
  
  /**
   * Start peer discovery process
   */
  startPeerDiscovery() {
    setInterval(() => {
      // Announce known peers
      const knownPeers = Array.from(this.peerInfo.values()).map(peer => ({
        nodeId: peer.nodeId,
        address: `ws://localhost:${this.port}` // Simplified
      }));
      
      const discovery = {
        type: this.config.MESSAGE_TYPES.PEER_DISCOVERY,
        peers: knownPeers,
        fromPeer: this.nodeId,
        timestamp: new Date().toISOString()
      };
      
      this.broadcastMessage(discovery);
    }, this.config.DISCOVERY_INTERVAL);
  }
  
  /**
   * Broadcast Knowledge Unit to network
   */
  async broadcastKU(ku) {
    const message = {
      type: this.config.MESSAGE_TYPES.KU_BROADCAST,
      ku: ku,
      hash: blake3Hash(JSON.stringify(ku)),
      fromPeer: this.nodeId,
      timestamp: new Date().toISOString()
    };
    
    this.broadcastMessage(message);
    this.metrics.kusShared++;
    
    console.log(`📡 Broadcasted KU: ${ku.title}`);
  }
  
  /**
   * Request Knowledge Units from network
   */
  async requestKUs(query) {
    const requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    const request = {
      type: this.config.MESSAGE_TYPES.KU_REQUEST,
      requestId: requestId,
      query: query,
      fromPeer: this.nodeId,
      timestamp: new Date().toISOString()
    };
    
    // Send to all connected peers
    this.broadcastMessage(request);
    
    // Return promise that resolves when responses are received
    return new Promise((resolve) => {
      const responses = [];
      
      this.pendingRequests.set(requestId, {
        resolve: (results) => {
          responses.push(...results);
          resolve(responses);
        }
      });
      
      // Timeout after 10 seconds
      setTimeout(() => {
        if (this.pendingRequests.has(requestId)) {
          this.pendingRequests.delete(requestId);
          resolve(responses);
        }
      }, 10000);
    });
  }
  
  /**
   * Get network statistics
   */
  getStatistics() {
    return {
      ...this.metrics,
      uptime: Date.now() - this.startTime,
      connectedPeers: this.connections.size,
      knownPeers: this.peerInfo.size,
      nodeId: this.nodeId,
      isStarted: this.isStarted,
      identityHash: networkIdentityManager.localIdentity?.identityHash?.substring(0, 16) + '...'
    };
  }
  
  /**
   * Stop the network node
   */
  async stop() {
    if (!this.isStarted) return;
    
    console.log(`🛑 Stopping SGN Network Node: ${this.nodeId}`);
    
    // Close all connections
    for (const [peerId, ws] of this.connections.entries()) {
      ws.close();
    }
    
    // Stop servers
    if (this.wsServer) {
      this.wsServer.close();
    }
    
    if (this.server) {
      this.server.close();
    }
    
    this.isStarted = false;
    console.log(`✅ SGN Network Node stopped`);
  }
}
