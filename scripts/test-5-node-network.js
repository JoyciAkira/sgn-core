const { createNetwork } = require('../src/network/core');
const { generateKU } = require('../src/data-generator');

async function stressTest() {
  // Inizializza 5 nodi
  const nodes = await Promise.all(Array(5).fill().map((_, i) => 
    createNetwork({
      nodeId: `node_${i+1}`,
      port: 4000 + i,
      enableRelay: true
    })
  ));

  // Connessione a forma di stella
  await nodes[0].connect(nodes[1].peerId);
  await nodes[0].connect(nodes[2].peerId);
  await nodes[3].connect(nodes[0].peerId);
  await nodes[4].connect(nodes[0].peerId);

  // Test di propagazione KU
  const testResults = {
    totalSent: 0,
    receivedCount: new Map(),
    latencies: []
  };

  // Registra gli handler
  nodes.forEach(node => {
    node.on('ku-received', (ku, sender) => {
      const arrivalTime = Date.now();
      const latency = arrivalTime - ku.timestamp;
      
      testResults.receivedCount.set(ku.id, (testResults.receivedCount.get(ku.id) || 0) + 1);
      testResults.latencies.push(latency);
    });
  });

  // Genera 100 KU dal nodo centrale
  for (let i = 0; i < 100; i++) {
    const ku = generateKU({
      type: 'vulnerability',
      severity: 'high',
      sourceNode: nodes[0].peerId.toString()
    });
    
    await nodes[0].broadcastKU(ku);
    testResults.totalSent++;
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  // Calcola le metriche
  const successfulDeliveries = [...testResults.receivedCount.values()]
    .filter(count => count === 4).length;

  const avgLatency = testResults.latencies
    .reduce((a, b) => a + b, 0) / testResults.latencies.length;

  return {
    successRate: `${(successfulDeliveries / testResults.totalSent * 100).toFixed(1)}%`,
    avgLatency: `${avgLatency.toFixed(1)}ms`,
    lostMessages: testResults.totalSent - successfulDeliveries
  };
}

stressTest()
  .then(console.log)
  .catch(console.error);