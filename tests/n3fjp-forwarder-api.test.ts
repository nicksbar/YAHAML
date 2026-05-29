import request from 'supertest';
import prisma from '../src/db';
import { connectToTestDB, teardownTestDB } from './setup';
import { createTestSession } from './test-helpers';

describe('N3FJP Forwarder Config API', () => {
  beforeAll(async () => {
    await connectToTestDB();
  });

  afterEach(async () => {
    await teardownTestDB();
  });

  const createStationWithSession = async (callsign: string) => {
    const station = await prisma.station.create({
      data: {
        callsign,
        name: callsign,
      },
    });

    const session = await createTestSession({
      stationId: station.id,
      callsign,
    });

    return { station, token: session.token };
  };

  it('requires auth for reading config', async () => {
    jest.resetModules();
    const app = (await import('../src/index')).default;

    const response = await request(app).get('/api/n3fjp-forwarder/config');

    expect(response.status).toBe(401);
  });

  it('allows admin to update and read system-wide config', async () => {
    jest.resetModules();
    const app = (await import('../src/index')).default;

    const { token: adminToken } = await createStationWithSession('ADMINFWD');

    // Bootstrap admin list with this caller
    const bootstrap = await request(app)
      .post('/api/admin/callsigns')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ callsigns: ['ADMINFWD'] });

    expect(bootstrap.status).toBe(200);

    const update = await request(app)
      .put('/api/n3fjp-forwarder/config')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        enabled: true,
        host: ' fieldday-relay.local ',
        port: 10001,
        timeoutMs: 4500,
      });

    expect(update.status).toBe(200);
    expect(update.body.enabled).toBe(true);
    expect(update.body.host).toBe('fieldday-relay.local');
    expect(update.body.port).toBe(10001);
    expect(update.body.timeoutMs).toBe(4500);

    const read = await request(app)
      .get('/api/n3fjp-forwarder/config')
      .set('Authorization', `Bearer ${adminToken}`);

    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({
      enabled: true,
      host: 'fieldday-relay.local',
      port: 10001,
      timeoutMs: 4500,
    });
  });

  it('blocks non-admin from updating config when admin list is set', async () => {
    jest.resetModules();
    const app = (await import('../src/index')).default;

    const { token: adminToken } = await createStationWithSession('ADMINFWD2');
    const { token: userToken } = await createStationWithSession('USERFWD2');

    const bootstrap = await request(app)
      .post('/api/admin/callsigns')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ callsigns: ['ADMINFWD2'] });

    expect(bootstrap.status).toBe(200);

    const denied = await request(app)
      .put('/api/n3fjp-forwarder/config')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        enabled: true,
        host: 'non-admin-host',
        port: 1000,
      });

    expect(denied.status).toBe(403);
  });
});