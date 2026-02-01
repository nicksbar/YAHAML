import dgram from 'dgram';
import { Prisma } from '@prisma/client';
import prisma from './db';

export interface UdpTarget {
  host: string;
  port: number;
}

export interface UdpQsoInput {
  stationCall: string;
  callsign: string;
  band: string;
  mode: string;
  qsoDate: Date;
  qsoTime: string;
  frequency?: string;
  rstSent?: string;
  rstRcvd?: string;
  power?: number;
  points?: number;
  name?: string;
  state?: string;
  grid?: string;
}

function buildDedupeKey(input: {
  stationCall: string;
  callsign: string;
  band: string;
  mode: string;
  qsoDate: Date;
  qsoTime: string;
  contestId?: string | null;
  clubId?: string | null;
}): string {
  const dateStr = input.qsoDate.toISOString().slice(0, 10);
  return [
    input.contestId || 'none',
    input.clubId || 'none',
    input.stationCall.toUpperCase(),
    input.callsign.toUpperCase(),
    input.band.toUpperCase(),
    input.mode.toUpperCase(),
    dateStr,
    input.qsoTime,
  ].join('|');
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

function parseKeyValuePayload(payload: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const regex = /([A-Za-z0-9_]+)=([^,;\n\r\s]+)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(payload))) {
    fields[match[1].toUpperCase()] = match[2].trim();
  }
  return fields;
}

function parseXmlPayload(payload: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const regex = /<([A-Za-z0-9_]+)>([^<]*)<\/\1>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(payload))) {
    fields[match[1].toUpperCase()] = match[2].trim();
  }
  return fields;
}

function parseAdifPayload(payload: string): Record<string, string> {
  const fields: Record<string, string> = {};
  const regex = /<([A-Za-z0-9_]+):(\d+)(:[^>]*)?>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(payload))) {
    const key = match[1].toUpperCase();
    const length = Number(match[2]);
    const valueStart = match.index + match[0].length;
    const value = payload.substr(valueStart, length);
    fields[key] = value.trim();
  }
  return fields;
}

export function parseUdpPayload(payload: string): Record<string, string> {
  const trimmed = payload.trim();
  if (trimmed.includes('<') && /<[A-Za-z0-9_]+:\d+/.test(trimmed)) {
    return parseAdifPayload(trimmed);
  }
  if (trimmed.includes('<') && trimmed.includes('</')) {
    return parseXmlPayload(trimmed);
  }
  if (trimmed.includes('=')) {
    return parseKeyValuePayload(trimmed);
  }
  return {};
}

function parseDateTime(
  dateStr?: string,
  timeStr?: string,
): { qsoDate: Date; qsoTime: string } {
  const now = new Date();
  if (!dateStr) {
    return { qsoDate: now, qsoTime: timeStr || now.toTimeString().slice(0, 8) };
  }

  let normalizedDate = dateStr.trim();
  if (/^\d{8}$/.test(normalizedDate)) {
    normalizedDate = `${normalizedDate.slice(0, 4)}-${normalizedDate.slice(4, 6)}-${normalizedDate.slice(6, 8)}`;
  }
  normalizedDate = normalizedDate.replace(/\//g, '-');

  let normalizedTime = timeStr?.trim() || now.toTimeString().slice(0, 8);
  if (/^\d{6}$/.test(normalizedTime)) {
    normalizedTime = `${normalizedTime.slice(0, 2)}:${normalizedTime.slice(2, 4)}:${normalizedTime.slice(4, 6)}`;
  }
  if (/^\d{4}$/.test(normalizedTime)) {
    normalizedTime = `${normalizedTime.slice(0, 2)}:${normalizedTime.slice(2, 4)}:00`;
  }
  if (/^\d{2}:\d{2}$/.test(normalizedTime)) {
    normalizedTime = `${normalizedTime}:00`;
  }

  const combined = `${normalizedDate}T${normalizedTime}Z`;
  const qsoDate = new Date(combined);
  return { qsoDate: isNaN(qsoDate.getTime()) ? now : qsoDate, qsoTime: normalizedTime };
}

function getField(fields: Record<string, string>, keys: string[]): string | undefined {
  for (const key of keys) {
    if (fields[key]) return fields[key];
  }
  return undefined;
}

export function mapFieldsToQso(fields: Record<string, string>): UdpQsoInput | null {
  const callsign = getField(fields, ['CALL', 'FLDCALL', 'CALLSIGN', 'DXCALL']);
  const stationCall = getField(fields, ['STATION', 'FLDSTATION', 'MYCALL', 'OPERATOR', 'FLDOPERATOR']);
  const band = getField(fields, ['BAND', 'FLDBAND']);
  const mode = getField(fields, ['MODE', 'FLDMODE', 'MODECONTEST', 'FLDMODECONTEST']);
  const frequency = getField(fields, ['FREQ', 'FREQUENCY', 'FLDFREQ']);
  const rstSent = getField(fields, ['RST_SENT', 'FLDRSTS', 'RST_S']);
  const rstRcvd = getField(fields, ['RST_RCVD', 'FLDRSTR', 'RST_R']);
  const powerStr = getField(fields, ['POWER', 'TX_PWR', 'FLDPOWER']);
  const pointsStr = getField(fields, ['POINTS', 'FLDPOINTS']);
  const name = getField(fields, ['NAME', 'FLDNAME']);
  const state = getField(fields, ['STATE', 'FLDSTATE']);
  const grid = getField(fields, ['GRID', 'GRIDSQUARE', 'FLDGRID']);

  if (!callsign || !band || !mode) {
    return null;
  }

  const { qsoDate, qsoTime } = parseDateTime(
    getField(fields, ['QSO_DATE', 'FLDDATESTR', 'DATE']),
    getField(fields, ['TIME_ON', 'FLDTIMEONSTR', 'TIME']),
  );

  return {
    stationCall: stationCall || 'UDP-UNKNOWN',
    callsign,
    band,
    mode,
    qsoDate,
    qsoTime,
    frequency,
    rstSent,
    rstRcvd,
    power: powerStr ? Number(powerStr) : undefined,
    points: pointsStr ? Number(pointsStr) : undefined,
    name,
    state,
    grid,
  };
}

async function getOrCreateStation(callsign: string) {
  let station = await prisma.station.findUnique({
    where: { callsign },
  });
  if (!station) {
    station = await prisma.station.create({
      data: { callsign, name: callsign },
    });
  }
  return station;
}

async function logUdpContext(
  stationId: string,
  level: string,
  message: string,
  details?: Record<string, unknown>,
) {
  await prisma.contextLog.create({
    data: {
      stationId,
      level,
      category: 'UDP',
      message,
      details: details ? JSON.stringify(details) : undefined,
    },
  });
}

async function logBandActivity(stationId: string, band: string, mode: string) {
  await prisma.bandActivity.create({
    data: {
      stationId,
      band,
      mode,
    },
  });
}

async function updateNetworkStatus(stationId: string, ip: string) {
  const existing = await prisma.networkStatus.findUnique({
    where: { stationId },
  });
  if (!existing) {
    await prisma.networkStatus.create({
      data: {
        stationId,
        isConnected: true,
        ip,
        port: 0,
        relayHost: 'udp',
        relayPort: 0,
        relayVersion: '1.0.0',
      },
    });
    return;
  }
  await prisma.networkStatus.update({
    where: { stationId },
    data: {
      isConnected: true,
      ip,
      lastConnected: new Date(),
    },
  });
}

export function parseUdpTargets(targets: string | undefined): UdpTarget[] {
  if (!targets) return [];
  return targets
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [host, portStr] = entry.split(':');
      const port = Number(portStr);
      if (!host || !port) return null;
      return { host, port } as UdpTarget;
    })
    .filter((entry): entry is UdpTarget => Boolean(entry));
}

