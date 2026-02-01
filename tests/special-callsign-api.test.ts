/**
 * Special Callsign API integration tests
 */
import request from 'supertest';
import prisma from '../src/db';

import app from '../src/index';

describe('Special Callsign API', () => {
  let testContestId: string;
  let testClubId: string;

  beforeAll(async () => {
    // Create test contest and club
    const contest = await prisma.contest.create({
      data: {
        name: 'Test Contest',
        isActive: true,
        mode: 'CW/SSB',
      },
    });
    testContestId = contest.id;

    const club = await prisma.club.create({
      data: {
        callsign: 'W1TEST',
        name: 'Test Club',
        contestId: testContestId,
      },
    });
    testClubId = club.id;
  });

  afterAll(async () => {
    // Cleanup - only delete data we created
    await prisma.specialCallsign.deleteMany({});
    await prisma.club.deleteMany({ where: { id: testClubId } });
    await prisma.contest.deleteMany({ where: { id: testContestId } });
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Clean up special callsigns after each test
    await prisma.specialCallsign.deleteMany({});
  });

  describe('POST /api/special-callsigns', () => {
    test('creates special callsign with required fields', async () => {
      const startDate = new Date('2026-06-01');
      const endDate = new Date('2026-06-30');

      const response = await request(app)
        .post('/api/special-callsigns')
        .send({
          callsign: 'W1FD',
          eventName: 'Field Day 2026',
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        });

      expect(response.status).toBe(201);
      expect(response.body.callsign).toBe('W1FD');
      expect(response.body.eventName).toBe('Field Day 2026');
      expect(response.body.isActive).toBe(true); // default
      expect(new Date(response.body.startDate)).toEqual(startDate);
      expect(new Date(response.body.endDate)).toEqual(endDate);
    });

    test('creates special callsign with optional fields', async () => {
      const response = await request(app)
        .post('/api/special-callsigns')
        .send({
          callsign: 'W100AW',
          eventName: 'Centennial Operation',
          description: 'Celebrating 100 years',
          startDate: new Date('2026-01-01').toISOString(),
          endDate: new Date('2026-12-31').toISOString(),
          clubId: testClubId,
          isActive: true,
          autoActivate: false,
        });

      expect(response.status).toBe(201);
      expect(response.body.callsign).toBe('W100AW');
      expect(response.body.description).toBe('Celebrating 100 years');
      expect(response.body.clubId).toBe(testClubId);
      expect(response.body.autoActivate).toBe(false);
    });

    test('requires callsign field', async () => {
      const response = await request(app)
        .post('/api/special-callsigns')
        .send({
          eventName: 'No Callsign Event',
          startDate: new Date().toISOString(),
          endDate: new Date().toISOString(),
        });

      expect(response.status).toBe(400);
    });

    test('requires eventName field', async () => {
      const response = await request(app)
        .post('/api/special-callsigns')
        .send({
          callsign: 'W1NOEVENT',
          startDate: new Date().toISOString(),
          endDate: new Date().toISOString(),
        });

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/special-callsigns', () => {
    beforeEach(async () => {
      // Create test special callsigns
      await prisma.specialCallsign.create({
        data: {
          callsign: 'W1GET1',
          eventName: 'Get Test 1',
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-12-31'),
        },
      });

      await prisma.specialCallsign.create({
        data: {
          callsign: 'W1GET2',
          eventName: 'Get Test 2',
          startDate: new Date('2025-01-01'),
          endDate: new Date('2025-12-31'),
          clubId: testClubId,
        },
      });
    });

    test('returns all special callsigns', async () => {
      const response = await request(app).get('/api/special-callsigns');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);

      const sc1 = response.body.find((s: any) => s.callsign === 'W1GET1');
      expect(sc1).toBeDefined();
      expect(sc1.eventName).toBe('Get Test 1');
    });

    test('includes club relation when present', async () => {
      const response = await request(app).get('/api/special-callsigns');

      const sc2 = response.body.find((s: any) => s.callsign === 'W1GET2');
      expect(sc2.club).toBeDefined();
      expect(sc2.club.id).toBe(testClubId);
      expect(sc2.club.callsign).toBe('W1TEST');
    });
  });

  describe('GET /api/special-callsigns/active', () => {
    beforeEach(async () => {
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      // Active: started yesterday, ends tomorrow
      await prisma.specialCallsign.create({
        data: {
          callsign: 'W1ACTIVE',
          eventName: 'Currently Active',
          startDate: yesterday,
          endDate: tomorrow,
          isActive: true,
        },
      });

      // Expired: ended yesterday
      await prisma.specialCallsign.create({
        data: {
          callsign: 'W1EXPIRED',
          eventName: 'Already Expired',
          startDate: lastWeek,
          endDate: yesterday,
          isActive: true,
        },
      });

      // Pending: starts tomorrow
      await prisma.specialCallsign.create({
        data: {
          callsign: 'W1PENDING',
          eventName: 'Not Yet Active',
          startDate: tomorrow,
          endDate: nextWeek,
          isActive: true,
        },
      });

      // Disabled: in date range but isActive=false
      await prisma.specialCallsign.create({
        data: {
          callsign: 'W1DISABLED',
          eventName: 'Manually Disabled',
          startDate: yesterday,
          endDate: tomorrow,
          isActive: false,
        },
      });
    });

    test('returns only currently active special callsigns', async () => {
      const response = await request(app).get('/api/special-callsigns/active');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);

      const callsigns = response.body.map((s: any) => s.callsign);
      
      // Should include active
      expect(callsigns).toContain('W1ACTIVE');
      
      // Should NOT include expired, pending, or disabled
      expect(callsigns).not.toContain('W1EXPIRED');
      expect(callsigns).not.toContain('W1PENDING');
      expect(callsigns).not.toContain('W1DISABLED');
    });

    test('filters by isActive flag', async () => {
      const response = await request(app).get('/api/special-callsigns/active');

      const disabled = response.body.find((s: any) => s.callsign === 'W1DISABLED');
      expect(disabled).toBeUndefined();
    });

    test('filters by date range (startDate <= now)', async () => {
      const response = await request(app).get('/api/special-callsigns/active');

      const pending = response.body.find((s: any) => s.callsign === 'W1PENDING');
      expect(pending).toBeUndefined(); // starts tomorrow, should not be included
    });

    test('filters by date range (endDate >= now)', async () => {
      const response = await request(app).get('/api/special-callsigns/active');

      const expired = response.body.find((s: any) => s.callsign === 'W1EXPIRED');
      expect(expired).toBeUndefined(); // ended yesterday, should not be included
    });
  });

  describe('PATCH /api/special-callsigns/:id', () => {
    let testId: string;

    beforeEach(async () => {
      const sc = await prisma.specialCallsign.create({
        data: {
          callsign: 'W1PATCH',
          eventName: 'Patch Test',
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-12-31'),
        },
      });
      testId = sc.id;
    });

    test('updates eventName', async () => {
      const response = await request(app)
        .patch(`/api/special-callsigns/${testId}`)
        .send({ eventName: 'Updated Event Name' });

      expect(response.status).toBe(200);
      expect(response.body.eventName).toBe('Updated Event Name');
    });

    test('updates dates', async () => {
      const newStart = new Date('2027-01-01');
      const newEnd = new Date('2027-12-31');

      const response = await request(app)
        .patch(`/api/special-callsigns/${testId}`)
        .send({
          startDate: newStart.toISOString(),
          endDate: newEnd.toISOString(),
        });

      expect(response.status).toBe(200);
      expect(new Date(response.body.startDate)).toEqual(newStart);
      expect(new Date(response.body.endDate)).toEqual(newEnd);
    });

    test('toggles isActive flag', async () => {
      const response = await request(app)
        .patch(`/api/special-callsigns/${testId}`)
        .send({ isActive: false });

      expect(response.status).toBe(200);
      expect(response.body.isActive).toBe(false);
    });

    test('returns 404 for non-existent callsign', async () => {
      const response = await request(app)
        .patch('/api/special-callsigns/non-existent-id')
        .send({ eventName: 'Updated' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /api/special-callsigns/:id', () => {
    test('deletes special callsign without restrictions', async () => {
      const sc = await prisma.specialCallsign.create({
        data: {
          callsign: 'W1DELETE',
          eventName: 'Delete Test',
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-12-31'),
        },
      });

      const response = await request(app).delete(`/api/special-callsigns/${sc.id}`);

      expect(response.status).toBe(204);

      // Verify deleted
      const deleted = await prisma.specialCallsign.findUnique({ where: { id: sc.id } });
      expect(deleted).toBeNull();
    });

    test('deletes special callsign even if associated with club', async () => {
      const sc = await prisma.specialCallsign.create({
        data: {
          callsign: 'W1WITHCLUB',
          eventName: 'Has Club Association',
          startDate: new Date('2026-01-01'),
          endDate: new Date('2026-12-31'),
          clubId: testClubId,
        },
      });

      const response = await request(app).delete(`/api/special-callsigns/${sc.id}`);

      expect(response.status).toBe(204);

      // Verify deleted
      const deleted = await prisma.specialCallsign.findUnique({ where: { id: sc.id } });
      expect(deleted).toBeNull();
    });

    test('returns 404 for non-existent callsign', async () => {
      const response = await request(app).delete('/api/special-callsigns/non-existent-id');

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });
  });
});
