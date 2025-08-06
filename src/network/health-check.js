class ConnectionHealth {
  constructor() {
    this.monitoringIntervals = new Map();
  }

  async monitorConnection(node, targetPeer) {
    const interval = setInterval(async () => {
      const connections = node.getConnections(targetPeer);
      if (connections.length === 0) {
        console.log(`⚠️ Connection lost to ${targetPeer.toString()}, initiating recovery...`);
        await this.attemptRecovery(node, targetPeer);
      }
    }, 5000);
    this.monitoringIntervals.set(targetPeer.toString(), interval);
  }

  async attemptRecovery(node, peerId, attempt = 1) {
    const maxAttempts = 5;
    const baseDelay = 1000;

    try {
      await node.dial(peerId);
      console.log(`✅ Successfully reconnected to ${peerId.toString()}`);
      return;
    } catch (err) {
      if (attempt >= maxAttempts) {
        console.log('⚠️ Max recovery attempts reached, escalating to relay network');
        return this.useRelayNode(node, peerId);
      }

      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`⏳ Retry ${attempt}/${maxAttempts} in ${delay}ms`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return this.attemptRecovery(node, peerId, attempt + 1);
    }
  }

  useRelayNode(node, peerId) {
    const relayMultiaddr = '/ip4/RELAY_IP/tcp/RELAY_PORT/p2p/RELAY_ID';
    console.log(`🔀 Using relay node at ${relayMultiaddr}`);
    return node.dial(peerId, { multiaddrs: [relayMultiaddr] });
  }
}

module.exports = ConnectionHealth;