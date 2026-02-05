/**
 * Unified test helpers - server lifecycle and database management
 * 
 * Testing Strategy:
 * - Unit tests: Pure functions, no server needed
 * - API tests: Use supertest with app instance (fast, no server)
 * - E2E tests: Real server + WebSocket + relay (full stack)
 */

import http from 'http';
import net from 'net';
import crypto from 'crypto';
import prisma from '../src/db';
import { wsManager } from '../src/websocket';

let testServer: http.Server | null = null;
let serverWasRunning = false;

/**
 * Check if server is already running on a port
 */
export async function isServerRunning(port: number = 3000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection(port, '127.0.0.1');
    socket.on('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.on('error', () => {
      resolve(false);
    });
    socket.setTimeout(1000, () => {
      socket.destroy();
      resolve(false);
    });
  });
}

/**
 * Start test server if not already running
 * Returns whether we started it (so we know whether to stop it later)
 */
export async function ensureServerRunning(port: number = 3000): Promise<boolean> {
  serverWasRunning = await isServerRunning(port);
  
  if (serverWasRunning) {
    console.log(`[Test Helper] ✓ Server already running on port ${port}`);
    return false; // We didn't start it
  }

  // Import app only when we need to start the server
  const app = (await import('../src/index')).default;
  
  testServer = http.createServer(app);
  wsManager.initialize(testServer);

  return new Promise((resolve, reject) => {
    testServer!.listen(port, '127.0.0.1', () => {
      console.log(`[Test Helper] ✓ Started test server on port ${port}`);
      resolve(true); // We started it
    });
    testServer!.on('error', reject);
  });
}

/**
 * Stop test server only if we started it
 */
export async function stopTestServer(weStartedIt: boolean): Promise<void> {
  if (!weStartedIt || !testServer) {
    console.log('[Test Helper] ℹ Leaving server running (was already running)');
    return;
  }

  return new Promise((resolve, reject) => {
    // Close all existing connections first
    if (typeof (testServer as any).closeAllConnections === 'function') {
      (testServer as any).closeAllConnections();
    }
    
    testServer!.close((err) => {
      if (err) {
        reject(err);
      } else {
        testServer = null;
        console.log('[Test Helper] ✓ Stopped test server');
        resolve();
      }
    });
  });
}

/**
 * Clean database - preserves seed data like contest templates
 */
export async function cleanDatabase(options?: { preserveTemplates?: boolean }) {
  const preserveTemplates = options?.preserveTemplates ?? true;
  
  try {
    // Delete in FK dependency order
    await prisma.auditLog.deleteMany();
    await prisma.session.deleteMany();
    await prisma.logAggregate.deleteMany();
    await prisma.logEntry.deleteMany();
    await prisma.radioAssignment.deleteMany();
    await prisma.radioConnection.deleteMany();
    await prisma.specialCallsign.deleteMany();
    await prisma.bandActivity.deleteMany();
    await prisma.contextLog.deleteMany();
    await prisma.networkStatus.deleteMany();
    await prisma.club.deleteMany();
    await prisma.contest.deleteMany();
    
    if (!preserveTemplates) {
      await prisma.contestTemplate.deleteMany();
    }
    
    await prisma.station.deleteMany();
    await prisma.aDIFImport.deleteMany();
  } catch (error) {
    // Log but don't fail on cleanup errors
    // eslint-disable-next-line no-console
    console.warn('[Test Helper] Cleanup warning:', error instanceof Error ? error.message : error);
  }
}

/**
 * Clean up only test-specific records by ID
 */
export async function cleanupTestRecords(ids: {
  contestIds?: string[];
  clubIds?: string[];
  stationIds?: string[];
  callsignIds?: string[];
}) {
  try {
    if (ids.callsignIds?.length) {
      await prisma.specialCallsign.deleteMany({
        where: { id: { in: ids.callsignIds } }
      });
    }
    if (ids.clubIds?.length) {
      await prisma.club.deleteMany({
        where: { id: { in: ids.clubIds } }
      });
    }
    if (ids.contestIds?.length) {
      // Clean up related records first
      await prisma.logEntry.deleteMany({
        where: { contestId: { in: ids.contestIds } }
      });
      await prisma.contest.deleteMany({
        where: { id: { in: ids.contestIds } }
      });
    }
    if (ids.stationIds?.length) {
      await prisma.session.deleteMany({
        where: { stationId: { in: ids.stationIds } }
      });
      await prisma.station.deleteMany({
        where: { id: { in: ids.stationIds } }
      });
    }
  } catch (error) {
    console.warn('[Test Helper] Cleanup warning:', error instanceof Error ? error.message : error);
  }
}

/**
 * Create a test session for authenticated endpoints
 */
export async function createTestSession(params: {
  stationId: string;
  callsign: string;
  browserId?: string;
  expiresInMinutes?: number;
  sourceType?: string;
  sourceInfo?: string;
}): Promise<{ token: string; sessionId: string }> {
  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = new Date(Date.now() + (params.expiresInMinutes ?? 20) * 60 * 1000);

  const session = await prisma.session.create({
    data: {
      token,
      callsign: params.callsign,
      stationId: params.stationId,
      browserId: params.browserId,
      sourceType: params.sourceType || 'web',
      sourceInfo: params.sourceInfo,
      expiresAt,
    },
  });

  return { token, sessionId: session.id };
}

/**
 * Wait for a condition with timeout
 */
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout: number = 5000,
  interval: number = 100
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  return false;
}
