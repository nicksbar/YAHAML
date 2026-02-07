/**
 * WebSocket Radio Control Integration Tests
 * Tests the new WebSocket-based radio control message routing
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import WebSocket from 'ws';
import { PrismaClient } from '@prisma/client';
import { ensureServerRunning, stopTestServer, cleanupTestRecords } from './test-helpers';

const WS_URL = 'ws://127.0.0.1:3000/ws';
const prisma = new PrismaClient();

// Helper to wait for WebSocket message
function waitForMessage(ws: WebSocket, timeout = 10000): Promise<any> {
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

async function openWebSocket(): Promise<WebSocket> {
  const socket = new WebSocket(WS_URL);
  const welcomePromise = waitForMessage(socket, 10000);
  await new Promise((resolve, reject) => {
    socket.on('open', resolve);
    socket.on('error', reject);
  });
  await welcomePromise;
  return socket;
}

describe('WebSocket Radio Control Message Routing', () => {
  let weStartedServer = false;
  let ws: WebSocket;
  let testStationIds: string[] = [];
  let testRadioIds: string[] = [];

  beforeAll(async () => {
    weStartedServer = await ensureServerRunning(3000);
    await new Promise(resolve => setTimeout(resolve, 500));
  });

  afterAll(async () => {
    await cleanupTestRecords({
      stationIds: testStationIds,
    });
    await stopTestServer(weStartedServer);
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    const timestamp = Date.now();
    
    // Create test station
    const station = await prisma.station.create({
      data: {
        callsign: `W5RC${timestamp}`,
        name: 'Radio Control Test Station',
      },
    });
    testStationIds.push(station.id);

    // Create test radio
    const radio = await prisma.radioConnection.create({
      data: {
        name: `TestRig-${timestamp}`,
        host: 'localhost',
        port: 4532,
        connectionType: 'mock',
        isEnabled: true,
        pollInterval: 1000,
      },
    });
    testRadioIds.push(radio.id);

    // Assign radio to station
    await prisma.radioAssignment.create({
      data: {
        radioId: radio.id,
        stationId: station.id,
        isActive: true,
      },
    });

    ws = await openWebSocket();
  });

  afterEach(async () => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }

    // Cleanup radios
    await prisma.radioAssignment.deleteMany({ where: { radioId: { in: testRadioIds } } });
    await prisma.radioConnection.deleteMany({ where: { id: { in: testRadioIds } } });
    testRadioIds = [];
  });

  describe('Radio control message types', () => {
    it('should handle radioControl message type', async () => {
      // Send a radioControl message (will fail because radio doesn't exist, but message should be routed)
      ws.send(JSON.stringify({
        type: 'radioControl',
        data: {
          radioId: 'test-radio',
          command: 'setFrequency',
          params: { frequencyHz: 14074000 },
        },
      }));

      const response = await waitForMessage(ws);
      // Should get either a response or error, confirming message was routed
      expect(response.type).toBeDefined();
    });

    it('should handle unknown radioControl command', async () => {
      ws.send(JSON.stringify({
        type: 'radioControl',
        data: {
          radioId: 'test-radio',
          command: 'unknownCommand',
          params: {},
        },
      }));

      const response = await waitForMessage(ws);
      expect(response.type).toBeDefined(); // Should get some response
    });

    it('should handle missing radioId in radioControl message', async () => {
      ws.send(JSON.stringify({
        type: 'radioControl',
        data: {
          command: 'setFrequency',
          params: { frequencyHz: 14074000 },
        },
      }));

      const response = await waitForMessage(ws);
      // Should get an error response
      expect(response.type).toBeDefined();
    });

    it('should handle missing command in radioControl message', async () => {
      ws.send(JSON.stringify({
        type: 'radioControl',
        data: {
          radioId: 'test-radio',
          params: { frequencyHz: 14074000 },
        },
      }));

      const response = await waitForMessage(ws);
      expect(response.type).toBeDefined();
    });
  });

  describe('Radio control commands', () => {
    const commands = ['setFrequency', 'setMode', 'setPower', 'setPtt', 'setVfo', 'sendRaw'];

    commands.forEach(command => {
      it(`should route ${command} command via WebSocket`, async () => {
        const params = {
          setFrequency: { frequencyHz: 14074000 },
          setMode: { mode: 'USB', bandwidth: 3000 },
          setPower: { power: 50 },
          setPtt: { enabled: true },
          setVfo: { vfo: 'VFO_A' },
          sendRaw: { rawCommand: 'f\\n' },
        }[command] || {};

        ws.send(JSON.stringify({
          type: 'radioControl',
          data: {
            radioId: 'test-radio',
            command,
            params,
          },
        }));

        const response = await waitForMessage(ws);
        // Should get some kind of response
        expect(response).toBeDefined();
        expect(response.type).toBeDefined();
      });
    });
  });

  describe('Error responses', () => {
    it('should respond to invalid message format', async () => {
      ws.send(JSON.stringify({
        type: 'radioControl',
        data: null,
      }));

      const response = await waitForMessage(ws);
      expect(response.type).toBeDefined();
    });

    it('should handle empty params', async () => {
      ws.send(JSON.stringify({
        type: 'radioControl',
        data: {
          radioId: 'test-radio',
          command: 'setFrequency',
          params: {},
        },
      }));

      const response = await waitForMessage(ws);
      expect(response.type).toBeDefined();
    });
  });

  describe('Message flow', () => {
    it('should handle consecutive radioControl messages', async () => {
      for (let i = 0; i < 3; i++) {
        ws.send(JSON.stringify({
          type: 'radioControl',
          data: {
            radioId: `test-radio-${i}`,
            command: 'setFrequency',
            params: { frequencyHz: 14074000 + i * 1000 },
          },
        }));

        const response = await waitForMessage(ws, 2000);
        expect(response).toBeDefined();
      }
    });
  });
});
