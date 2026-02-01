/**
 * Test server factory - starts the main server for integration tests
 */
import http from 'http';
import express from 'express';
import { PrismaClient } from '@prisma/client';

let server: http.Server | null = null;
let prisma: PrismaClient;

export async function startTestServer(): Promise<{ server: http.Server; prisma: PrismaClient }> {
  if (server) return { server, prisma };

  prisma = new PrismaClient();

  // Create a minimal Express app for WebSocket tests
  // We'll import the actual app and use it
  const app = express();
  
  // Import after we have prisma
  const { wsManager } = await import('../src/websocket');

  // Create HTTP server with WebSocket
  server = http.createServer(app);
  
  // Initialize WebSocket manager
  wsManager.initialize(server);

  return new Promise((resolve, reject) => {
    const httpServer = server!;
    httpServer.listen(3000, '127.0.0.1', () => {
      console.log('Test server started on ws://127.0.0.1:3000');
      resolve({ server: httpServer, prisma });
    });

    httpServer.on('error', reject);
  });
}

export async function stopTestServer(): Promise<void> {
  return new Promise(async (resolve, reject) => {
    if (server) {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    } else {
      resolve();
    }

    if (prisma) {
      await prisma.$disconnect();
    }
  });
}

export function getTestPrisma(): PrismaClient {
  if (!prisma) {
    throw new Error('Test server not started. Call startTestServer first.');
  }
  return prisma;
}
