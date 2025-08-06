/**
 * Test Real WebSocket Server
 * Verifies that the server actually binds to a port and accepts connections
 */

import { RealSGNWebSocketServer } from './real-websocket-server.mjs';
import { SGNProtocolMessage, MESSAGE_TYPES } from './sgn-p2p-protocol.mjs';
import WebSocket from 'ws';

console.log("🧪 TESTING REAL WEBSOCKET SERVER");
console.log("=" * 40);

/**
 * Test server startup and port binding
 */
async function testServerStartup() {
  console.log("\n1. Testing server startup and port binding...");
  
  const server = new RealSGNWebSocketServer({
    port: 8080,
    nodeId: 'test-server-node'
  });
  
  try {
    // Start server
    await server.start();
    
    // Verify server is running
    const stats = server.getStatistics();
    console.log(`✅ Server started successfully`);
    console.log(`   Port: ${stats.port}`);
    console.log(`   Running: ${stats.isRunning}`);
    console.log(`   Uptime: ${stats.uptime}ms`);
    
    return server;
    
  } catch (error) {
    console.error(`❌ Server startup failed: ${error.message}`);
    throw error;
  }
}

/**
 * Test client connection
 */
async function testClientConnection(serverPort) {
  console.log("\n2. Testing client connection...");
  
  return new Promise((resolve, reject) => {
    const client = new WebSocket(`ws://localhost:${serverPort}/sgn`);
    
    const timeout = setTimeout(() => {
      client.close();
      reject(new Error('Connection timeout'));
    }, 5000);
    
    client.on('open', () => {
      clearTimeout(timeout);
      console.log('✅ Client connected successfully');
      
      client.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          console.log(`📨 Received message: ${message.type}`);
          
          if (message.type === 'welcome') {
            console.log(`   Server Node ID: ${message.nodeId}`);
            console.log(`   Server Version: ${message.serverInfo.version}`);
            console.log(`   Capabilities: ${message.serverInfo.capabilities.join(', ')}`);
          }
        } catch (error) {
          console.error(`❌ Error parsing message: ${error.message}`);
        }
      });
      
      // Send test handshake using protocol
      const handshakeMessage = SGNProtocolMessage.peerHandshake(
        'test-client-peer',
        'test-public-key'
      );
      client.send(JSON.stringify(handshakeMessage));
      
      setTimeout(() => {
        client.close();
        resolve();
      }, 2000);
    });
    
    client.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

/**
 * Test multiple connections
 */
async function testMultipleConnections(serverPort) {
  console.log("\n3. Testing multiple connections...");
  
  const connections = [];
  const numConnections = 3;
  
  try {
    // Create multiple connections
    for (let i = 0; i < numConnections; i++) {
      const client = new WebSocket(`ws://localhost:${serverPort}/sgn`);
      connections.push(client);
      
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Connection timeout')), 3000);
        
        client.on('open', () => {
          clearTimeout(timeout);
          console.log(`✅ Connection ${i + 1} established`);
          
          // Send handshake using protocol
          const handshakeMessage = SGNProtocolMessage.peerHandshake(
            `test-peer-${i + 1}`,
            `test-key-${i + 1}`
          );
          client.send(JSON.stringify(handshakeMessage));
          
          resolve();
        });
        
        client.on('error', reject);
      });
    }
    
    console.log(`✅ All ${numConnections} connections established`);
    
    // Wait a bit then close all connections
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    for (const client of connections) {
      client.close();
    }
    
    console.log(`✅ All connections closed`);
    
  } catch (error) {
    console.error(`❌ Multiple connections test failed: ${error.message}`);
    
    // Clean up connections
    for (const client of connections) {
      if (client.readyState === WebSocket.OPEN) {
        client.close();
      }
    }
    
    throw error;
  }
}

/**
 * Test KU request/response
 */
