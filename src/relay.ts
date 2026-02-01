import * as net from 'net';
import prisma from './db';

interface ConnectedClient {
  socket: net.Socket;
  stationName?: string;
  stationId?: string;
  currentBand?: string;
  currentMode?: string;
  isAuthenticated: boolean;
}

const connectedClients = new Map<string, ConnectedClient>();
let clientCounter = 0;

/**
 * Decode UTF-16LE message, handling BOR/EOR framing
 */
function decodeMessage(data: Buffer): string {
  // BOR = 0x00 0x01, EOR = 0x00 0x03 0x00 0x04 0x00 0x07
  // Remove framing and decode
  let cleaned = data.toString('utf-16le', 2); // Skip BOR
  cleaned = cleaned.split('\x00')[0]; // Remove null terminator and EOR remnants
  return cleaned.trim();
}

/**
 * Encode message with UTF-16LE and N3FJP framing
 * (Reserved for future use - currently using raw relay)
 */
// @ts-ignore
function _encodeMessage(msg: string): Buffer {
  const bor = Buffer.from([0x00, 0x01]);
  const eor = Buffer.from([0x00, 0x03, 0x00, 0x04, 0x00, 0x07]);
  const utf16msg = Buffer.from(msg, 'utf-16le');
  return Buffer.concat([bor, utf16msg, eor]);
}

/**
 * Parse BAMS message to extract station, band, mode
 * Format: <BAMS><STATION>callsign</STATION><BAND>20</BAND><MODE>CW</MODE></BAMS>
 */
function parseBAMS(msg: string): { station?: string; band?: string; mode?: string } {
  const result: any = {};
  
  const stationMatch = msg.match(/<STATION>([^<]+)<\/STATION>/);
  if (stationMatch) result.station = stationMatch[1];
  
  const bandMatch = msg.match(/<BAND>([^<]+)<\/BAND>/);
  if (bandMatch) result.band = bandMatch[1];
  
  const modeMatch = msg.match(/<MODE>([^<]+)<\/MODE>/);
  if (modeMatch) result.mode = modeMatch[1];
  
  return result;
}

/**
 * Parse WHO (roster) message
 * (Reserved for future use)
 */
// @ts-ignore
function _parseWHO(msg: string): string[] {
  const stations: string[] = [];
  const matches = msg.matchAll(/<STATION>([^<]+)<\/STATION>/g);
  for (const match of matches) {
    stations.push(match[1]);
  }
  return stations;
}

/**
 * Get or create station in database
 */
async function getOrCreateStation(callsign: string) {
  try {
    let station = await prisma.station.findUnique({
      where: { callsign },
    });
    
    if (!station) {
      station = await prisma.station.create({
        data: {
          callsign,
          name: callsign,
        },
      });
    }
    
    return station;
  } catch (error) {
    console.error(`Error getting/creating station ${callsign}:`, error);
    return null;
  }
}

/**
 * Log band activity change
 */
async function logBandActivity(stationId: string, band: string, mode: string) {
  try {
    const activity = await prisma.bandActivity.create({
      data: {
        stationId,
        band,
        mode,
      },
    });
    
    // Also log context event
    await prisma.contextLog.create({
      data: {
        stationId,
        level: 'INFO',
        category: 'BAND_CHANGE',
        message: `Changed to ${band}m ${mode}`,
        details: JSON.stringify({ band, mode }),
      },
    });
    
    return activity;
  } catch (error: any) {
    console.error('Error logging band activity:', error.message);
    return null;
  }
}

/**
 * Update network status

 */
async function updateNetworkStatus(
  stationId: string,
  isConnected: boolean,
  clientIp?: string,
  relayPort: number = 10000,
) {
  try {
    let status = await prisma.networkStatus.findUnique({
      where: { stationId },
    });
    
    if (!status) {
      status = await prisma.networkStatus.create({
        data: {
          stationId,
          isConnected,
          ip: clientIp,
          port: relayPort,
          relayHost: 'localhost',
          relayPort,
          relayVersion: '1.0.0',
        },
      });
    } else {
      status = await prisma.networkStatus.update({
        where: { stationId },
        data: {
          isConnected,
          lastConnected: isConnected ? new Date() : status.lastConnected,
          ip: clientIp || status.ip,
          port: relayPort,
          relayPort,
        },
      });
    }
    
    return status;
  } catch (error: any) {
    console.error('Error updating network status:', error.message);
    return null;
  }
}

/**
 * Broadcast message to all connected clients
 */
