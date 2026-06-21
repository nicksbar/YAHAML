import type { CwAgentConfig, TxArmState } from './types';

function numberFromEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function armStateFromEnv(value?: string): TxArmState {
  if (value === 'ARMED' || value === 'DISARMED' || value === 'KILLED') {
    return value;
  }
  return 'DRY_RUN';
}

function parseExchange(value?: string): Record<string, string> {
  if (!value) return {};
  return value.split(',').reduce<Record<string, string>>((exchange, pair) => {
    const [rawKey, rawValue] = pair.split('=');
    const key = rawKey?.trim();
    const exchangeValue = rawValue?.trim();
    if (key && exchangeValue) {
      exchange[key] = exchangeValue.toUpperCase();
    }
    return exchange;
  }, {});
}

export function loadCwAgentConfig(): CwAgentConfig {
  const yahamlBaseUrl = process.env.CW_AGENT_YAHAML_URL || 'http://localhost:3000';
  const yahamlWsUrl = process.env.CW_AGENT_YAHAML_WS_URL || yahamlBaseUrl.replace(/^http/, 'ws') + '/ws';
  const stationCallsign = (process.env.CW_AGENT_CALLSIGN || 'YAHAML').toUpperCase();
  const sentExchange = parseExchange(process.env.CW_AGENT_SENT_EXCHANGE);

  return {
    yahamlBaseUrl,
    yahamlWsUrl,
    sessionToken: process.env.CW_AGENT_SESSION_TOKEN,
    browserId: process.env.CW_AGENT_BROWSER_ID || `cw-agent-${stationCallsign.toLowerCase()}`,
    stationId: process.env.CW_AGENT_STATION_ID,
    stationCallsign,
    onAirCallsignOverride: process.env.CW_AGENT_ON_AIR_CALLSIGN?.toUpperCase(),
    useClubCallsign: process.env.CW_AGENT_USE_CLUB_CALLSIGN !== 'false',
    useSpecialEventCallsign: process.env.CW_AGENT_USE_SPECIAL_EVENT_CALLSIGN !== 'false',
    operatorCallsign: process.env.CW_AGENT_OPERATOR_CALLSIGN?.toUpperCase(),
    activityType: process.env.CW_AGENT_ACTIVITY_TYPE,
    activityName: process.env.CW_AGENT_ACTIVITY_NAME,
    sentExchange,
    txArmState: armStateFromEnv(process.env.CW_AGENT_TX_STATE),
    maxTxMessageLength: numberFromEnv('CW_AGENT_MAX_TX_LENGTH', 80),
    cqCooldownMs: numberFromEnv('CW_AGENT_CQ_COOLDOWN_MS', 10000),
    actionTimeoutMs: numberFromEnv('CW_AGENT_ACTION_TIMEOUT_MS', 5000),
    backend: {
      radio: 'simulator',
      keyer: 'simulator',
      decoder: 'manual',
      logger: 'mock',
    },
  };
}
