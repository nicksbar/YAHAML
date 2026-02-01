/**
 * Relay server unit tests
 */
import prisma from '../src/db';
import { connectToTestDB, teardownTestDB } from './setup';

describe('Relay Server', () => {
  beforeAll(async () => {
    await connectToTestDB();
  });

  afterEach(async () => {
    await teardownTestDB();
  });

  describe('Message Parsing', () => {
    it('should decode UTF-16LE message correctly', () => {
      const bor = Buffer.from([0x00, 0x01]);
      const eor = Buffer.from([0x00, 0x03, 0x00, 0x04, 0x00, 0x07]);
      const msg = '<BAMS><STATION>TEST</STATION><BAND>20</BAND></BAMS>';
      const utf16 = Buffer.from(msg, 'utf-16le');
      const encoded = Buffer.concat([bor, utf16, eor]);

      // Test that we can decode it back
      const decoded = encoded.toString('utf-16le', 2).split('\x00')[0];
      expect(decoded).toContain('BAMS');
      expect(decoded).toContain('TEST');
      expect(decoded).toContain('20');
    });

    it('should parse BAMS message for station, band, mode', () => {
      const msg =
        '<BAMS><STATION>W1AW</STATION><BAND>40</BAND><MODE>CW</MODE></BAMS>';
      const stationMatch = msg.match(/<STATION>([^<]+)<\/STATION>/);
      const bandMatch = msg.match(/<BAND>([^<]+)<\/BAND>/);
      const modeMatch = msg.match(/<MODE>([^<]+)<\/MODE>/);

      expect(stationMatch?.[1]).toBe('W1AW');
      expect(bandMatch?.[1]).toBe('40');
      expect(modeMatch?.[1]).toBe('CW');
    });
  });

  describe('Station Management', () => {
    it('should create station if not exists', async () => {
      const callsign = 'K1LI';
      let station = await prisma.station.findUnique({
        where: { callsign },
      });
      expect(station).toBeNull();

      station = await prisma.station.create({
        data: {
          callsign,
          name: callsign,
        },
      });

      expect(station).toBeDefined();
      expect(station.callsign).toBe('K1LI');

      const found = await prisma.station.findUnique({
        where: { callsign },
      });
      expect(found).toBeDefined();
      expect(found?.id).toBe(station.id);
    });
  });

  describe('Band Activity Logging', () => {
    it('should log band activity to database', async () => {
      const station = await prisma.station.create({
        data: {
          callsign: 'TEST-BAND',
          name: 'Test Band Station',
        },
      });

      const activity = await prisma.bandActivity.create({
        data: {
          stationId: station.id,
          band: '20',
          mode: 'CW',
        },
      });

      expect(activity).toBeDefined();
      expect(activity.band).toBe('20');
      expect(activity.mode).toBe('CW');

      const found = await prisma.bandActivity.findUnique({
        where: { id: activity.id },
      });
      expect(found?.band).toBe('20');
    });

    it('should create context log for band change', async () => {
      const station = await prisma.station.create({
        data: {
          callsign: 'TEST-CONTEXT',
          name: 'Test Context Station',
        },
      });

      const log = await prisma.contextLog.create({
        data: {
          stationId: station.id,
          level: 'INFO',
          category: 'BAND_CHANGE',
          message: 'Changed to 40m PH',
          details: JSON.stringify({ band: '40', mode: 'PH' }),
        },
      });

      expect(log).toBeDefined();
      expect(log.category).toBe('BAND_CHANGE');
      expect(log.level).toBe('INFO');
    });
  });

  describe('Network Status', () => {
    it('should track connection status', async () => {
      const station = await prisma.station.create({
        data: {
          callsign: 'TEST-NETWORK',
          name: 'Test Network Station',
        },
      });

      const status = await prisma.networkStatus.create({
        data: {
          stationId: station.id,
          isConnected: true,
          ip: '127.0.0.1',
          port: 10000,
          relayHost: 'localhost',
          relayPort: 10000,
          relayVersion: '1.0.0',
        },
      });

      expect(status.isConnected).toBe(true);
      expect(status.ip).toBe('127.0.0.1');

      const updated = await prisma.networkStatus.update({
        where: { stationId: station.id },
        data: {
          isConnected: false,
        },
      });

      expect(updated.isConnected).toBe(false);
    });
  });
});
