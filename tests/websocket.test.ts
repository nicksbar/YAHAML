import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import WebSocket from 'ws';
import { PrismaClient } from '@prisma/client';

const API_URL = 'http://127.0.0.1:3000';
const WS_URL = 'ws://127.0.0.1:3000/ws';

const prisma = new PrismaClient();

// Helper to wait for WebSocket message
function waitForMessage(ws: WebSocket, timeout = 5000): Promise<any> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timeout waiting for message'));
    }, timeout);

    ws.once('message', (data) => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(data.toString()));
      } catch (error) {
        reject(error);
      }
    });
  });
}

describe('WebSocket Integration', () => {
  let ws: WebSocket;
  let stationId: string;
  let contestId: string;

  beforeAll(async () => {
    // Server is already running; just wait a bit for stability
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  beforeEach(async () => {
    const timestamp = Date.now();
    
    // Create test station
    const station = await prisma.station.create({
      data: {
        callsign: `W5WS${timestamp}`,
        name: 'WebSocket Test Station',
      },
    });
    stationId = station.id;

    // Create test contest
    const contest = await prisma.contest.create({
      data: {
        name: `WebSocket Test Contest ${timestamp}`,
      },
    });
    contestId = contest.id;
  });

  afterEach(async () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
    
    // Clean up
    await prisma.logAggregate.deleteMany({ where: { contestId } });
    await prisma.logEntry.deleteMany({ where: { contestId } });
    await prisma.contest.deleteMany({ where: { id: contestId } });
    await prisma.station.deleteMany({ where: { id: stationId } });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Connection', () => {
    it('should connect to WebSocket server', (done) => {
      ws = new WebSocket(WS_URL);

      ws.on('open', () => {
        expect(ws.readyState).toBe(WebSocket.OPEN);
        done();
      });

      ws.on('error', (error) => {
        done(error);
      });
    });

    it('should receive welcome message on connection', async () => {
      ws = new WebSocket(WS_URL);

      await new Promise((resolve) => ws.on('open', resolve));

      const message = await waitForMessage(ws);

      expect(message.type).toBe('connected');
      expect(message.data.message).toContain('Connected');
    });

    it('should handle ping-pong', async () => {
      ws = new WebSocket(WS_URL);

      await new Promise((resolve) => ws.on('open', resolve));
      await waitForMessage(ws); // Welcome message

      // Send ping
      ws.send(JSON.stringify({ type: 'ping' }));

      const response = await waitForMessage(ws);
      expect(response.type).toBe('pong');
    });
  });

  describe('Subscriptions', () => {
    beforeEach(async () => {
      ws = new WebSocket(WS_URL);
      await new Promise((resolve) => ws.on('open', resolve));
      await waitForMessage(ws); // Consume welcome message
    });

    it('should subscribe to a channel', async () => {
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: `contest:${contestId}`,
      }));

      const response = await waitForMessage(ws);

      expect(response.type).toBe('subscribed');
      expect(response.channel).toBe(`contest:${contestId}`);
    });

    it('should unsubscribe from a channel', async () => {
      // Subscribe first
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: `contest:${contestId}`,
      }));
      await waitForMessage(ws);

      // Unsubscribe
      ws.send(JSON.stringify({
        type: 'unsubscribe',
        channel: `contest:${contestId}`,
      }));

      const response = await waitForMessage(ws);

      expect(response.type).toBe('unsubscribed');
      expect(response.channel).toBe(`contest:${contestId}`);
    });

    it('should reject unknown message types', async () => {
      ws.send(JSON.stringify({
        type: 'invalid_type',
      }));

      const response = await waitForMessage(ws);

      expect(response.type).toBe('error');
      expect(response.data.message).toContain('Unknown message type');
    });
  });

  describe('Real-time Updates', () => {
    beforeEach(async () => {
      ws = new WebSocket(WS_URL);
      await new Promise((resolve) => ws.on('open', resolve));
      await waitForMessage(ws); // Consume welcome message

      // Subscribe to contest channel
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: `contest:${contestId}`,
      }));
      await waitForMessage(ws); // Consume subscription confirmation
    });

    it('should broadcast logEntry:created on new QSO', async () => {
      // Create a promise to catch the broadcast
      const broadcastPromise = waitForMessage(ws, 10000);

      // Create log entry via API
      await fetch(`${API_URL}/api/qso-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId,
          contestId,
          callsign: 'W0XYZ',
          band: '40m',
          mode: 'CW',
          qsoDate: new Date().toISOString(),
          qsoTime: '1500',
          operatorCallsign: 'W5ABC',
          source: 'test',
          dedupeKey: `ws-test-${Date.now()}`,
        }),
      });

      const message = await broadcastPromise;

      expect(message.type).toBe('logEntry:created');
      expect(message.channel).toBe(`contest:${contestId}`);
      expect(message.data.callsign).toBe('W0XYZ');
    });

    it('should broadcast aggregate:updated after new QSO', async () => {
      // Skip first message (logEntry:created)
      const firstMessagePromise = waitForMessage(ws, 10000);
      const secondMessagePromise = new Promise((resolve, reject) => {
        let messageCount = 0;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);
        
        ws.on('message', (data) => {
          messageCount++;
          if (messageCount === 2) {
            clearTimeout(timeout);
            try {
              resolve(JSON.parse(data.toString()));
            } catch (error) {
              reject(error);
            }
          }
        });
      });

      // Create log entry
      await fetch(`${API_URL}/api/qso-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId,
          contestId,
          callsign: 'N0ABC',
          band: '20m',
          mode: 'SSB',
          qsoDate: new Date().toISOString(),
          qsoTime: '1500',
          operatorCallsign: 'W5XYZ',
          source: 'test',
          dedupeKey: `ws-agg-test-${Date.now()}`,
        }),
      });

      await firstMessagePromise; // logEntry:created
      const message: any = await secondMessagePromise; // aggregate:updated

      expect(message.type).toBe('aggregate:updated');
      expect(message.data.totalQsos).toBeGreaterThan(0);
    });

    it('should broadcast dupe:detected for duplicate entries', async () => {
      const timestamp = Date.now();
      
      // Create first entry
      await fetch(`${API_URL}/api/qso-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId,
          contestId,
          callsign: 'W0DUPE',
          band: '40m',
          mode: 'CW',
          qsoDate: new Date().toISOString(),
          qsoTime: '1500',
          operatorCallsign: 'W5ABC',
          source: 'test',
          dedupeKey: `ws-dupe-1-${timestamp}`,
        }),
      });

      // Wait for broadcasts to complete
      await waitForMessage(ws); // logEntry:created
      await waitForMessage(ws); // aggregate:updated

      // Create duplicate entry (same callsign, band, mode)
      const dupePromise = new Promise((resolve, reject) => {
        let messageCount = 0;
        const timeout = setTimeout(() => reject(new Error('Timeout')), 10000);
        
        ws.on('message', (data) => {
          messageCount++;
          if (messageCount === 3) { // Should be 3rd message (after logEntry + aggregate)
            clearTimeout(timeout);
            try {
              const msg = JSON.parse(data.toString());
              if (msg.type === 'dupe:detected') {
                resolve(msg);
              }
            } catch (error) {
              reject(error);
            }
          }
        });
      });

      await fetch(`${API_URL}/api/qso-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId,
          contestId,
          callsign: 'W0DUPE',
          band: '40m',
          mode: 'CW',
          qsoDate: new Date().toISOString(),
          qsoTime: '1505',
          operatorCallsign: 'W5ABC',
          source: 'test',
          dedupeKey: `ws-dupe-2-${timestamp}`,
        }),
      });

      const message: any = await dupePromise;

      expect(message.type).toBe('dupe:detected');
      expect(message.data.entry.callsign).toBe('W0DUPE');
      expect(message.data.duplicate.callsign).toBe('W0DUPE');
    });
  });

  describe('Multiple Clients', () => {
    let ws2: WebSocket;

    afterEach(() => {
      if (ws2 && ws2.readyState === WebSocket.OPEN) {
        ws2.close();
      }
    });

    it('should broadcast to all subscribed clients', async () => {
      // Setup first client
      ws = new WebSocket(WS_URL);
      await new Promise((resolve) => ws.on('open', resolve));
      await waitForMessage(ws);
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: `contest:${contestId}`,
      }));
      await waitForMessage(ws);

      // Setup second client
      ws2 = new WebSocket(WS_URL);
      await new Promise((resolve) => ws2.on('open', resolve));
      await waitForMessage(ws2);
      ws2.send(JSON.stringify({
        type: 'subscribe',
        channel: `contest:${contestId}`,
      }));
      await waitForMessage(ws2);

      // Setup listeners
      const ws1Promise = waitForMessage(ws, 10000);
      const ws2Promise = waitForMessage(ws2, 10000);

      // Create log entry
      await fetch(`${API_URL}/api/qso-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId,
          contestId,
          callsign: 'W0MULTI',
          band: '40m',
          mode: 'CW',
          qsoDate: new Date().toISOString(),
          qsoTime: '1500',
          operatorCallsign: 'W5ABC',
          source: 'test',
          dedupeKey: `ws-multi-${Date.now()}`,
        }),
      });

      // Both clients should receive the message
      const msg1: any = await ws1Promise;
      const msg2: any = await ws2Promise;

      expect(msg1.type).toBe('logEntry:created');
      expect(msg2.type).toBe('logEntry:created');
      expect(msg1.data.callsign).toBe('W0MULTI');
      expect(msg2.data.callsign).toBe('W0MULTI');
    });

    it('should not broadcast to unsubscribed clients', async () => {
      // Setup first client (subscribed)
      ws = new WebSocket(WS_URL);
      await new Promise((resolve) => ws.on('open', resolve));
      await waitForMessage(ws);
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: `contest:${contestId}`,
      }));
      await waitForMessage(ws);

      // Setup second client (not subscribed to this contest)
      ws2 = new WebSocket(WS_URL);
      await new Promise((resolve) => ws2.on('open', resolve));
      await waitForMessage(ws2);

      // Setup listener on ws2 that should timeout
      let ws2ReceivedMessage = false;
      ws2.on('message', () => {
        ws2ReceivedMessage = true;
      });

      const ws1Promise = waitForMessage(ws, 10000);

      // Create log entry
      await fetch(`${API_URL}/api/qso-logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          stationId,
          contestId,
          callsign: 'W0UNSUB',
          band: '40m',
          mode: 'CW',
          qsoDate: new Date().toISOString(),
          qsoTime: '1500',
          operatorCallsign: 'W5ABC',
          source: 'test',
          dedupeKey: `ws-unsub-${Date.now()}`,
        }),
      });

      // ws1 should receive
      await ws1Promise;

      // Wait a bit to ensure ws2 doesn't receive
      await new Promise((resolve) => setTimeout(resolve, 500));

      expect(ws2ReceivedMessage).toBe(false);
    });
  });
});
