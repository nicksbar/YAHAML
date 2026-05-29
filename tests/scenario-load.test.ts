import request from 'supertest';
import app from '../src/index';
import prisma from '../src/db';
import { cleanDatabase, createTestSession } from './test-helpers';

describe('Scenario load contest field mapping', () => {
  afterEach(async () => {
    await cleanDatabase({ preserveTemplates: true });
  });

  it('loads Field Day scenario with template linkage, exchange payload, and mode-based points', async () => {
    const station = await prisma.station.create({
      data: {
        callsign: 'W5ADMIN',
        name: 'Scenario Admin',
      },
    });

    const { token } = await createTestSession({
      stationId: station.id,
      callsign: station.callsign,
    });

    const response = await request(app)
      .post('/api/admin/scenarios/field-day-small/load')
      .set('Authorization', `Bearer ${token}`)
      .send({});

    expect(response.status).toBe(200);

    const contest = await prisma.contest.findFirst({
      where: { name: 'ARRL Field Day 2024' },
      include: { template: true },
    });

    expect(contest).toBeTruthy();
    expect(contest?.isActive).toBe(true);
    expect(contest?.template?.type).toBe('ARRL_FD');

    const stations = await prisma.station.findMany();
    expect(stations.length).toBeGreaterThan(0);
    expect(stations.every((s) => s.contestId === contest?.id)).toBe(true);

    const cwLog = await prisma.logEntry.findFirst({
      where: {
        source: 'scenario',
        contestId: contest?.id,
        mode: 'CW',
      },
      orderBy: { createdAt: 'asc' },
    });

    const phoneLog = await prisma.logEntry.findFirst({
      where: {
        source: 'scenario',
        contestId: contest?.id,
        mode: 'SSB',
      },
      orderBy: { createdAt: 'asc' },
    });

    expect(cwLog).toBeTruthy();
    expect(phoneLog).toBeTruthy();
    expect(cwLog?.points).toBe(2);
    expect(phoneLog?.points).toBe(1);

    const rawPayload = cwLog?.rawPayload ? JSON.parse(cwLog.rawPayload) : null;
    expect(rawPayload?.exchange).toBeTruthy();
    expect(rawPayload?.exchange?.class).toBeTruthy();
    expect(rawPayload?.exchange?.section).toBeTruthy();
    expect(rawPayload?.exchange?.power).toBe('LOW');
    expect(rawPayload?.exchange?.class).toMatch(/^[1-9][A-F]$/);
    expect(String(rawPayload?.exchange?.section).length).toBeGreaterThanOrEqual(2);

    const statsResponse = await request(app)
      .get(`/api/stats/contest?contestId=${contest?.id}&period=contest`);

    expect(statsResponse.status).toBe(200);
    expect(statsResponse.body.qsoCount).toBeGreaterThan(0);
    expect(statsResponse.body.pointsTotal).toBeGreaterThan(0);
    expect(Object.keys(statsResponse.body.bandDist || {}).length).toBeGreaterThan(0);
  });
});
