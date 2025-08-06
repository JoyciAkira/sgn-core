import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { identify } from '@libp2p/identify'
import { ping } from '@libp2p/ping'
import { multiaddr } from '@multiformats/multiaddr'

// SGN with Real P2P Connectivity - Phase 1.1 Implementation
console.log("🚀 SGN-P2P - Real Peer-to-Peer Connectivity")
console.log("📡 Phase 1.1: Foundation Hardening")
console.log("=" * 60)

// Enhanced libp2p node creation with better compatibility
const createSGNNode = async (port, nodeType = 'peer') => {
  console.log(`🏗️  Creating ${nodeType.toUpperCase()} node on port ${port}...`)
  
  try {
    const node = await createLibp2p({
      addresses: {
        listen: [
          `/ip4/0.0.0.0/tcp/${port}`,
          `/ip4/127.0.0.1/tcp/${port}`
        ]
      },
      transports: [tcp()],
      connectionEncryption: [noise()],
      streamMuxers: [mplex()],
      services: {
        identify: identify(),
        pubsub: gossipsub({
          allowPublishToZeroPeers: false,
          emitSelf: false,
          canRelayMessage: true,
          // Enhanced message ID function for better deduplication
          messageIdFn: (msg) => {
            const msgStr = `${msg.from?.toString() || 'unknown'}-${msg.sequenceNumber || Date.now()}`
            return new TextEncoder().encode(msgStr)
          },
          // Gossipsub parameters for better performance
          scoreParams: {
            topicScoreCap: 10,
            appSpecificScore: () => 0,
            ipColocationFactorWeight: 0,
            behaviourPenaltyWeight: -1,
            behaviourPenaltyThreshold: 6,
            behaviourPenaltyDecay: 0.8
          }
        }),
        ping: ping({
          protocolPrefix: 'sgn',
          maxInboundStreams: 32,
          maxOutboundStreams: 64,
          timeout: 10000
        })
      },
      connectionManager: {
        maxConnections: 100,
        minConnections: 5,
        pollInterval: 2000,
        autoDialInterval: 10000,
        inboundUpgradeTimeout: 10000
      }
    })

    await node.start()
    
    const multiaddrs = node.getMultiaddrs()
    const peerId = node.peerId.toString()
    
    console.log(`✅ ${nodeType.toUpperCase()} Node Started Successfully`)
    console.log(`   🆔 Peer ID: ${peerId}`)
    console.log(`   🔗 Port: ${port}`)
    console.log(`   📍 Multiaddrs:`)
    multiaddrs.forEach(addr => {
      console.log(`      ${addr.toString()}`)
    })
    console.log("")
    
    // Enhanced connection event handlers
    node.addEventListener('peer:connect', (evt) => {
      console.log(`🔗 ${nodeType.toUpperCase()} | Peer connected: ${evt.detail.toString()}`)
    })
    
    node.addEventListener('peer:disconnect', (evt) => {
      console.log(`❌ ${nodeType.toUpperCase()} | Peer disconnected: ${evt.detail.toString()}`)
    })
    
    node.addEventListener('peer:discovery', (evt) => {
      console.log(`🔍 ${nodeType.toUpperCase()} | Peer discovered: ${evt.detail.id.toString()}`)
    })
    
    return node
  } catch (error) {
    console.error(`❌ Failed to create ${nodeType} node:`, error.message)
    throw error
  }
}