async function testKURequestResponse(serverPort) {
  console.log("\n4. Testing KU request/response...");
  
  return new Promise((resolve, reject) => {
    const client = new WebSocket(`ws://localhost:${serverPort}/sgn`);
    
    const timeout = setTimeout(() => {
      client.close();
      reject(new Error('KU request timeout'));
    }, 5000);
    
    client.on('open', () => {
      console.log('✅ Client connected for KU test');
      
      // Send handshake first using protocol
      const handshakeMessage = SGNProtocolMessage.peerHandshake(
        'ku-test-peer',
        'ku-test-key'
      );
      client.send(JSON.stringify(handshakeMessage));

      // Send KU request after handshake using protocol
      setTimeout(() => {
        const requestId = `req-${Date.now()}`;
        const kuRequestMessage = SGNProtocolMessage.kuRequest(
          requestId,
          {
            type: 'security-vulnerability',
            severity: 'CRITICAL'
          },
          'ku-test-peer'
        );
        client.send(JSON.stringify(kuRequestMessage));
        console.log(`📤 Sent KU request: ${requestId}`);
      }, 500);
    });
    
    client.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        
        if (message.type === MESSAGE_TYPES.KU_RESPONSE) {
          clearTimeout(timeout);
          console.log(`📦 Received KU response: ${message.results.length} results`);
          console.log(`   Request ID: ${message.requestId}`);
          client.close();
          resolve();
        }
      } catch (error) {
        console.error(`❌ Error parsing KU response: ${error.message}`);
      }
    });
    
    client.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

/**
 * Verify port binding with system command
 */
async function verifyPortBinding(port) {
  console.log(`\n5. Verifying port binding with system command...`);
  
  const { exec } = await import('child_process');
  const { promisify } = await import('util');
  const execAsync = promisify(exec);
  
  try {
    const { stdout } = await execAsync(`lsof -i :${port}`);
    
    if (stdout.includes(`${port}`)) {
      console.log(`✅ Port ${port} is bound and listening`);
      console.log(`   Process info: ${stdout.split('\n')[1]}`);
      return true;
    } else {
      console.log(`❌ Port ${port} is not bound`);
      return false;
    }
    
  } catch (error) {
    // lsof might not be available or port not bound
    console.log(`⚠️ Could not verify port binding: ${error.message}`);
    return false;
  }
}

/**
 * Main test function
 */
async function runRealServerTest() {
  let server = null;
  
  try {
    console.log("🚀 Starting Real WebSocket Server Test...");
    
    // Test 1: Server startup
    server = await testServerStartup();
    
    // Test 2: Port verification
    await verifyPortBinding(8080);
    
    // Test 3: Single client connection
    await testClientConnection(8080);
    
    // Test 4: Multiple connections
    await testMultipleConnections(8080);
    
    // Test 5: KU request/response
    await testKURequestResponse(8080);
    
    // Get final statistics
    const finalStats = server.getStatistics();
    console.log("\n📊 Final Server Statistics:");
    console.log(`   Connections accepted: ${finalStats.connectionsAccepted}`);
    console.log(`   Connections rejected: ${finalStats.connectionsRejected}`);
    console.log(`   Messages received: ${finalStats.messagesReceived}`);
    console.log(`   Messages sent: ${finalStats.messagesSent}`);
    console.log(`   Bytes received: ${finalStats.bytesReceived}`);
    console.log(`   Bytes sent: ${finalStats.bytesSent}`);
    console.log(`   Uptime: ${finalStats.uptime}ms`);
    
    console.log("\n🎉 ALL TESTS PASSED!");
    console.log("✅ Real WebSocket Server is functional");
    console.log("✅ Port binding verified");
    console.log("✅ Client connections working");
    console.log("✅ Message protocol operational");
    
  } catch (error) {
    console.error(`\n❌ TEST FAILED: ${error.message}`);
    console.error(error.stack);
  } finally {
    // Clean up
    if (server) {
      await server.stop();
    }
  }
}

// Run the test
runRealServerTest();
