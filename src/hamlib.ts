import * as net from 'net';
import prisma from './db';
import { wsManager } from './websocket';

interface HamlibResponse {
  success: boolean;
  data?: string;
  error?: string;
}

interface RadioClient {
  connect(): Promise<boolean>;
  disconnect(): void;
  isConnected(): boolean;
  getSupportedModes(): Promise<string[] | null>;
  getSupportedLevels(): Promise<string[] | null>;
  getSupportedFunctions(): Promise<string[] | null>;
  getSupportedParameters(): Promise<string[] | null>;
  getFrequency(): Promise<string | null>;
  setFrequency(frequency: string): Promise<boolean>;
  getMode(): Promise<{ mode: string; bandwidth: number } | null>;
  setMode(mode: string, bandwidth: number): Promise<boolean>;
  getPower(): Promise<number | null>;
  setPower(powerPercent: number): Promise<boolean>;
  getPtt(): Promise<boolean | null>;
  setPtt(enabled: boolean): Promise<boolean>;
  getVfo(): Promise<string | null>;
  setVfo(vfo: string): Promise<boolean>;
  sendRaw(command: string): Promise<HamlibResponse>;
  getInfo(): Promise<string | null>;
  getState(): Promise<{
    frequency: string | null;
    mode: string | null;
    bandwidth: number | null;
    power: number | null;
    ptt: boolean | null;
    vfo: string | null;
  }>;
}

/**
 * Hamlib rigctld client for radio control
 * Communicates with rigctld servers using the Hamlib protocol
 * 
 * Uses a command serialization queue pattern to prevent response interleaving.
 * Only one command is sent at a time; the next command waits until the previous
 * one receives its RPRT status code.
 */
export class HamlibClient {
  private host: string;
  private port: number;
  private socket: net.Socket | null = null;
  private responseBuffer: string = '';
  
  // Command queue for serialization (CQRLOG-inspired pattern)
  private commandQueue: Array<{
    command: string;
    expectedLines: number;
    allowNoReply: boolean;
    resolve: (response: HamlibResponse) => void;
    lines: string[];
    timeout: NodeJS.Timeout;
    sent: boolean;
  }> = [];
  
  private commandInFlight: boolean = false;

  constructor(host: string, port: number = 4532) {
    this.host = host;
    this.port = port;
  }

  private parseTokenList(data?: string): string[] | null {
    if (!data) return null;
    const tokens = data
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
    return tokens.length ? tokens : null;
  }

  private async getSupportedTokens(command: string): Promise<string[] | null> {
    const response = await this.sendCommand(`${command} ?`, 1);
    if (!response.success || !response.data) return null;
    return this.parseTokenList(response.data);
  }

  private normalizeModeToken(mode: string): string {
    const normalized = mode.trim().toUpperCase();
    const tokenMap: Record<string, string> = {
      'USB-D': 'PKTUSB',
      'LSB-D': 'PKTLSB',
      DIGU: 'PKTUSB',
      DIGL: 'PKTLSB',
    };
    return tokenMap[normalized] || normalized;
  }

  async getSupportedModes(): Promise<string[] | null> {
    return this.getSupportedTokens('M');
  }

  async getSupportedLevels(): Promise<string[] | null> {
    return this.getSupportedTokens('L');
  }

  async getSupportedFunctions(): Promise<string[] | null> {
    return this.getSupportedTokens('U');
  }

  async getSupportedParameters(): Promise<string[] | null> {
    return this.getSupportedTokens('P');
  }

  /**
   * Connect to rigctld server
   */
  async connect(): Promise<boolean> {
    return new Promise((resolve) => {
      this.socket = new net.Socket();
      
      this.socket.on('data', (data) => {
        this.handleResponse(data.toString());
      });

      this.socket.on('error', (error) => {
        console.error(`[Hamlib ${this.host}:${this.port}] Error:`, error.message);
        this.disconnect();
        resolve(false);
      });

      this.socket.on('close', () => {
        console.log(`[Hamlib ${this.host}:${this.port}] Connection closed`);
        this.socket = null;
      });

      this.socket.connect(this.port, this.host, () => {
        console.log(`[Hamlib ${this.host}:${this.port}] Connected`);
        resolve(true);
      });

      // Timeout after 5 seconds
      setTimeout(() => {
        if (!this.socket || this.socket.connecting) {
          this.disconnect();
          resolve(false);
        }
      }, 5000);
    });
  }

