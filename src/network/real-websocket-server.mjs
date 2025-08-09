/**
 * Real WebSocket Server Implementation
 * Phase 3: Network Protocol Implementation
 *
 * This creates an ACTUAL WebSocket server that:
 * - Binds to a real port
 * - Accepts real TCP connections
 * - Handles real WebSocket protocol
 * - Manages real peer connections
 */

import { WebSocketServer } from 'ws';
import { createServer } from 'http';
import {
  SGNProtocolMessage,
  SGNProtocolValidator,
  SGNProtocolStats,
  MESSAGE_TYPES,
  ERROR_CODES
} from './sgn-p2p-protocol.mjs';

/**
 * Real SGN WebSocket Server
 * Handles actual P2P connections
 */
export class RealSGNWebSocketServer {
  constructor(options = {}) {
    this.config = {
      port: options.port || 8080,
      host: options.host || '0.0.0.0',
      nodeId: options.nodeId || `sgn-node-${Date.now()}`,
      maxConnections: options.maxConnections || 100,
      heartbeatInterval: options.heartbeatInterval || 30000,
      connectionTimeout: options.connectionTimeout || 10000
    };

    // Server instances
    this.httpServer = null;
    this.wsServer = null;
    this.isRunning = false;

    // Connection management
    this.connectedPeers = new Map(); // peerId -> WebSocket
    this.peerInfo = new Map(); // peerId -> peer metadata
    this.connectionAttempts = new Map(); // peerId -> attempt count

    // Message handling
    this.messageHandlers = new Map();
    this.pendingRequests = new Map(); // requestId -> { resolve, reject, timeout }


    // Outbox for messages when no peers are connected
    this.outbox = [];
    this.outboxFlushInProgress = false;
    this.outboxRateLimitMs = 25; // simple rate-limit for flush

    // Statistics
    this.stats = {
      connectionsAccepted: 0,
      connectionsRejected: 0,
      messagesReceived: 0,
      messagesSent: 0,
      bytesReceived: 0,
      bytesSent: 0,
      uptime: 0,
      startTime: null
    };

    // Protocol statistics
    this.protocolStats = new SGNProtocolStats();

    // Distributed storage integration
    this.distributedStorage = options.distributedStorage || null;
  }

