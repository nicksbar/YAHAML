import type { ContestTemplate } from '../../contest-templates/types';

export type TxArmState = 'DRY_RUN' | 'ARMED' | 'DISARMED' | 'KILLED';

export type CwQsoStatus =
  | 'IDLE'
  | 'CQ_SCHEDULED'
  | 'CQ_SENT'
  | 'LISTENING_FOR_CALL'
  | 'PARTIAL_CALL_HEARD'
  | 'CALL_CONFIRMED'
  | 'EXCHANGE_SENT'
  | 'WAITING_FOR_EXCHANGE'
  | 'EXCHANGE_RECEIVED'
  | 'CONFIRM_SENT'
  | 'LOGGING'
  | 'LOGGED'
  | 'ERROR_RECOVERY'
  | 'STOPPED';

export type CwActionType =
  | 'SEND_CW'
  | 'LOG_QSO'
  | 'ASK_REPEAT'
  | 'SEND_CQ'
  | 'SET_FREQUENCY'
  | 'SET_MODE'
  | 'MARK_DUPE'
  | 'ABORT_QSO'
  | 'OPERATOR_ALERT'
  | 'NOOP';

export interface RadioState {
  frequencyHz?: string;
  band?: string;
  mode?: string;
  bandwidth?: number | null;
  power?: number | null;
  ptt?: boolean | null;
  vfo?: string | null;
  connected: boolean;
}

export interface RadioAudioSource {
  type?: 'janus' | 'http-stream' | 'loopback' | 'none' | string | null;
  janusRoomId?: string | null;
  janusStreamId?: string | null;
  httpStreamUrl?: string | null;
}

export interface CwAgentSession {
  token: string;
  sessionId: string;
  operatorCallsign: string;
  stationId: string;
  stationCallsign: string;
  expiresAt: string;
}

export type EffectiveCallsignSource = 'override' | 'special-event' | 'club' | 'station';

export interface EffectiveCallsignContext {
  onAirCallsign: string;
  operatorCallsign: string;
  stationCallsign: string;
  source: EffectiveCallsignSource;
  reason: string;
  clubId?: string;
  clubCallsign?: string;
  specialCallsignId?: string;
  specialEventName?: string;
}

export interface ActivityProfile {
  type: string;
  name: string;
  organization?: string;
  allowedBands: string[];
  allowedModes: string[];
  exchangeSentFields: string[];
  exchangeReceivedFields: string[];
  duplicateRule?: 'none' | 'band' | 'mode' | 'band-mode';
  template?: ContestTemplate;
}

export interface CwAgentConfig {
  yahamlBaseUrl: string;
  yahamlWsUrl: string;
  sessionToken?: string;
  browserId: string;
  stationId?: string;
  stationCallsign: string;
  onAirCallsignOverride?: string;
  useClubCallsign: boolean;
  useSpecialEventCallsign: boolean;
  operatorCallsign?: string;
  activityType?: string;
  activityName?: string;
  sentExchange: Record<string, string>;
  txArmState: TxArmState;
  maxTxMessageLength: number;
  cqCooldownMs: number;
  actionTimeoutMs: number;
  backend: {
    radio: 'simulator' | 'hamlib';
    keyer: 'simulator' | 'cat';
    decoder: 'simulator' | 'manual';
    logger: 'yahaml' | 'mock';
  };
  llm?: {
    backend?: 'ollama' | 'lemonade';
    fastActionModel?: string;
    reasoningModel?: string;
  };
}

export interface FieldDayExchange {
  callsign: string;
  class?: string;
  section?: string;
}

export interface CwQsoState {
  status: CwQsoStatus;
  callsign?: string;
  partialCallsign?: string;
  receivedExchange: Record<string, string>;
  sentExchange: Record<string, string>;
  lastTxAt?: number;
  lastRxText?: string;
  dupe: boolean;
  logEntryId?: string;
  error?: string;
}

export interface CwObservation {
  timestamp: number;
  rxText?: string;
  radio: RadioState;
  activity: ActivityProfile;
  qso: CwQsoState;
  txArmState: TxArmState;
  dupe?: boolean;
}

export interface CwAction {
  type: CwActionType;
  message?: string;
  callsign?: string;
  exchange?: Record<string, string>;
  frequencyHz?: string;
  mode?: string;
  reason?: string;
}

export interface CwDecision {
  action: CwAction;
  qso: CwQsoState;
  rationale: string;
  confidence: number;
  source: 'deterministic' | 'llm' | 'operator';
}

export interface SafetyResult {
  allowed: boolean;
  reasons: string[];
}

export interface AgentAuditEvent {
  timestamp: number;
  level: 'INFO' | 'WARN' | 'ERROR';
  event: string;
  details?: Record<string, unknown>;
}
