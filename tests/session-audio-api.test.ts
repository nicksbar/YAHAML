/**
 * Session, QSO Logs, and Radio Audio API Tests
 * Tests for session management, QSO log endpoints, and radio audio configuration
 */
import request from 'supertest';
import express from 'express';
import cors from 'cors';
import prisma from '../src/db';
import { connectToTestDB, teardownTestDB } from './setup';

const createTestApp = () => {
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Session endpoints
  app.post('/api/sessions', async (req, res) => {
    const { callsign, stationId, browserId } = req.body;
    const token = `test-token-${Date.now()}`;
    await prisma.session.create({
      data: {
        token,
        stationId,
        callsign,
        browserId: browserId || 'test',
        expiresAt: new Date(Date.now() + 20 * 60 * 1000),
      },
    });
    res.json({ token });
  });

  app.get('/api/sessions/me', async (req, res) => {
    const token = req.headers.authorization?.substring(7);
    if (!token) return res.status(401).json({ error: 'No token' });
    
    const session = await prisma.session.findUnique({ where: { token } });
    if (!session || session.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Invalid token' });
    }
    return res.json(session);
  });

  // QSO logs endpoints
  app.get('/api/qso-logs', async (req, res) => {
    const { limit } = req.query;
    const qsos = await prisma.logEntry.findMany({
      orderBy: { qsoDate: 'desc' },
      take: limit ? parseInt(limit as string) : 100,
      include: { station: { select: { callsign: true } } },
    });
    res.json(qsos);
  });

  // Radio endpoints
  app.put('/api/radios/:id', async (req, res) => {
    const { audioSourceType } = req.body;
    const radio = await prisma.radioConnection.update({
      where: { id: req.params.id },
      data: { audioSourceType },
    });
    res.json(radio);
  });

  return app;
};

describe('New Features', () => {
  let app: express.Application;

  beforeAll(async () => {
    await connectToTestDB();
    app = createTestApp();
  });

  afterEach(async () => {
    await teardownTestDB();
  });

  describe('Session Management', () => {
    it('should create and validate session', async () => {
      const station = await prisma.station.create({
        data: { callsign: 'N7UF', name: 'Test' },
      });

      // Create session
      const createRes = await request(app).post('/api/sessions').send({
        callsign: 'N7UF',
        stationId: station.id,
        browserId: 'test-1',
      });

      expect(createRes.status).toBe(200);
      expect(createRes.body.token).toBeDefined();

      // Validate session
      const validateRes = await request(app)
        .get('/api/sessions/me')
        .set('Authorization', `Bearer ${createRes.body.token}`);

      expect(validateRes.status).toBe(200);
      expect(validateRes.body.callsign).toBe('N7UF');
    });

    it('should reject invalid token', async () => {
      const res = await request(app)
        .get('/api/sessions/me')
        .set('Authorization', 'Bearer invalid');

      expect(res.status).toBe(401);
    });
  });

  describe('QSO Logs API', () => {
    it('should list all QSOs with limit', async () => {
      const station = await prisma.station.create({
        data: { callsign: 'N7UF', name: 'Test' },
      });

      // Create 3 QSOs
      for (let i = 0; i < 3; i++) {
        await prisma.logEntry.create({
          data: {
            stationId: station.id,
            callsign: `W${i}AW`,
            band: '20',
            mode: 'SSB',
            qsoDate: new Date(`2026-02-01T${10 + i}:00:00Z`),
            qsoTime: `${10 + i}:00`,
            source: 'test',
            dedupeKey: `test-${Date.now()}-${i}`,
          },
        });
      }

      // Get all
      const allRes = await request(app).get('/api/qso-logs');
      expect(allRes.status).toBe(200);
      expect(allRes.body).toHaveLength(3);

      // Get with limit
      const limitRes = await request(app).get('/api/qso-logs?limit=2');
      expect(limitRes.status).toBe(200);
      expect(limitRes.body).toHaveLength(2);
    });
  });

  describe('Radio Audio Control', () => {
    it('should configure audio source types', async () => {
      const radio = await prisma.radioConnection.create({
        data: {
          name: 'Test Radio',
          host: 'localhost',
          port: 4532,
        },
      });

      const types = ['loopback', 'janus', 'http-stream', 'none'];
      for (const type of types) {
        const res = await request(app).put(`/api/radios/${radio.id}`).send({
          audioSourceType: type,
        });

        expect(res.status).toBe(200);
        expect(res.body.audioSourceType).toBe(type);
      }
    });
  });
});