export function sendUdpMessage(socket: dgram.Socket, payload: string, targets: UdpTarget[]) {
  const message = Buffer.from(payload, 'utf-8');
  for (const target of targets) {
    socket.send(message, target.port, target.host);
  }
}

export function startUdpServer(port: number, host: string = '0.0.0.0', targets: UdpTarget[]) {
  const server = dgram.createSocket('udp4');

  server.on('error', (err) => {
    console.error('UDP server error:', err);
  });

  server.on('message', async (msg, rinfo) => {
    const payload = msg.toString('utf-8');
    const fields = parseUdpPayload(payload);
    const qso = mapFieldsToQso(fields);

    if (!qso) {
      const unknownStation = await getOrCreateStation('UDP-UNKNOWN');
      await logUdpContext(unknownStation.id, 'WARN', 'UDP payload missing required fields', {
        payload: payload.substring(0, 200),
      }).catch(() => {});
      return;
    }

    const station = await getOrCreateStation(qso.stationCall);
    const dedupeKey = buildDedupeKey({
      stationCall: qso.stationCall,
      callsign: qso.callsign,
      band: qso.band,
      mode: qso.mode,
      qsoDate: qso.qsoDate,
      qsoTime: qso.qsoTime,
    });

    try {
      await prisma.logEntry.create({
        data: {
          stationId: station.id,
          callsign: qso.callsign,
          band: qso.band,
          mode: qso.mode,
          frequency: qso.frequency,
          rstSent: qso.rstSent,
          rstRcvd: qso.rstRcvd,
          power: qso.power,
          qsoDate: qso.qsoDate,
          qsoTime: qso.qsoTime,
          points: qso.points || 0,
          name: qso.name,
          state: qso.state,
          grid: qso.grid,
          source: 'udp',
          dedupeKey,
          rawPayload: payload.substring(0, 2000),
        },
      });
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }
    }

    await logBandActivity(station.id, qso.band, qso.mode).catch(() => {});
    await updateNetworkStatus(station.id, rinfo.address).catch(() => {});
    await logUdpContext(station.id, 'INFO', 'UDP log entry received', {
      callsign: qso.callsign,
      band: qso.band,
      mode: qso.mode,
    }).catch(() => {});

    if (targets.length > 0) {
      sendUdpMessage(server, payload, targets);
    }
  });

  server.bind(port, host, () => {
    const displayHost = host === '0.0.0.0' ? 'all interfaces' : host;
    console.log(`✓ UDP log listener running on ${host}:${port}`);
    console.log(`  - Accessible from: ${displayHost}`);
  });

  return server;
}
