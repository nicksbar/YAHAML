/**
 * Core types and interfaces for digital modem system
 * Supports CW, FT8, FT4, and extensible fldigi modes
 */

export type DigitalMode = 'CW' | 'FT8' | 'FT4' | 'PSK31' | 'OLIVIA' | 'MT63' | 'DOMINOEX' | 'CUSTOM'

export interface DecodedMessage {
  /** Decoded text (callsign, exchange, etc.) */
  text: string

  /** Confidence level 0-1 */
  confidence: number

  /** Timestamp when decoded */
  timestamp: number

  /** Operating frequency in Hz (optional) */
  frequency?: number

  /** Signal-to-noise ratio in dB (optional) */
  snr?: number

  /** CW receive speed estimate in words per minute (optional) */
  wpm?: number

  /** Time to decode in ms */
  processingTime?: number
}

export interface ModeConfig {
  /** CW: words per minute */
  wpm?: number

  /** CW: tone frequency in Hz */
  toneFrequency?: number

  /** CW: tone bandwidth in Hz */
  toneBandwidth?: number

  /** Sample rate in Hz */
  sampleRate: number

  /** Frequency range for mode in Hz */
  frequencyRange: [number, number]

  /** Mode-specific settings (serialized) */
  customSettings?: Record<string, unknown>
}

export interface DigitalModem {
  /** Mode name */
  name: DigitalMode

  /** Display abbreviation */
  abbreviation: string

  /** Current configuration */
  readonly config: ModeConfig

  /**
   * Decode audio buffer to messages
   * @param audioBuffer Float32Array of audio samples
   * @param sampleRate Sample rate of buffer
   * @returns Array of decoded messages
   */
  decode(audioBuffer: Float32Array, sampleRate: number): DecodedMessage[]

  /**
   * Encode text to audio
   * @param text Text to encode (e.g., callsign, CQ)
   * @returns AudioBuffer or Float32Array
   */
  encode(text: string): AudioBuffer | Float32Array

  /**
   * Update modem configuration
   */
  setConfig(config: Partial<ModeConfig>): void

  /**
   * Clean up resources
   */
  dispose(): void
}

export interface DecoderStats {
  /** Total messages decoded */
  messagesDecoded: number

  /** Average confidence of decoded messages */
  averageConfidence: number

  /** Last decode timestamp */
  lastDecodeTime: number

  /** CPU time spent decoding (ms) */
  totalProcessingTime: number
}

export interface DecoderState {
  /** Currently active modem */
  activeMode: DigitalMode

  /** Is decoder running */
  isRunning: boolean

  /** Recent decoded messages */
  recentMessages: DecodedMessage[]

  /** Decoder statistics */
  stats: DecoderStats
}

/**
 * fldigi integration types
 */
export interface fldigi_rx_data {
  type: string // 'rx.data'
  data: {
    text: string
    frequency: number
    snr: number
    mode: string
  }
}

export interface fldigi_tx_data {
  mode: string
  text: string
  speed?: number
}

/**
 * Contest-specific types
 */
export interface ContestExchange {
  callsign: string
  exchange: string
  mode: DigitalMode
  band: string
  frequency: number
  timestamp: number
  decoderConfidence: number
}

export interface CallsignMatch {
  callsign: string
  frequency?: number
  snr?: number
  confidence: number
  source: 'decoder' | 'manual'
}