  /**
   * Start the WebSocket server
   */
  async start() {
    if (this.isRunning) {
      throw new Error('Server is already running');
    }

    console.log(`🌐 Starting Real SGN WebSocket Server...`);
    console.log(`   Node ID: ${this.config.nodeId}`);
    console.log(`   Port: ${this.config.port}`);
    console.log(`   Host: ${this.config.host}`);

    try {
      // Create HTTP server
      this.httpServer = createServer();

      // Create WebSocket server
      this.wsServer = new WebSocketServer({
        server: this.httpServer,
        path: '/sgn',
        maxPayload: 1024 * 1024, // 1MB max message size
      });

      // Setup event handlers
      this.setupEventHandlers();

      // Start listening
      await new Promise((resolve, reject) => {
        this.httpServer.listen(this.config.port, this.config.host, (error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });

      this.isRunning = true;
      this.stats.startTime = Date.now();

      // Start heartbeat
      this.startHeartbeat();

      console.log(`✅ Real SGN WebSocket Server started successfully`);
      console.log(`   Listening on: ws://${this.config.host}:${this.config.port}/sgn`);
      console.log(`   Max connections: ${this.config.maxConnections}`);

      return true;

    } catch (error) {
      console.error(`❌ Failed to start WebSocket server: ${error.message}`);
      throw error;
    }
  }

  /**
   * Setup WebSocket event handlers
   */
  setupEventHandlers() {
    this.wsServer.on('connection', (ws, request) => {
      this.handleNewConnection(ws, request);
    });

    this.wsServer.on('error', (error) => {
      console.error(`❌ WebSocket server error: ${error.message}`);
    });

    this.wsServer.on('close', () => {
      console.log('🔌 WebSocket server closed');
    });
  }

  /**
   * Handle new WebSocket connection
   */
  async handleNewConnection(ws, request) {
    const clientIP = request.socket.remoteAddress;
    const connectionId = `conn-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    console.log(`🔗 New connection from ${clientIP} (${connectionId})`);

    // Check connection limits
    if (this.connectedPeers.size >= this.config.maxConnections) {
      console.log(`❌ Connection rejected: max connections reached (${this.config.maxConnections})`);
      ws.close(1013, 'Server overloaded');
      this.stats.connectionsRejected++;
      return;
    }

    // Setup connection metadata
    ws.connectionId = connectionId;
    ws.connectedAt = Date.now();
    ws.lastPing = Date.now();
    ws.isAlive = true;

    // Setup message handlers
    ws.on('message', (data) => {
      this.handleMessage(ws, data);
    });

    ws.on('close', (code, reason) => {
      this.handleConnectionClose(ws, code, reason);
    });

    ws.on('error', (error) => {
      console.error(`❌ WebSocket connection error: ${error.message}`);
    });

    ws.on('pong', () => {
      ws.isAlive = true;
      ws.lastPing = Date.now();
    });

    // Send welcome message using protocol
    const welcomeMessage = SGNProtocolMessage.welcome(
      this.config.nodeId,
      ['ku-request', 'ku-response', 'peer-discovery', 'ku-broadcast']
    );
    this.sendMessage(ws, welcomeMessage);

    // On new connection, attempt to flush any queued messages
    this.flushOutbox();

    this.stats.connectionsAccepted++;
    console.log(`✅ Connection established: ${connectionId}`);
  }

  /**
   * Handle incoming message
   */
  async handleMessage(ws, data) {
    try {
      this.stats.messagesReceived++;
      this.stats.bytesReceived += data.length;

      const message = JSON.parse(data.toString());

      // Validate message using protocol
      const validation = SGNProtocolValidator.validateMessage(message);
      if (!validation.valid) {
        console.warn(`⚠️ Invalid message: ${validation.errors.join(', ')}`);
        const errorMessage = SGNProtocolMessage.error(
          ERROR_CODES.INVALID_MESSAGE,
          validation.errors.join(', '),
          message
        );
        this.sendMessage(ws, errorMessage);
        this.protocolStats.recordError(ERROR_CODES.INVALID_MESSAGE, validation.errors.join(', '));
        return;
      }

      // Check message expiration
      if (SGNProtocolValidator.isMessageExpired(message)) {
        console.warn(`⚠️ Expired message: ${message.type}`);
        return;
      }

      // Record protocol statistics
      this.protocolStats.recordReceived(message, data.length);

      console.log(`📨 Received message: ${message.type} from ${ws.connectionId}`);

      // Handle different message types
      switch (message.type) {
        case MESSAGE_TYPES.PEER_HANDSHAKE:
          await this.handlePeerHandshake(ws, message);
          break;

        case MESSAGE_TYPES.KU_REQUEST:
          await this.handleKURequest(ws, message);
          break;

        case MESSAGE_TYPES.KU_RESPONSE:
          await this.handleKUResponse(ws, message);
          break;

        case MESSAGE_TYPES.KU_BROADCAST:
          await this.handleKUBroadcast(ws, message);
          break;

        case MESSAGE_TYPES.PING:
          const pongMessage = SGNProtocolMessage.pong(this.config.nodeId, message.timestamp);
          this.sendMessage(ws, pongMessage);
          break;

        case MESSAGE_TYPES.PEER_DISCOVERY:
          await this.handlePeerDiscovery(ws, message);
          break;

        default:
          console.warn(`⚠️ Unknown message type: ${message.type}`);
          const errorMessage = SGNProtocolMessage.error(
            ERROR_CODES.INVALID_MESSAGE,
            `Unknown message type: ${message.type}`,
            message
          );
          this.sendMessage(ws, errorMessage);
          this.protocolStats.recordError(ERROR_CODES.INVALID_MESSAGE, `Unknown message type: ${message.type}`);
      }

    } catch (error) {
      console.error(`❌ Error handling message: ${error.message}`);
      const errorMessage = SGNProtocolMessage.error(
        ERROR_CODES.INTERNAL_ERROR,
        'Invalid message format'
      );
      this.sendMessage(ws, errorMessage);
      this.protocolStats.recordError(ERROR_CODES.INTERNAL_ERROR, error.message);
    }
  }

  /**
   * Handle peer handshake
   */
  async handlePeerHandshake(ws, message) {
    try {
      const { peerId, publicKey, signature, timestamp } = message;

      // Verify peer identity (simplified)
      if (!peerId || !publicKey) {
        throw new Error('Invalid handshake: missing peer credentials');
      }

      // Store peer info
      ws.peerId = peerId;
      this.connectedPeers.set(peerId, ws);
      this.peerInfo.set(peerId, {
        peerId,
        publicKey,
        connectedAt: Date.now(),
        lastSeen: Date.now(),
        messageCount: 0
      });
      // After successful peer registration, flush queued messages
      await this.flushOutbox();

      // Register with distributed storage
      if (this.distributedStorage) {
        this.distributedStorage.registerNetworkConnection(peerId, ws);
      }

      console.log(`🤝 Peer handshake completed: ${peerId}`);

      // Send handshake response using protocol
      const ackMessage = SGNProtocolMessage.handshakeAck(this.config.nodeId, 'accepted');
      this.sendMessage(ws, ackMessage);

    } catch (error) {
      console.error(`❌ Handshake failed: ${error.message}`);
      const ackMessage = SGNProtocolMessage.handshakeAck(this.config.nodeId, 'rejected', error.message);
      this.sendMessage(ws, ackMessage);
      this.protocolStats.recordError(ERROR_CODES.AUTHENTICATION_FAILED, error.message);
    }
  }

  /**
   * Handle KU request
   */
  async handleKURequest(ws, message) {
    console.log(`🔍 KU request from ${ws.peerId || ws.connectionId}: ${JSON.stringify(message.query)}`);

    try {
      // Use distributed storage if available
      if (this.distributedStorage) {
        await this.distributedStorage.handleKURequest(
          message.requestId,
          message.query,
          message.requesterPeerId
        );
      } else {
        // Fallback: send empty response
        const responseMessage = SGNProtocolMessage.kuResponse(
          message.requestId,
          [], // Empty results
          this.config.nodeId
        );
        this.sendMessage(ws, responseMessage);
      }
    } catch (error) {
      console.error(`❌ Error handling KU request: ${error.message}`);
      const errorMessage = SGNProtocolMessage.error(
        ERROR_CODES.INTERNAL_ERROR,
        'Failed to process KU request'
      );
      this.sendMessage(ws, errorMessage);
    }
  }

  /**
   * Handle KU response
   */
  async handleKUResponse(ws, message) {
    console.log(`📦 KU response from ${ws.peerId || ws.connectionId}: ${message.results?.length || 0} results`);

    try {
      // Use distributed storage if available
      if (this.distributedStorage) {
        this.distributedStorage.handleKUResponse(
          message.requestId,
          message.results,
          message.responderPeerId
        );
      } else {
        // Fallback: handle pending request resolution
        if (message.requestId && this.pendingRequests.has(message.requestId)) {
          const pending = this.pendingRequests.get(message.requestId);
          clearTimeout(pending.timeout);
          pending.resolve(message.results);
          this.pendingRequests.delete(message.requestId);
        }
      }
    } catch (error) {
      console.error(`❌ Error handling KU response: ${error.message}`);
    }
  }

  /**
   * Handle KU broadcast
   */
  async handleKUBroadcast(ws, message) {
    console.log(`📡 KU broadcast from ${ws.peerId || ws.connectionId}: ${message.ku.title}`);

    try {
      // Use distributed storage if available
      if (this.distributedStorage) {
        await this.distributedStorage.handleKUBroadcast(
          message.ku,
          message.broadcasterPeerId
        );
      } else {
        // Fallback: just log the broadcast
        console.log(`   KU ID: ${message.ku.id}`);
        console.log(`   KU Type: ${message.ku.type}`);
        console.log(`   KU Severity: ${message.ku.severity}`);
      }
    } catch (error) {
      console.error(`❌ Error handling KU broadcast: ${error.message}`);
    }
  }

  /**
   * Handle peer discovery
   */
  async handlePeerDiscovery(ws, message) {
    console.log(`🔍 Peer discovery request from ${ws.peerId || ws.connectionId}`);

    // Send list of known peers (excluding requester)
    const knownPeers = Array.from(this.peerInfo.values())
      .filter(peer => peer.peerId !== ws.peerId)
      .map(peer => ({
        peerId: peer.peerId,
        lastSeen: peer.lastSeen
      }));

    const peerListMessage = SGNProtocolMessage.peerList(knownPeers, this.config.nodeId);
    this.sendMessage(ws, peerListMessage);
  }

  /**
   * Handle connection close
   */
  handleConnectionClose(ws, code, reason) {
    console.log(`🔌 Connection closed: ${ws.connectionId} (code: ${code}, reason: ${reason})`);

    // Clean up peer info
    if (ws.peerId) {
      this.connectedPeers.delete(ws.peerId);
      this.peerInfo.delete(ws.peerId);

      // Unregister from distributed storage

      if (this.distributedStorage) {
        this.distributedStorage.unregisterNetworkConnection(ws.peerId);
      }

      console.log(`👋 Peer disconnected: ${ws.peerId}`);

    // Try to flush outbox in case peers remain
    this.flushOutbox();

    }
  }

  /**
   * Send message to WebSocket
   */
  sendMessage(ws, message) {
    try {
      if (ws.readyState === ws.OPEN) {
        const data = JSON.stringify(message);
        ws.send(data);
        this.stats.messagesSent++;
        this.stats.bytesSent += data.length;
        this.protocolStats.recordSent(message, data.length);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`❌ Error sending message: ${error.message}`);
      return false;
    }
  }

  publishOrEnqueue(message) {
    if (this.connectedPeers.size === 0) {
      this.outbox.push(message);
      console.log(`📬 Outbox queued message type=${message.type} (no peers)`);
      return 0;
    }
    return this.broadcast(message);
  }

  async flushOutbox() {
    if (this.outboxFlushInProgress || this.outbox.length === 0) return;
    this.outboxFlushInProgress = true;
    try {
      while (this.outbox.length && this.connectedPeers.size) {
        const msg = this.outbox.shift();
        this.broadcast(msg);
        await new Promise((r) => setTimeout(r, this.outboxRateLimitMs));
      }
    } finally {
      this.outboxFlushInProgress = false;
    }
  }

  /**
   * Broadcast message to all connected peers
   */
  broadcast(message, excludePeerId = null) {
    let sentCount = 0;

    for (const [peerId, ws] of this.connectedPeers.entries()) {
      if (peerId !== excludePeerId) {
        if (this.sendMessage(ws, message)) {
          sentCount++;
        }
      }
    }

    console.log(`📡 Broadcast sent to ${sentCount} peers`);
    return sentCount;
  }

  /**
   * Start heartbeat to check connection health
   */
  startHeartbeat() {
    setInterval(() => {
      for (const [peerId, ws] of this.connectedPeers.entries()) {
        if (!ws.isAlive) {
          console.log(`💔 Terminating dead connection: ${peerId}`);
          ws.terminate();
          this.connectedPeers.delete(peerId);
          this.peerInfo.delete(peerId);
        } else {
          ws.isAlive = false;
          ws.ping();
        }
      }
    }, this.config.heartbeatInterval);
  }

  /**
   * Get server statistics
   */
  getStatistics() {
    const protocolStats = this.protocolStats.getStatistics();

    return {
      ...this.stats,
      uptime: this.stats.startTime ? Date.now() - this.stats.startTime : 0,
      connectedPeers: this.connectedPeers.size,
      isRunning: this.isRunning,
      port: this.config.port,
      host: this.config.host,
      protocol: {
        version: SGNProtocolMessage.version || '1.0.0',
        ...protocolStats
      }
    };
  }

  /**
   * Stop the WebSocket server
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    console.log('🛑 Stopping SGN WebSocket Server...');

    // Close all connections
    for (const ws of this.connectedPeers.values()) {
      ws.close(1001, 'Server shutting down');
    }

    // Close servers
    if (this.wsServer) {
      this.wsServer.close();
    }

    if (this.httpServer) {
      await new Promise((resolve) => {
        this.httpServer.close(resolve);
      });
    }

    this.isRunning = false;
    console.log('✅ SGN WebSocket Server stopped');
  }
}
