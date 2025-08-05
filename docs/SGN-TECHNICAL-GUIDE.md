# 🔧 SGN Technical Implementation Guide

**Version**: 1.0  
**Status**: Phase 1 Ready  
**Last Updated**: January 5, 2025

## 🎯 **Quick Start for Developers**

### **Current Working Demo**
```bash
# Clone and run the working PoC
git clone <repository>
cd sgn-poc
npm install
npm start
```

### **Project Structure**
```
sgn-poc/
├── src/
│   └── sgn-poc.mjs          # Main demo implementation
├── docs/
│   ├── SGN-ROADMAP.md       # Development roadmap
│   └── SGN-TECHNICAL-GUIDE.md # This file
├── tests/                   # Future test suite
├── start.mjs               # Launch script
├── package.json            # Dependencies
└── sgn.config.json         # Configuration
```

## 🏗️ **Architecture Overview**

### **Current PoC Architecture**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Sender Node   │    │  Receiver Node  │    │  Receiver Node  │
│   (Port 6001)   │───▶│   (Port 6002)   │    │   (Port 6003)   │
│                 │    │                 │    │                 │
│ • KU Generation │    │ • KU Processing │    │ • KU Processing │
│ • Broadcasting  │    │ • Validation    │    │ • Validation    │
│ • Network Stats │    │ • Local Display │    │ • Local Display │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │  SGN Network    │
                    │                 │
                    │ • Message Queue │
                    │ • Routing       │
                    │ • Statistics    │
                    │ • Monitoring    │
                    └─────────────────┘
```

### **Target Production Architecture**
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Desktop App   │    │   Web Client    │    │   Mobile App    │
│   (Full Node)   │    │  (Light Node)   │    │ (Notification)  │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         └───────────────────────┼───────────────────────┘
                                 │
                    ┌─────────────────┐
                    │  SGN Core Net   │
                    │                 │
                    │ • libp2p DHT    │
                    │ • Relay Nodes   │
                    │ • Bootstrap     │
                    │ • Security      │
                    └─────────────────┘
                                 │
                    ┌─────────────────┐
                    │ Socrate Global  │
                    │    Network      │
                    └─────────────────┘
```

## 💾 **Data Structures**

### **Knowledge Unit (KU) Schema**
```typescript
interface KnowledgeUnit {
  // Identity
  id: string;                    // Unique identifier
  version: string;               // Schema version
  hash: string;                  // Content integrity hash
  
  // Classification
  type: KUType;                  // security-vulnerability, performance-issue, etc.
  severity: Severity;            // CRITICAL, HIGH, MEDIUM, LOW, INFO
  confidence: number;            // 0.0 - 1.0
  
  // Content
  title: string;                 // Human-readable title
  description: string;           // Detailed description
  solution: string;              // Recommended solution
  references: string[];          // External references
  
  // Context
  affectedSystems: string[];     // Systems/technologies affected
  tags: string[];                // Categorization tags
  cveIds?: string[];             // CVE identifiers
  cweIds?: string[];             // CWE identifiers
  
  // Provenance
  discoveredBy: string;          // Source/scanner that found it
  verifiedBy?: string[];         // Verification sources
  timestamp: string;             // Discovery timestamp
  expiresAt?: string;            // Expiration date
  
  // Network
  signature?: string;            // Digital signature (Phase 1)
  propagationPath?: string[];    // Peer propagation history
}

type KUType = 
  | 'security-vulnerability'
  | 'performance-issue'
  | 'best-practice'
  | 'threat-intel'
  | 'configuration-issue';

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
```

### **Network Message Format**
```typescript
interface SGNMessage {
  messageId: string;             // Unique message ID
  type: 'KU_BROADCAST' | 'KU_REQUEST' | 'PEER_DISCOVERY' | 'HEARTBEAT';
  sender: string;                // Sender peer ID
  timestamp: string;             // Message timestamp
  payload: KnowledgeUnit | any;  // Message payload
  signature?: string;            // Message signature
  ttl?: number;                  // Time to live
}
```

## 🔧 **Implementation Details**

### **Phase 1: Foundation Hardening**