  /**
   * Disconnect from rigctld server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
    this.responseBuffer = '';
    this.commandInFlight = false;
    this.commandQueue.forEach((queued) => clearTimeout(queued.timeout));
    this.commandQueue = [];
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  /**
   * Send command to rigctld with serialization queue
   * 
   * Implements CQRLOG-style command queue pattern:
   * - Only one command is in flight at a time
   * - Next command waits for previous RPRT response
   * - Prevents response interleaving in socket buffer
   */
  private async sendCommand(
    command: string,
    expectedLines: number = 0,
    allowNoReply: boolean = false
  ): Promise<HamlibResponse> {
    if (!this.isConnected()) {
      return { success: false, error: 'Not connected' };
    }

    return new Promise((resolve) => {
      console.debug(
        `[Hamlib ${this.host}:${this.port}] Queueing command: "${command}" (expectedLines=${expectedLines}, queue_size=${this.commandQueue.length})`
      );
      
      const queued = {
        command,
        expectedLines,
        allowNoReply,
        resolve,
        lines: [] as string[],
        sent: false,
        timeout: setTimeout(() => {
          const index = this.commandQueue.indexOf(queued);
          if (index !== -1) {
            this.commandQueue.splice(index, 1);
          }
          
          // If this was the in-flight command, allow next to proceed
          if (queued.sent) {
            this.commandInFlight = false;
            this.sendNextCommand();
          }
          
          if (queued.lines.length > 0) {
            resolve({ success: true, data: queued.lines.join('\n') });
          } else if (
            queued.expectedLines === 0 &&
            (queued.sent || allowNoReply)
          ) {
            resolve({ success: true });
          } else {
            resolve({ success: false, error: 'Command timeout' });
          }
        }, 2000),
      };

      this.commandQueue.push(queued);
      this.sendNextCommand();
    });
  }

  /**
   * Process next command in queue (CQRLOG pattern)
   * Only sends if no command is currently in flight
   */
  private sendNextCommand(): void {
    // Already have a command in flight, wait for RPRT
    if (this.commandInFlight) return;
    
    // No commands in queue
    if (this.commandQueue.length === 0) return;

    const queued = this.commandQueue[0];
    if (queued.sent) return; // Already sent

    console.debug(
      `[Hamlib ${this.host}:${this.port}] Sending queued command: "${queued.command}"`
    );
    
    queued.sent = true;
    this.commandInFlight = true;
    this.socket!.write(queued.command + '\n');
  }

  /**
   * Handle response from rigctld
   */
  private handleResponse(data: string): void {
    this.responseBuffer += data;
    
    // Check for complete response (ends with RPRT or newline)
    if (this.responseBuffer.includes('\n')) {
      const lines = this.responseBuffer.split('\n');
      this.responseBuffer = lines.pop() || ''; // Keep incomplete line
      
      for (const line of lines) {
        if (line.trim()) {
          this.processResponseLine(line.trim());
        }
      }
    }
  }

  /**
   * Process a complete response line
   * 
   * Responses come as data lines followed by RPRT status code.
   * Only resolves when RPRT is received (ensures proper response boundaries).
   */
  private processResponseLine(line: string): void {
    // Only process if command is in flight and queue has entries
    if (!this.commandInFlight || this.commandQueue.length === 0) {
      console.warn(
        `[Hamlib ${this.host}:${this.port}] Unexpected response with no command in flight: "${line}"`
      );
      return;
    }

    const queued = this.commandQueue[0];

    // RPRT indicates command result (0 = success, negative = error)
    if (line.startsWith('RPRT')) {
      const code = parseInt(line.split(' ')[1] || '0');
      clearTimeout(queued.timeout);
      
      // Resolve the command promise
      const success = code === 0;
      if (success) {
        const data = queued.lines.length ? queued.lines.join('\n') : undefined;
        queued.resolve({ success: true, data });
      } else {
        queued.resolve({ success: false, error: `Hamlib error code: ${code}` });
      }

      // Remove completed command from queue
      this.commandQueue.shift();
      
      // Allow next command to proceed
      this.commandInFlight = false;
      this.sendNextCommand();
      
      console.debug(
        `[Hamlib ${this.host}:${this.port}] Command completed (code=${code}, queue_remaining=${this.commandQueue.length})`
      );
    } else {
      // Data line - add to current command's response
      queued.lines.push(line);
    }
  }

