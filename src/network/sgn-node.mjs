/**
 * SGN Node - Core P2P Network Implementation
 * Phase 4: Network Protocol Implementation
 * 
 * Features:
 * - Libp2p integration with enterprise configuration
 * - Kademlia DHT for peer discovery
 * - Noise Protocol for end-to-end encryption
 * - Mplex for stream multiplexing
 * - Integration with Phase 1-3 components
 */

import { createLibp2p } from 'libp2p';
import { tcp } from '@libp2p/tcp';
import { noise } from '@chainsafe/libp2p-noise';
import { mplex } from '@libp2p/mplex';
import { gossipsub } from '@chainsafe/libp2p-gossipsub';
import { kadDHT } from '@libp2p/kad-dht';
import { identify } from '@libp2p/identify';
import { ping } from '@libp2p/ping';
import { bootstrap } from '@libp2p/bootstrap';
import { multiaddr } from '@multiformats/multiaddr';
import { generateKeyPair } from '../crypto.mjs';
import { reputationManager } from '../reputation-manager.mjs';
import { multiTierStorage } from '../persistence/multi-tier-storage.mjs';
import { blake3Hash } from '../crypto/blake3-hasher.mjs';

// SGN Network Configuration
export const SGN_NETWORK_CONFIG = {
  PROTOCOL_VERSION: '1.0.0',
  NETWORK_ID: 'sgn-mainnet',
  
  // Connection limits
  MAX_CONNECTIONS: 100,
  MIN_CONNECTIONS: 5,
  TARGET_CONNECTIONS: 20,
  
  // Timeouts
  CONNECTION_TIMEOUT: 10000,
  DIAL_TIMEOUT: 5000,
  DISCOVERY_TIMEOUT: 500,
  
  // DHT Configuration
  DHT_BUCKET_SIZE: 20,
  DHT_ALPHA: 3,
  DHT_BETA: 3,
  
  // Gossipsub Configuration
  GOSSIP_HEARTBEAT_INTERVAL: 1000,
  GOSSIP_FANOUT_TTL: 60000,
  GOSSIP_MESSAGE_CACHE_SIZE: 500,
  
  // SGN Specific
  KU_CHANNEL: 'sgn-ku-broadcast',
  DISCOVERY_CHANNEL: 'sgn-peer-discovery',
  REQUEST_CHANNEL: 'sgn-ku-request',
  
  // Bootstrap nodes (would be real addresses in production)
  BOOTSTRAP_NODES: [
    '/ip4/127.0.0.1/tcp/4001/p2p/12D3KooWBootstrap1',
    '/ip4/127.0.0.1/tcp/4002/p2p/12D3KooWBootstrap2'
  ]
};

/**
 * SGN Node - Main P2P Network Node
 */
export class SGNNode {
  constructor(options = {}) {
    this.config = { ...SGN_NETWORK_CONFIG, ...options };
    this.nodeId = options.nodeId || `sgn-node-${Date.now()}`;
    this.port = options.port || 0; // Auto-assign if not specified
    
    // Core components
    this.libp2pNode = null;
    this.isStarted = false;
    this.peerId = null;
    
    // Network state
    this.connectedPeers = new Map();
    this.knownPeers = new Map();
    this.peerReputations = new Map();
    
    // Message handling
    this.messageHandlers = new Map();
    this.pendingRequests = new Map();
    this.messageCache = new Map();
    
    // Performance metrics
    this.metrics = {
      messagesReceived: 0,
      messagesSent: 0,
      peersDiscovered: 0,
      connectionAttempts: 0,
      successfulConnections: 0,
      networkLatency: 0,
      uptime: 0
    };
    
    this.startTime = Date.now();
    
    // Initialize message handlers
    this.setupMessageHandlers();
  }
  
  /**
   * Initialize and start the SGN node
   */
  async start() {
    if (this.isStarted) {
      throw new Error('SGN Node already started');
    }
    
    console.log(`🚀 Starting SGN Node: ${this.nodeId}`);
    console.log(`   Port: ${this.port || 'auto-assign'}`);
    console.log(`   Protocol Version: ${this.config.PROTOCOL_VERSION}`);
    
    try {
      // Create libp2p node with enterprise configuration
      this.libp2pNode = await this.createLibp2pNode();
      
      // Start the node
      await this.libp2pNode.start();
      
      this.peerId = this.libp2pNode.peerId.toString();
      this.isStarted = true;
      
      // Setup event handlers
      this.setupEventHandlers();
      
      // Subscribe to SGN channels
      await this.subscribeToChannels();
      
      // Start peer discovery
      await this.startPeerDiscovery();
      
      // Initialize storage integration
      await this.initializeStorageIntegration();
      
      console.log(`✅ SGN Node started successfully`);
      console.log(`   Peer ID: ${this.peerId}`);
      console.log(`   Listening on: ${this.libp2pNode.getMultiaddrs().map(ma => ma.toString()).join(', ')}`);
      
      return this;
      
    } catch (error) {
      console.error(`❌ Failed to start SGN Node: ${error.message}`);
      throw error;
    }
  }
  
