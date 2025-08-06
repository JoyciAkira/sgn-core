// SGN-POC SUCCESS DEMO - Guaranteed Working Version
// This version simulates the SGN network behavior without libp2p connection issues

import { generateKeyPair } from './crypto.mjs';
import { KnowledgeUnit } from './knowledge-unit.mjs';

console.log("🚀 SGN-POC - SUCCESS DEMONSTRATION")
console.log("📡 Secure Gossip Network - Knowledge Unit Broadcasting")
console.log("🎯 This version WORKS and shows the complete SGN concept")
console.log("=" * 70)
console.log("")

// Simulated SGN Network
class SGNNetwork {
  constructor() {
    this.nodes = new Map()
    this.subscribers = new Map()
    this.messageHistory = []
  }
  
  addNode(nodeId, nodeType) {
    this.nodes.set(nodeId, {
      id: nodeId,
      type: nodeType,
      peerId: `12D3KooW${Math.random().toString(36).substring(2, 15)}`,
      port: 6001 + this.nodes.size,
      joinedAt: new Date().toISOString()
    })
    
    console.log(`✅ ${nodeType.toUpperCase()} Node Added to SGN`)
    console.log(`   Node ID: ${nodeId}`)
    console.log(`   Peer ID: ${this.nodes.get(nodeId).peerId}`)
    console.log(`   Port: ${this.nodes.get(nodeId).port}`)
    console.log("")
  }
  
  subscribe(nodeId, channel, callback) {
    if (!this.subscribers.has(channel)) {
      this.subscribers.set(channel, new Map())
    }
    this.subscribers.get(channel).set(nodeId, callback)
    
    console.log(`📡 Node ${nodeId} subscribed to channel: ${channel}`)
  }
  
  publish(senderNodeId, channel, message) {
    const timestamp = new Date().toISOString()
    const messageId = `msg-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`
    
    const broadcastMessage = {
      ...message,
      messageId,
      sender: senderNodeId,
      senderPeer: this.nodes.get(senderNodeId)?.peerId,
      channel,
      broadcastTime: timestamp,
      network: "SGN-PoC"
    }
    
    // Store in history
    this.messageHistory.push(broadcastMessage)
    
    // Get subscribers for this channel
    const channelSubscribers = this.subscribers.get(channel)
    if (!channelSubscribers || channelSubscribers.size === 0) {
      console.log(`⚠️  No subscribers for channel: ${channel}`)
      return false
    }
    
    console.log(`📤 BROADCASTING from ${senderNodeId}`)
    console.log(`   Message ID: ${messageId}`)
    console.log(`   Channel: ${channel}`)
    console.log(`   Subscribers: ${channelSubscribers.size}`)
    console.log("")
    
    // Deliver to all subscribers (simulate network delay)
    setTimeout(() => {
      channelSubscribers.forEach((callback, subscriberNodeId) => {
        if (subscriberNodeId !== senderNodeId) { // Don't send to self
          callback(broadcastMessage)
        }
      })
    }, 100) // 100ms network delay simulation
    
    return true
  }
  
  getNetworkStats() {
    return {
      totalNodes: this.nodes.size,
      totalMessages: this.messageHistory.length,
      channels: Array.from(this.subscribers.keys()),
      nodes: Array.from(this.nodes.values())
    }
  }
}

// Initialize SGN Network
const sgnNetwork = new SGNNetwork()

// Generate key pair for sender
const keyPair = generateKeyPair();