  /**
   * Get current frequency in Hz
   */
  async getFrequency(): Promise<string | null> {
    const response = await this.sendCommand('f', 1);
    return response.success && response.data ? response.data : null;
  }

  /**
   * Set frequency in Hz
   */
  async setFrequency(frequency: string): Promise<boolean> {
    const response = await this.sendCommand(`F ${frequency}`, 0, true);
    return response.success;
  }

  /**
   * Get current mode and bandwidth
   * Returns: "USB 3000" or "CW 500", etc.
   */
  async getMode(): Promise<{ mode: string; bandwidth: number } | null> {
    const response = await this.sendCommand('m', 2);
    if (!response.success || !response.data) return null;
    
    const parts = response.data.split('\n');
    if (parts.length < 2) return null;
    
    const mode = parts[0].trim();
    const bandwidth = parseInt(parts[1].trim()) || 0;
    
    return { mode, bandwidth };
  }

  /**
   * Set mode and bandwidth
   */
  async setMode(mode: string, bandwidth: number): Promise<boolean> {
    const token = this.normalizeModeToken(mode);
    const response = await this.sendCommand(`M ${token} ${bandwidth}`, 0, true);
    if (!response.success) {
      console.warn(
        `[Hamlib ${this.host}:${this.port}] setMode failed for ${token} ${bandwidth}: ${response.error || 'unknown error'}`
      );
    }
    return response.success;
  }

  /**
   * Get power level in watts
   */
  async getPower(): Promise<number | null> {
    const response = await this.sendCommand('l RFPOWER', 1);
    if (!response.success || !response.data) return null;
    
    // Response is a float 0.0-1.0, convert to percentage
    const powerFraction = parseFloat(response.data);
    
    // Validate: should be 0.0-1.0 (or 0-100 if radio returns that way)
    // Clamp to 0-100 range to prevent invalid values
    if (isNaN(powerFraction)) return null;
    
    const percentage = powerFraction > 1 ? powerFraction : powerFraction * 100;
    const clamped = Math.max(0, Math.min(100, Math.round(percentage)));
    
    console.debug(`[Hamlib ${this.host}:${this.port}] Power raw="${response.data}" fraction=${powerFraction} clamped=${clamped}%`);
    
    return clamped;
  }

  /**
   * Set power level (0-100%)
   */
  async setPower(powerPercent: number): Promise<boolean> {
    const powerFraction = powerPercent / 100;
    const response = await this.sendCommand(`L RFPOWER ${powerFraction.toFixed(2)}`, 0, true);
    return response.success;
  }

  /**
   * Get PTT state (0/1)
   */
  async getPtt(): Promise<boolean | null> {
    const response = await this.sendCommand('t', 1);
    if (!response.success || !response.data) return null;
    return response.data.trim() === '1';
  }

  /**
   * Set PTT state (true/false)
   */
  async setPtt(enabled: boolean): Promise<boolean> {
    const response = await this.sendCommand(`T ${enabled ? 1 : 0}`, 0, true);
    return response.success;
  }

  /**
   * Get VFO (e.g., VFOA, VFOB)
   */
  async getVfo(): Promise<string | null> {
    const response = await this.sendCommand('v', 1);
    return response.success && response.data ? response.data.trim() : null;
  }

  /**
   * Set VFO (e.g., VFOA, VFOB)
   */
  async setVfo(vfo: string): Promise<boolean> {
    const response = await this.sendCommand(`V ${vfo}`, 0, true);
    return response.success;
  }

  /**
   * Send raw rigctld command
   */
  async sendRaw(command: string): Promise<HamlibResponse> {
    return this.sendCommand(command);
  }

  /**
   * Get radio info
   */
  async getInfo(): Promise<string | null> {
    const response = await this.sendCommand('_', 1);
    return response.success && response.data ? response.data : null;
  }

  /**
   * Get all current radio state
   */
  async getState(): Promise<{
    frequency: string | null;
    mode: string | null;
    bandwidth: number | null;
    power: number | null;
    ptt: boolean | null;
    vfo: string | null;
  }> {
    // Serialize to avoid response ordering issues
    const frequency = await this.getFrequency();
    const modeData = await this.getMode();
    const power = await this.getPower();
    const ptt = await this.getPtt();
    const vfo = await this.getVfo();

    return {
      frequency,
      mode: modeData?.mode || null,
      bandwidth: modeData?.bandwidth || null,
      power,
      ptt,
      vfo,
    };
  }
}

