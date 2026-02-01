/**
 * API integration tests
 */
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import prisma from '../src/db';
import { connectToTestDB, teardownTestDB, setupTestDB } from './setup';

// Create test express app with same middleware as main app
const createTestApp = () => {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Health check
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Stations endpoints
  app.get('/api/stations', async (_req, res) => {
    try {
      const stations = await prisma.station.findMany({
        include: {
          bandActivities: true,
          networkStatus: true,
          _count: {
            select: { qsoLogs: true, contextLogs: true },
          },
        },
      });
      res.json(stations);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch stations' });
    }
  });

  app.get('/api/stations/:id', async (req, res) => {
    try {
      const station = await prisma.station.findUnique({
        where: { id: req.params.id },
        include: {
          bandActivities: true,
          qsoLogs: { orderBy: { qsoDate: 'desc' }, take: 10 },
          contextLogs: { orderBy: { createdAt: 'desc' }, take: 10 },
          networkStatus: true,
        },
      });
      res.json(station);
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch station' });
    }
  });

  app.post('/api/stations', async (req, res) => {
    try {
      const { callsign, name, class: stationClass, section, grid } = req.body;
      const station = await prisma.station.create({
        data: {
          callsign,
          name,
          class: stationClass,
          section,
          grid,
        },
      });
      res.status(201).json(station);
    } catch (error) {
      res.status(400).json({ error: 'Failed to create station' });
    }
  });

  app.post('/api/band-activity', async (req, res) => {
    try {
      const { stationId, band, mode, frequency, power } = req.body;
      const activity = await prisma.bandActivity.create({
        data: {
          stationId,
          band,
          mode,
          frequency,
          power,
        },
      });
      res.status(201).json(activity);
    } catch (error) {
      res.status(400).json({ error: 'Failed to create band activity' });
    }
  });

  return app;
};

describe('API Endpoints', () => {
  let app: express.Application;

  beforeAll(async () => {
    await connectToTestDB();
    app = createTestApp();
  });

  afterEach(async () => {
    await teardownTestDB();
  });

  describe('GET /health', () => {
    it('should return health status', async () => {
      const res = await request(app).get('/health');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.timestamp).toBeDefined();
    });
  });

  describe('GET /api/stations', () => {
    it('should return empty list initially', async () => {
      const res = await request(app).get('/api/stations');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(0);
    });

    it('should return stations with relationships', async () => {
      const { station } = await setupTestDB();

      const res = await request(app).get('/api/stations');
      expect(res.status).toBe(200);
      expect(res.body.length).toBeGreaterThan(0);

      const found = res.body.find((s: any) => s.id === station.id);
      expect(found).toBeDefined();
      expect(found.bandActivities).toBeDefined();
      expect(found._count).toBeDefined();
    });
  });

  describe('POST /api/stations', () => {
    it('should create a new station', async () => {
      const res = await request(app).post('/api/stations').send({
        callsign: 'N0CALL',
        name: 'Test Station',
        class: '2A',
        section: 'CA',
        grid: 'CM87us',
      });

      expect(res.status).toBe(201);
      expect(res.body.callsign).toBe('N0CALL');
      expect(res.body.class).toBe('2A');

      const found = await prisma.station.findUnique({
        where: { id: res.body.id },
      });
      expect(found).toBeDefined();
    });

    it('should fail with duplicate callsign', async () => {
      await prisma.station.create({
        data: {
          callsign: 'DUPE',
          name: 'Existing Station',
        },
      });

      const res = await request(app).post('/api/stations').send({
        callsign: 'DUPE',
        name: 'Duplicate',
      });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/band-activity', () => {
    it('should log band activity', async () => {
      const station = await prisma.station.create({
        data: {
          callsign: 'TEST-ACTIVITY',
          name: 'Activity Test',
        },
      });

      const res = await request(app).post('/api/band-activity').send({
        stationId: station.id,
        band: '20',
        mode: 'CW',
        frequency: '14025',
        power: 100,
      });

      expect(res.status).toBe(201);
      expect(res.body.band).toBe('20');
      expect(res.body.mode).toBe('CW');
    });
  });

  describe('GET /api/stations/:id', () => {
    it('should return station with all details', async () => {
      const station = await prisma.station.create({
        data: {
          callsign: 'TEST-DETAIL',
          name: 'Detail Test',
        },
      });

      const res = await request(app).get(`/api/stations/${station.id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(station.id);
      expect(res.body.bandActivities).toBeDefined();
      expect(res.body.contextLogs).toBeDefined();
    });

    it('should return null for nonexistent station', async () => {
      const res = await request(app).get('/api/stations/nonexistent');
      expect(res.status).toBe(200);
      expect(res.body).toBeNull();
    });
  });
});
