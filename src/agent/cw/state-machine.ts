import { getSentExchangeText } from './activity-profile';
import { extractCallsign, parseActivityExchange } from './exchange-parser';
import type { ActivityProfile, CwAction, CwObservation, CwQsoState } from './types';

export function createInitialQsoState(sentExchange: Record<string, string> = {}): CwQsoState {
  return {
    status: 'IDLE',
    receivedExchange: {},
    sentExchange,
    dupe: false,
  };
}

export function scheduleCq(qso: CwQsoState): CwQsoState {
  if (qso.status === 'STOPPED') return qso;
  return {
    ...qso,
    status: 'CQ_SCHEDULED',
    error: undefined,
  };
}

export function stopQso(qso: CwQsoState): CwQsoState {
  return {
    ...qso,
    status: 'STOPPED',
  };
}

function cqMessage(profile: ActivityProfile, stationCallsign: string): string {
  const activity = profile.type === 'GENERAL' ? 'CW' : profile.type.replace(/_/g, ' ');
  return `CQ ${activity} DE ${stationCallsign} ${stationCallsign} K`;
}

function exchangeMessage(callsign: string, profile: ActivityProfile, sentExchange: Record<string, string>): string {
  const exchangeText = getSentExchangeText(profile, sentExchange);
  return [callsign, exchangeText].filter(Boolean).join(' ');
}

export function decideRunModeAction(
  observation: CwObservation,
  stationCallsign: string,
): { action: CwAction; qso: CwQsoState; rationale: string } {
  const qso = observation.qso;

  if (qso.status === 'STOPPED') {
    return {
      action: { type: 'NOOP', reason: 'QSO state is stopped' },
      qso,
      rationale: 'Stopped state suppresses autonomous actions.',
    };
  }

  if (qso.status === 'CQ_SCHEDULED') {
    const message = cqMessage(observation.activity, stationCallsign);
    return {
      action: { type: 'SEND_CQ', message },
      qso: { ...qso, status: 'CQ_SENT', lastTxAt: observation.timestamp },
      rationale: 'CQ was scheduled and no active QSO is in progress.',
    };
  }

  if (!observation.rxText) {
    return {
      action: { type: 'NOOP', reason: 'No decoded CW text' },
      qso,
      rationale: 'No decoded text available.',
    };
  }

  const parsed = parseActivityExchange(observation.rxText, observation.activity);
  const callsign = parsed.callsign || qso.callsign || extractCallsign(observation.rxText) || undefined;

  if (!callsign) {
    return {
      action: { type: 'ASK_REPEAT', message: 'CALL? AGN', reason: 'No callsign found' },
      qso: { ...qso, status: 'PARTIAL_CALL_HEARD', lastRxText: observation.rxText },
      rationale: 'Decoded text did not contain a complete callsign.',
    };
  }

  if (observation.dupe || qso.dupe) {
    return {
      action: { type: 'MARK_DUPE', callsign, message: `${callsign} QSO B4 TU` },
      qso: { ...qso, callsign, dupe: true, status: 'ERROR_RECOVERY', lastRxText: observation.rxText },
      rationale: 'Station appears to be a duplicate for this activity context.',
    };
  }

  if (qso.status === 'LISTENING_FOR_CALL' || qso.status === 'CQ_SENT' || qso.status === 'PARTIAL_CALL_HEARD') {
    return {
      action: {
        type: 'SEND_CW',
        callsign,
        message: exchangeMessage(callsign, observation.activity, qso.sentExchange),
      },
      qso: {
        ...qso,
        status: 'EXCHANGE_SENT',
        callsign,
        lastRxText: observation.rxText,
        lastTxAt: observation.timestamp,
      },
      rationale: 'A callsign was copied and the agent is sending the configured exchange.',
    };
  }

  if (qso.status === 'EXCHANGE_SENT' || qso.status === 'WAITING_FOR_EXCHANGE') {
    if (!parsed.complete) {
      return {
        action: { type: 'ASK_REPEAT', callsign, message: `${callsign} AGN` },
        qso: { ...qso, status: 'WAITING_FOR_EXCHANGE', callsign, lastRxText: observation.rxText },
        rationale: 'The received exchange is incomplete for the active activity.',
      };
    }

    return {
      action: {
        type: 'LOG_QSO',
        callsign,
        exchange: parsed.exchange,
        message: `TU ${stationCallsign}`,
      },
      qso: {
        ...qso,
        status: 'LOGGING',
        callsign,
        receivedExchange: parsed.exchange,
        lastRxText: observation.rxText,
      },
      rationale: 'The received exchange satisfies the active activity profile.',
    };
  }

  return {
    action: { type: 'NOOP', reason: `No transition for ${qso.status}` },
    qso,
    rationale: 'No state transition matched.',
  };
}