function broadcastMessage(data: Buffer, senderClientId?: string) {
  let broadcast = 0;
  for (const [clientId, client] of connectedClients.entries()) {
    if (clientId === senderClientId) continue; // Don't send back to sender
    
    try {
      client.socket.write(data);
      broadcast++;
    } catch (error) {
      console.error(`Error broadcasting to ${clientId}:`, error);
    }
  }
  return broadcast;
}

/**
 * Handle incoming data from client
 */
async function handleClientData(clientId: string, data: Buffer) {
  const client = connectedClients.get(clientId);
  if (!client) return;
  
  try {
    const msg = decodeMessage(data);
    
    // Log all relay messages (only if we have a stationId)
    if (client.stationId) {
      await prisma.contextLog.create({
        data: {
          stationId: client.stationId,
          level: 'INFO',
          category: 'NETWORK',
          message: `Relay received: ${msg.substring(0, 100)}...`,
          details: JSON.stringify({ msgType: msg.substring(0, 10), length: msg.length }),
        },
      }).catch(() => {}); // Ignore errors for logging
    }
    
    // Parse BAMS message for band changes
    if (msg.includes('<BAMS>')) {
      const { station, band, mode } = parseBAMS(msg);
      
      if (station && band && mode) {
        const dbStation = await getOrCreateStation(station);
        if (dbStation) {
          client.stationId = dbStation.id;
          client.stationName = station;
          client.currentBand = band;
          client.currentMode = mode;
          
          const localPort = client.socket.localPort || 10000;
          await logBandActivity(dbStation.id, band, mode);
          await updateNetworkStatus(
            dbStation.id,
            true,
            client.socket.remoteAddress,
            localPort,
          );
        }
      }
    }
    
    // Relay message to all other connected clients
    const broadcast = broadcastMessage(data, clientId);
    console.log(`[${client.stationName || clientId}] Relayed to ${broadcast} clients`);
    
  } catch (error) {
    console.error(`Error handling client data from ${clientId}:`, error);
  }
}

/**
 * Handle client disconnect
 */
async function handleClientDisconnect(clientId: string) {
  const client = connectedClients.get(clientId);
  if (!client) return;
  
  console.log(`[${client.stationName || clientId}] Disconnected`);
  
  // Update network status
  if (client.stationId) {
    const localPort = client.socket.localPort || 10000;
    await updateNetworkStatus(
      client.stationId,
      false,
      client.socket.remoteAddress,
      localPort,
    );
    
    // Log disconnect event
    await prisma.contextLog.create({
      data: {
        stationId: client.stationId,
        level: 'WARN',
        category: 'NETWORK',
        message: `Station disconnected from relay`,
      },
    }).catch(() => {});
  }
  
  connectedClients.delete(clientId);
}

/**
 * Main relay server
 */
export function startRelayServer(port: number = 10000, host: string = '0.0.0.0') {
  const server = net.createServer((socket) => {
    const clientId = `client-${++clientCounter}`;
    
    const client: ConnectedClient = {
      socket,
      isAuthenticated: true, // N3FJP relay doesn't authenticate
    };
    
    connectedClients.set(clientId, client);
    
    const remoteAddr = socket.remoteAddress || 'unknown';
    console.log(`\n[${clientId}] Connected from ${remoteAddr}`);
    
    // Log connection
    prisma.contextLog
      .create({
        data: {
          stationId: 'relay',
          level: 'INFO',
          category: 'NETWORK',
          message: `New connection from ${remoteAddr}`,
        },
      })
      .catch(() => {});
    
    socket.on('data', (data) => {
      handleClientData(clientId, data);
    });
    
    socket.on('end', () => {
      handleClientDisconnect(clientId);
    });
    
    socket.on('error', (error) => {
      console.error(`[${clientId}] Socket error:`, error.message);
      handleClientDisconnect(clientId);
    });
  });
  
  server.listen(port, host, () => {
    const displayHost = host === '0.0.0.0' ? 'all interfaces' : host;
    console.log(`\n✓ YAHAML Relay Server listening on ${host}:${port}`);
    console.log(`  - Accessible from: ${displayHost}`);
    console.log(`  - Protocol: N3FJP TCP relay`);
    console.log(`  - Encoding: UTF-16LE with BOR/EOR framing`);
    console.log(`  - Mode: Silent relay (broadcasts all messages to all clients)`);
    console.log(`  - Protocol: N3FJP TCP relay`);
    console.log(`  - Encoding: UTF-16LE with BOR/EOR framing`);
    console.log(`  - Mode: Silent relay (broadcasts all messages to all clients)`);
  });
  
  return server;
}

export { ConnectedClient, connectedClients };
