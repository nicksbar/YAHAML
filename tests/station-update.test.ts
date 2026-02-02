/**
 * Station update tests - including contestId and clubId auto-save functionality
 */
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import prisma from '../src/db';
import { connectToTestDB, teardownTestDB, setupTestDB } from './setup';

// Create test express app with station PATCH endpoint
const createTestApp = () => {
  const app = express();
  app.use(cors());
  app.use(express.json());

  app.patch('/api/stations/:callsign', async (req, res) => {
    try {
      const { 
        name, 
        class: stationClass, 
        section,
        address,
        city,
        state,
        zip,
        country,
        locationId, 
        clubId,
        contestId
      } = req.body;
      const station = await prisma.station.update({
        where: { callsign: req.params.callsign },
        data: {
          name,
          class: stationClass,
          section,
          address,
          city,
          state,
          zip,
          country,
          locationId,
          clubId,
          contestId,
        },
      });
      return res.json(station);
    } catch (error) {
      if ((error as any).code === 'P2025') {
        return res.status(404).json({
          error: 'Station not found',
          details: 'Save the callsign first or create a new station.',
        });
      }
      if ((error as any).code === 'P2003') {
        return res.status(400).json({
          error: 'Invalid reference',
          details: 'The selected club or contest does not exist.',
        });
      }
      return res.status(400).json({
        error: 'Failed to update station',
        details: 'Please check the form values and try again.',
      });
    }
  });

  return app;
};

