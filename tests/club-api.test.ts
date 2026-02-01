/**
 * Club API integration tests
 */
import request from 'supertest';
import prisma from '../src/db';

const API_BASE = 'http://localhost:3000';

describe('Club API', () => {
  let testContestId: string;
  let testClubId: string;

  beforeAll(async () => {
    // Create a test contest (required for club FK)
    const contest = await prisma.contest.create({
      data: {
        name: 'Test Contest',
        isActive: true,
        mode: 'CW/SSB',
      },
    });
    testContestId = contest.id;
  });

  afterAll(async () => {
    // Cleanup
    await prisma.club.deleteMany({});
    await prisma.contest.deleteMany({});
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Clean up clubs after each test - delete in correct order
    await prisma.logEntry.deleteMany({});
    await prisma.station.deleteMany({});
    await prisma.club.deleteMany({ where: { contestId: testContestId } });
  });

  describe('POST /api/clubs', () => {
    test('creates club with basic fields', async () => {
      const response = await request(API_BASE)
        .post('/api/clubs')
        .send({
          callsign: 'W1TEST',
          name: 'Test Club',
          contestId: testContestId,
        });

      expect(response.status).toBe(201);
      expect(response.body.callsign).toBe('W1TEST');
      expect(response.body.name).toBe('Test Club');
      expect(response.body.contestId).toBe(testContestId);
      expect(response.body.isActive).toBe(true); // default value

      testClubId = response.body.id;
    });

    test('creates club with alternative callsigns', async () => {
      const altCalls = ['N1ABC', 'K1XYZ', 'W1DEF'];
      const response = await request(API_BASE)
        .post('/api/clubs')
        .send({
          callsign: 'W1MULTI',
          name: 'Multi Call Club',
          contestId: testContestId,
          altCallsigns: JSON.stringify(altCalls),
        });

      expect(response.status).toBe(201);
      expect(response.body.callsign).toBe('W1MULTI');
      
      // Verify altCallsigns stored as JSON
      const parsed = JSON.parse(response.body.altCallsigns);
      expect(parsed).toEqual(altCalls);
    });

    test('creates club with empty altCallsigns', async () => {
      const response = await request(API_BASE)
        .post('/api/clubs')
        .send({
          callsign: 'W1EMPTY',
          name: 'Empty Alt Calls',
          contestId: testContestId,
          altCallsigns: '[]',
        });

      expect(response.status).toBe(201);
      const parsed = JSON.parse(response.body.altCallsigns);
      expect(parsed).toEqual([]);
    });

    test('requires callsign field', async () => {
      const response = await request(API_BASE)
        .post('/api/clubs')
        .send({
          name: 'No Callsign Club',
          contestId: testContestId,
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/clubs', () => {
    beforeEach(async () => {
      // Create test clubs
      await prisma.club.create({
        data: {
          callsign: 'W1GET1',
          name: 'Get Test 1',
          contestId: testContestId,
          altCallsigns: JSON.stringify(['N1A', 'N1B']),
        },
      });

      await prisma.club.create({
        data: {
          callsign: 'W1GET2',
          name: 'Get Test 2',
          contestId: testContestId,
          isActive: false, // disabled club
        },
      });
    });

    test('returns all clubs with stations and QSO counts', async () => {
      const response = await request(API_BASE).get('/api/clubs');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);

      const club1 = response.body.find((c: any) => c.callsign === 'W1GET1');
      expect(club1).toBeDefined();
      expect(club1.name).toBe('Get Test 1');
      expect(club1.isActive).toBe(true);
      expect(Array.isArray(club1.stations)).toBe(true);

      const club2 = response.body.find((c: any) => c.callsign === 'W1GET2');
      expect(club2.isActive).toBe(false);
    });

    test('includes altCallsigns in response', async () => {
      const response = await request(API_BASE).get('/api/clubs');

      const club = response.body.find((c: any) => c.callsign === 'W1GET1');
      expect(club.altCallsigns).toBeDefined();
      
      const parsed = JSON.parse(club.altCallsigns);
      expect(parsed).toEqual(['N1A', 'N1B']);
    });
  });

  describe('PATCH /api/clubs/:id', () => {
    beforeEach(async () => {
      const club = await prisma.club.create({
        data: {
          callsign: 'W1PATCH',
          name: 'Patch Test',
          contestId: testContestId,
          isActive: true,
        },
      });
      testClubId = club.id;
    });

    test('toggles isActive to false', async () => {
      const response = await request(API_BASE)
        .patch(`/api/clubs/${testClubId}`)
        .send({ isActive: false });

      expect(response.status).toBe(200);
      expect(response.body.isActive).toBe(false);

      // Verify in database
      const club = await prisma.club.findUnique({ where: { id: testClubId } });
      expect(club?.isActive).toBe(false);
    });

    test('toggles isActive back to true', async () => {
      // First disable
      await prisma.club.update({
        where: { id: testClubId },
        data: { isActive: false },
      });

      // Then enable via API
      const response = await request(API_BASE)
        .patch(`/api/clubs/${testClubId}`)
        .send({ isActive: true });

      expect(response.status).toBe(200);
      expect(response.body.isActive).toBe(true);
    });

    test('updates name field', async () => {
      const response = await request(API_BASE)
        .patch(`/api/clubs/${testClubId}`)
        .send({ name: 'Updated Name' });

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Updated Name');
    });

    test('returns 404 for non-existent club', async () => {
      const response = await request(API_BASE)
        .patch('/api/clubs/non-existent-id')
        .send({ isActive: false });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/clubs/:id', () => {
    test('deletes club with no QSO logs', async () => {
      const club = await prisma.club.create({
        data: {
          callsign: 'W1DELETE',
          name: 'Delete Test',
          contestId: testContestId,
        },
      });

      const response = await request(API_BASE).delete(`/api/clubs/${club.id}`);

      expect(response.status).toBe(204);

      // Verify deleted
      const deleted = await prisma.club.findUnique({ where: { id: club.id } });
      expect(deleted).toBeNull();
    });

    test('prevents delete when club has stations with QSO logs', async () => {
      // Create club with station and QSO log
      const club = await prisma.club.create({
        data: {
          callsign: 'W1PROTECTED',
          name: 'Protected Club',
          contestId: testContestId,
        },
      });

      const station = await prisma.station.create({
        data: {
          callsign: 'W1PROTECTED',
          name: 'Protected Station',
          clubId: club.id,
        },
      });

      await prisma.logEntry.create({
        data: {
          stationId: station.id,
          source: 'test',
          dedupeKey: `${station.callsign}|N1TEST|20|CW|test`,
          callsign: 'N1TEST',
          qsoDate: new Date(),
          qsoTime: '1234',
          band: '20',
          mode: 'CW',
        },
      });

      const response = await request(API_BASE).delete(`/api/clubs/${club.id}`);

      expect(response.status).toBe(400);
      expect(response.body.error).toContain('Cannot delete club');
      expect(response.body.hasLogs).toBe(true);

      // Verify club still exists
      const stillExists = await prisma.club.findUnique({ where: { id: club.id } });
      expect(stillExists).not.toBeNull();
    });

    test('allows delete when club has stations without QSO logs', async () => {
      // Create club with station but no logs
      const club = await prisma.club.create({
        data: {
          callsign: 'W1NOLOGS',
          name: 'No Logs Club',
          contestId: testContestId,
        },
      });

      await prisma.station.create({
        data: {
          callsign: 'W1NOLOGS',
          name: 'Station No Logs',
          clubId: club.id,
        },
      });

      const response = await request(API_BASE).delete(`/api/clubs/${club.id}`);

      expect(response.status).toBe(204);

      // Verify deleted
      const deleted = await prisma.club.findUnique({ where: { id: club.id } });
      expect(deleted).toBeNull();
    });

    test('returns 404 for non-existent club', async () => {
      const response = await request(API_BASE).delete('/api/clubs/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });
  });
});