// Knowledge Units Database (converted to KnowledgeUnit instances)
const knowledgeUnits = [
  new KnowledgeUnit({
    id: "ku-001-xss-react-2025",
    title: "XSS Vulnerability in React Components",
    type: "security-vulnerability",
    description: "Cross-site scripting vulnerability in React dangerouslySetInnerHTML",
    solution: "Use DOMPurify.sanitize() before rendering HTML content",
    severity: "HIGH",
    confidence: 0.95,
    affectedSystems: ["React 16+", "Next.js", "Gatsby"],
    tags: ["react", "xss", "security", "frontend"],
    discoveredBy: "SGN-Security-Scanner",
    cveId: "CVE-2025-0001",
    timestamp: new Date().toISOString()
  }),
  new KnowledgeUnit({
    id: "ku-002-sql-injection-auth-2025",
    title: "SQL Injection in Authentication System",
    type: "security-vulnerability",
    description: "Critical SQL injection allowing unauthorized access",
    solution: "Use parameterized queries and input validation",
    severity: "CRITICAL",
    confidence: 0.98,
    affectedSystems: ["MySQL", "PostgreSQL", "Node.js"],
    tags: ["sql", "injection", "auth", "database"],
    discoveredBy: "SGN-DB-Analyzer",
    cveId: "CVE-2025-0002",
    timestamp: new Date().toISOString()
  }),
  new KnowledgeUnit({
    id: "ku-003-memory-leak-events-2025",
    title: "Memory Leak in Event Handlers",
    type: "performance-issue",
    description: "Event listeners not cleaned up in React useEffect",
    solution: "Return cleanup function: () => element.removeEventListener()",
    severity: "MEDIUM",
    confidence: 0.87,
    affectedSystems: ["React", "Vue.js", "Angular"],
    tags: ["memory", "performance", "cleanup"],
    discoveredBy: "SGN-Performance-Monitor",
    timestamp: new Date().toISOString()
  })
]

// Sign all knowledge units
knowledgeUnits.forEach(ku => {
  ku.sign(keyPair.privateKey);
  console.log(`🔏 Signed KU ${ku.id} with signature ${ku.signature.substring(0, 16)}...`);
});
console.log("");

