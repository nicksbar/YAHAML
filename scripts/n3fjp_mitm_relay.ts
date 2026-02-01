#!/usr/bin/env node
/**
 * N3FJP Protocol MITM Relay
 * 
 * Acts as a transparent proxy between a client and the N3FJP server
 * Records all bidirectional communication for protocol analysis
 * 
 * Usage:
 *   node scripts/n3fjp_mitm_relay.js [client_port] [server_host] [server_port]
 * 
 * Example:
 *   node scripts/n3fjp_mitm_relay.js 2000 localhost 1000
 *   # Client connects to localhost:2000, relay forwards to localhost:1000
 */

import * as net from 'net';
import * as fs from 'fs';
import * as path from 'path';

const clientPort = parseInt(process.argv[2]) || 2000;
const serverHost = process.argv[3] || 'localhost';
const serverPort = parseInt(process.argv[4]) || 1000;

const logDir = './captures';
const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
const logFile = path.join(logDir, `n3fjp_mitm_${timestamp}.log`);
const dataFile = path.join(logDir, `n3fjp_mitm_${timestamp}.json`);

// Ensure captures directory exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const log = (message: string) => {
  const msg = `[${new Date().toISOString()}] ${message}`;
  console.log(msg);
  fs.appendFileSync(logFile, msg + '\n');
};

interface RelayConnection {
  id: string;
  client: net.Socket | null;
  server: net.Socket | null;
  clientConnected: boolean;
  serverConnected: boolean;
  messages: Array<{
    direction: 'client→server' | 'server→client';
    timestamp: string;
    hex: string;
    ascii: string;
    length: number;
  }>;
}

const connections = new Map<string, RelayConnection>();
let connectionId = 0;

const createConnection = (): RelayConnection => ({
  id: `conn-${++connectionId}`,
  client: null,
  server: null,
  clientConnected: false,
  serverConnected: false,
  messages: [],
});

const formatBuffer = (buf: Buffer) => {
  const hex = buf.toString('hex').match(/.{1,2}/g)?.join(' ') || '';
  const ascii = buf
    .toString('ascii', 0, Math.min(buf.length, 64))
    .replace(/[^\x20-\x7e]/g, '.');
  return { hex, ascii };
};

const recordMessage = (
  relay: RelayConnection,
  direction: 'client→server' | 'server→client',
  data: Buffer,
) => {
  const { hex, ascii } = formatBuffer(data);
  relay.messages.push({
    direction,
    timestamp: new Date().toISOString(),
    hex,
    ascii,
    length: data.length,
  });

  const preview = ascii.length > 40 ? ascii.slice(0, 40) + '...' : ascii;
  log(
    `[${relay.id}] ${direction} (${data.length} bytes): ${preview}`,
  );
};

const handleClientConnection = (client: net.Socket) => {
  const relay = createConnection();
  relay.client = client;
  connections.set(relay.id, relay);

  const clientAddr = `${client.remoteAddress}:${client.remotePort}`;
  log(`[${relay.id}] Client connected from ${clientAddr}`);
  relay.clientConnected = true;

  // Connect to server
  const server = net.createConnection(serverPort, serverHost, () => {
    relay.server = server;
    relay.serverConnected = true;
    log(`[${relay.id}] Connected to server at ${serverHost}:${serverPort}`);
  });

  server.on('error', (err) => {
    log(`[${relay.id}] Server connection error: ${err.message}`);
    client.destroy();
    connections.delete(relay.id);
  });

  server.on('close', () => {
    log(`[${relay.id}] Server connection closed`);
    relay.serverConnected = false;
    client.destroy();
    saveRelayData(relay);
    connections.delete(relay.id);
  });

  // Server → Client
  server.on('data', (data) => {
    recordMessage(relay, 'server→client', data);
    client.write(data);
  });

  // Client → Server
  client.on('data', (data) => {
    recordMessage(relay, 'client→server', data);
    server.write(data);
  });

  client.on('error', (err) => {
    log(`[${relay.id}] Client connection error: ${err.message}`);
    relay.clientConnected = false;
    server.destroy();
    connections.delete(relay.id);
  });

  client.on('close', () => {
    log(`[${relay.id}] Client connection closed`);
    relay.clientConnected = false;
    server.destroy();
    saveRelayData(relay);
    connections.delete(relay.id);
  });

  client.on('end', () => {
    log(`[${relay.id}] Client end`);
    server.end();
  });
};

const saveRelayData = (relay: RelayConnection) => {
  const data = {
    id: relay.id,
    timestamp: new Date().toISOString(),
    serverHost,
    serverPort,
    messageCount: relay.messages.length,
    messages: relay.messages,
  };

  const existingData = fs.existsSync(dataFile)
    ? JSON.parse(fs.readFileSync(dataFile, 'utf-8'))
    : [];
  existingData.push(data);
  fs.writeFileSync(dataFile, JSON.stringify(existingData, null, 2));

  log(`[${relay.id}] Saved ${relay.messages.length} messages to ${dataFile}`);
};

// Create relay server
const relayServer = net.createServer(handleClientConnection);

relayServer.on('error', (err) => {
  console.error(`Relay server error: ${err.message}`);
  process.exit(1);
});

relayServer.listen(clientPort, () => {
  log(
    `N3FJP MITM Relay listening on port ${clientPort}`,
  );
  log(`Forwarding to ${serverHost}:${serverPort}`);
  log(`Logging to ${logFile}`);
  log(`Data to ${dataFile}`);
  log('---');
  log('Start server on port 1000 and client on this relay port');
  log(`Example: nc localhost ${clientPort}  (to test)`);
});

// Graceful shutdown
process.on('SIGINT', () => {
  log('Shutting down...');
  relayServer.close(() => {
    log('Relay server closed');
    // Save any remaining connections
    connections.forEach((relay) => {
      if (relay.messages.length > 0) {
        saveRelayData(relay);
      }
    });
    process.exit(0);
  });
});