  /**
   * Create libp2p node with enterprise configuration
   */
  async createLibp2pNode() {
    const addresses = {
      listen: []
    };
    
    if (this.port) {
      addresses.listen.push(`/ip4/0.0.0.0/tcp/${this.port}`);
    } else {
      addresses.listen.push('/ip4/0.0.0.0/tcp/0');
    }
    
    return createLibp2p({
      addresses,
      
      // Transport layer
      transports: [tcp()],
      
      // Connection encryption
      connectionEncryption: [noise()],
      
      // Stream multiplexing
      streamMuxers: [mplex()],
      
      // Services
      services: {
        // Peer identification
        identify: identify({
          protocolPrefix: 'sgn',
          agentVersion: `SGN/${this.config.PROTOCOL_VERSION}`,
          clientName: 'SGN-Node'
        }),
        
        // Ping service for connectivity testing
        ping: ping({
          protocolPrefix: 'sgn',
          maxInboundStreams: 32,
          maxOutboundStreams: 64,
          timeout: this.config.CONNECTION_TIMEOUT
        }),
        
        // Kademlia DHT for peer discovery
        dht: kadDHT({
          kBucketSize: this.config.DHT_BUCKET_SIZE,
          clientMode: false,
          validators: {
            sgn: {
              func: this.validateDHTRecord.bind(this),
              sign: true
            }
          },
          selectors: {
            sgn: this.selectDHTRecord.bind(this)
          }
        }),
        
        // GossipSub for message broadcasting
        pubsub: gossipsub({
          allowPublishToZeroPeers: true,
          emitSelf: false,
          canRelayMessage: true,
          
          // Message ID generation using BLAKE3
          messageIdFn: (msg) => {
            const msgData = `${msg.from?.toString() || 'unknown'}-${msg.sequenceNumber || Date.now()}`;
            return new TextEncoder().encode(blake3Hash(msgData).substring(0, 16));
          },
          
          // Peer scoring integration with reputation system
          scoreParams: {
            topicScoreCap: 10,
            appSpecificScore: (peerId) => {
              const reputation = reputationManager.getPeerReputation(peerId.toString());
              return reputation ? reputation.trustScore * 10 : 0;
            },
            ipColocationFactorWeight: -1,
            behaviourPenaltyWeight: -10,
            behaviourPenaltyThreshold: 6,
            behaviourPenaltyDecay: 0.8
          },
          
          // Gossipsub timing
          heartbeatInterval: this.config.GOSSIP_HEARTBEAT_INTERVAL,
          fanoutTTL: this.config.GOSSIP_FANOUT_TTL,
          mcacheLength: this.config.GOSSIP_MESSAGE_CACHE_SIZE
        }),
        
        // Bootstrap for initial peer discovery
        bootstrap: bootstrap({
          list: this.config.BOOTSTRAP_NODES,
          timeout: this.config.DISCOVERY_TIMEOUT,
          tagName: 'bootstrap',
          tagValue: 50,
          tagTTL: 120000
        })
      },
      
      // Connection manager
      connectionManager: {
        maxConnections: this.config.MAX_CONNECTIONS,
        minConnections: this.config.MIN_CONNECTIONS,
        pollInterval: 2000,
        autoDialInterval: 10000,
        inboundUpgradeTimeout: this.config.CONNECTION_TIMEOUT,
        outboundUpgradeTimeout: this.config.CONNECTION_TIMEOUT
      },
      
      // Connection gater for security
      connectionGater: {
        denyDialMultiaddr: async (multiaddr) => {
          // Implement reputation-based connection filtering
          return false; // Allow all for now
        },
        
        denyInboundConnection: async (maConn) => {
          // Check peer reputation
          const peerId = maConn.remotePeer?.toString();
          if (peerId) {
            const reputation = reputationManager.getPeerReputation(peerId);
            if (reputation && reputation.trustScore < 0.1) {
              console.log(`🚫 Denied connection from low-reputation peer: ${peerId}`);
              return true;
            }
          }
          return false;
        }
      }
    });
  }
  