type MockRadioState = {
  frequency: string;
  mode: string;
  bandwidth: number;
  power: number;
  ptt: boolean;
  vfo: string;
};

export class MockHamlibClient implements RadioClient {
  private connected: boolean = false;
  private state: MockRadioState;

  constructor(initial?: Partial<MockRadioState>) {
    this.state = {
      frequency: initial?.frequency || '14074000',
      mode: initial?.mode || 'USB',
      bandwidth: initial?.bandwidth ?? 2400,
      power: initial?.power ?? 50,
      ptt: initial?.ptt ?? false,
      vfo: initial?.vfo || 'VFOA',
    };
  }

  async connect(): Promise<boolean> {
    this.connected = true;
    return true;
  }

  disconnect(): void {
    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  async getSupportedModes(): Promise<string[] | null> {
    return ['USB', 'LSB', 'CW', 'FM', 'AM', 'PKTUSB', 'PKTLSB'];
  }

  async getSupportedLevels(): Promise<string[] | null> {
    return ['RFPOWER'];
  }

  async getSupportedFunctions(): Promise<string[] | null> {
    return [];
  }

  async getSupportedParameters(): Promise<string[] | null> {
    return [];
  }

  async getFrequency(): Promise<string | null> {
    return this.state.frequency;
  }

  async setFrequency(frequency: string): Promise<boolean> {
    this.state.frequency = frequency;
    return true;
  }

  async getMode(): Promise<{ mode: string; bandwidth: number } | null> {
    return { mode: this.state.mode, bandwidth: this.state.bandwidth };
  }

  async setMode(mode: string, bandwidth: number): Promise<boolean> {
    this.state.mode = mode;
    this.state.bandwidth = bandwidth;
    return true;
  }

  async getPower(): Promise<number | null> {
    return this.state.power;
  }

  async setPower(powerPercent: number): Promise<boolean> {
    this.state.power = powerPercent;
    return true;
  }

  async getPtt(): Promise<boolean | null> {
    return this.state.ptt;
  }

  async setPtt(enabled: boolean): Promise<boolean> {
    this.state.ptt = enabled;
    return true;
  }

  async getVfo(): Promise<string | null> {
    return this.state.vfo;
  }

  async setVfo(vfo: string): Promise<boolean> {
    this.state.vfo = vfo;
    return true;
  }

  async sendRaw(command: string): Promise<HamlibResponse> {
    const trimmed = command.trim();
    if (trimmed === 'f') return { success: true, data: this.state.frequency };
    if (trimmed === 'm') return { success: true, data: `${this.state.mode}\n${this.state.bandwidth}` };
    if (trimmed === 't') return { success: true, data: this.state.ptt ? '1' : '0' };
    if (trimmed === 'v') return { success: true, data: this.state.vfo };
    if (trimmed.startsWith('F ')) {
      this.state.frequency = trimmed.split(' ').slice(1).join(' ').trim();
      return { success: true };
    }
    if (trimmed.startsWith('M ')) {
      const parts = trimmed.split(' ');
      const mode = parts[1];
      const bw = parseInt(parts[2] || '0');
      if (mode) this.state.mode = mode;
      if (!Number.isNaN(bw)) this.state.bandwidth = bw;
      return { success: true };
    }
    if (trimmed.startsWith('L RFPOWER ')) {
      const value = parseFloat(trimmed.replace('L RFPOWER', '').trim());
      if (!Number.isNaN(value)) {
        this.state.power = Math.round(value * 100);
      }
      return { success: true };
    }
    if (trimmed.startsWith('T ')) {
      this.state.ptt = trimmed.endsWith('1');
      return { success: true };
    }
    if (trimmed.startsWith('V ')) {
      this.state.vfo = trimmed.split(' ').slice(1).join(' ').trim();
      return { success: true };
    }
    return { success: true, data: 'OK' };
  }

  async getInfo(): Promise<string | null> {
    return 'Mock Radio (Simulated Hamlib)';
  }

  async getState(): Promise<{
    frequency: string | null;
    mode: string | null;
    bandwidth: number | null;
    power: number | null;
    ptt: boolean | null;
    vfo: string | null;
  }> {
    return {
      frequency: this.state.frequency,
      mode: this.state.mode,
      bandwidth: this.state.bandwidth,
      power: this.state.power,
      ptt: this.state.ptt,
      vfo: this.state.vfo,
    };
  }
}

/**
 * Radio connection manager
 * Handles multiple radio connections and polling
 */
export class RadioManager {
  private connections: Map<string, RadioClient> = new Map();
  private pollIntervals: Map<string, NodeJS.Timeout> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private maxReconnectAttempts = 5;
  private pollInProgress: Map<string, boolean> = new Map();

