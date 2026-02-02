import * as net from 'net';
import prisma from './db';
import { validateQsoAgainstTemplate } from './contest-validation';
import { wsManager } from './websocket';

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
  // Protocol uses literal <BOR> and <EOR> tags in UTF-16 LE
  let decoded = data.toString('utf-16le');
  
  // Strip <BOR> prefix if present
  if (decoded.startsWith('<BOR>')) {
    decoded = decoded.substring(5);
  }
  
  // Strip <EOR> suffix and control characters
  const eorIndex = decoded.indexOf('<EOR>');
  if (eorIndex !== -1) {
    decoded = decoded.substring(0, eorIndex);
  }
  
  return decoded.trim();
}

/**
 * Encode message with UTF-16LE and N3FJP framing
 * Based on protocol capture: <BOR>message<EOR> + control chars
 */
function encodeMessage(msg: string): Buffer {
  // Protocol: <BOR>message<EOR> in UTF-16 LE + control chars 03 00 04 00 07 00
  const msgUtf16 = Buffer.from(`<BOR>${msg}<EOR>`, 'utf-16le');
  const controlChars = Buffer.from([0x03, 0x00, 0x04, 0x00, 0x07, 0x00]);
  return Buffer.concat([msgUtf16, controlChars]);
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
 * Parse operator message from N3FJP WHO/NTWK message
 * Extracts: <MSG><FROM>N7UF</FROM><TO>K7XYZ</TO><CONTENT>See you on 20CW</CONTENT></MSG>
 * Also handles broadcasts: <BROADCAST><FROM>N7UF</FROM><CONTENT>Testing</CONTENT></BROADCAST>
 */
function parseOperatorMessage(msg: string): {
  fromCall?: string;
  toCall?: string;
  content?: string;
  messageType?: string;
} {
  const result: any = {};
  
  // Check for direct message
  if (msg.includes('<MSG>') || msg.includes('<MESSAGE>')) {
    result.messageType = 'DIRECT';
    const fromMatch = msg.match(/<FROM>([^<]+)<\/FROM>/);
    if (fromMatch) result.fromCall = fromMatch[1].trim();
    
    const toMatch = msg.match(/<TO>([^<]+)<\/TO>/);
    if (toMatch) result.toCall = toMatch[1].trim();
    
    const contentMatch = msg.match(/<CONTENT>([^<]+)<\/CONTENT>/) || msg.match(/<TEXT>([^<]+)<\/TEXT>/);
    if (contentMatch) result.content = contentMatch[1].trim();
  }
  
  // Check for broadcast message
  if (msg.includes('<BROADCAST>') || (msg.includes('<NTWK>') && msg.includes('<MSG>'))) {
    result.messageType = 'BROADCAST';
    const fromMatch = msg.match(/<FROM>([^<]+)<\/FROM>/);
    if (fromMatch) result.fromCall = fromMatch[1].trim();
    result.toCall = 'ALL';
    
    const contentMatch = msg.match(/<CONTENT>([^<]+)<\/CONTENT>/) || msg.match(/<MSG>([^<]+)<\/MSG>/) || msg.match(/<TEXT>([^<]+)<\/TEXT>/);
    if (contentMatch) result.content = contentMatch[1].trim();
  }
  
  return result;
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
async function logBandActivity(stationId: string, band: string, mode: string, source: string = 'n3fjp') {
  try {
    const activity = await prisma.bandActivity.create({
      data: {
        stationId,
        band,
        mode,
      },
    });
    
    // Get the active contest
    const activeContest = await prisma.contest.findFirst({
      where: { isActive: true },
    });
    
    // Delete ALL old band occupancy entries for this station
    await prisma.bandOccupancy.deleteMany({
      where: { stationId }
    });
    
    // Create single entry for current band/mode
    await prisma.bandOccupancy.create({
      data: {
        stationId,
        contestId: activeContest?.id,
        band,
        mode,
        source,
      }
    });
    
    // Also log context event
    const contextLog = await prisma.contextLog.create({
      data: {
        stationId,
        level: 'INFO',
        category: 'BAND_CHANGE',
        message: `Changed to ${band}m ${mode}`,
        details: JSON.stringify({ band, mode, source }),
      },
    });

    // Broadcast to debug listeners
    wsManager.broadcast('logs', 'contextLog', contextLog);
    
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
      prisma.contextLog.create({
        data: {
          stationId: client.stationId,
          level: 'INFO',
          category: 'NETWORK',
          message: `Relay received: ${msg.substring(0, 100)}...`,
          details: JSON.stringify({ msgType: msg.substring(0, 10), length: msg.length }),
        },
      }).then(log => {
        wsManager.broadcast('logs', 'contextLog', log);
      }).catch(() => {}); // Ignore errors for logging
    }
    
    // Parse BAMS message for band changes
    if (msg.includes('<BAMS>')) {
      const { station, band, mode } = parseBAMS(msg);
      
      if (station && band && mode) {
        const dbStation = await getOrCreateStation(station);
        if (dbStation) {
          // Validate against active contest
          const activeContest = await prisma.contest.findFirst({
            where: { isActive: true },
            include: { template: true },
          });
          
          if (activeContest?.template) {
            const validationResult = validateQsoAgainstTemplate(
              { band, mode } as any,
              activeContest.template
            );
            
            if (!validationResult.valid) {
              console.warn(
                `[${station}] Invalid band/mode for ${activeContest.name}:`,
                validationResult.errors.join(', ')
              );
              const log = await prisma.contextLog.create({
                data: {
                  stationId: dbStation.id,
                  level: 'WARN',
                  category: 'VALIDATION',
                  message: `Invalid band/mode: ${band}/${mode}`,
                  details: JSON.stringify(validationResult.errors),
                },
              });
              wsManager.broadcast('logs', 'contextLog', log);
            }
          }
          
          // Check if this is actually a mode change (prevents duplicates)
          const hasChanged = 
            !client.currentBand || client.currentBand !== band ||
            !client.currentMode || client.currentMode !== mode;
          
          client.stationId = dbStation.id;
          client.stationName = station;
          client.currentBand = band;
          client.currentMode = mode;
          
          const localPort = client.socket.localPort || 10000;
          
          if (hasChanged) {
            await logBandActivity(dbStation.id, band, mode);
            await updateNetworkStatus(
              dbStation.id,
              true,
              client.socket.remoteAddress,
              localPort,
            );
            
            // Notify UI of band/mode change via WebSocket (only on actual change)
            wsManager.broadcast('stations', 'bandModeChange', {
              stationId: dbStation.id,
              callsign: station,
              band,
              mode,
              timestamp: new Date(),
            });
          }
          
          // CRITICAL: Echo BAMS back to sender immediately (from protocol capture)
          console.log(`[${station}] BAMS received - echoing back`);
          client.socket.write(data);
        }
      }
    }
    
    // Parse and store operator messages
    if (msg.includes('<MSG>') || msg.includes('<BROADCAST>')) {
      const messageData = parseOperatorMessage(msg);
      if (messageData.fromCall && messageData.content && client.stationId) {
        try {
          const msgRecord = await prisma.operatorMessage.create({
            data: {
              stationId: client.stationId,
              fromCall: messageData.fromCall,
              toCall: messageData.toCall || 'ALL',
              messageType: messageData.messageType || 'BROADCAST',
              content: messageData.content,
              source: 'n3fjp',
              rawPayload: msg,
            },
          });
          
          console.log(
            `[${messageData.fromCall}→${messageData.toCall || 'ALL'}] Message stored: "${messageData.content.substring(0, 50)}..."`
          );
          
          // Notify UI of new message via WebSocket
          wsManager.broadcast('messages', 'newMessage', {
            id: msgRecord.id,
            fromCall: messageData.fromCall,
            toCall: messageData.toCall,
            content: messageData.content,
            messageType: messageData.messageType,
            timestamp: msgRecord.createdAt,
          });
        } catch (error: any) {
          console.error('Error storing operator message:', error.message);
        }
      }
    }
    
    // Handle special messages that need responses
    if (msg.includes('<WHO>')) {
      console.log(`[${client.stationName || clientId}] WHO request - responding with roster`);
      // Build roster of all connected stations
      const roster: string[] = [];
      for (const [, c] of connectedClients) {
        if (c.stationName && c.stationName !== client.stationName) {
          roster.push(`<BAMS><STATION>${c.stationName}</STATION><BAND>${c.currentBand || '20'}</BAND><MODE>${c.currentMode || 'CW'}</MODE>`);
        }
      }
      
      // Send WHO response
      client.socket.write(encodeMessage('<WHO>'));
      
      // Send each station's BAMS
      for (const bams of roster) {
        client.socket.write(encodeMessage(bams));
      }
    }
    
    if (msg.includes('<NTWK>') && msg.includes('<CHECK>')) {
      console.log(`[${client.stationName || clientId}] CHECK request - responding`);
      const fromStation = client.stationName || 'SERVER';
      const response = `<NTWK><FROM>${fromStation}</FROM><TRANSACTION>CHECK</TRANSACTION><XMLDATA><COUNT>0</COUNT><LAST>0</LAST></XMLDATA>`;
      client.socket.write(encodeMessage(response));
    }
    
    if (msg.includes('<NTWK>') && msg.includes('<OPEN>')) {
      console.log(`[${client.stationName || clientId}] OPEN/connect request - sending acknowledgment`);
      // Send CLEAR and LIST transactions like real server does
      client.socket.write(encodeMessage('<NTWK><TRANSACTION>CLEAR</TRANSACTION>'));
      client.socket.write(encodeMessage('<NTWK><TRANSACTION>LIST</TRANSACTION>'));
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
    prisma.contextLog.create({
      data: {
        stationId: client.stationId,
        level: 'WARN',
        category: 'NETWORK',
        message: `Station disconnected from relay`,
      },
    }).then(log => {
      wsManager.broadcast('logs', 'contextLog', log);
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