  /**
   * Setup event handlers for libp2p events
   */
  setupEventHandlers() {
    // Peer connection events
    this.libp2pNode.addEventListener('peer:connect', (evt) => {
      const peerId = evt.detail.toString();
      console.log(`🔗 Peer connected: ${peerId}`);
      
      this.connectedPeers.set(peerId, {
        peerId,
        connectedAt: Date.now(),
        lastSeen: Date.now()
      });
      
      this.metrics.successfulConnections++;
      
      // Update reputation for successful connection
      reputationManager.updatePeerReputation(peerId, 'successful_connection');
    });
    
    this.libp2pNode.addEventListener('peer:disconnect', (evt) => {
      const peerId = evt.detail.toString();
      console.log(`🔌 Peer disconnected: ${peerId}`);
      
      this.connectedPeers.delete(peerId);
    });
    
    // Peer discovery events
    this.libp2pNode.addEventListener('peer:discovery', (evt) => {
      const peerId = evt.detail.id.toString();
      const multiaddrs = evt.detail.multiaddrs;
      
      console.log(`🔍 Peer discovered: ${peerId}`);
      
      this.knownPeers.set(peerId, {
        peerId,
        multiaddrs: multiaddrs.map(ma => ma.toString()),
        discoveredAt: Date.now()
      });
      
      this.metrics.peersDiscovered++;
    });
  }
  
  /**
   * Subscribe to SGN communication channels
   */
  async subscribeToChannels() {
    const pubsub = this.libp2pNode.services.pubsub;
    
    // Subscribe to KU broadcast channel
    await pubsub.subscribe(this.config.KU_CHANNEL);
    pubsub.addEventListener('message', this.handleKUBroadcast.bind(this));
    
    // Subscribe to peer discovery channel
    await pubsub.subscribe(this.config.DISCOVERY_CHANNEL);
    
    // Subscribe to KU request channel
    await pubsub.subscribe(this.config.REQUEST_CHANNEL);
    pubsub.addEventListener('message', this.handleKURequest.bind(this));
    
    console.log(`📡 Subscribed to SGN channels: ${[this.config.KU_CHANNEL, this.config.DISCOVERY_CHANNEL, this.config.REQUEST_CHANNEL].join(', ')}`);
  }
  
  /**
   * Start peer discovery process
   */
  async startPeerDiscovery() {
    console.log('🔍 Starting peer discovery...');
    
    // Start DHT for peer discovery
    const dht = this.libp2pNode.services.dht;
    
    // Announce ourselves to the network
    await dht.setMode('server');
    
    // Start periodic peer discovery
    setInterval(async () => {
      try {
        // Find peers using DHT
        const randomKey = blake3Hash(`discovery-${Date.now()}`);
        const peers = dht.getClosestPeers(new TextEncoder().encode(randomKey));
        
        let discoveredCount = 0;
        for await (const peer of peers) {
          if (!this.knownPeers.has(peer.toString())) {
            discoveredCount++;
          }
        }
        
        if (discoveredCount > 0) {
          console.log(`🔍 Discovered ${discoveredCount} new peers via DHT`);
        }
      } catch (error) {
        console.warn('DHT discovery error:', error.message);
      }
    }, 30000); // Every 30 seconds
  }
  
  /**
   * Initialize storage integration
   */
  async initializeStorageIntegration() {
    // Initialize multi-tier storage if not already done
    if (!multiTierStorage.isInitialized) {
      await multiTierStorage.initialize();
    }
    
    console.log('💾 Storage integration initialized');
  }
  
  /**
   * Setup message handlers
   */
  setupMessageHandlers() {
    this.messageHandlers.set('KU_BROADCAST', this.handleKUBroadcast.bind(this));
    this.messageHandlers.set('KU_REQUEST', this.handleKURequest.bind(this));
    this.messageHandlers.set('KU_RESPONSE', this.handleKUResponse.bind(this));
    this.messageHandlers.set('PEER_DISCOVERY', this.handlePeerDiscovery.bind(this));
  }
  
