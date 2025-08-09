import test from 'node:test';
import assert from 'node:assert/strict';
import { RealSGNWebSocketServer } from '../src/network/real-websocket-server.mjs';
import WebSocket from 'ws';
import { SGNProtocolMessage } from '../src/network/sgn-p2p-protocol.mjs';

await test('outbox queues without peers and flushes when a peer connects', async () => {
  const server = new RealSGNWebSocketServer({ port: 9091, host: '127.0.0.1', nodeId: 'server-A' });
  await server.start();

  // Publish a KU broadcast before any peer is connected
  const ku = { id: 'ku-1', title: 'Test KU', type: 'ku.note', severity: 'LOW' };
  const msg = SGNProtocolMessage.kuBroadcast(ku, 'server-A');
  const delivered = server.publishOrEnqueue(msg);
  assert.equal(delivered, 0, 'Should enqueue when no peers');

  // Now connect a peer and ensure it receives the queued message
  await new Promise((resolve, reject) => {
    const client = new WebSocket('ws://127.0.0.1:9091/sgn');
    const timer = setTimeout(() => reject(new Error('timeout')), 4000);

    client.on('open', () => {
      // send handshake to complete registration
      client.send(JSON.stringify(SGNProtocolMessage.peerHandshake('peer-1','pubkey-1')));
    });

    client.on('message', (data) => {
      try {
        const m = JSON.parse(data.toString());
        if (m.type === 'welcome') {
          // ask server to flush just in case
          // nothing to send; flush happens after handshake on server
        }
        if (m.type === 'ku-broadcast' && m.ku?.id === 'ku-1') {
          clearTimeout(timer);
          client.close();
          resolve();
        }
      } catch {}
    });

    client.on('error', reject);
  });

  await server.stop();
});

