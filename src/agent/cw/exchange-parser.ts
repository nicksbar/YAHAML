import type { ActivityProfile, FieldDayExchange } from './types';

const CALLSIGN_PATTERN = /\b[A-Z0-9]{1,3}[0-9][A-Z0-9]{1,4}\b/;
const FIELD_DAY_CLASS_PATTERN = /\b\d{1,2}[A-F]\b/;

function normalizeTokens(text: string): string[] {
  return text
    .toUpperCase()
    .replace(/[^A-Z0-9/ -]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export function extractCallsign(text: string): string | null {
  const match = normalizeTokens(text).find((token) => CALLSIGN_PATTERN.test(token));
  return match || null;
}

export function parseFieldDayExchange(text: string): FieldDayExchange | null {
  const tokens = normalizeTokens(text);
  const callsign = tokens.find((token) => CALLSIGN_PATTERN.test(token));
  const classValue = tokens.find((token) => FIELD_DAY_CLASS_PATTERN.test(token));
  const section = classValue
    ? tokens.slice(tokens.indexOf(classValue) + 1).find((token) => /^[A-Z]{2,3}$/.test(token))
    : undefined;

  if (!callsign && !classValue && !section) return null;

  return {
    callsign: callsign || '',
    class: classValue,
    section,
  };
}

export function parseActivityExchange(
  text: string,
  profile: ActivityProfile,
): { callsign?: string; exchange: Record<string, string>; complete: boolean } {
  const tokens = normalizeTokens(text);
  const callsign = extractCallsign(text) || undefined;

  if (profile.type === 'ARRL_FD') {
    const fieldDay = parseFieldDayExchange(text);
    const exchange: Record<string, string> = {};
    if (fieldDay?.class) exchange.class = fieldDay.class;
    if (fieldDay?.section) exchange.section = fieldDay.section;
    return {
      callsign: fieldDay?.callsign || callsign,
      exchange,
      complete: profile.exchangeReceivedFields.every((field) => Boolean(exchange[field])),
    };
  }

  const exchange: Record<string, string> = {};
  const fields = profile.exchangeReceivedFields;
  let tokenIndex = callsign ? tokens.indexOf(callsign) + 1 : 0;

  for (const field of fields) {
    const token = tokens[tokenIndex];
    if (!token) break;
    exchange[field] = token;
    tokenIndex += 1;
  }

  return {
    callsign,
    exchange,
    complete: fields.length === 0 || fields.every((field) => Boolean(exchange[field])),
  };
}
