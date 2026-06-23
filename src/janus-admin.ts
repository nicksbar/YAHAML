type JanusPayload = Record<string, unknown>;

type JanusRoom = {
  room: number;
  description?: string;
  num_participants?: number;
  sampling_rate?: number;
};

type JanusParticipant = {
  id: number;
  display?: string;
  muted?: boolean;
  setup?: boolean;
};

function janusTxn(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function asNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export class JanusAdminClient {
  private readonly baseUrl: string;
  private readonly apiSecret?: string;
  private readonly timeoutMs: number;

  constructor(options?: {
    baseUrl?: string;
    apiSecret?: string;
    timeoutMs?: number;
  }) {
    this.baseUrl = (options?.baseUrl || process.env.JANUS_API_URL || '').trim();
    this.apiSecret = (options?.apiSecret || process.env.JANUS_API_SECRET || '').trim() || undefined;
    this.timeoutMs = options?.timeoutMs || Number(process.env.JANUS_TIMEOUT_MS || 8000);
  }

  get enabled(): boolean {
    return Boolean(this.baseUrl);
  }

  private async post(url: string, payload: JanusPayload): Promise<any> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    const withSecret: JanusPayload = {
      ...payload,
      ...(this.apiSecret ? { apisecret: this.apiSecret } : {}),
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(withSecret),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`Janus HTTP ${response.status}`);
      }

      return response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  private async withAudioBridge<T>(fn: (ctx: { sessionId: number; handleId: number }) => Promise<T>): Promise<T> {
    if (!this.enabled) {
      throw new Error('JANUS_API_URL is not configured');
    }

    let sessionId = 0;
    let handleId = 0;

    try {
      const createResp = await this.post(this.baseUrl, {
        janus: 'create',
        transaction: janusTxn(),
      });

      if (createResp?.janus !== 'success' || !createResp?.data?.id) {
        throw new Error('Failed to create Janus session');
      }

      sessionId = Number(createResp.data.id);

      const attachResp = await this.post(`${this.baseUrl}/${sessionId}`, {
        janus: 'attach',
        plugin: 'janus.plugin.audiobridge',
        transaction: janusTxn(),
      });

      if (attachResp?.janus !== 'success' || !attachResp?.data?.id) {
        throw new Error('Failed to attach AudioBridge');
      }

      handleId = Number(attachResp.data.id);
      return await fn({ sessionId, handleId });
    } finally {
      if (sessionId && handleId) {
        try {
          await this.post(`${this.baseUrl}/${sessionId}/${handleId}`, {
            janus: 'detach',
            transaction: janusTxn(),
          });
        } catch {
          // best-effort cleanup
        }
      }

      if (sessionId) {
        try {
          await this.post(`${this.baseUrl}/${sessionId}`, {
            janus: 'destroy',
            transaction: janusTxn(),
          });
        } catch {
          // best-effort cleanup
        }
      }
    }
  }

  async listRooms(): Promise<JanusRoom[]> {
    return this.withAudioBridge(async ({ sessionId, handleId }) => {
      const listResp = await this.post(`${this.baseUrl}/${sessionId}/${handleId}`, {
        janus: 'message',
        body: { request: 'list' },
        transaction: janusTxn(),
      });

      const rooms = listResp?.plugindata?.data?.list;
      if (!Array.isArray(rooms)) return [];
      return rooms as JanusRoom[];
    });
  }

  async ensureRoom(roomId: number, description: string): Promise<number> {
    if (!Number.isFinite(roomId) || roomId <= 0) {
      throw new Error('roomId must be a positive number');
    }

    const rooms = await this.listRooms();
    const exists = rooms.find((room) => Number(room.room) === roomId);
    if (exists) {
      return roomId;
    }

    return this.withAudioBridge(async ({ sessionId, handleId }) => {
      const createResp = await this.post(`${this.baseUrl}/${sessionId}/${handleId}`, {
        janus: 'message',
        body: {
          request: 'create',
          room: roomId,
          description,
          permanent: false,
          sampling_rate: 48000,
        },
        transaction: janusTxn(),
      });

      if (createResp?.janus === 'error') {
        throw new Error(String(createResp?.error?.reason || 'Janus create room failed'));
      }

      return roomId;
    });
  }

  async listParticipants(roomId: number): Promise<JanusParticipant[]> {
    return this.withAudioBridge(async ({ sessionId, handleId }) => {
      const response = await this.post(`${this.baseUrl}/${sessionId}/${handleId}`, {
        janus: 'message',
        body: {
          request: 'listparticipants',
          room: roomId,
        },
        transaction: janusTxn(),
      });

      const participants = response?.plugindata?.data?.participants;
      if (!Array.isArray(participants)) return [];
      return participants as JanusParticipant[];
    });
  }

  async kickParticipant(roomId: number, participantId: number): Promise<void> {
    await this.withAudioBridge(async ({ sessionId, handleId }) => {
      const response = await this.post(`${this.baseUrl}/${sessionId}/${handleId}`, {
        janus: 'message',
        body: {
          request: 'kick',
          room: roomId,
          id: participantId,
        },
        transaction: janusTxn(),
      });

      if (response?.janus === 'error') {
        throw new Error(String(response?.error?.reason || 'Janus kick failed'));
      }
    });
  }

  async startRtpForward(roomId: number, host: string, port: number, payloadType = 111): Promise<number | null> {
    return this.withAudioBridge(async ({ sessionId, handleId }) => {
      const response = await this.post(`${this.baseUrl}/${sessionId}/${handleId}`, {
        janus: 'message',
        body: {
          request: 'rtp_forward',
          room: roomId,
          host,
          port,
          codec: 'opus',
          pt: payloadType,
        },
        transaction: janusTxn(),
      });

      if (response?.janus === 'error') {
        throw new Error(String(response?.error?.reason || 'Janus rtp_forward failed'));
      }

      return asNumber(response?.plugindata?.data?.stream_id);
    });
  }

  async stopRtpForward(roomId: number, streamId: number): Promise<void> {
    await this.withAudioBridge(async ({ sessionId, handleId }) => {
      const response = await this.post(`${this.baseUrl}/${sessionId}/${handleId}`, {
        janus: 'message',
        body: {
          request: 'stop_rtp_forward',
          room: roomId,
          stream_id: streamId,
        },
        transaction: janusTxn(),
      });

      if (response?.janus === 'error') {
        throw new Error(String(response?.error?.reason || 'Janus stop_rtp_forward failed'));
      }
    });
  }
}

export const janusAdminClient = new JanusAdminClient();