describe('Station Update API (PATCH /api/stations/:callsign)', () => {
  let app: any;

  beforeEach(async () => {
    await connectToTestDB();
    app = createTestApp();
  });

  afterEach(async () => {
    await teardownTestDB();
  });

  describe('Station details update', () => {
    it('should update basic station details', async () => {
      const { station } = await setupTestDB();

      const res = await request(app)
        .patch(`/api/stations/${station.callsign}`)
        .send({
          name: 'Updated Station Name',
          class: '1A',
          address: '123 Radio Lane',
          city: 'Boston',
          state: 'MA',
          zip: '02101',
          country: 'USA',
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Station Name');
      expect(res.body.class).toBe('1A');
      expect(res.body.address).toBe('123 Radio Lane');
      expect(res.body.city).toBe('Boston');

      // Verify in database
      const updated = await prisma.station.findUnique({
        where: { callsign: station.callsign },
      });
      expect(updated?.name).toBe('Updated Station Name');
      expect(updated?.state).toBe('MA');
    });

    it('should fail if station does not exist', async () => {
      const res = await request(app)
        .patch('/api/stations/NONEXISTENT')
        .send({ name: 'Test' });

      expect(res.status).toBe(404);
      expect(res.body.error).toBe('Station not found');
    });
  });

  describe('Club association (clubId)', () => {
    it('should update station club association', async () => {
      const { station, club } = await setupTestDB();

      const res = await request(app)
        .patch(`/api/stations/${station.callsign}`)
        .send({ clubId: club.id });

      expect(res.status).toBe(200);
      expect(res.body.clubId).toBe(club.id);

      const updated = await prisma.station.findUnique({
        where: { callsign: station.callsign },
        include: { club: true },
      });
      expect(updated?.club?.id).toBe(club.id);
    });

    it('should clear club association with null', async () => {
      const { station, club } = await setupTestDB();

      // First set club
      await prisma.station.update({
        where: { id: station.id },
        data: { clubId: club.id },
      });

      // Then clear it
      const res = await request(app)
        .patch(`/api/stations/${station.callsign}`)
        .send({ clubId: null });

      expect(res.status).toBe(200);
      expect(res.body.clubId).toBeNull();
    });

    it('should fail with invalid club reference', async () => {
      const { station } = await setupTestDB();

      const res = await request(app)
        .patch(`/api/stations/${station.callsign}`)
        .send({ clubId: 'invalid-club-id' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid reference');
    });
  });

  describe('Contest participation (contestId)', () => {
    it('should update station active contest', async () => {
      const { station } = await setupTestDB();
      
      // Create a contest
      const contest = await prisma.contest.create({
        data: {
          name: 'Test Contest',
          isActive: true,
        },
      });

      const res = await request(app)
        .patch(`/api/stations/${station.callsign}`)
        .send({ contestId: contest.id });

      expect(res.status).toBe(200);
      expect(res.body.contestId).toBe(contest.id);

      const updated = await prisma.station.findUnique({
        where: { callsign: station.callsign },
        include: { contest: true },
      });
      expect(updated?.contest?.id).toBe(contest.id);
      expect(updated?.contest?.name).toBe('Test Contest');
    });

    it('should clear contest association with null', async () => {
      const { station } = await setupTestDB();
      
      const contest = await prisma.contest.create({
        data: {
          name: 'Test Contest',
          isActive: true,
        },
      });

      // First set contest
      await prisma.station.update({
        where: { id: station.id },
        data: { contestId: contest.id },
      });

      // Then clear it
      const res = await request(app)
        .patch(`/api/stations/${station.callsign}`)
        .send({ contestId: null });

      expect(res.status).toBe(200);
      expect(res.body.contestId).toBeNull();

      const updated = await prisma.station.findUnique({
        where: { callsign: station.callsign },
      });
      expect(updated?.contestId).toBeNull();
    });

    it('should fail with invalid contest reference', async () => {
      const { station } = await setupTestDB();

      const res = await request(app)
        .patch(`/api/stations/${station.callsign}`)
        .send({ contestId: 'invalid-contest-id' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid reference');
    });

    it('should persist contest after page refresh (simulate)', async () => {
      const { station } = await setupTestDB();
      
      const contest = await prisma.contest.create({
        data: {
          name: 'Persistent Contest',
          isActive: true,
        },
      });

      // Update with contest
      const updateRes = await request(app)
        .patch(`/api/stations/${station.callsign}`)
        .send({ contestId: contest.id });

      expect(updateRes.status).toBe(200);

      // Verify contest persists in database
      const reloaded = await prisma.station.findUnique({
        where: { callsign: station.callsign },
      });

      expect(reloaded?.contestId).toBe(contest.id);
    });
  });

  describe('Location association (locationId)', () => {
    it('should update station location', async () => {
      const { station, location } = await setupTestDB();

      const res = await request(app)
        .patch(`/api/stations/${station.callsign}`)
        .send({ locationId: location.id });

      expect(res.status).toBe(200);
      expect(res.body.locationId).toBe(location.id);
    });

    it('should clear location with null', async () => {
      const { station, location } = await setupTestDB();

      // First set location
      await prisma.station.update({
        where: { id: station.id },
        data: { locationId: location.id },
      });

      const res = await request(app)
        .patch(`/api/stations/${station.callsign}`)
        .send({ locationId: null });

      expect(res.status).toBe(200);
      expect(res.body.locationId).toBeNull();
    });
  });

  describe('Multiple field updates', () => {
    it('should update multiple fields simultaneously', async () => {
      const { station, club } = await setupTestDB();
      
      const contest = await prisma.contest.create({
        data: {
          name: 'Multi-update Contest',
          isActive: true,
        },
      });

      const res = await request(app)
        .patch(`/api/stations/${station.callsign}`)
        .send({
          name: 'Updated Name',
          clubId: club.id,
          contestId: contest.id,
          city: 'New City',
          state: 'NY',
        });

      expect(res.status).toBe(200);
      expect(res.body.name).toBe('Updated Name');
      expect(res.body.clubId).toBe(club.id);
      expect(res.body.contestId).toBe(contest.id);
      expect(res.body.city).toBe('New City');
      expect(res.body.state).toBe('NY');

      const updated = await prisma.station.findUnique({
        where: { callsign: station.callsign },
        include: { club: true, contest: true },
      });
      expect(updated?.club?.id).toBe(club.id);
      expect(updated?.contest?.id).toBe(contest.id);
    });
  });
});
