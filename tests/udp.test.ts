/**
 * UDP parsing unit tests
 */
import { mapFieldsToQso, parseUdpPayload } from '../src/udp';

describe('UDP Parser', () => {
  it('parses key=value payloads', () => {
    const payload = 'CALL=K1LI BAND=20 MODE=CW QSO_DATE=20250131 TIME_ON=123456';
    const fields = parseUdpPayload(payload);
    expect(fields.CALL).toBe('K1LI');
    expect(fields.BAND).toBe('20');
    expect(fields.MODE).toBe('CW');
  });

  it('parses ADIF payloads', () => {
    const payload = '<CALL:4>K1LI<BAND:2>20<MODE:2>CW<qso_date:8>20250131<time_on:6>123456';
    const fields = parseUdpPayload(payload);
    expect(fields.CALL).toBe('K1LI');
    expect(fields.BAND).toBe('20');
    expect(fields.MODE).toBe('CW');
  });

  it('parses XML payloads', () => {
    const payload = '<LOG><CALL>K1LI</CALL><BAND>40</BAND><MODE>PH</MODE></LOG>';
    const fields = parseUdpPayload(payload);
    expect(fields.CALL).toBe('K1LI');
    expect(fields.BAND).toBe('40');
    expect(fields.MODE).toBe('PH');
  });

  it('maps fields to QSO input', () => {
    const fields = {
      CALL: 'W1AW',
      BAND: '20',
      MODE: 'CW',
      QSO_DATE: '20250131',
      TIME_ON: '123456',
      MYCALL: 'K1LI',
    };
    const qso = mapFieldsToQso(fields);
    expect(qso?.callsign).toBe('W1AW');
    expect(qso?.band).toBe('20');
    expect(qso?.mode).toBe('CW');
    expect(qso?.stationCall).toBe('K1LI');
  });
});
