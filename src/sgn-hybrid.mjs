import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { webSockets } from '@libp2p/websockets'
import { webRTC } from '@libp2p/webrtc'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { identify } from '@libp2p/identify'
import { ping } from '@libp2p/ping'
import { multiaddr } from '@multiformats/multiaddr'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import WebSocket from 'ws'

// SGN Hybrid Implementation - Phase 1.1 Alternative Approach
console.log("🚀 SGN-HYBRID - Hybrid P2P + WebSocket + WebRTC Implementation")
console.log("📡 Phase 1.1: Foundation Hardening - Alternative Approach")
console.log("=" * 70)

// Hybrid node creation with multiple transport options
const createSGNHybridNode = async (port, nodeType = 'peer') => {
  console.log(`🏗️  Creating ${nodeType.toUpperCase()} hybrid node on port ${port}...`)
  
  try {
    const node = await createLibp2p({
      addresses: {
        listen: [
          `/ip4/0.0.0.0/tcp/${port}`,
          `/ip4/127.0.0.1/tcp/${port}`,
          `/ip4/127.0.0.1/tcp/${port + 1000}/ws`, // WebSocket on port + 1000
          `/ip4/0.0.0.0/udp/${port + 2000}/webrtc-direct` // WebRTC on port + 2000
        ]
      },
      transports: [
        tcp(),
        webSockets(),
        webRTC()
      ],
      connectionEncryption: [noise()],
      streamMuxers: [mplex()],
      services: {
        identify: identify(),
        pubsub: gossipsub({
          allowPublishToZeroPeers: true, // Allow for hybrid approach
          emitSelf: false,
          canRelayMessage: true,
          messageIdFn: (msg) => {
            const msgStr = `${msg.from?.toString() || 'unknown'}-${msg.sequenceNumber || Date.now()}`
            return new TextEncoder().encode(msgStr)
          }
        }),
        ping: ping()
      },
      connectionManager: {
        maxConnections: 50,
        minConnections: 1,
        pollInterval: 5000
      }
    })

    await node.start()
    
    const multiaddrs = node.getMultiaddrs()
    const peerId = node.peerId.toString()
    
    console.log(`✅ ${nodeType.toUpperCase()} Hybrid Node Started`)
    console.log(`   🆔 Peer ID: ${peerId}`)
    console.log(`   🔗 Port: ${port}`)
    console.log(`   📍 Multiaddrs:`)
    multiaddrs.forEach(addr => {
      console.log(`      ${addr.toString()}`)
    })
    console.log("")
    
    // Enhanced event handlers
    node.addEventListener('peer:connect', (evt) => {
      console.log(`🔗 ${nodeType.toUpperCase()} | Peer connected: ${evt.detail.toString()}`)
    })
    
    node.addEventListener('peer:disconnect', (evt) => {
      console.log(`❌ ${nodeType.toUpperCase()} | Peer disconnected: ${evt.detail.toString()}`)
    })
    
    return node
  } catch (error) {
    console.error(`❌ Failed to create ${nodeType} hybrid node:`, error.message)
    throw error
  }
}

// WebSocket fallback server for direct communication
const createWebSocketFallback = (port, nodeType, messageHandler) => {
  const server = createServer()
  const wss = new WebSocketServer({ server })
  
  const connections = new Set()
  
  wss.on('connection', (ws) => {
    connections.add(ws)
    console.log(`🔌 ${nodeType.toUpperCase()} | WebSocket client connected (${connections.size} total)`)
    
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString())
        messageHandler(message)
      } catch (error) {
        console.log(`❌ ${nodeType.toUpperCase()} | WebSocket message parse error:`, error.message)
      }
    })
    
    ws.on('close', () => {
      connections.delete(ws)
      console.log(`🔌 ${nodeType.toUpperCase()} | WebSocket client disconnected (${connections.size} total)`)
    })
  })
  
  server.listen(port + 2000, () => {
    console.log(`🔌 ${nodeType.toUpperCase()} | WebSocket fallback server on port ${port + 2000}`)
  })
  
  return {
    broadcast: (message) => {
      const data = JSON.stringify(message)
      connections.forEach(ws => {
        if (ws.readyState === ws.OPEN) {
          ws.send(data)
        }
      })
      return connections.size
    },
    getConnectionCount: () => connections.size
  }
}

