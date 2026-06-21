import type {
  CwAgentConfig,
  CwAgentSession,
  EffectiveCallsignContext,
  RadioAudioSource,
  RadioState,
} from './types';

export interface StationResponse {
  id: string;
  callsign: string;
  name?: string;
  class?: string | null;
  section?: string | null;
  clubId?: string | null;
  contestId?: string | null;
  club?: ClubResponse | null;
}

interface SessionResponse {
  token: string;
  sessionId: string;
  expiresAt: string;
}

interface RadioResponse {
  id: string;
  name: string;
  frequency?: string | null;
  mode?: string | null;
  bandwidth?: number | null;
  power?: number | null;
  isConnected?: boolean;
  audioSourceType?: string | null;
  janusRoomId?: string | null;
  janusStreamId?: string | null;
  httpStreamUrl?: string | null;
}

interface RadioAssignmentResponse {
  id: string;
  radio: RadioResponse;
  station: StationResponse;
}

export interface ClubResponse {
  id: string;
  callsign: string;
  name?: string;
  contestId?: string | null;
  isActive?: boolean;
}

export interface SpecialCallsignResponse {
  id: string;
  callsign: string;
  eventName: string;
  clubId?: string | null;
  isActive?: boolean;
  club?: ClubResponse | null;
}

export interface ActiveContestResponse {
  id: string;
  name: string;
  isActive: boolean;
  clubs?: ClubResponse[];
  template?: {
    type?: string;
    name?: string;
  } | null;
}

function requireOk(response: Response, context: string): void {
  if (!response.ok) {
    throw new Error(`${context} failed with HTTP ${response.status}`);
  }
}

function audioSourceFromRadio(radio: RadioResponse | null | undefined): RadioAudioSource {
  return {
    type: radio?.audioSourceType || 'none',
    janusRoomId: radio?.janusRoomId || null,
    janusStreamId: radio?.janusStreamId || null,
    httpStreamUrl: radio?.httpStreamUrl || null,
  };
}

function radioStateFromRadio(radio: RadioResponse | null | undefined): RadioState {
  return {
    frequencyHz: radio?.frequency || undefined,
    band: undefined,
    mode: radio?.mode || undefined,
    bandwidth: radio?.bandwidth ?? null,
    power: radio?.power ?? null,
    ptt: null,
    vfo: null,
    connected: Boolean(radio?.isConnected),
  };
}

function normalizeCallsign(callsign: string): string {
  return callsign.trim().toUpperCase();
}

function findStationClub(
  station: StationResponse,
  activeContest?: ActiveContestResponse | null,
  clubs: ClubResponse[] = [],
): ClubResponse | undefined {
  if (station.club) {
    return station.club;
  }

  if (!station.clubId) {
    return undefined;
  }

  return activeContest?.clubs?.find((club) => club.id === station.clubId)
    || clubs.find((club) => club.id === station.clubId);
}

function findActiveSpecialCallsign(
  specialCallsigns: SpecialCallsignResponse[],
  club?: ClubResponse,
): SpecialCallsignResponse | undefined {
  if (club) {
    return specialCallsigns.find((special) => special.clubId === club.id || special.club?.id === club.id);
  }

  const unscopedSpecials = specialCallsigns.filter((special) => !special.clubId && !special.club?.id);
  return unscopedSpecials.length === 1 ? unscopedSpecials[0] : undefined;
}

export function resolveEffectiveCallsign(
  config: CwAgentConfig,
  station: StationResponse,
  options: {
    activeContest?: ActiveContestResponse | null;
    clubs?: ClubResponse[];
    activeSpecialCallsigns?: SpecialCallsignResponse[];
  } = {},
): EffectiveCallsignContext {
  const stationCallsign = normalizeCallsign(station.callsign);
  const operatorCallsign = normalizeCallsign(config.operatorCallsign || stationCallsign);

  if (config.onAirCallsignOverride) {
    return {
      onAirCallsign: normalizeCallsign(config.onAirCallsignOverride),
      operatorCallsign,
      stationCallsign,
      source: 'override',
      reason: 'CW_AGENT_ON_AIR_CALLSIGN explicitly overrides discovered activity callsign',
    };
  }

  const club = findStationClub(station, options.activeContest, options.clubs);
  const activeSpecial = config.useSpecialEventCallsign
    ? findActiveSpecialCallsign(options.activeSpecialCallsigns || [], club)
    : undefined;

  if (activeSpecial) {
    return {
      onAirCallsign: normalizeCallsign(activeSpecial.callsign),
      operatorCallsign,
      stationCallsign,
      source: 'special-event',
      reason: `Active special-event callsign "${activeSpecial.eventName}" is enabled for this operating context`,
      clubId: activeSpecial.clubId || club?.id,
      clubCallsign: club?.callsign ? normalizeCallsign(club.callsign) : undefined,
      specialCallsignId: activeSpecial.id,
      specialEventName: activeSpecial.eventName,
    };
  }

  if (config.useClubCallsign && club?.callsign && club.isActive !== false) {
    return {
      onAirCallsign: normalizeCallsign(club.callsign),
      operatorCallsign,
      stationCallsign,
      source: 'club',
      reason: 'Station is associated with an active club callsign',
      clubId: club.id,
      clubCallsign: normalizeCallsign(club.callsign),
    };
  }

  return {
    onAirCallsign: stationCallsign,
    operatorCallsign,
    stationCallsign,
    source: 'station',
    reason: 'No active club or special-event callsign applies to this station',
    clubId: club?.id,
    clubCallsign: club?.callsign ? normalizeCallsign(club.callsign) : undefined,
  };
}

