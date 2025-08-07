/**
 * Bootstrap Peer Discovery System
 * Phase 3 Step 3: Bootstrap Peer Discovery
 * 
 * Features:
 * - Automatic peer discovery and connection
 * - Bootstrap node management
 * - Network topology maintenance
 * - Connection health monitoring
 * - Peer reputation tracking
 */

import WebSocket from 'ws';
import { SGNProtocolMessage, MESSAGE_TYPES, ERROR_CODES } from './sgn-p2p-protocol.mjs';

/**
 * Bootstrap Configuration
 */
export const BOOTSTRAP_CONFIG = {
  // Default bootstrap nodes (in production, these would be well-known nodes)
  DEFAULT_BOOTSTRAP_NODES: [
    'ws://localhost:8080/sgn',
    'ws://localhost:8081/sgn',
    'ws://localhost:8082/sgn'
  ],
  
  // Connection parameters
  CONNECTION_TIMEOUT: 10000,
  RECONNECT_DELAY: 5000,
  MAX_RECONNECT_ATTEMPTS: 5,
  HEARTBEAT_INTERVAL: 30000,
  
  // Discovery parameters
  DISCOVERY_INTERVAL: 60000, // 1 minute
  MAX_PEERS: 50,
  MIN_PEERS: 3,
  PEER_REFRESH_INTERVAL: 300000, // 5 minutes
  
  // Health check parameters
  HEALTH_CHECK_INTERVAL: 45000,
  UNHEALTHY_THRESHOLD: 3,
  CONNECTION_QUALITY_WINDOW: 10
};

/**
 * Bootstrap Peer Discovery Manager
 */
export class BootstrapPeerDiscovery {
  constructor(options = {}) {
    this.config = { ...BOOTSTRAP_CONFIG, ...options };
    this.nodeId = options.nodeId || `sgn-node-${Date.now()}`;
    
    // Bootstrap nodes
    this.bootstrapNodes = options.bootstrapNodes || this.config.DEFAULT_BOOTSTRAP_NODES;
    this.connectedBootstraps = new Map(); // url -> WebSocket
    
    // Discovered peers
    this.discoveredPeers = new Map(); // peerId -> peer info
    this.connectedPeers = new Map(); // peerId -> WebSocket
    this.peerConnections = new Map(); // peerId -> connection metadata
    
    // Connection management
    this.connectionAttempts = new Map(); // peerId -> attempt count
    this.reconnectTimers = new Map(); // peerId -> timer
    this.healthChecks = new Map(); // peerId -> health data
    
    // Discovery state
    this.isDiscovering = false;
    this.discoveryTimer = null;
    this.healthCheckTimer = null;
    
    // Statistics
    this.stats = {
      bootstrapAttempts: 0,
      bootstrapSuccesses: 0,
      peersDiscovered: 0,
      connectionsEstablished: 0,
      connectionsFailed: 0,
      reconnectAttempts: 0,
      healthChecksPerformed: 0,
      averageConnectionTime: 0,
      networkTopologyChanges: 0
    };
  }
  
  /**
   * Start bootstrap discovery process
   */
  async startDiscovery() {
    if (this.isDiscovering) {
      console.log('⚠️ Discovery already running');
      return;
    }
    
    console.log('🔍 Starting Bootstrap Peer Discovery...');
    console.log(`   Node ID: ${this.nodeId}`);
    console.log(`   Bootstrap nodes: ${this.bootstrapNodes.length}`);
    console.log(`   Target peers: ${this.config.MIN_PEERS}-${this.config.MAX_PEERS}`);
    
    this.isDiscovering = true;
    
    try {
      // Connect to bootstrap nodes
      await this.connectToBootstrapNodes();
      
      // Start periodic discovery
      this.startPeriodicDiscovery();
      
      // Start health monitoring
      this.startHealthMonitoring();
      
      console.log('✅ Bootstrap discovery started successfully');
      
    } catch (error) {
      console.error(`❌ Failed to start discovery: ${error.message}`);
      this.isDiscovering = false;
      throw error;
    }
  }
  