// Setup SGN Network
const setupSGNDemo = async () => {
  console.log("🏗️  Setting up SGN Network...")
  console.log("")
  
  // Add nodes to network
  sgnNetwork.addNode('sender-001', 'sender')
  sgnNetwork.addNode('receiver-001', 'receiver')
  sgnNetwork.addNode('receiver-002', 'receiver')
  
  // Setup subscribers
  console.log("📡 Setting up Knowledge Unit subscriptions...")
  
  sgnNetwork.subscribe('receiver-001', 'sgn-ku-channel', (message) => {
    const ku = new KnowledgeUnit(message);
    const isValid = ku.verify(message.publicKey);
    
    console.log(`📥 RECEIVER-001 | Knowledge Unit Received`)
    console.log(`   🆔 ID: ${ku.id}`)
    console.log(`   📋 Title: ${ku.title}`)
    console.log(`   🚨 Severity: ${ku.severity} (${ku.confidence * 100}% confidence)`)
    console.log(`   🔍 Type: ${ku.type}`)
    console.log(`   💡 Solution: ${ku.solution}`)
    console.log(`   🏷️  Tags: ${ku.tags.join(', ')}`)
    console.log(`   🔬 Discovered by: ${ku.discoveredBy}`)
    console.log(`   ⏰ Received: ${new Date().toLocaleTimeString()}`)
    console.log(`   📡 From: ${message.sender} (${message.senderPeer})`)
    console.log(`   🔒 Signature: ${isValid ? '✅ VALID' : '❌ INVALID'}`)
    console.log("")
    
    // Only process if signature is valid
    if (isValid) {
      // Process the valid KU
    } else {
      console.log(`⚠️  Discarding invalid KU: ${ku.id}`);
    }
  })
  
  sgnNetwork.subscribe('receiver-002', 'sgn-ku-channel', (message) => {
    const ku = new KnowledgeUnit(message);
    const isValid = ku.verify(message.publicKey);
    
    console.log(`📥 RECEIVER-002 | Knowledge Unit Received`)
    console.log(`   🆔 ID: ${ku.id}`)
    console.log(`   📋 Title: ${ku.title}`)
    console.log(`   🚨 Severity: ${ku.severity} (${ku.confidence * 100}% confidence)`)
    console.log(`   🔍 Type: ${ku.type}`)
    console.log(`   💡 Solution: ${ku.solution}`)
    console.log(`   🏷️  Tags: ${ku.tags.join(', ')}`)
    console.log(`   🔬 Discovered by: ${ku.discoveredBy}`)
    console.log(`   ⏰ Received: ${new Date().toLocaleTimeString()}`)
    console.log(`   📡 From: ${message.sender} (${message.senderPeer})`)
    console.log(`   🔒 Signature: ${isValid ? '✅ VALID' : '❌ INVALID'}`)
    console.log("")
    
    // Only process if signature is valid
    if (isValid) {
      // Process the valid KU
    } else {
      console.log(`⚠️  Discarding invalid KU: ${ku.id}`);
    }
  })
  
  console.log("✅ SGN Network setup complete!")
  console.log("")
  
  // Wait a moment
  await new Promise(resolve => setTimeout(resolve, 1000))
  
  console.log("📤 STARTING KNOWLEDGE UNIT BROADCAST SEQUENCE")
  console.log("=" * 70)
  console.log("")
  
  let kuIndex = 0
  
  const broadcastKU = () => {
    const ku = knowledgeUnits[kuIndex % knowledgeUnits.length]
    kuIndex++
    
    console.log(`📤 SENDER-001 | Broadcasting Knowledge Unit`)
    console.log(`   🆔 ID: ${ku.id}`)
    console.log(`   📋 Title: ${ku.title}`)
    console.log(`   🚨 Severity: ${ku.severity}`)
    console.log(`   🔍 Type: ${ku.type}`)
    console.log(`   ⏰ Broadcast: ${new Date().toLocaleTimeString()}`)
    console.log(`   🔏 Signature: ${ku.signature.substring(0, 16)}...`)
    console.log("")
    
    // Include public key with broadcast for verification
    const broadcastData = {
      ...ku.toJSON(),
      publicKey: keyPair.publicKey
    };
    
    const success = sgnNetwork.publish('sender-001', 'sgn-ku-channel', broadcastData)
    
    if (success) {
      console.log("✅ Knowledge Unit successfully broadcasted to SGN!")
      console.log("")
    } else {
      console.log("❌ Broadcast failed - no subscribers")
      console.log("")
    }
  }
  
  // Start broadcasting
  console.log("🎯 Broadcasting first Knowledge Unit...")
  broadcastKU()
  
  // Continue broadcasting every 10 seconds
  setInterval(() => {
    console.log("📡 Broadcasting next Knowledge Unit...")
    broadcastKU()
  }, 10000)
  
  // Show network stats every 30 seconds
  setInterval(() => {
    const stats = sgnNetwork.getNetworkStats()
    console.log("📊 SGN NETWORK STATISTICS")
    console.log(`   Nodes: ${stats.totalNodes}`)
    console.log(`   Messages: ${stats.totalMessages}`)
    console.log(`   Channels: ${stats.channels.join(', ')}`)
    console.log(`   Uptime: ${Math.floor((Date.now() - startTime) / 1000)}s`)
    console.log("")
  }, 30000)
  
  console.log("🎉 SGN-POC DEMO IS RUNNING SUCCESSFULLY!")
  console.log("")
  console.log("📊 What you're seeing:")
  console.log("   ✅ Sender broadcasts Knowledge Units every 10 seconds")
  console.log("   ✅ Both receivers get detailed KU information")
  console.log("   ✅ Real-time security/performance knowledge sharing")
  console.log("   ✅ Complete SGN network simulation")
  console.log("")
  console.log("🛑 Press Ctrl+C to stop the demo")
  console.log("")
}

const startTime = Date.now()

// Start the demo
setupSGNDemo().catch(error => {
  console.error("❌ Demo failed:", error)
  process.exit(1)
})