export class YahamlAgentClient {
  constructor(private readonly baseUrl: string) {}

  async getStation(stationId: string): Promise<StationResponse> {
    const response = await fetch(`${this.baseUrl}/api/stations/${stationId}`);
    requireOk(response, 'Fetch station');
    return response.json() as Promise<StationResponse>;
  }

  async getActiveContest(): Promise<ActiveContestResponse | null> {
    const response = await fetch(`${this.baseUrl}/api/contests/active/current`);
    requireOk(response, 'Fetch active contest');
    return response.json() as Promise<ActiveContestResponse | null>;
  }

  async getClubs(): Promise<ClubResponse[]> {
    const response = await fetch(`${this.baseUrl}/api/clubs`);
    requireOk(response, 'Fetch clubs');
    return response.json() as Promise<ClubResponse[]>;
  }

  async getActiveSpecialCallsigns(): Promise<SpecialCallsignResponse[]> {
    const response = await fetch(`${this.baseUrl}/api/special-callsigns/active`);
    requireOk(response, 'Fetch active special callsigns');
    return response.json() as Promise<SpecialCallsignResponse[]>;
  }

  async createAgentSession(config: CwAgentConfig, station: StationResponse): Promise<CwAgentSession> {
    const operatorCallsign = (config.operatorCallsign || station.callsign).toUpperCase();
    const response = await fetch(`${this.baseUrl}/api/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callsign: operatorCallsign,
        stationId: station.id,
        browserId: config.browserId,
        sourceType: 'cw-agent',
        sourceInfo: JSON.stringify({
          role: 'autonomous-cw-operator',
          dryRunDefault: true,
          activityType: config.activityType,
        }),
      }),
    });
    requireOk(response, 'Create CW agent session');
    const session = await response.json() as SessionResponse;

    return {
      token: session.token,
      sessionId: session.sessionId,
      operatorCallsign,
      stationId: station.id,
      stationCallsign: station.callsign.toUpperCase(),
      expiresAt: session.expiresAt,
    };
  }

  async getCurrentRadioAssignment(token: string): Promise<RadioAssignmentResponse | null> {
    const response = await fetch(`${this.baseUrl}/api/radio-assignments/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    requireOk(response, 'Fetch current radio assignment');
    return response.json() as Promise<RadioAssignmentResponse | null>;
  }

  async bootstrapAgentContext(config: CwAgentConfig): Promise<{
    session?: CwAgentSession;
    station?: StationResponse;
    effectiveCallsign?: EffectiveCallsignContext;
    activeContest?: ActiveContestResponse | null;
    radio?: RadioState;
    audio?: RadioAudioSource;
  }> {
    if (!config.stationId) {
      return {};
    }

    const station = await this.getStation(config.stationId);
    const [activeContest, clubs, activeSpecialCallsigns] = await Promise.all([
      this.getActiveContest(),
      this.getClubs(),
      this.getActiveSpecialCallsigns(),
    ]);
    const effectiveCallsign = resolveEffectiveCallsign(config, station, {
      activeContest,
      clubs,
      activeSpecialCallsigns,
    });
    const session = config.sessionToken
      ? {
          token: config.sessionToken,
          sessionId: 'existing',
          operatorCallsign: effectiveCallsign.operatorCallsign,
          stationId: station.id,
          stationCallsign: station.callsign.toUpperCase(),
          expiresAt: '',
        }
      : await this.createAgentSession(config, station);

    const assignment = await this.getCurrentRadioAssignment(session.token);

    return {
      session,
      station,
      effectiveCallsign,
      activeContest,
      radio: radioStateFromRadio(assignment?.radio),
      audio: audioSourceFromRadio(assignment?.radio),
    };
  }
}
