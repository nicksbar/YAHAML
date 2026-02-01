/**
 * E2E test - Relay server with live client connections
 */
import * as net from 'net';
import { startRelayServer } from '../src/relay';
import prisma from '../src/db';
import { connectToTestDB, teardownTestDB } from './setup';

describe('Relay Server E2E', () => {
  let server: net.Server;
  const relayPort = 10002; // Use different port for tests to avoid conflict with main server

  beforeAll(async () => {
    await connectToTestDB();
    // Start relay server on test port
    server = startRelayServer(relayPort);
  });

  afterEach(async () => {
    await teardownTestDB();
  });

  afterAll(async () => {
    return new Promise<void>((resolve) => {
      server.close(() => {
        resolve();
      });
    });
  });

  function encodeMessage(msg: string): Buffer {
    const bor = Buffer.from([0x00, 0x01]);
    const eor = Buffer.from([0x00, 0x03, 0x00, 0x04, 0x00, 0x07]);
    const utf16msg = Buffer.from(msg, 'utf-16le');
    return Buffer.concat([bor, utf16msg, eor]);
  }

  // Helper function for decoding messages if needed
  // function decodeMessage(data: Buffer): string {
  //   let cleaned = data.toString('utf-16le', 2);
  //   cleaned = cleaned.split('\x00')[0];
  //   return cleaned.trim();
  // }

  it('should accept client connections', async () => {
    return new Promise<void>((resolve, reject) => {
      const client = net.createConnection(relayPort, '127.0.0.1');
      const timeout = setTimeout(() => {
        client.destroy();
        reject(new Error('Connection timeout'));
      }, 5000);

      client.on('connect', () => {
        clearTimeout(timeout);
        client.destroy();
        resolve();
      });

      client.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }, 10000);

  it('should create station on BAMS message', async () => {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        client.destroy();
        reject(new Error('Test timeout'));
      }, 8000);

      const client = net.createConnection(relayPort, '127.0.0.1');

      client.on('connect', () => {
        const msg =
          '<BAMS><STATION>E2E-STATION</STATION><BAND>20</BAND><MODE>CW</MODE></BAMS>';
        const encoded = encodeMessage(msg);
        client.write(encoded);
      });

      setTimeout(async () => {
        try {
          client.destroy();
          clearTimeout(timeout);

          // Check if station was created
          const station = await prisma.station.findUnique({
            where: { callsign: 'E2E-STATION' },
          });

          if (!station) {
            reject(new Error('Station not created in database'));
            return;
          }

          resolve();
        } catch (error) {
          reject(error);
        }
      }, 2000);

      client.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }, 10000);

  it('should log band activity', async () => {
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        client.destroy();
        reject(new Error('Test timeout'));
      }, 8000);

      const client = net.createConnection(relayPort, '127.0.0.1');

      client.on('connect', () => {
        const msg =
          '<BAMS><STATION>E2E-BAND-TEST</STATION><BAND>40</BAND><MODE>PH</MODE></BAMS>';
        const encoded = encodeMessage(msg);
        client.write(encoded);
      });

      setTimeout(async () => {
        try {
          client.destroy();
          clearTimeout(timeout);

          const station = await prisma.station.findUnique({
            where: { callsign: 'E2E-BAND-TEST' },
            include: { bandActivities: true },
          });

          if (!station) {
            reject(new Error('Station not created'));
            return;
          }

          const activity = station.bandActivities.find(
            (a) => a.band === '40' && a.mode === 'PH',
          );

          if (!activity) {
            reject(new Error('Band activity not logged'));
            return;
          }

          resolve();
        } catch (error) {
          reject(error);
        }
      }, 2000);

      client.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });
  }, 10000);
});