// Enhanced Knowledge Unit creation
const createKnowledgeUnit = (data) => {
  const timestamp = new Date().toISOString()
  const ku = {
    id: data.id || `ku-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    version: "1.1", // Updated for hybrid version
    hash: "",
    
    type: data.type || 'security-vulnerability',
    severity: data.severity || 'MEDIUM',
    confidence: data.confidence || 0.8,
    
    title: data.title || 'Unknown Issue',
    description: data.description || '',
    solution: data.solution || '',
    references: data.references || [],
    
    affectedSystems: data.affectedSystems || [],
    tags: data.tags || [],
    cveIds: data.cveIds || [],
    cweIds: data.cweIds || [],
    
    discoveredBy: data.discoveredBy || 'SGN-Scanner',
    verifiedBy: data.verifiedBy || [],
    timestamp: timestamp,
    expiresAt: data.expiresAt || null,
    
    signature: null,
    propagationPath: []
  }
  
  // Enhanced hash calculation
  const contentString = JSON.stringify({
    id: ku.id,
    type: ku.type,
    title: ku.title,
    description: ku.description,
    solution: ku.solution,
    timestamp: ku.timestamp
  })
  
  ku.hash = Buffer.from(contentString).toString('base64').substring(0, 20)
  
  return ku
}

// HYBRID SENDER Implementation
const runHybridSender = async () => {
  console.log("📤 STARTING SGN HYBRID SENDER")
  console.log("=" * 40)
  
  const node = await createSGNHybridNode(6001, 'sender')
  
  // WebSocket fallback for direct communication
  const wsServer = createWebSocketFallback(6001, 'sender', (message) => {
    console.log(`🔌 SENDER | Received WebSocket message: ${message.type}`)
  })
  
  // Knowledge Units
  const knowledgeUnits = [
    createKnowledgeUnit({
      id: "ku-001-xss-react-2025",
      title: "XSS Vulnerability in React dangerouslySetInnerHTML",
      type: "security-vulnerability",
      description: "Cross-site scripting vulnerability in React components using dangerouslySetInnerHTML without proper sanitization",
      solution: "Use DOMPurify.sanitize() to clean HTML content: const cleanHTML = DOMPurify.sanitize(userInput); return <div dangerouslySetInnerHTML={{__html: cleanHTML}} />",
      severity: "HIGH",
      confidence: 0.95,
      affectedSystems: ["React 16+", "Next.js", "Gatsby"],
      tags: ["react", "xss", "security", "frontend", "sanitization"],
      cveIds: ["CVE-2025-0001"],
      discoveredBy: "SGN-Security-Scanner"
    }),
    createKnowledgeUnit({
      id: "ku-002-sql-injection-auth-2025",
      title: "SQL Injection in Authentication System",
      type: "security-vulnerability",
      description: "Critical SQL injection vulnerability in user authentication allowing unauthorized access",
      solution: "Use parameterized queries: const query = 'SELECT * FROM users WHERE email = ? AND password = ?'; const result = await db.query(query, [email, hashedPassword]);",
      severity: "CRITICAL",
      confidence: 0.98,
      affectedSystems: ["MySQL", "PostgreSQL", "Node.js backends"],
      tags: ["sql", "injection", "authentication", "database", "security"],
      cveIds: ["CVE-2025-0002"],
      discoveredBy: "SGN-DB-Analyzer"
    })
  ]
  
  let kuIndex = 0
  
  // Hybrid broadcast function (libp2p + WebSocket)
  const hybridBroadcast = async () => {
    const ku = knowledgeUnits[kuIndex % knowledgeUnits.length]
    kuIndex++
    
    const networkMessage = {
      ...ku,
      broadcastId: `broadcast-${Date.now()}`,
      broadcastTime: new Date().toISOString(),
      senderPeer: node.peerId.toString(),
      networkVersion: "1.1-hybrid",
      messageType: "KU_BROADCAST"
    }
    
    let totalDelivered = 0
    
    // Try libp2p first
    try {
      const subscribers = node.services.pubsub.getSubscribers('sgn-ku-channel')
      if (subscribers.length > 0) {
        await node.services.pubsub.publish('sgn-ku-channel', 
          new TextEncoder().encode(JSON.stringify(networkMessage)))
        totalDelivered += subscribers.length
        console.log(`📡 SENDER | libp2p broadcast to ${subscribers.length} subscribers`)
      }
    } catch (error) {
      console.log(`⚠️  SENDER | libp2p broadcast failed: ${error.message}`)
    }
    
    // WebSocket fallback
    const wsDelivered = wsServer.broadcast(networkMessage)
    if (wsDelivered > 0) {
      totalDelivered += wsDelivered
      console.log(`🔌 SENDER | WebSocket broadcast to ${wsDelivered} connections`)
    }
    
    if (totalDelivered > 0) {
      console.log(`📤 SENDER | Knowledge Unit Broadcasted`)
      console.log(`   🆔 ID: ${ku.id}`)
      console.log(`   📋 Title: ${ku.title}`)
      console.log(`   🚨 Severity: ${ku.severity} (${ku.confidence * 100}% confidence)`)
      console.log(`   📊 Total Delivered: ${totalDelivered}`)
      console.log(`   ⏰ Time: ${new Date().toLocaleTimeString()}`)
      console.log("")
    } else {
      console.log("⏳ SENDER | No subscribers found, waiting...")
    }
    
    return totalDelivered > 0
  }
  
  console.log("🔄 SENDER | Hybrid system ready")
  console.log("📋 SENDER | Supports both libp2p and WebSocket connections")
  console.log("")
  
  // Start broadcasting
  setTimeout(() => {
    console.log("🎯 SENDER | Starting hybrid broadcast sequence...")
    hybridBroadcast()
    setInterval(hybridBroadcast, 15000)
  }, 5000)
  
  return { node, wsServer }
}

// HYBRID RECEIVER Implementation
const runHybridReceiver = async (port, senderMultiaddr) => {
  console.log(`📡 STARTING SGN HYBRID RECEIVER (Port ${port})`)
  console.log("=" * 40)
  
  const node = await createSGNHybridNode(port, 'receiver')
  
  // Message handler for both libp2p and WebSocket
  const handleKnowledgeUnit = (networkMessage, source = 'unknown') => {
    console.log(`📥 RECEIVER | Knowledge Unit Received (via ${source})`)
    console.log(`   🆔 ID: ${networkMessage.id}`)
    console.log(`   📋 Title: ${networkMessage.title}`)
    console.log(`   🚨 Severity: ${networkMessage.severity} (${networkMessage.confidence * 100}% confidence)`)
    console.log(`   🔍 Type: ${networkMessage.type}`)
    console.log(`   💡 Solution: ${networkMessage.solution.substring(0, 120)}...`)
    console.log(`   🏷️  Tags: ${networkMessage.tags.join(', ')}`)
    console.log(`   🔬 Discovered by: ${networkMessage.discoveredBy}`)
    console.log(`   📡 From: ${networkMessage.senderPeer}`)
    console.log(`   ⏰ Received: ${new Date().toLocaleTimeString()}`)
    console.log("")
  }
  
  // Subscribe to libp2p pubsub
  node.services.pubsub.subscribe('sgn-ku-channel', (msg) => {
    try {
      const networkMessage = JSON.parse(new TextDecoder().decode(msg.data))
      handleKnowledgeUnit(networkMessage, 'libp2p')
    } catch (error) {
      console.log(`❌ RECEIVER | libp2p message parse error: ${error.message}`)
    }
  })
  
  console.log("📡 RECEIVER | Subscribed to sgn-ku-channel (libp2p)")
  
  // WebSocket fallback connection
  const connectWebSocket = () => {
    try {
      const ws = new WebSocket('ws://127.0.0.1:8001') // sender port + 2000
      
      ws.on('open', () => {
        console.log("🔌 RECEIVER | WebSocket fallback connected")
      })
      
      ws.on('message', (data) => {
        try {
          const networkMessage = JSON.parse(data.toString())
          handleKnowledgeUnit(networkMessage, 'WebSocket')
        } catch (error) {
          console.log(`❌ RECEIVER | WebSocket message parse error: ${error.message}`)
        }
      })
      
      ws.on('error', (error) => {
        console.log(`⚠️  RECEIVER | WebSocket error: ${error.message}`)
      })
      
      ws.on('close', () => {
        console.log("🔌 RECEIVER | WebSocket connection closed, retrying in 5s...")
        setTimeout(connectWebSocket, 5000)
      })
      
    } catch (error) {
      console.log(`⚠️  RECEIVER | WebSocket setup failed: ${error.message}`)
    }
  }
  
  // Try libp2p connection if multiaddr provided
  if (senderMultiaddr) {
    console.log(`🔍 RECEIVER | Attempting libp2p connection to: ${senderMultiaddr}`)
    
    try {
      await node.dial(multiaddr(senderMultiaddr))
      console.log("✅ RECEIVER | libp2p connection successful!")
    } catch (error) {
      console.log(`⚠️  RECEIVER | libp2p connection failed: ${error.message}`)
      console.log("🔌 RECEIVER | Falling back to WebSocket...")
    }
  }
  
  // Always try WebSocket as fallback
  setTimeout(connectWebSocket, 3000)
  
  console.log("👂 RECEIVER | Hybrid receiver ready (libp2p + WebSocket)")
  console.log("")
  
  return node
}

// MAIN ROUTER
const command = process.argv[2]
const port = process.argv[3] ? parseInt(process.argv[3]) : undefined
const senderMultiaddr = process.argv[4]

switch (command) {
  case 'sender':
    runHybridSender().catch(error => {
      console.error("❌ Hybrid sender failed:", error)
      process.exit(1)
    })
    break
    
  case 'receiver':
    if (!port) {
      console.log("❌ Port required for receiver")
      console.log("Usage: node src/sgn-hybrid.mjs receiver <port> [sender-multiaddr]")
      process.exit(1)
    }
    runHybridReceiver(port, senderMultiaddr).catch(error => {
      console.error("❌ Hybrid receiver failed:", error)
      process.exit(1)
    })
    break
    
  default:
    console.log('🚀 SGN-HYBRID - Hybrid P2P + WebSocket Implementation')
    console.log('')
    console.log('USAGE:')
    console.log('')
    console.log('1. Start SENDER:')
    console.log('   node src/sgn-hybrid.mjs sender')
    console.log('')
    console.log('2. Start RECEIVER(S):')
    console.log('   node src/sgn-hybrid.mjs receiver 6002 [sender-multiaddr]')
    console.log('   node src/sgn-hybrid.mjs receiver 6003 [sender-multiaddr]')
    console.log('')
    console.log('Features:')
    console.log('- Dual transport: libp2p + WebSocket fallback')
    console.log('- Automatic fallback if libp2p fails')
    console.log('- Enhanced Knowledge Unit schema')
    console.log('- Real-time broadcasting')
    break
}