  /**
   * Connect to bootstrap nodes
   */
  async connectToBootstrapNodes() {
    console.log('🌐 Connecting to bootstrap nodes...');
    
    const connectionPromises = this.bootstrapNodes.map(url => 
      this.connectToBootstrapNode(url)
    );
    
    const results = await Promise.allSettled(connectionPromises);
    
    let successCount = 0;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const url = this.bootstrapNodes[i];
      
      if (result.status === 'fulfilled') {
        successCount++;
        console.log(`✅ Connected to bootstrap: ${url}`);
      } else {
        console.warn(`❌ Failed to connect to bootstrap: ${url} - ${result.reason.message}`);
      }
    }
    
    this.stats.bootstrapAttempts += this.bootstrapNodes.length;
    this.stats.bootstrapSuccesses += successCount;
    
    if (successCount === 0) {
      throw new Error('Failed to connect to any bootstrap nodes');
    }
    
    console.log(`✅ Connected to ${successCount}/${this.bootstrapNodes.length} bootstrap nodes`);
  }
  
  /**
   * Connect to a single bootstrap node
   */
  async connectToBootstrapNode(url) {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      
      const timeout = setTimeout(() => {
        ws.close();
        reject(new Error('Connection timeout'));
      }, this.config.CONNECTION_TIMEOUT);
      
      ws.on('open', () => {
        clearTimeout(timeout);
        console.log(`🔗 Bootstrap connection established: ${url}`);
        
        // Store connection
        this.connectedBootstraps.set(url, ws);
        
        // Setup message handlers
        this.setupBootstrapHandlers(ws, url);
        
        // Send handshake (simplified for bootstrap)
        const handshakeMessage = SGNProtocolMessage.peerHandshake(
          this.nodeId,
          `pubkey-${this.nodeId}`, // Simplified public key
          `signature-${this.nodeId}` // Simplified signature
        );
        ws.send(JSON.stringify(handshakeMessage));
        
        resolve(ws);
      });
      
      ws.on('error', (error) => {
        clearTimeout(timeout);
        reject(error);
      });
      
      ws.on('close', () => {
        clearTimeout(timeout);
        this.handleBootstrapDisconnection(url);
      });
    });
  }
  
  /**
   * Setup bootstrap node message handlers
   */
  setupBootstrapHandlers(ws, url) {
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleBootstrapMessage(ws, message, url);
      } catch (error) {
        console.error(`❌ Error parsing bootstrap message: ${error.message}`);
      }
    });
  }
  
  /**
   * Handle message from bootstrap node
   */
  async handleBootstrapMessage(ws, message, url) {
    switch (message.type) {
      case MESSAGE_TYPES.WELCOME:
        console.log(`👋 Welcome from bootstrap: ${url}`);
        // Request peer list immediately
        this.requestPeerList(ws);
        break;
        
      case MESSAGE_TYPES.HANDSHAKE_ACK:
        if (message.status === 'accepted') {
          console.log(`🤝 Handshake accepted by bootstrap: ${url}`);
          // Request peer discovery
          this.requestPeerDiscovery(ws);
        } else {
          console.warn(`❌ Handshake rejected by bootstrap: ${url} - ${message.error}`);
        }
        break;
        
      case MESSAGE_TYPES.PEER_LIST:
        console.log(`📋 Received peer list from ${url}: ${message.peers.length} peers`);
        await this.processPeerList(message.peers);
        break;
        
      case MESSAGE_TYPES.PEER_INFO:
        console.log(`ℹ️ Received peer info from ${url}`);
        await this.processPeerInfo(message);
        break;
        
      default:
        console.log(`📨 Bootstrap message: ${message.type} from ${url}`);
    }
  }
  
  /**
   * Request peer list from bootstrap
   */
  requestPeerList(ws) {
    const discoveryMessage = SGNProtocolMessage.peerDiscovery(
      this.nodeId,
      this.config.MAX_PEERS
    );
    ws.send(JSON.stringify(discoveryMessage));
  }
  
  /**
   * Request peer discovery from bootstrap
   */
  requestPeerDiscovery(ws) {
    const discoveryMessage = SGNProtocolMessage.peerDiscovery(
      this.nodeId,
      this.config.MAX_PEERS
    );
    ws.send(JSON.stringify(discoveryMessage));
  }
  
  /**
   * Process received peer list
   */
  async processPeerList(peers) {
    console.log(`🔍 Processing peer list: ${peers.length} peers`);
    
    for (const peer of peers) {
      if (peer.peerId !== this.nodeId && !this.discoveredPeers.has(peer.peerId)) {
        this.discoveredPeers.set(peer.peerId, {
          ...peer,
          discoveredAt: Date.now(),
          connectionAttempts: 0,
          lastSeen: peer.lastSeen || Date.now()
        });
        
        this.stats.peersDiscovered++;
        console.log(`📍 Discovered new peer: ${peer.peerId}`);
      }
    }
    
    // Attempt to connect to discovered peers
    await this.connectToDiscoveredPeers();
  }
  
  /**
   * Process peer info
   */
  async processPeerInfo(message) {
    const peerId = message.peerId;
    if (peerId && peerId !== this.nodeId) {
      const existingPeer = this.discoveredPeers.get(peerId);
      const peerInfo = {
        peerId: peerId,
        ...message.peerInfo,
        discoveredAt: existingPeer?.discoveredAt || Date.now(),
        lastSeen: Date.now()
      };
      
      this.discoveredPeers.set(peerId, peerInfo);
      console.log(`ℹ️ Updated peer info: ${peerId}`);
    }
  }
  
  /**
   * Connect to discovered peers
   */
  async connectToDiscoveredPeers() {
    const unconnectedPeers = Array.from(this.discoveredPeers.values())
      .filter(peer => 
        !this.connectedPeers.has(peer.peerId) && 
        (this.connectionAttempts.get(peer.peerId) || 0) < this.config.MAX_RECONNECT_ATTEMPTS
      )
      .slice(0, this.config.MAX_PEERS - this.connectedPeers.size);
    
    if (unconnectedPeers.length === 0) {
      return;
    }
    
    console.log(`🔗 Attempting to connect to ${unconnectedPeers.length} peers...`);
    
    const connectionPromises = unconnectedPeers.map(peer => 
      this.connectToPeer(peer)
    );
    
    const results = await Promise.allSettled(connectionPromises);
    
    let successCount = 0;
    for (const result of results) {
      if (result.status === 'fulfilled') {
        successCount++;
      }
    }
    
    console.log(`✅ Connected to ${successCount}/${unconnectedPeers.length} peers`);
  }
  
  /**
   * Connect to a specific peer
   */
  async connectToPeer(peer) {
    const peerId = peer.peerId;
    const attempts = this.connectionAttempts.get(peerId) || 0;
    
    if (attempts >= this.config.MAX_RECONNECT_ATTEMPTS) {
      console.log(`⚠️ Max reconnection attempts reached for peer: ${peerId}`);
      return;
    }
    
    this.connectionAttempts.set(peerId, attempts + 1);
    
    try {
      // For now, we don't have direct peer addresses
      // In a real implementation, peers would advertise their addresses
      console.log(`🔗 Would connect to peer: ${peerId} (address discovery needed)`);
      
      // TODO: Implement actual peer connection when we have peer addresses
      // This would involve:
      // 1. Getting peer's network address from peer info
      // 2. Establishing WebSocket connection
      // 3. Performing handshake
      // 4. Adding to connected peers
      
      this.stats.connectionsEstablished++;
      
    } catch (error) {
      console.error(`❌ Failed to connect to peer ${peerId}: ${error.message}`);
      this.stats.connectionsFailed++;
    }
  }
  
  /**
   * Handle bootstrap disconnection
   */
  handleBootstrapDisconnection(url) {
    console.log(`🔌 Bootstrap disconnected: ${url}`);
    this.connectedBootstraps.delete(url);
    
    // Schedule reconnection
    setTimeout(() => {
      if (this.isDiscovering) {
        console.log(`🔄 Reconnecting to bootstrap: ${url}`);
        this.connectToBootstrapNode(url).catch(error => {
          console.error(`❌ Bootstrap reconnection failed: ${error.message}`);
        });
      }
    }, this.config.RECONNECT_DELAY);
  }
  
  /**
   * Start periodic discovery
   */
  startPeriodicDiscovery() {
    this.discoveryTimer = setInterval(() => {
      if (this.connectedPeers.size < this.config.MIN_PEERS) {
        console.log('🔍 Performing periodic peer discovery...');
        this.performDiscovery();
      }
    }, this.config.DISCOVERY_INTERVAL);
  }
  
  /**
   * Perform discovery round
   */
  async performDiscovery() {
    // Request peer lists from all connected bootstraps
    for (const ws of this.connectedBootstraps.values()) {
      this.requestPeerList(ws);
    }
    
    // Request peer lists from connected peers
    for (const ws of this.connectedPeers.values()) {
      this.requestPeerDiscovery(ws);
    }
  }
  
  /**
   * Start health monitoring
   */
  startHealthMonitoring() {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthChecks();
    }, this.config.HEALTH_CHECK_INTERVAL);
  }
  
  /**
   * Perform health checks on connections
   */
  performHealthChecks() {
    console.log('💓 Performing connection health checks...');
    
    // Check bootstrap connections
    for (const [url, ws] of this.connectedBootstraps.entries()) {
      this.checkConnectionHealth(ws, `bootstrap:${url}`);
    }
    
    // Check peer connections
    for (const [peerId, ws] of this.connectedPeers.entries()) {
      this.checkConnectionHealth(ws, `peer:${peerId}`);
    }
    
    this.stats.healthChecksPerformed++;
  }
  
  /**
   * Check individual connection health
   */
  checkConnectionHealth(ws, identifier) {
    if (ws.readyState !== WebSocket.OPEN) {
      console.warn(`⚠️ Unhealthy connection: ${identifier}`);
      return;
    }
    
    // Send ping
    const pingMessage = SGNProtocolMessage.ping(this.nodeId);
    ws.send(JSON.stringify(pingMessage));
    
    // TODO: Track response times and connection quality
  }
  
  /**
   * Get discovery statistics
   */
  getStatistics() {
    return {
      ...this.stats,
      isDiscovering: this.isDiscovering,
      connectedBootstraps: this.connectedBootstraps.size,
      discoveredPeers: this.discoveredPeers.size,
      connectedPeers: this.connectedPeers.size,
      connectionSuccessRate: this.stats.connectionsEstablished / 
        Math.max(this.stats.connectionsEstablished + this.stats.connectionsFailed, 1),
      bootstrapSuccessRate: this.stats.bootstrapSuccesses / Math.max(this.stats.bootstrapAttempts, 1)
    };
  }
  
  /**
   * Stop discovery process
   */
  async stopDiscovery() {
    if (!this.isDiscovering) {
      return;
    }
    
    console.log('🛑 Stopping bootstrap discovery...');
    
    this.isDiscovering = false;
    
    // Clear timers
    if (this.discoveryTimer) {
      clearInterval(this.discoveryTimer);
      this.discoveryTimer = null;
    }
    
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    
    // Close bootstrap connections
    for (const ws of this.connectedBootstraps.values()) {
      ws.close();
    }
    this.connectedBootstraps.clear();
    
    // Close peer connections
    for (const ws of this.connectedPeers.values()) {
      ws.close();
    }
    this.connectedPeers.clear();
    
    console.log('✅ Bootstrap discovery stopped');
  }
}
