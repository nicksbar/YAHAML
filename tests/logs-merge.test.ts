import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import fetch from 'node-fetch';

const prisma = new PrismaClient();
const API_URL = 'http://localhost:3000';

describe('Merge API Endpoints', () => {
  let stationId: string;
  let contestId: string;
  let primaryId: string;
  let duplicate1Id: string;
  let duplicate2Id: string;

  beforeEach(async () => {
    // Create test station
    const station = await prisma.station.create({
      data: {
        callsign: 'W5TEST',
        name: 'Test Station',
      },
    });
    stationId = station.id;

    // Create test contest
    const contest = await prisma.contest.create({
      data: {
        name: 'Test Contest',
      },
    });
    contestId = contest.id;

    // Create primary log entry
    const primary = await prisma.logEntry.create({
      data: {
        stationId,
        contestId,
        callsign: 'N0ABC',
        band: '20',
        mode: 'CW',
        qsoDate: new Date('2026-02-01'),
        qsoTime: '1430',
        source: 'ui-manual',
        dedupeKey: 'test-primary-1',
      },
    });
    primaryId = primary.id;

    // Create duplicate 1
    const dup1 = await prisma.logEntry.create({
      data: {
        stationId,
        contestId,
        callsign: 'N0ABC',
        band: '20',
        mode: 'CW',
        qsoDate: new Date('2026-02-01'),
        qsoTime: '1430',
        source: 'tcp-relay',
        dedupeKey: 'test-dup-1',
      },
    });
    duplicate1Id = dup1.id;

    // Create duplicate 2
    const dup2 = await prisma.logEntry.create({
      data: {
        stationId,
        contestId,
        callsign: 'N0ABC',
        band: '20',
        mode: 'CW',
        qsoDate: new Date('2026-02-01'),
        qsoTime: '1430',
        source: 'wsjt-x',
        dedupeKey: 'test-dup-2',
      },
    });
    duplicate2Id = dup2.id;
  });

  afterEach(async () => {
    // Clean up
    await prisma.logEntry.deleteMany({});
    await prisma.contest.deleteMany({});
    await prisma.station.deleteMany({});
  });

  describe('POST /api/logs/merge', () => {
    it('should merge duplicate entries into primary', async () => {
      const response = await fetch(`${API_URL}/api/logs/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primary_id: primaryId,
          duplicate_ids: [duplicate1Id, duplicate2Id],
          merge_reason: 'test merge',
        }),
      });

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.success).toBe(true);
      expect(result.primary_id).toBe(primaryId);
      expect(result.merged_count).toBe(2);

      // Verify entries were marked as duplicates
      const dup1 = await prisma.logEntry.findUnique({ where: { id: duplicate1Id } });
      expect(dup1?.merge_status).toBe('duplicate_of');
      expect(dup1?.merged_into_id).toBe(primaryId);
      expect(dup1?.merge_reason).toBe('test merge');
      expect(dup1?.merge_timestamp).toBeTruthy();

      const dup2 = await prisma.logEntry.findUnique({ where: { id: duplicate2Id } });
      expect(dup2?.merge_status).toBe('duplicate_of');
      expect(dup2?.merged_into_id).toBe(primaryId);
    });

    it('should return 400 if primary_id is missing', async () => {
      const response = await fetch(`${API_URL}/api/logs/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          duplicate_ids: [duplicate1Id],
        }),
      });

      expect(response.status).toBe(400);
      const result = await response.json();
      expect(result.error).toContain('primary_id');
    });

    it('should return 400 if duplicate_ids is empty', async () => {
      const response = await fetch(`${API_URL}/api/logs/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primary_id: primaryId,
          duplicate_ids: [],
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should return 400 if primary_id is in duplicate_ids', async () => {
      const response = await fetch(`${API_URL}/api/logs/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primary_id: primaryId,
          duplicate_ids: [primaryId, duplicate1Id],
        }),
      });

      expect(response.status).toBe(400);
      const result = await response.json();
      expect(result.error).toContain('cannot be in duplicate');
    });

    it('should return 404 if primary entry does not exist', async () => {
      const response = await fetch(`${API_URL}/api/logs/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primary_id: 'nonexistent',
          duplicate_ids: [duplicate1Id],
        }),
      });

      expect(response.status).toBe(404);
      const result = await response.json();
      expect(result.error).toContain('not found');
    });

    it('should return 404 if one or more duplicate entries do not exist', async () => {
      const response = await fetch(`${API_URL}/api/logs/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primary_id: primaryId,
          duplicate_ids: [duplicate1Id, 'nonexistent'],
        }),
      });

      expect(response.status).toBe(404);
    });

    it('should use default merge_reason if not provided', async () => {
      const response = await fetch(`${API_URL}/api/logs/merge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          primary_id: primaryId,
          duplicate_ids: [duplicate1Id],
        }),
      });

      expect(response.status).toBe(200);

      const dup = await prisma.logEntry.findUnique({ where: { id: duplicate1Id } });
      expect(dup?.merge_reason).toBe('merged via API');
    });
  });

  describe('GET /api/logs/:id/merged-with', () => {
    beforeEach(async () => {
      // Merge entries first
      await prisma.logEntry.update({
        where: { id: duplicate1Id },
        data: {
          merge_status: 'duplicate_of',
          merged_into_id: primaryId,
          merge_reason: 'tcp relay dup',
          merge_timestamp: new Date(),
        },
      });

      await prisma.logEntry.update({
        where: { id: duplicate2Id },
        data: {
          merge_status: 'duplicate_of',
          merged_into_id: primaryId,
          merge_reason: 'wsjt-x dup',
          merge_timestamp: new Date(),
        },
      });
    });

    it('should return merged entries for a primary QSO', async () => {
      const response = await fetch(`${API_URL}/api/logs/${primaryId}/merged-with`);

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.primary_id).toBe(primaryId);
      expect(result.merged_count).toBe(2);
      expect(result.merged_from).toHaveLength(2);

      const sources = result.merged_from.map((m: any) => m.source);
      expect(sources).toContain('tcp-relay');
      expect(sources).toContain('wsjt-x');
    });

    it('should return 404 if entry does not exist', async () => {
      const response = await fetch(`${API_URL}/api/logs/nonexistent/merged-with`);

      expect(response.status).toBe(404);
      const result = await response.json();
      expect(result.error).toContain('not found');
    });

    it('should return empty merged_from if no duplicates exist', async () => {
      // Create a new primary with no merges
      const newPrimary = await prisma.logEntry.create({
        data: {
          stationId,
          contestId,
          callsign: 'W0XYZ',
          band: '40',
          mode: 'SSB',
          qsoDate: new Date('2026-02-01'),
          qsoTime: '1500',
          source: 'ui-manual',
          dedupeKey: 'test-new-primary',
        },
      });

      const response = await fetch(`${API_URL}/api/logs/${newPrimary.id}/merged-with`);

      expect(response.status).toBe(200);
      const result = await response.json();
      expect(result.merged_count).toBe(0);
      expect(result.merged_from).toHaveLength(0);
    });
  });
});
