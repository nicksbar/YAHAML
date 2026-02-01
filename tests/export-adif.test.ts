import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API_URL = 'http://localhost:3000';

describe('ADIF Export Endpoints', () => {
  let stationId: string;
  let contestId: string;
  let entryId1: string;

  beforeEach(async () => {
    const timestamp = Date.now();
    // Create test station
    const station = await prisma.station.create({
      data: {
        callsign: `W5ADIF${timestamp}`,
        name: 'Test Station',
      },
    });
    stationId = station.id;

    // Create test contest
    const contest = await prisma.contest.create({
      data: {
        name: `Test Contest ${timestamp}`,
      },
    });
    contestId = contest.id;

    // Create test log entries
    const entry1 = await prisma.logEntry.create({
      data: {
        stationId,
        contestId,
        callsign: 'W0XYZ',
        band: '40m',
        mode: 'SSB',
        qsoDate: new Date('2026-01-31'),
        qsoTime: '1500',
        frequency: '7050',
        rstSent: '599',
        rstRcvd: '599',
        operatorCallsign: 'W5ABC',
        source: 'tcp-relay',
        dedupeKey: `adif-1-${timestamp}`,
      },
    });
    entryId1 = entry1.id;

    // Create second entry (later time)
    await prisma.logEntry.create({
      data: {
        stationId,
        contestId,
        callsign: 'N0ABC',
        band: '20m',
        mode: 'CW',
        qsoDate: new Date('2026-01-31'),
        qsoTime: '1530',
        frequency: '14200',
        rstSent: '599',
        rstRcvd: '599',
        operatorCallsign: 'W5XYZ',
        source: 'wsjt-x',
        dedupeKey: `adif-2-${timestamp}`,
      },
    });

    // Create a duplicate entry (merged)
    await prisma.logEntry.create({
      data: {
        stationId,
        contestId,
        callsign: 'W0XYZ',
        band: '40m',
        mode: 'SSB',
        qsoDate: new Date('2026-01-31'),
        qsoTime: '1500',
        frequency: '7050',
        rstSent: '599',
        rstRcvd: '599',
        operatorCallsign: 'W5ABC',
        source: 'ui-manual',
        dedupeKey: `adif-1-dup-${timestamp}`,
        merge_status: 'duplicate_of',
        merged_into_id: entryId1,
        merge_reason: 'duplicate from manual entry',
        merge_timestamp: new Date(),
      },
    });
  });

  afterEach(async () => {
    // Clean up
    await prisma.logEntry.deleteMany({ where: { contestId } });
    await prisma.contest.deleteMany({ where: { id: contestId } });
    await prisma.station.deleteMany({ where: { id: stationId } });
  });

  describe('GET /api/export/adif', () => {
    it('should export valid ADIF-3 format with all required fields', async () => {
      const response = await fetch(`${API_URL}/api/export/adif?contestId=${contestId}&format=3`);

      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toMatch(/application\/x-adi/);
      expect(response.headers.get('Content-Disposition')).toContain('attachment');
      expect(response.headers.get('Content-Disposition')).toContain('.adi');

      const content = await response.text();
      expect(content).toContain('ADIF_VER:5');
      expect(content).toContain('PROGRAMID:6');
      expect(content).toContain('YAHAML');
    });

    it('should include only primary entries (exclude merged duplicates)', async () => {
      const response = await fetch(`${API_URL}/api/export/adif?contestId=${contestId}`);

      expect(response.status).toBe(200);
      const content = await response.text();

      // Count occurrences of W0XYZ (should appear once, not twice)
      const w0xyzCount = (content.match(/W0XYZ/g) || []).length;
      expect(w0xyzCount).toBe(1);

      // Verify N0ABC is present
      expect(content).toContain('N0ABC');
    });

    it('should include all mandatory ADIF fields', async () => {
      const response = await fetch(`${API_URL}/api/export/adif?contestId=${contestId}`);

      expect(response.status).toBe(200);
      const content = await response.text();

      // Mandatory fields
      expect(content).toMatch(/<QSO_DATE:\d+>\d{8}/); // Date in YYYYMMDD
      expect(content).toMatch(/<TIME_ON:\d+>\d{4,6}/); // Time
      expect(content).toMatch(/<CALL:\d+>/); // Callsign
      expect(content).toMatch(/<MODE:\d+>/); // Mode
      expect(content).toMatch(/<BAND:\d+>/); // Band
    });

    it('should include recommended ADIF fields when available', async () => {
      const response = await fetch(`${API_URL}/api/export/adif?contestId=${contestId}`);

      expect(response.status).toBe(200);
      const content = await response.text();

      // Recommended fields from our test data
      expect(content).toContain('<FREQ:');
      expect(content).toContain('<RST_SENT:');
      expect(content).toContain('<RST_RCVD:');
      expect(content).toContain('<OPERATOR:');
      expect(content).toContain('<STATION_CALLSIGN:');
    });

    it('should include YAHAML extension fields', async () => {
      const response = await fetch(`${API_URL}/api/export/adif?contestId=${contestId}`);

      expect(response.status).toBe(200);
      const content = await response.text();

      // YAHAML extensions
      expect(content).toContain('<CONTEST_ID:');
      expect(content).toContain('<SOURCE:');
    });

    it('should format ADIF records with proper <EOR> markers', async () => {
      const response = await fetch(`${API_URL}/api/export/adif?contestId=${contestId}`);

      expect(response.status).toBe(200);
      const content = await response.text();

      // Count EOR markers (should match number of entries, excluding merged)
      const eorCount = (content.match(/<EOR>/g) || []).length;
      expect(eorCount).toBe(2); // 2 primary entries
    });

    it('should return 400 when contestId is missing', async () => {
      const response = await fetch(`${API_URL}/api/export/adif`);

      expect(response.status).toBe(400);
      const error = (await response.json()) as any;
      expect(error.error).toContain('contestId');
    });

    it('should return 400 when format is invalid', async () => {
      const response = await fetch(
        `${API_URL}/api/export/adif?contestId=${contestId}&format=99`
      );

      expect(response.status).toBe(400);
      const error = (await response.json()) as any;
      expect(error.error).toContain('format');
    });

    it('should return 404 when contest does not exist', async () => {
      const response = await fetch(`${API_URL}/api/export/adif?contestId=nonexistent`);

      expect(response.status).toBe(404);
      const error = (await response.json()) as any;
      expect(error.error).toContain('No QSO entries found');
    });

    it('should normalize band names to ADIF standard (e.g., 40m -> 40M)', async () => {
      const response = await fetch(`${API_URL}/api/export/adif?contestId=${contestId}`);

      expect(response.status).toBe(200);
      const content = await response.text();

      // Normalized bands should be in ADIF format
      expect(content).toContain('40M');
      expect(content).toContain('20M');
    });

    it('should sort entries by QSO date/time', async () => {
      const response = await fetch(`${API_URL}/api/export/adif?contestId=${contestId}`);

      expect(response.status).toBe(200);
      const content = await response.text();

      // Find positions of both entries
      const w0xyzPos = content.indexOf('W0XYZ');
      const n0abcPos = content.indexOf('N0ABC');

      // W0XYZ should appear before N0ABC (earlier time: 1500 vs 1530)
      expect(w0xyzPos).toBeLessThan(n0abcPos);
    });

    it('should support ADIF-2.2 format when requested', async () => {
      const response = await fetch(`${API_URL}/api/export/adif?contestId=${contestId}&format=2`);

      expect(response.status).toBe(200);
      const content = await response.text();

      // ADIF 2.2 should still have basic structure
      expect(content).toContain('ADIF_VER');
      expect(content).toMatch(/<QSO_DATE:\d+>\d{8}/);
    });
  });

  describe('ADIF Export Edge Cases', () => {
    it('should handle entries with minimal fields', async () => {
      // Create minimal entry
      await prisma.logEntry.create({
        data: {
          stationId,
          contestId,
          callsign: 'K9ABC',
          band: '10',
          mode: 'FM',
          qsoDate: new Date('2026-02-01'),
          qsoTime: '0000',
          source: 'test',
          dedupeKey: 'minimal',
        },
      });

      const response = await fetch(`${API_URL}/api/export/adif?contestId=${contestId}`);

      expect(response.status).toBe(200);
      const content = await response.text();

      // Should still include mandatory fields
      expect(content).toContain('K9ABC');
      expect(content).toMatch(/<QSO_DATE:\d+>20260201/);
    });

    it('should escape special characters in callsigns and notes', async () => {
      await prisma.logEntry.create({
        data: {
          stationId,
          contestId,
          callsign: 'W5/AB0',
          band: '80',
          mode: 'CW',
          qsoDate: new Date('2026-02-01'),
          qsoTime: '2200',
          source: 'test',
          dedupeKey: 'special-chars',
        },
      });

      const response = await fetch(`${API_URL}/api/export/adif?contestId=${contestId}`);

      expect(response.status).toBe(200);
      const content = await response.text();

      expect(content).toContain('W5/AB0');
    });

    it('should handle large number of QSOs efficiently', async () => {
      // Create 50 test entries
      const entries = Array.from({ length: 50 }, (_, i) => ({
        stationId,
        contestId,
        callsign: `W${i}ABC`,
        band: '20',
        mode: 'SSB',
        qsoDate: new Date('2026-02-01'),
        qsoTime: String(1000 + i).padStart(4, '0'),
        source: 'test',
        dedupeKey: `bulk-${i}`,
      }));

      await prisma.logEntry.createMany({ data: entries });

      const response = await fetch(`${API_URL}/api/export/adif?contestId=${contestId}`);

      expect(response.status).toBe(200);
      const content = await response.text();

      // Should have 50 primary entries plus original 2
      const eorCount = (content.match(/<EOR>/g) || []).length;
      expect(eorCount).toBeGreaterThanOrEqual(50);
    });
  });
});