  /**
   * Start managing a radio connection
   */
  async startRadio(radioId: string): Promise<boolean> {
    // Get radio from database
    const radio = await prisma.radioConnection.findUnique({
      where: { id: radioId },
    });

    if (!radio || !radio.isEnabled) {
      return false;
    }

    // Check if already connected
    if (this.connections.has(radioId)) {
      return true;
    }

    const connectionType = radio.connectionType || 'hamlib';
    const client: RadioClient = connectionType === 'mock'
      ? new MockHamlibClient({
          frequency: radio.frequency || undefined,
          mode: radio.mode || undefined,
          bandwidth: radio.bandwidth || undefined,
          power: radio.power || undefined,
        })
      : new HamlibClient(radio.host, radio.port);

    const connected = await client.connect();

    if (!connected) {
      await prisma.radioConnection.update({
        where: { id: radioId },
        data: {
          isConnected: false,
          lastError: 'Failed to connect',
        },
      });
      return false;
    }

    // Store connection
    this.connections.set(radioId, client);

    // Update database
    await prisma.radioConnection.update({
      where: { id: radioId },
      data: {
        isConnected: true,
        lastSeen: new Date(),
        lastError: null,
      },
    });

    // Start polling immediately for real-time updates
    this.startPolling(radioId, radio.pollInterval);

    return true;
  }

  /**
   * Stop managing a radio connection
   */
  async stopRadio(radioId: string): Promise<void> {
    // Stop polling
    const interval = this.pollIntervals.get(radioId);
    if (interval) {
      clearInterval(interval);
      this.pollIntervals.delete(radioId);
    }

    // Clean up poll tracking
    this.pollInProgress.delete(radioId);
    this.reconnectAttempts.delete(radioId);

    // Disconnect client
    const client = this.connections.get(radioId);
    if (client) {
      client.disconnect();
      this.connections.delete(radioId);
    }

    // Update database
    await prisma.radioConnection.update({
      where: { id: radioId },
      data: {
        isConnected: false,
      },
    });
  }

  /**
   * Start polling radio for state updates
   */
  private startPolling(radioId: string, intervalMs: number): void {
    const interval = setInterval(async () => {
      // Skip this poll tick if one is already in progress (prevents overlapping polls)
      if (this.pollInProgress.get(radioId)) {
        console.warn(`[RadioManager] Poll skipped for ${radioId} - previous poll still in progress`);
        return;
      }

      this.pollInProgress.set(radioId, true);
      try {
        await this.pollRadio(radioId);
      } finally {
        this.pollInProgress.set(radioId, false);
      }
    }, intervalMs);

    this.pollIntervals.set(radioId, interval);
  }

  /**
   * Poll radio for current state
   */
  private async pollRadio(radioId: string): Promise<void> {
    const client = this.connections.get(radioId);
    if (!client || !client.isConnected()) {
      // Attempt to reconnect if still under max attempts
      const attempts = this.reconnectAttempts.get(radioId) || 0;
      if (attempts < this.maxReconnectAttempts) {
        console.log(`[RadioManager] Radio ${radioId} disconnected. Attempting reconnect (${attempts + 1}/${this.maxReconnectAttempts})`);
        this.reconnectAttempts.set(radioId, attempts + 1);
        
        // Try to reconnect
        await this.stopRadio(radioId);
        const reconnected = await this.startRadio(radioId);
        if (reconnected) {
          console.log(`[RadioManager] Radio ${radioId} reconnected successfully`);
          this.reconnectAttempts.delete(radioId);
          return;
        }
      } else {
        // Max attempts reached, stop trying
        console.error(`[RadioManager] Radio ${radioId} failed to reconnect after ${this.maxReconnectAttempts} attempts`);
        await this.stopRadio(radioId);
        this.reconnectAttempts.delete(radioId);
      }
      return;
    }

    try {
      const state = await client.getState();

      // Update database
      const updated = await prisma.radioConnection.update({
        where: { id: radioId },
        data: {
          frequency: state.frequency,
          mode: state.mode,
          bandwidth: state.bandwidth,
          power: state.power,
          lastSeen: new Date(),
          isConnected: true,
          lastError: null,
        },
      });

      // Broadcast state update via WebSocket
      wsManager.broadcast('radio', 'radioStateUpdate', {
        radioId,
        state: updated,
      });

      // Update assigned station's band activity
      await this.updateStationBandActivity(radioId, state);
    } catch (error: any) {
      console.error(`[RadioManager] Poll error for ${radioId}:`, error.message);
      const updated = await prisma.radioConnection.update({
        where: { id: radioId },
        data: {
          lastError: error.message,
        },
      });

      // Broadcast error via WebSocket
      wsManager.broadcast('radio', 'radioStateUpdate', {
        radioId,
        state: updated,
      });
    }
  }

