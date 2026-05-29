import dgram from 'dgram';
import { connectToTestDB, teardownTestDB } from './setup';
import { waitFor } from './test-helpers';

jest.mock('../src/n3fjp-forwarder', () => ({
  forwardQsoAsTransaction: jest.fn().mockResolvedValue(true),
}));

import prisma from '../src/db';
import { startUdpServer } from '../src/udp';
import { forwardQsoAsTransaction } from '../src/n3fjp-forwarder';

const mockedForwardQsoAsTransaction =
  forwardQsoAsTransaction as jest.MockedFunction<typeof forwardQsoAsTransaction>;

function getTestPort() {
  return 30000 + Math.floor(Math.random() * 10000);
}

async function sendUdp(host: string, port: number, payload: string) {
  const client = dgram.createSocket('udp4');
  await new Promise<void>((resolve, reject) => {
    client.send(Buffer.from(payload, 'utf-8'), port, host, (err) => {
      if (err) {
        reject(err);
        return;
      }
      resolve();
    });
  });
  client.close();
}

describe('UDP ingest forwarding integration', () => {
  let server: dgram.Socket | null = null;

  beforeAll(async () => {
    await connectToTestDB();
  });

  afterEach(async () => {
    mockedForwardQsoAsTransaction.mockClear();
    if (server) {
      await new Promise<void>((resolve) => {
        server?.close(() => resolve());
      });
      server = null;
    }
    await teardownTestDB();
  });

  it('forwards once when first UDP QSO is ingested', async () => {
    const port = getTestPort();
    server = startUdpServer(port, '127.0.0.1', []);

    await sendUdp(
      '127.0.0.1',
      port,
      'CALL=W1AW BAND=20 MODE=CW QSO_DATE=20250131 TIME_ON=123456 MYCALL=UDPFWD1'
    );

    const forwarded = await waitFor(() => mockedForwardQsoAsTransaction.mock.calls.length === 1, 4000, 50);
    expect(forwarded).toBe(true);
    expect(mockedForwardQsoAsTransaction).toHaveBeenCalledTimes(1);
    expect(mockedForwardQsoAsTransaction).toHaveBeenCalledWith(
      expect.objectContaining({
        stationCallsign: 'UDPFWD1',
        callsign: 'W1AW',
        band: '20',
        mode: 'CW',
      })
    );

    const logCount = await prisma.logEntry.count();
    expect(logCount).toBe(1);
  });

  it('does not forward duplicate UDP packet twice when deduped', async () => {
    const port = getTestPort();
    server = startUdpServer(port, '127.0.0.1', []);

    const payload =
      'CALL=K1ZZ BAND=40 MODE=PH QSO_DATE=20250131 TIME_ON=235959 MYCALL=UDPFWD2';

    await sendUdp('127.0.0.1', port, payload);
    await waitFor(() => mockedForwardQsoAsTransaction.mock.calls.length === 1, 4000, 50);

    await sendUdp('127.0.0.1', port, payload);

    // Give processor a moment; deduped second packet should not trigger second forward
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(mockedForwardQsoAsTransaction).toHaveBeenCalledTimes(1);
    const logCount = await prisma.logEntry.count();
    expect(logCount).toBe(1);
  });
});