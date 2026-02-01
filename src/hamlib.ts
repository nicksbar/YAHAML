import * as net from 'net';
import prisma from './db';

interface HamlibResponse {
  success: boolean;
  data?: string;
  error?: string;
}

/**
 * Hamlib rigctld client for radio control
 * Communicates with rigctld servers using the Hamlib protocol
 */
export class HamlibClient {
  private host: string;
  private port: number;
  private socket: net.Socket | null = null;
  private responseBuffer: string = '';
  private pendingCallbacks: Array<(response: HamlibResponse) => void> = [];

  constructor(host: string, port: number = 4532) {
    this.host = host;
    this.port = port;
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
    this.pendingCallbacks = [];
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  /**
   * Send command to rigctld
   */
  private async sendCommand(command: string): Promise<HamlibResponse> {
    if (!this.isConnected()) {
      return { success: false, error: 'Not connected' };
    }

    return new Promise((resolve) => {
      this.pendingCallbacks.push(resolve);
      this.socket!.write(command + '\n');
      
      // Timeout after 2 seconds
      setTimeout(() => {
        const index = this.pendingCallbacks.indexOf(resolve);
        if (index !== -1) {
          this.pendingCallbacks.splice(index, 1);
          resolve({ success: false, error: 'Command timeout' });
        }
      }, 2000);
    });
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
   */
  private processResponseLine(line: string): void {
    const callback = this.pendingCallbacks.shift();
    if (!callback) return;

    // RPRT indicates command result (0 = success, negative = error)
    if (line.startsWith('RPRT')) {
      const code = parseInt(line.split(' ')[1] || '0');
      if (code === 0) {
        callback({ success: true });
      } else {
        callback({ success: false, error: `Hamlib error code: ${code}` });
      }
    } else {
      // Data response
      callback({ success: true, data: line });
    }
  }

  /**
   * Get current frequency in Hz
   */
  async getFrequency(): Promise<string | null> {
    const response = await this.sendCommand('f');
    return response.success && response.data ? response.data : null;
  }

  /**
   * Set frequency in Hz
   */
  async setFrequency(frequency: string): Promise<boolean> {
    const response = await this.sendCommand(`F ${frequency}`);
    return response.success;
  }

  /**
   * Get current mode and bandwidth
   * Returns: "USB 3000" or "CW 500", etc.
   */
  async getMode(): Promise<{ mode: string; bandwidth: number } | null> {
    const response = await this.sendCommand('m');
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
    const response = await this.sendCommand(`M ${mode} ${bandwidth}`);
    return response.success;
  }

  /**
   * Get power level in watts
   */
  async getPower(): Promise<number | null> {
    const response = await this.sendCommand('l RFPOWER');
    if (!response.success || !response.data) return null;
    
    // Response is a float 0.0-1.0, convert to percentage
    const powerFraction = parseFloat(response.data);
    return Math.round(powerFraction * 100);
  }

  /**
   * Set power level (0-100%)
   */
  async setPower(powerPercent: number): Promise<boolean> {
    const powerFraction = powerPercent / 100;
    const response = await this.sendCommand(`L RFPOWER ${powerFraction.toFixed(2)}`);
    return response.success;
  }

  /**
   * Get radio info
   */
  async getInfo(): Promise<string | null> {
    const response = await this.sendCommand('_');
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
  }> {
    const [frequency, modeData, power] = await Promise.all([
      this.getFrequency(),
      this.getMode(),
      this.getPower(),
    ]);

    return {
      frequency,
      mode: modeData?.mode || null,
      bandwidth: modeData?.bandwidth || null,
      power,
    };
  }
}

/**
 * Radio connection manager
 * Handles multiple radio connections and polling
 */
export class RadioManager {
  private connections: Map<string, HamlibClient> = new Map();
  private pollIntervals: Map<string, NodeJS.Timeout> = new Map();

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

    // Create client and connect
    const client = new HamlibClient(radio.host, radio.port);
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

    // Start polling
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
      await this.pollRadio(radioId);
    }, intervalMs);

    this.pollIntervals.set(radioId, interval);
  }

  /**
   * Poll radio for current state
   */
  private async pollRadio(radioId: string): Promise<void> {
    const client = this.connections.get(radioId);
    if (!client || !client.isConnected()) {
      await this.stopRadio(radioId);
      return;
    }

    try {
      const state = await client.getState();

      // Update database
      await prisma.radioConnection.update({
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

      // Update assigned station's band activity
      await this.updateStationBandActivity(radioId, state);
    } catch (error: any) {
      console.error(`[RadioManager] Poll error for ${radioId}:`, error.message);
      await prisma.radioConnection.update({
        where: { id: radioId },
        data: {
          lastError: error.message,
        },
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
  getClient(radioId: string): HamlibClient | undefined {
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
