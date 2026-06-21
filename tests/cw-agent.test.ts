import { ARRL_FIELD_DAY, POTA } from '../src/contest-templates';
import { createActivityProfile } from '../src/agent/cw/activity-profile';
import { decideDeterministicRunMode } from '../src/agent/cw/brain';
import { parseActivityExchange } from '../src/agent/cw/exchange-parser';
import { validateCwAction } from '../src/agent/cw/safety';
import { createInitialQsoState, scheduleCq } from '../src/agent/cw/state-machine';
import type { CwAgentConfig, CwObservation } from '../src/agent/cw/types';

function baseConfig(): CwAgentConfig {
  return {
    yahamlBaseUrl: 'http://localhost:3000',
    yahamlWsUrl: 'ws://localhost:3000/ws',
    browserId: 'cw-agent-test',
    stationCallsign: 'W1AW',
    sentExchange: { class: '2A', section: 'CT' },
    txArmState: 'DRY_RUN',
    maxTxMessageLength: 80,
    cqCooldownMs: 10000,
    actionTimeoutMs: 5000,
    backend: {
      radio: 'simulator',
      keyer: 'simulator',
      decoder: 'manual',
      logger: 'mock',
    },
  };
}

function observation(config: CwAgentConfig, overrides: Partial<CwObservation> = {}): CwObservation {
  const activity = createActivityProfile(ARRL_FIELD_DAY);
  return {
    timestamp: 100000,
    radio: {
      frequencyHz: '14030000',
      band: '20',
      mode: 'CW',
      connected: true,
      ptt: false,
    },
    activity,
    qso: createInitialQsoState(config.sentExchange),
    txArmState: config.txArmState,
    ...overrides,
  };
}

describe('CW agent activity profile', () => {
  test('builds profiles from any YAHAML contest template', () => {
    const pota = createActivityProfile(POTA);

    expect(pota.type).toBe('POTA');
    expect(pota.allowedModes).toContain('CW');
    expect(pota.exchangeReceivedFields).toEqual(['rst', 'park']);
  });

  test('falls back to a general CW activity when no contest is active', () => {
    const general = createActivityProfile(null);

    expect(general.type).toBe('GENERAL');
    expect(general.allowedModes).toEqual(['CW']);
  });
});

describe('CW exchange parsing', () => {
  test('parses Field Day callsign, class, and section', () => {
    const parsed = parseActivityExchange('K1ABC 2A EMA', createActivityProfile(ARRL_FIELD_DAY));

    expect(parsed.callsign).toBe('K1ABC');
    expect(parsed.exchange).toEqual({ class: '2A', section: 'EMA' });
    expect(parsed.complete).toBe(true);
  });

  test('uses generic exchange fields for non-Field-Day activities', () => {
    const parsed = parseActivityExchange('N7P 599 K-1234', createActivityProfile(POTA));

    expect(parsed.callsign).toBe('N7P');
    expect(parsed.exchange).toEqual({ rst: '599', park: 'K-1234' });
    expect(parsed.complete).toBe(true);
  });
});

describe('CW run-mode brain and safety', () => {
  test('schedules CQ but dry-run safety blocks transmit by default', () => {
    const config = baseConfig();
    const qso = scheduleCq(createInitialQsoState(config.sentExchange));
    const obs = observation(config, { qso });
    const decision = decideDeterministicRunMode(obs, config);
    const safety = validateCwAction(decision.action, obs, config);

    expect(decision.action.type).toBe('SEND_CQ');
    expect(decision.action.message).toContain('CQ ARRL FD');
    expect(safety.allowed).toBe(false);
    expect(safety.reasons).toContain('Transmit is not armed');
  });

  test('allows CQ transmit when explicitly armed on an allowed band and mode', () => {
    const config = { ...baseConfig(), txArmState: 'ARMED' as const };
    const qso = scheduleCq(createInitialQsoState(config.sentExchange));
    const obs = observation(config, { qso, txArmState: 'ARMED' });
    const decision = decideDeterministicRunMode(obs, config);
    const safety = validateCwAction(decision.action, obs, config);

    expect(decision.action.type).toBe('SEND_CQ');
    expect(safety.allowed).toBe(true);
  });

  test('logs a QSO after a complete activity exchange is received', () => {
    const config = { ...baseConfig(), txArmState: 'ARMED' as const };
    const qso = {
      ...createInitialQsoState(config.sentExchange),
      status: 'WAITING_FOR_EXCHANGE' as const,
      callsign: 'K1ABC',
    };
    const obs = observation(config, {
      qso,
      txArmState: 'ARMED',
      rxText: 'K1ABC 1D WWA',
    });
    const decision = decideDeterministicRunMode(obs, config);
    const safety = validateCwAction(decision.action, obs, config);

    expect(decision.action.type).toBe('LOG_QSO');
    expect(decision.action.callsign).toBe('K1ABC');
    expect(decision.action.exchange).toEqual({ class: '1D', section: 'WWA' });
    expect(safety.allowed).toBe(true);
  });
});
