// Demo script for 5-node network stress testing
// Note: requires ../src/network/core and ../src/data-generator modules
const { createNetwork } = require('../src/network/core');
const { generateKU } = require('../src/data-generator');

async function stressTest() {
  const nodes = await Promise.all(Array(5).fill().map((_, i) => 
    createNetwork({ nodeId: `node_${i+1}`, port: 4000 + i, enableRelay: true })
  ));

  await nodes[0].connect(nodes[1].peerId);
  await nodes[0].connect(nodes[2].peerId);
  await nodes[3].connect(nodes[0].peerId);
  await nodes[4].connect(nodes[0].peerId);

  const testResults = { totalSent: 0, receivedCount: new Map(), latencies: [] };
  nodes.forEach(node => {
    node.on('ku-received', (ku, sender) => {
      const arrivalTime = Date.now();
      const latency = arrivalTime - ku.timestamp;
      testResults.receivedCount.set(ku.id, (testResults.receivedCount.get(ku.id) || 0) + 1);
      testResults.latencies.push(latency);
    });
  });

  for (let i = 0; i < 100; i++) {
    const ku = generateKU({ type: 'vulnerability', severity: 'high', sourceNode: nodes[0].peerId.toString() });
    await nodes[0].broadcastKU(ku);
    testResults.totalSent++;
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  const successfulDeliveries = [...testResults.receivedCount.values()].filter(count => count === 4).length;
  const avgLatency = testResults.latencies.reduce((a, b) => a + b, 0) / testResults.latencies.length;
  console.log(JSON.stringify({ successRate: `${(successfulDeliveries / testResults.totalSent * 100).toFixed(1)}%`, avgLatency: `${avgLatency.toFixed(1)}ms`, lostMessages: testResults.totalSent - successfulDeliveries }));
}

stressTest().catch(err => { console.error(String(err)); process.exit(1); });