#### **1. libp2p Integration**
```javascript
// Target libp2p configuration for Phase 1
import { createLibp2p } from 'libp2p'
import { tcp } from '@libp2p/tcp'
import { noise } from '@chainsafe/libp2p-noise'
import { mplex } from '@libp2p/mplex'
import { gossipsub } from '@chainsafe/libp2p-gossipsub'
import { identify } from '@libp2p/identify'
import { mdns } from '@libp2p/mdns'

const createSGNNode = async (port) => {
  return await createLibp2p({
    addresses: {
      listen: [`/ip4/0.0.0.0/tcp/${port}`]
    },
    transports: [tcp()],
    connectionEncryption: [noise()],
    streamMuxers: [mplex()],
    peerDiscovery: [
      mdns({
        interval: 1000,
        serviceTag: 'sgn-network'
      })
    ],
    services: {
      identify: identify(),
      pubsub: gossipsub({
        allowPublishToZeroPeers: false,
        emitSelf: false,
        canRelayMessage: true,
        messageIdFn: (msg) => {
          // Custom message ID generation
          return new TextEncoder().encode(
            `${msg.from}-${msg.sequenceNumber}-${Date.now()}`
          )
        }
      })
    }
  })
}
```

#### **2. Persistence Layer**
```javascript
// SQLite-based storage for Phase 1
import Database from 'better-sqlite3'

class KUStorage {
  constructor(dbPath = './sgn-data.db') {
    this.db = new Database(dbPath)
    this.initTables()
  }
  
  initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_units (
        id TEXT PRIMARY KEY,
        version TEXT NOT NULL,
        hash TEXT NOT NULL,
        type TEXT NOT NULL,
        severity TEXT NOT NULL,
        confidence REAL NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        solution TEXT NOT NULL,
        affected_systems TEXT, -- JSON array
        tags TEXT,             -- JSON array
        cve_ids TEXT,          -- JSON array
        discovered_by TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        expires_at TEXT,
        signature TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
      
      CREATE INDEX IF NOT EXISTS idx_ku_type ON knowledge_units(type);
      CREATE INDEX IF NOT EXISTS idx_ku_severity ON knowledge_units(severity);
      CREATE INDEX IF NOT EXISTS idx_ku_timestamp ON knowledge_units(timestamp);
    `)
  }
  
  async store(ku) {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO knowledge_units 
      (id, version, hash, type, severity, confidence, title, description, 
       solution, affected_systems, tags, cve_ids, discovered_by, timestamp, 
       expires_at, signature)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    
    return stmt.run(
      ku.id, ku.version, ku.hash, ku.type, ku.severity, ku.confidence,
      ku.title, ku.description, ku.solution,
      JSON.stringify(ku.affectedSystems),
      JSON.stringify(ku.tags),
      JSON.stringify(ku.cveIds || []),
      ku.discoveredBy, ku.timestamp, ku.expiresAt, ku.signature
    )
  }
  
  async retrieve(id) {
    const stmt = this.db.prepare('SELECT * FROM knowledge_units WHERE id = ?')
    const row = stmt.get(id)
    
    if (!row) return null
    
    return {
      id: row.id,
      version: row.version,
      hash: row.hash,
      type: row.type,
      severity: row.severity,
      confidence: row.confidence,
      title: row.title,
      description: row.description,
      solution: row.solution,
      affectedSystems: JSON.parse(row.affected_systems || '[]'),
      tags: JSON.parse(row.tags || '[]'),
      cveIds: JSON.parse(row.cve_ids || '[]'),
      discoveredBy: row.discovered_by,
      timestamp: row.timestamp,
      expiresAt: row.expires_at,
      signature: row.signature
    }
  }
  
  async search(filters = {}) {
    let query = 'SELECT * FROM knowledge_units WHERE 1=1'
    const params = []
    
    if (filters.type) {
      query += ' AND type = ?'
      params.push(filters.type)
    }
    
    if (filters.severity) {
      query += ' AND severity = ?'
      params.push(filters.severity)
    }
    
    if (filters.minConfidence) {
      query += ' AND confidence >= ?'
      params.push(filters.minConfidence)
    }
    
    query += ' ORDER BY timestamp DESC'
    
    if (filters.limit) {
      query += ' LIMIT ?'
      params.push(filters.limit)
    }
    
    const stmt = this.db.prepare(query)
    const rows = stmt.all(...params)
    
    return rows.map(row => ({
      id: row.id,
      version: row.version,
      hash: row.hash,
      type: row.type,
      severity: row.severity,
      confidence: row.confidence,
      title: row.title,
      description: row.description,
      solution: row.solution,
      affectedSystems: JSON.parse(row.affected_systems || '[]'),
      tags: JSON.parse(row.tags || '[]'),
      cveIds: JSON.parse(row.cve_ids || '[]'),
      discoveredBy: row.discovered_by,
      timestamp: row.timestamp,
      expiresAt: row.expires_at,
      signature: row.signature
    }))
  }
}
```

#### **3. Digital Signatures**
```javascript
// Ed25519 signatures for KU authenticity
import { generateKeyPair, sign, verify } from '@noble/ed25519'