// Enhanced Knowledge Unit structure for Phase 1
const createKnowledgeUnit = (data) => {
  const timestamp = new Date().toISOString()
  const ku = {
    // Core Identity
    id: data.id || `ku-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
    version: "1.0",
    hash: "", // Will be calculated
    
    // Classification
    type: data.type || 'security-vulnerability',
    severity: data.severity || 'MEDIUM',
    confidence: data.confidence || 0.8,
    
    // Content
    title: data.title || 'Unknown Issue',
    description: data.description || '',
    solution: data.solution || '',
    references: data.references || [],
    
    // Context
    affectedSystems: data.affectedSystems || [],
    tags: data.tags || [],
    cveIds: data.cveIds || [],
    cweIds: data.cweIds || [],
    
    // Provenance
    discoveredBy: data.discoveredBy || 'SGN-Scanner',
    verifiedBy: data.verifiedBy || [],
    timestamp: timestamp,
    expiresAt: data.expiresAt || null,
    
    // Network (Phase 1 - basic)
    signature: null, // Will be added in task 1.4
    propagationPath: []
  }
  
  // Calculate content hash (simple for now, will be enhanced)
  const contentString = JSON.stringify({
    id: ku.id,
    type: ku.type,
    title: ku.title,
    description: ku.description,
    solution: ku.solution,
    timestamp: ku.timestamp
  })
  
  // Simple hash for Phase 1 (will use proper crypto hash later)
  ku.hash = Buffer.from(contentString).toString('base64').substring(0, 16)
  
  return ku
}

// SENDER Node Implementation
const runSender = async () => {
  console.log("📤 STARTING SGN SENDER NODE")
  console.log("=" * 40)
  
  const node = await createSGNNode(6001, 'sender')
  
  // Knowledge Units database
  const knowledgeUnits = [
    createKnowledgeUnit({
      id: "ku-001-xss-react-2025",
      title: "XSS Vulnerability in React dangerouslySetInnerHTML",
      type: "security-vulnerability",
      description: "Cross-site scripting vulnerability in React components using dangerouslySetInnerHTML without proper sanitization",
      solution: "Use DOMPurify.sanitize() to clean HTML content before rendering: const cleanHTML = DOMPurify.sanitize(userInput)",
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
      description: "Critical SQL injection vulnerability in user authentication allowing unauthorized access to user accounts",
      solution: "Use parameterized queries: const query = 'SELECT * FROM users WHERE email = ? AND password = ?'; db.query(query, [email, hashedPassword])",
      severity: "CRITICAL",
      confidence: 0.98,
      affectedSystems: ["MySQL", "PostgreSQL", "Node.js backends"],
      tags: ["sql", "injection", "authentication", "database", "security"],
      cveIds: ["CVE-2025-0002"],
      discoveredBy: "SGN-DB-Analyzer"
    }),
    createKnowledgeUnit({
      id: "ku-003-memory-leak-events-2025",
      title: "Memory Leak in Event Handlers",
      type: "performance-issue",
      description: "Memory leak caused by event listeners not being properly cleaned up in React useEffect hooks",
      solution: "Always return cleanup function: useEffect(() => { const handler = (e) => {...}; element.addEventListener('click', handler); return () => element.removeEventListener('click', handler); }, [])",
      severity: "MEDIUM",
      confidence: 0.87,
      affectedSystems: ["React", "Vue.js", "Angular"],
      tags: ["memory-leak", "performance", "react", "useeffect", "cleanup"],
      discoveredBy: "SGN-Performance-Monitor"
    })
  ]
  
  let kuIndex = 0
  
  // Enhanced broadcast function
  const broadcastKU = async () => {
    const ku = knowledgeUnits[kuIndex % knowledgeUnits.length]
    kuIndex++
    
    // Add network metadata
    const networkMessage = {
      ...ku,
      broadcastId: `broadcast-${Date.now()}`,
      broadcastTime: new Date().toISOString(),
      senderPeer: node.peerId.toString(),
      networkVersion: "1.0",
      messageType: "KU_BROADCAST"
    }
    
    try {
      const subscribers = node.services.pubsub.getSubscribers('sgn-ku-channel')
      
      if (subscribers.length === 0) {
        console.log("⏳ SENDER | No subscribers found, waiting for receivers...")
        return false
      }
      
      await node.services.pubsub.publish('sgn-ku-channel', 
        new TextEncoder().encode(JSON.stringify(networkMessage)))
      
      console.log(`📤 SENDER | Knowledge Unit Broadcasted`)
      console.log(`   🆔 ID: ${ku.id}`)
      console.log(`   📋 Title: ${ku.title}`)
      console.log(`   🚨 Severity: ${ku.severity} (${ku.confidence * 100}% confidence)`)
      console.log(`   🔍 Type: ${ku.type}`)
      console.log(`   📊 Subscribers: ${subscribers.length}`)
      console.log(`   ⏰ Time: ${new Date().toLocaleTimeString()}`)
      console.log("")
      
      return true
    } catch (error) {
      console.log(`❌ SENDER | Broadcast failed: ${error.message}`)
      return false
    }
  }
  
  console.log("🔄 SENDER | Ready to broadcast Knowledge Units")
  console.log("📋 SENDER | Copy multiaddr above to connect receivers")
  console.log("")
  
  // Start broadcasting after initial delay
  setTimeout(() => {
    console.log("🎯 SENDER | Starting broadcast sequence...")
    
    // Initial broadcast
    broadcastKU()
    
    // Continue broadcasting every 12 seconds
    setInterval(broadcastKU, 12000)
    
  }, 5000)
  
  return node
}

// RECEIVER Node Implementation
const runReceiver = async (port, senderMultiaddr) => {
  console.log(`📡 STARTING SGN RECEIVER NODE (Port ${port})`)
  console.log("=" * 40)
  
  if (!senderMultiaddr) {
    console.log("❌ ERROR: Sender multiaddr required!")
    console.log("")
    console.log("Usage:")
    console.log(`  node src/sgn-p2p.mjs receiver ${port} <sender-multiaddr>`)
    console.log("")
    console.log("Example:")
    console.log(`  node src/sgn-p2p.mjs receiver ${port} /ip4/127.0.0.1/tcp/6001/p2p/12D3KooW...`)
    return
  }
  
  const node = await createSGNNode(port, 'receiver')
  
  // Subscribe to Knowledge Unit channel
  node.services.pubsub.subscribe('sgn-ku-channel', (msg) => {
    try {
      const networkMessage = JSON.parse(new TextDecoder().decode(msg.data))
      
      console.log(`📥 RECEIVER | Knowledge Unit Received`)
      console.log(`   🆔 ID: ${networkMessage.id}`)
      console.log(`   📋 Title: ${networkMessage.title}`)
      console.log(`   🚨 Severity: ${networkMessage.severity} (${networkMessage.confidence * 100}% confidence)`)
      console.log(`   🔍 Type: ${networkMessage.type}`)
      console.log(`   💡 Solution: ${networkMessage.solution.substring(0, 100)}...`)
      console.log(`   🏷️  Tags: ${networkMessage.tags.join(', ')}`)
      console.log(`   🔬 Discovered by: ${networkMessage.discoveredBy}`)
      console.log(`   📡 From: ${networkMessage.senderPeer}`)
      console.log(`   ⏰ Received: ${new Date().toLocaleTimeString()}`)
      console.log("")
      
    } catch (error) {
      console.log(`❌ RECEIVER | Failed to parse message: ${error.message}`)
    }
  })
  
  console.log("📡 RECEIVER | Subscribed to sgn-ku-channel")
  
  // Connect to sender with exponential backoff retry
  const connectToSender = async () => {
    const maxRetries = 10
    let attempt = 0
    const baseDelay = 1000 // 1 second base delay
    const maxDelay = 60000 // 60 seconds max delay

    const attemptConnection = async () => {
      if (attempt >= maxRetries) {
        console.log("❌ RECEIVER | All connection attempts failed")
        console.log("💡 RECEIVER | Make sure sender is running and multiaddr is correct")
        return
      }
      
      attempt++
      
      try {
        console.log(`🔍 RECEIVER | Connecting to sender... (attempt ${attempt}/${maxRetries})`)
        console.log(`   Target: ${senderMultiaddr}`)
        
        await node.dial(multiaddr(senderMultiaddr))
        console.log("✅ RECEIVER | Connected to sender successfully!")
        console.log("👂 RECEIVER | Listening for Knowledge Units...")
        console.log("")
        
      } catch (error) {
        console.log(`⚠️  RECEIVER | Connection attempt ${attempt} failed: ${error.message}`)
        
        if (attempt < maxRetries) {
          // Exponential backoff with jitter
          const jitter = Math.random() * 0.4 + 0.8 // 0.8-1.2 multiplier
          const delay = Math.min(maxDelay, baseDelay * Math.pow(2, attempt)) * jitter
          
          console.log(`🔄 RECEIVER | Retrying in ${Math.round(delay/1000)} seconds...`)
          setTimeout(attemptConnection, delay)
        } else {
          console.log("❌ RECEIVER | All connection attempts failed")
          console.log("💡 RECEIVER | Make sure sender is running and multiaddr is correct")
        }
      }
    }
    
    attemptConnection()
  }
  
  // Start connection attempts after a brief delay
  setTimeout(connectToSender, 2000)
  
  return node
}

// MAIN ROUTER
const command = process.argv[2]
const port = process.argv[3] ? parseInt(process.argv[3]) : undefined
const senderMultiaddr = process.argv[4]

switch (command) {
  case 'sender':
    runSender().catch(error => {
      console.error("❌ Sender failed:", error)
      process.exit(1)
    })
    break
    
  case 'receiver':
    if (!port) {
      console.log("❌ Port required for receiver")
      console.log("Usage: node src/sgn-p2p.mjs receiver <port> <sender-multiaddr>")
      process.exit(1)
    }
    runReceiver(port, senderMultiaddr).catch(error => {
      console.error("❌ Receiver failed:", error)
      process.exit(1)
    })
    break
    
  default:
    console.log('🚀 SGN-P2P - Real Peer-to-Peer Implementation')
    console.log('')
    console.log('USAGE:')
    console.log('')
    console.log('1. Start SENDER:')
    console.log('   node src/sgn-p2p.mjs sender')
    console.log('')
    console.log('2. Copy multiaddr from sender output')
    console.log('')
    console.log('3. Start RECEIVER(S):')
    console.log('   node src/sgn-p2p.mjs receiver 6002 <sender-multiaddr>')
    console.log('   node src/sgn-p2p.mjs receiver 6003 <sender-multiaddr>')
    console.log('')
    console.log('Example:')
    console.log('   node src/sgn-p2p.mjs receiver 6002 /ip4/127.0.0.1/tcp/6001/p2p/12D3KooW...')
    break
}