  /**
   * Update station's band activity based on radio state
   */
  private async updateStationBandActivity(
    radioId: string,
    state: { frequency: string | null; mode: string | null; power: number | null }
  ): Promise<void> {
    if (!state.frequency || !state.mode) return;

    // Find active assignment
    const assignment = await prisma.radioAssignment.findFirst({
      where: {
        radioId,
        isActive: true,
      },
      include: {
        station: true,
      },
    });

    if (!assignment) return;

    // Convert frequency to band
    const band = this.frequencyToBand(state.frequency);
    if (!band) return;

    // Normalize mode
    const normalizedMode = this.normalizeMode(state.mode);

    // Find existing band activity for this station
    const existing = await prisma.bandActivity.findFirst({
      where: { stationId: assignment.stationId },
    });

    if (existing) {
      // Update existing
      await prisma.bandActivity.update({
        where: { id: existing.id },
        data: {
          band,
          mode: normalizedMode,
          frequency: state.frequency,
          power: state.power || undefined,
          active: true,
          lastSeen: new Date(),
        },
      });
    } else {
      // Create new
      await prisma.bandActivity.create({
        data: {
          stationId: assignment.stationId,
          band,
          mode: normalizedMode,
          frequency: state.frequency,
          power: state.power || undefined,
          active: true,
        },
      });
    }
  }

  /**
   * Convert frequency in Hz to band
   */
  private frequencyToBand(frequencyHz: string): string | null {
    const freq = parseInt(frequencyHz);
    if (isNaN(freq)) return null;

    // Band edges in Hz
    const bands: [number, number, string][] = [
      [1800000, 2000000, '160'],
      [3500000, 4000000, '80'],
      [5330500, 5403500, '60'],
      [7000000, 7300000, '40'],
      [10100000, 10150000, '30'],
      [14000000, 14350000, '20'],
      [18068000, 18168000, '17'],
      [21000000, 21450000, '15'],
      [24890000, 24990000, '12'],
      [28000000, 29700000, '10'],
      [50000000, 54000000, '6'],
      [144000000, 148000000, '2'],
      [222000000, 225000000, '1.25'],
      [420000000, 450000000, '70cm'],
    ];

    for (const [low, high, band] of bands) {
      if (freq >= low && freq <= high) {
        return band;
      }
    }

    return null;
  }

  /**
   * Normalize mode to standard format
   */
  private normalizeMode(mode: string): string {
    const upper = mode.toUpperCase();
    
    // Map various mode names to standard
    if (upper.includes('CW')) return 'CW';
    if (upper.includes('USB') || upper.includes('LSB') || upper === 'SSB') return 'PHONE';
    if (upper.includes('FM')) return 'PHONE';
    if (upper.includes('AM')) return 'PHONE';
    if (upper.includes('FT8') || upper.includes('FT4') || upper.includes('RTTY') || 
        upper.includes('PSK') || upper.includes('DIGITAL') || upper.includes('DATA')) {
      return 'DIGITAL';
    }

    return 'PHONE'; // Default
  }

  /**
   * Get client for a radio
   */
  getClient(radioId: string): RadioClient | undefined {
    return this.connections.get(radioId);
  }

  /**
   * Stop all radios
   */
  async stopAll(): Promise<void> {
    const radioIds = Array.from(this.connections.keys());
    await Promise.all(radioIds.map(id => this.stopRadio(id)));
  }

  /**
   * Restart all enabled radios
   */
  async startAll(): Promise<void> {
    const radios = await prisma.radioConnection.findMany({
      where: { isEnabled: true },
    });

    await Promise.all(radios.map(radio => this.startRadio(radio.id)));
  }
}

// Global radio manager instance
export const radioManager = new RadioManager();