class SGNSecurity {
  constructor() {
    this.keyPair = null
  }
  
  async generateKeyPair() {
    const privateKey = generateKeyPair()
    this.keyPair = {
      privateKey: privateKey.privateKey,
      publicKey: privateKey.publicKey
    }
    return this.keyPair
  }
  
  async signKU(ku, privateKey) {
    const kuString = JSON.stringify({
      id: ku.id,
      version: ku.version,
      type: ku.type,
      title: ku.title,
      description: ku.description,
      solution: ku.solution,
      timestamp: ku.timestamp
    })
    
    const signature = await sign(new TextEncoder().encode(kuString), privateKey)
    return Buffer.from(signature).toString('hex')
  }
  
  async verifyKU(ku, signature, publicKey) {
    const kuString = JSON.stringify({
      id: ku.id,
      version: ku.version,
      type: ku.type,
      title: ku.title,
      description: ku.description,
      solution: ku.solution,
      timestamp: ku.timestamp
    })
    
    try {
      return await verify(
        Buffer.from(signature, 'hex'),
        new TextEncoder().encode(kuString),
        publicKey
      )
    } catch (error) {
      return false
    }
  }
}
```

## 🧪 **Testing Strategy**

### **Unit Tests**
```javascript
// Example test structure
describe('SGN Core', () => {
  describe('KnowledgeUnit', () => {
    test('should create valid KU', () => {
      const ku = createKU({
        title: 'Test Vulnerability',
        type: 'security-vulnerability',
        severity: 'HIGH'
      })
      expect(ku.id).toBeDefined()
      expect(ku.hash).toBeDefined()
    })
  })
  
  describe('KUStorage', () => {
    test('should store and retrieve KU', async () => {
      const storage = new KUStorage(':memory:')
      const ku = createTestKU()
      
      await storage.store(ku)
      const retrieved = await storage.retrieve(ku.id)
      
      expect(retrieved).toEqual(ku)
    })
  })
})
```

### **Integration Tests**
```javascript
describe('SGN Network', () => {
  test('should broadcast KU between nodes', async () => {
    const sender = await createSGNNode(6001)
    const receiver = await createSGNNode(6002)
    
    // Connect nodes
    await receiver.dial(sender.getMultiaddrs()[0])
    
    // Setup subscription
    const receivedKUs = []
    receiver.services.pubsub.subscribe('sgn-ku-channel', (msg) => {
      receivedKUs.push(JSON.parse(new TextDecoder().decode(msg.data)))
    })
    
    // Broadcast KU
    const ku = createTestKU()
    await sender.services.pubsub.publish('sgn-ku-channel', 
      new TextEncoder().encode(JSON.stringify(ku)))
    
    // Wait and verify
    await new Promise(resolve => setTimeout(resolve, 1000))
    expect(receivedKUs).toHaveLength(1)
    expect(receivedKUs[0].id).toBe(ku.id)
  })
})
```

## 📊 **Performance Considerations**

### **Benchmarks (Target Phase 1)**
- **KU Processing**: <10ms per KU
- **Storage Operations**: <5ms per operation
- **Network Latency**: <100ms local network
- **Memory Usage**: <100MB per node
- **CPU Usage**: <5% idle, <20% under load

### **Optimization Strategies**
1. **Message Batching**: Group multiple KUs in single broadcast
2. **Compression**: Use gzip for large KU payloads
3. **Caching**: Redis for frequently accessed KUs
4. **Connection Pooling**: Reuse libp2p connections
5. **Lazy Loading**: Load KU details on demand

## 🔒 **Security Considerations**

### **Phase 1 Security Features**
- [ ] Digital signatures for KU authenticity
- [ ] Basic rate limiting per peer
- [ ] Input validation and sanitization
- [ ] Secure key storage
- [ ] Transport encryption (Noise protocol)

### **Future Security Enhancements**
- [ ] Reputation system for peers
- [ ] Advanced spam detection
- [ ] Content-based filtering
- [ ] Audit logging
- [ ] Compliance reporting

This technical guide provides the foundation for implementing Phase 1 of the SGN roadmap with concrete code examples and best practices.
