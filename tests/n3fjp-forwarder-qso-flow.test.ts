import request from 'supertest';
import prisma from '../src/db';
import { connectToTestDB, teardownTestDB } from './setup';
import { createTestSession } from './test-helpers';

jest.mock('../src/n3fjp-forwarder', () => ({
  forwardQsoAsTransaction: jest.fn().mockResolvedValue(true),
  getN3fjpForwarderConfig: jest.fn(() => ({
    enabled: true,
    host: '127.0.0.1',
    port: 1000,
    timeoutMs: 3000,
  })),
  updateN3fjpForwarderConfig: jest.fn((partial: any) => ({
    enabled: partial?.enabled ?? true,
    host: partial?.host ?? '127.0.0.1',
    port: partial?.port ?? 1000,
    timeoutMs: partial?.timeoutMs ?? 3000,
  })),
}));

import app from '../src/index';
import { forwardQsoAsTransaction } from '../src/n3fjp-forwarder';

const mockedForwardQsoAsTransaction = forwardQsoAsTransaction as jest.MockedFunction<typeof forwardQsoAsTransaction>;

describe('N3FJP forwarder QSO flow', () => {
  beforeAll(async () => {
    await connectToTestDB();
  });

  afterEach(async () => {
    mockedForwardQsoAsTransaction.mockClear();
    await teardownTestDB();
  });

  async function createStationAndToken(callsign: string) {
    const station = await prisma.station.create({
      data: {
        callsign,
        name: callsign,
      },
    });

    const { token } = await createTestSession({
      stationId: station.id,
      callsign,
    });

    return { station, token };
  }

  it('calls forwarder for successfully created QSO log', async () => {
    const { station, token } = await createStationAndToken('FWDQSO1');

    const response = await request(app)
      .post('/api/qso-logs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        stationId: station.id,
        callsign: 'K1ZZ',
        band: '20',
        mode: 'CW',
        qsoDate: '2026-06-27T18:01:02.000Z',
        qsoTime: '18:01:02',
      });

    expect(response.status).toBe(201);
    expect(mockedForwardQsoAsTransaction).toHaveBeenCalledTimes(1);
    expect(mockedForwardQsoAsTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        stationCallsign: 'FWDQSO1',
        callsign: 'K1ZZ',
        band: '20',
        mode: 'CW',
        qsoTime: '18:01:02',
      })
    );
  });

  it('does not call forwarder when duplicate QSO is deduped', async () => {
    const { station, token } = await createStationAndToken('FWDQSO2');

    const payload = {
      stationId: station.id,
      callsign: 'W1AW',
      band: '40',
      mode: 'PH',
      qsoDate: '2026-06-27T19:00:00.000Z',
      qsoTime: '19:00:00',
    };

    const first = await request(app)
      .post('/api/qso-logs')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    const second = await request(app)
      .post('/api/qso-logs')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);

    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.deduped).toBe(true);
    expect(mockedForwardQsoAsTransaction).toHaveBeenCalledTimes(1);
  });

  it('does not call forwarder on station/session mismatch (403)', async () => {
    const { station: ownerStation } = await createStationAndToken('FWDQSO3');
    const { token: otherToken } = await createStationAndToken('FWDQSO4');

    const response = await request(app)
      .post('/api/qso-logs')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({
        stationId: ownerStation.id,
        callsign: 'N0CALL',
        band: '15',
        mode: 'DIG',
        qsoDate: '2026-06-27T20:00:00.000Z',
        qsoTime: '20:00:00',
      });

    expect(response.status).toBe(403);
    expect(mockedForwardQsoAsTransaction).not.toHaveBeenCalled();
  });
});