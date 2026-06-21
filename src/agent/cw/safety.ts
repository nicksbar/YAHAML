import type { CwAction, CwAgentConfig, CwObservation, SafetyResult } from './types';

function normalize(value?: string): string {
  return (value || '').trim().toUpperCase();
}

function isTransmitAction(action: CwAction): boolean {
  return action.type === 'SEND_CW' || action.type === 'SEND_CQ' || action.type === 'ASK_REPEAT' || action.type === 'MARK_DUPE';
}

export function validateCwAction(
  action: CwAction,
  observation: CwObservation,
  config: CwAgentConfig,
): SafetyResult {
  const reasons: string[] = [];

  if (observation.txArmState === 'KILLED' || config.txArmState === 'KILLED') {
    reasons.push('Agent is killed');
  }

  if (isTransmitAction(action)) {
    if (observation.txArmState !== 'ARMED' || config.txArmState !== 'ARMED') {
      reasons.push('Transmit is not armed');
    }

    if (!action.message || action.message.trim().length === 0) {
      reasons.push('Transmit action has no message');
    }

    if (action.message && action.message.length > config.maxTxMessageLength) {
      reasons.push(`Message exceeds ${config.maxTxMessageLength} characters`);
    }

    const mode = normalize(observation.radio.mode);
    const allowedModes = observation.activity.allowedModes.map(normalize);
    if (!mode || !allowedModes.includes(mode)) {
      reasons.push(`Mode not allowed for activity: ${observation.radio.mode || 'unknown'}`);
    }

    const band = normalize(observation.radio.band);
    const allowedBands = observation.activity.allowedBands.map(normalize);
    if (!band || !allowedBands.includes(band)) {
      reasons.push(`Band not allowed for activity: ${observation.radio.band || 'unknown'}`);
    }

    if (observation.qso.lastTxAt && observation.timestamp - observation.qso.lastTxAt < config.cqCooldownMs) {
      reasons.push('Transmit cooldown is active');
    }

    if (observation.qso.status === 'STOPPED') {
      reasons.push('QSO state is stopped');
    }
  }

  if (action.type === 'SET_MODE' && !action.mode) {
    reasons.push('SET_MODE requires mode');
  }

  if (action.type === 'SET_FREQUENCY' && !action.frequencyHz) {
    reasons.push('SET_FREQUENCY requires frequencyHz');
  }

  if (action.type === 'LOG_QSO') {
    if (!action.callsign) {
      reasons.push('LOG_QSO requires callsign');
    }

    const missingFields = observation.activity.exchangeReceivedFields.filter((field) => !action.exchange?.[field]);
    if (missingFields.length > 0) {
      reasons.push(`LOG_QSO missing exchange fields: ${missingFields.join(', ')}`);
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}