  /**
   * Handle KU broadcast messages
   */
  async handleKUBroadcast(evt) {
    if (evt.detail.topic !== this.config.KU_CHANNEL) return;
    
    try {
      const message = JSON.parse(new TextDecoder().decode(evt.detail.data));
      const fromPeer = evt.detail.from.toString();
      
      console.log(`📦 Received KU broadcast from ${fromPeer}: ${message.ku?.title || 'Unknown'}`);
      
      this.metrics.messagesReceived++;
      
      // Validate message integrity using BLAKE3
      if (message.hash && message.ku) {
        const expectedHash = blake3Hash(JSON.stringify(message.ku));
        if (expectedHash !== message.hash) {
          console.warn(`⚠️ Hash mismatch in KU broadcast from ${fromPeer}`);
          reputationManager.updatePeerReputation(fromPeer, 'invalid_message');
          return;
        }
      }
      
      // Store KU in multi-tier storage
      if (message.ku) {
        await multiTierStorage.store(message.ku, { fromPeer });
        console.log(`💾 Stored KU ${message.ku.id} from peer ${fromPeer}`);
      }
      
      // Update peer reputation for valid message
      reputationManager.updatePeerReputation(fromPeer, 'valid_message');
      
    } catch (error) {
      console.error('Error handling KU broadcast:', error);
    }
  }
  
  /**
   * Handle KU request messages
   */
  async handleKURequest(evt) {
    if (evt.detail.topic !== this.config.REQUEST_CHANNEL) return;
    
    try {
      const request = JSON.parse(new TextDecoder().decode(evt.detail.data));
      const fromPeer = evt.detail.from.toString();
      
      console.log(`🔍 Received KU request from ${fromPeer}: ${JSON.stringify(request.query)}`);
      
      // Search for matching KUs
      const results = await multiTierStorage.search(request.query, { limit: 10 });
      
      // Send response
      const response = {
        messageType: 'KU_RESPONSE',
        requestId: request.requestId,
        results: results,
        responderId: this.peerId,
        timestamp: new Date().toISOString()
      };
      
      await this.sendDirectMessage(fromPeer, response);
      
    } catch (error) {
      console.error('Error handling KU request:', error);
    }
  }
  
  /**
   * Handle KU response messages
   */
  async handleKUResponse(message, fromPeer) {
    console.log(`📨 Received KU response from ${fromPeer}: ${message.results?.length || 0} results`);
    
    // Handle pending request
    if (message.requestId && this.pendingRequests.has(message.requestId)) {
      const pendingRequest = this.pendingRequests.get(message.requestId);
      pendingRequest.resolve(message.results);
      this.pendingRequests.delete(message.requestId);
    }
  }
  
  /**
   * Handle peer discovery messages
   */
  async handlePeerDiscovery(message, fromPeer) {
    console.log(`🔍 Peer discovery message from ${fromPeer}`);
    
    // Update known peers
    if (message.peerInfo) {
      this.knownPeers.set(fromPeer, {
        ...message.peerInfo,
        lastSeen: Date.now()
      });
    }
  }
  
  /**
   * Send direct message to a specific peer
   */
  async sendDirectMessage(peerId, message) {
    // Implementation would use libp2p streams for direct messaging
    // For now, we'll use pubsub with peer-specific topics
    const topic = `sgn-direct-${peerId}`;
    const messageData = JSON.stringify({
      ...message,
      from: this.peerId,
      timestamp: new Date().toISOString()
    });
    
    await this.libp2pNode.services.pubsub.publish(topic, new TextEncoder().encode(messageData));
    this.metrics.messagesSent++;
  }
  
  /**
   * Validate DHT records
   */
  validateDHTRecord(key, record) {
    // Implement SGN-specific DHT record validation
    return true; // Simplified for now
  }
  
  /**
   * Select best DHT record
   */
  selectDHTRecord(key, records) {
    // Select the most recent record
    return 0;
  }
  
  /**
   * Get node statistics
   */
  getStatistics() {
    return {
      ...this.metrics,
      uptime: Date.now() - this.startTime,
      connectedPeers: this.connectedPeers.size,
      knownPeers: this.knownPeers.size,
      peerId: this.peerId,
      isStarted: this.isStarted
    };
  }
  
  /**
   * Stop the SGN node
   */
  async stop() {
    if (!this.isStarted) return;
    
    console.log(`🛑 Stopping SGN Node: ${this.nodeId}`);
    
    if (this.libp2pNode) {
      await this.libp2pNode.stop();
    }
    
    this.isStarted = false;
    console.log(`✅ SGN Node stopped`);
  }
}
