import {
  buildTransactionMessage,
  getN3fjpForwarderConfig,
  updateN3fjpForwarderConfig,
} from '../src/n3fjp-forwarder';

describe('N3FJP forwarder', () => {
  it('builds NTWK transaction payload from QSO data', () => {
    const msg = buildTransactionMessage({
      stationCallsign: 'W7ABC',
      operatorCallsign: 'N7UF',
      callsign: 'K1ZZ',
      band: '20m',
      mode: 'SSB',
      qsoDate: new Date('2026-06-27T18:01:02Z'),
      qsoTime: '18:01:02',
      contestId: 'ARRL-FD',
      stationClass: '3A',
      section: 'ORG',
      points: 1,
    });

    expect(msg).toContain('<NTWK>');
    expect(msg).toContain('<TRANSACTION>ADD</TRANSACTION>');
    expect(msg).toContain('<FLDBAND>20</FLDBAND>');
    expect(msg).toContain('<FLDMODE>PH</FLDMODE>');
    expect(msg).toContain('<FLDCALL>K1ZZ</FLDCALL>');
    expect(msg).toContain('<FLDSECTION>ORG</FLDSECTION>');
    expect(msg).toContain('<FLDSTATION>W7ABC</FLDSTATION>');
  });

  it('sanitizes and persists runtime config updates', () => {
    const original = getN3fjpForwarderConfig();

    const updated = updateN3fjpForwarderConfig({
      enabled: true,
      host: '  example.net ',
      port: 70000,
      timeoutMs: 10,
    });

    expect(updated.enabled).toBe(true);
    expect(updated.host).toBe('example.net');
    expect(updated.port).toBe(65535);
    expect(updated.timeoutMs).toBe(500);

    updateN3fjpForwarderConfig(original);
  });
});