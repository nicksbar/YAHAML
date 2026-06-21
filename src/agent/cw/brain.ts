import { decideRunModeAction } from './state-machine';
import type { CwAgentConfig, CwDecision, CwObservation } from './types';

export function decideDeterministicRunMode(
  observation: CwObservation,
  config: CwAgentConfig,
): CwDecision {
  const result = decideRunModeAction(observation, config.stationCallsign);

  return {
    action: result.action,
    qso: result.qso,
    rationale: result.rationale,
    confidence: result.action.type === 'NOOP' ? 0.5 : 0.9,
    source: 'deterministic',
  };
}
