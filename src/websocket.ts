import { WebSocketServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import type { Server as HTTPServer } from 'http';
import prisma from './db';

// WebSocket message types
export interface WSMessage {
  type: string;
  channel?: string;
  filters?: Record<string, any>;
  data?: any;
}

/**
 * Real-time WebSocket channels available:
 * 
 * 'stations' - Band/mode changes
 *   Events: bandModeChange
 *   Data: { stationId, callsign, band, mode, timestamp }
 * 
 * 'messages' - Operator messages and DMs
 *   Events: newMessage
 *   Data: { id, fromCall, toCall, content, messageType, timestamp }
 * 
 * 'qsos' - QSO logging (new contacts)
 *   Events: newQSO
 *   Data: { id, callsign, band, mode, stationId, timestamp }
 * 
 * 'band-occupancy' - Current band/mode occupation state
 *   Events: occupancyUpdate
 *   Data: { band, mode, activeStations: [{callsign, source, lastSeen}], count }
 * 
 * 'stats' - Contest stats aggregates
 *   Events: statsUpdate
 *   Data: { qsoCount, pointsTotal, qsoPerHour, topCalls: [...] }
 *
 * 'voice' - WebRTC voice room signaling and events
 *   Events: participantJoined, participantLeft, signal, mute, unmute
 *   Data: varies by event type
 */

// Client subscription info
interface ClientSubscription {
  ws: WebSocket;
  channels: Set<string>;
  filters: Map<string, Record<string, any>>;
  userId?: string; // optional user/station ID for targeted messages
}

class WebSocketManager {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, ClientSubscription> = new Map();

  initialize(server: HTTPServer) {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
      console.log('WebSocket client connected:', req.socket.remoteAddress);

      // Initialize client subscription
      this.clients.set(ws, {
        ws,
        channels: new Set<string>(),
        filters: new Map<string, Record<string, any>>(),
      });

      // Identify client from token if provided
      const token = this.getTokenFromRequest(req);
      if (token) {
        this.attachUserFromToken(ws, token).catch((error) => {
          console.warn('WebSocket token validation failed:', error instanceof Error ? error.message : error);
        });
      }

      // Send welcome message
      this.send(ws, {
        type: 'connected',
        data: { message: 'Connected to YAHAML WebSocket server' },
      });

      // Handle incoming messages
      ws.on('message', (data: Buffer) => {
        try {
          const message: WSMessage = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          console.error('WebSocket message parse error:', error);
          this.send(ws, {
            type: 'error',
            data: { message: 'Invalid message format' },
          });
        }
      });

      // Handle client disconnect
      ws.on('close', () => {
        console.log('WebSocket client disconnected');
        this.clients.delete(ws);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });

      // Ping-pong for keepalive
      const pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) {
          ws.ping();
        } else {
          clearInterval(pingInterval);
        }
      }, 30000); // 30 seconds

      ws.on('pong', () => {
        // Client is alive
      });
    });

    console.log('WebSocket server initialized on /ws');
  }

  private handleMessage(ws: WebSocket, message: WSMessage) {
    const client = this.clients.get(ws);
    if (!client) return;

    switch (message.type) {
      case 'subscribe':
        if (message.channel) {
          client.channels.add(message.channel);
          if (message.filters) {
            client.filters.set(message.channel, message.filters);
          }
          this.send(ws, {
            type: 'subscribed',
            channel: message.channel,
            data: { message: `Subscribed to ${message.channel}` },
          });
          console.log(`Client subscribed to channel: ${message.channel}`);
        }
        break;

      case 'unsubscribe':
        if (message.channel) {
          client.channels.delete(message.channel);
          client.filters.delete(message.channel);
          this.send(ws, {
            type: 'unsubscribed',
            channel: message.channel,
            data: { message: `Unsubscribed from ${message.channel}` },
          });
          console.log(`Client unsubscribed from channel: ${message.channel}`);
        }
        break;

      case 'ping':
        this.send(ws, { type: 'pong' });
        break;

      default:
        this.send(ws, {
          type: 'error',
          data: { message: `Unknown message type: ${message.type}` },
        });
    }
  }

  private getTokenFromRequest(req: IncomingMessage): string | null {
    try {
      const host = req.headers.host || 'localhost';
      const url = new URL(req.url || '', `http://${host}`);
      return url.searchParams.get('token');
    } catch {
      return null;
    }
  }

  private async attachUserFromToken(ws: WebSocket, token: string): Promise<void> {
    const client = this.clients.get(ws);
    if (!client) return;

    const session = await prisma.session.findUnique({ where: { token } });
    if (!session) return;

    const now = new Date();
    if (now > session.expiresAt) return;

    const inactiveMs = now.getTime() - session.lastActivity.getTime();
    const inactiveMin = inactiveMs / (1000 * 60);
    if (inactiveMin > 20) return;

    await prisma.session.update({
      where: { id: session.id },
      data: { lastActivity: now },
    });

    client.userId = session.stationId;
  }

  private send(ws: WebSocket, message: WSMessage) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast message to all clients subscribed to a channel
   */
  broadcast(channel: string, type: string, data: any) {
    const message: WSMessage = { type, channel, data };

    this.clients.forEach((client) => {
      if (client.channels.has(channel)) {
        // Check if filters match (if any)
        const filters = client.filters.get(channel);
        if (filters && !this.matchesFilters(data, filters)) {
          return;
        }

        this.send(client.ws, message);
      }
    });
  }

  /**
   * Send message to a specific client by userId
   */
  sendTo(userId: string, channel: string, type: string, data: any) {
    const message: WSMessage = { type, channel, data };

    this.clients.forEach((client) => {
      if (client.userId === userId && client.channels.has(channel)) {
        this.send(client.ws, message);
      }
    });
  }

  /**
   * Broadcast to all connected clients (global)
   */
  broadcastAll(type: string, data: any) {
    const message: WSMessage = { type, data };

    this.clients.forEach((client) => {
      this.send(client.ws, message);
    });
  }

  /**
   * Check if data matches filters
   */
  private matchesFilters(data: any, filters: Record<string, any>): boolean {
    for (const [key, value] of Object.entries(filters)) {
      if (data[key] !== value) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get count of connected clients
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get count of clients subscribed to a channel
   */
  getChannelSubscriberCount(channel: string): number {
    let count = 0;
    this.clients.forEach((client) => {
      if (client.channels.has(channel)) {
        count++;
      }
    });
    return count;
  }

  /**
   * Close all connections
   */
  close() {
    if (this.wss) {
      this.wss.clients.forEach((ws) => {
        ws.close();
      });
      this.wss.close();
      this.clients.clear();
      console.log('WebSocket server closed');
    }
  }
}

// Singleton instance
export const wsManager = new WebSocketManager();
