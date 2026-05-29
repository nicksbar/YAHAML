import net from 'net';

export interface N3fjpForwarderConfig {
  enabled: boolean;
  host: string;
  port: number;
  timeoutMs: number;
}

export interface N3fjpTransactionInput {
  stationCallsign: string;
  operatorCallsign?: string;
  callsign: string;
  band: string;
  mode: string;
  qsoDate: Date;
  qsoTime: string;
  contestId?: string | null;
  stationClass?: string | null;
  section?: string | null;
  points?: number | null;
}

const defaultConfig: N3fjpForwarderConfig = {
  enabled: process.env.N3FJP_FORWARD_ENABLED === 'true',
  host: process.env.N3FJP_FORWARD_HOST || '127.0.0.1',
  port: Number(process.env.N3FJP_FORWARD_PORT || 1000),
  timeoutMs: Number(process.env.N3FJP_FORWARD_TIMEOUT_MS || 3000),
};

let config: N3fjpForwarderConfig = { ...defaultConfig };

function sanitizeConfig(partial: Partial<N3fjpForwarderConfig>): N3fjpForwarderConfig {
  const nextEnabled = typeof partial.enabled === 'boolean' ? partial.enabled : config.enabled;
  const nextHost = (partial.host ?? config.host).trim() || '127.0.0.1';
  const rawPort = partial.port ?? config.port;
  const nextPort = Number.isFinite(rawPort) ? Math.max(1, Math.min(65535, Math.trunc(rawPort))) : config.port;
  const rawTimeout = partial.timeoutMs ?? config.timeoutMs;
  const nextTimeout = Number.isFinite(rawTimeout) ? Math.max(500, Math.min(30000, Math.trunc(rawTimeout))) : config.timeoutMs;

  return {
    enabled: nextEnabled,
    host: nextHost,
    port: nextPort,
    timeoutMs: nextTimeout,
  };
}

export function getN3fjpForwarderConfig(): N3fjpForwarderConfig {
  return { ...config };
}

export function updateN3fjpForwarderConfig(partial: Partial<N3fjpForwarderConfig>): N3fjpForwarderConfig {
  config = sanitizeConfig(partial);
  return getN3fjpForwarderConfig();
}

function encodeMessage(msg: string): Buffer {
  const msgUtf16 = Buffer.from(`<BOR>${msg}<EOR>`, 'utf-16le');
  const controlChars = Buffer.from([0x03, 0x00, 0x04, 0x00, 0x07, 0x00]);
  return Buffer.concat([msgUtf16, controlChars]);
}

function sendToExternalHost(buffer: Buffer): Promise<void> {
  const active = getN3fjpForwarderConfig();

  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: active.host, port: active.port }, () => {
      socket.write(buffer, (writeErr) => {
        if (writeErr) {
          socket.destroy();
          reject(writeErr);
          return;
        }
        socket.end();
        resolve();
      });
    });

    socket.setTimeout(active.timeoutMs, () => {
      socket.destroy(new Error(`Timeout forwarding to ${active.host}:${active.port}`));
    });

    socket.on('error', (err) => {
      reject(err);
    });
  });
}

function normalizeBand(input: string): string {
  return input.trim().toUpperCase().replace(/M$/, '');
}

function normalizeMode(input: string): string {
  const mode = input.trim().toUpperCase();
  if (mode === 'SSB' || mode === 'PHONE' || mode === 'PH') return 'PH';
  if (mode === 'DIGITAL' || mode === 'DIG' || mode === 'FT8' || mode === 'FT4' || mode === 'PSK' || mode === 'RTTY') return 'DIG';
  if (mode === 'CW') return 'CW';
  return mode;
}

function formatDate(input: Date): string {
  const year = input.getUTCFullYear();
  const month = String(input.getUTCMonth() + 1).padStart(2, '0');
  const day = String(input.getUTCDate()).padStart(2, '0');
  return `${year}/${month}/${day}`;
}

function formatTime(input: string): string {
  const clean = input.trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(clean)) return clean;
  if (/^\d{2}:\d{2}$/.test(clean)) return `${clean}:00`;
  if (/^\d{6}$/.test(clean)) return `${clean.slice(0, 2)}:${clean.slice(2, 4)}:${clean.slice(4, 6)}`;
  if (/^\d{4}$/.test(clean)) return `${clean.slice(0, 2)}:${clean.slice(2, 4)}:00`;
  return '00:00:00';
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildTransactionMessage(input: N3fjpTransactionInput): string {
  const stationCallsign = input.stationCallsign.trim().toUpperCase();
  const operatorCallsign = (input.operatorCallsign || input.stationCallsign).trim().toUpperCase();
  const classValue = (input.stationClass || '').trim().toUpperCase();
  const sectionValue = (input.section || '').trim().toUpperCase();
  const pointsValue = input.points ?? 0;

  const xmlData = [
    `<FLDBAND>${xmlEscape(normalizeBand(input.band))}</FLDBAND>`,
    `<FLDCALL>${xmlEscape(input.callsign.trim().toUpperCase())}</FLDCALL>`,
    `<FLDCLASS>${xmlEscape(classValue)}</FLDCLASS>`,
    `<FLDCONTESTID>${xmlEscape(input.contestId || 'ARRL-FD')}</FLDCONTESTID>`,
    '<FLDCONTINENT>NA</FLDCONTINENT>',
    '<FLDCOUNTRYWORKED>USA</FLDCOUNTRYWORKED>',
    `<FLDDATESTR>${xmlEscape(formatDate(input.qsoDate))}</FLDDATESTR>`,
    `<FLDMODE>${xmlEscape(normalizeMode(input.mode))}</FLDMODE>`,
    `<FLDMODECONTEST>${xmlEscape(normalizeMode(input.mode))}</FLDMODECONTEST>`,
    `<FLDOPERATOR>${xmlEscape(operatorCallsign)}</FLDOPERATOR>`,
    `<FLDPOINTS>${String(pointsValue)}</FLDPOINTS>`,
    `<FLDSECTION>${xmlEscape(sectionValue)}</FLDSECTION>`,
    `<FLDSPCNUM>${xmlEscape(sectionValue)}</FLDSPCNUM>`,
    `<FLDSTATION>${xmlEscape(stationCallsign)}</FLDSTATION>`,
    `<FLDTIMEONSTR>${xmlEscape(formatTime(input.qsoTime))}</FLDTIMEONSTR>`,
  ].join('');

  return `<NTWK><FROM>YAHAML</FROM><TRANSACTION>ADD</TRANSACTION><XMLDATA>${xmlData}</XMLDATA></NTWK>`;
}

export async function forwardRawN3fjpMessage(message: string): Promise<boolean> {
  const active = getN3fjpForwarderConfig();
  if (!active.enabled) {
    return false;
  }

  try {
    await sendToExternalHost(encodeMessage(message));
    return true;
  } catch (error) {
    console.warn('[N3FJP-FWD] Failed to forward raw message:', error instanceof Error ? error.message : error);
    return false;
  }
}

export async function forwardQsoAsTransaction(input: N3fjpTransactionInput): Promise<boolean> {
  const message = buildTransactionMessage(input);
  return forwardRawN3fjpMessage(message);
}