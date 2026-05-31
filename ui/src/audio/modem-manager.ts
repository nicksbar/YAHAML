/**
 * Modem manager - Registry and lifecycle management for digital modems
 */

import type { DigitalModem, DigitalMode, DecodedMessage, DecoderState, DecoderStats } from './types';
import { CWDecoder } from './cw-decoder'

export class ModemManager {
  private modems: Map<DigitalMode, DigitalModem> = new Map()
  private activeMode: DigitalMode = 'CW'
  private recentMessages: DecodedMessage[] = []
  private maxRecentMessages = 50
  private stats: DecoderStats = {
    messagesDecoded: 0,
    averageConfidence: 0,
    lastDecodeTime: 0,
    totalProcessingTime: 0
  }

  constructor() {
    this.registerDefaultModems()
  }

  /**
   * Register built-in modems
   */
  private registerDefaultModems(): void {
    // CW decoder
    const cwDecoder = new CWDecoder({
      wpm: 20,
      toneFrequency: 800,
      sampleRate: 8000
    })
    this.modems.set('CW', cwDecoder)
  }

  /**
   * Register a custom modem
   */
  registerModem(modem: DigitalModem): void {
    this.modems.set(modem.name, modem)
  }

  /**
   * Get registered modem by mode
   */
  getModem(mode: DigitalMode): DigitalModem | undefined {
    return this.modems.get(mode)
  }

  /**
   * List all available modes
   */
  getAvailableModes(): DigitalMode[] {
    return Array.from(this.modems.keys())
  }

  /**
   * Switch to a different modem
   */
  setActiveMode(mode: DigitalMode): boolean {
    if (!this.modems.has(mode)) {
      console.error(`Mode ${mode} not registered`)
      return false
    }
    this.activeMode = mode
    return true
  }

  /**
   * Get current active mode
   */
  getActiveMode(): DigitalMode {
    return this.activeMode
  }

  /**
   * Decode audio with active modem
   */
  decode(audioBuffer: Float32Array, sampleRate: number): DecodedMessage[] {
    const modem = this.modems.get(this.activeMode)
    if (!modem) return []

    const messages = modem.decode(audioBuffer, sampleRate)

    // Update statistics
    for (const msg of messages) {
      this.recentMessages.unshift(msg)
      if (this.recentMessages.length > this.maxRecentMessages) {
        this.recentMessages.pop()
      }

      this.stats.messagesDecoded++
      this.stats.lastDecodeTime = msg.timestamp
      if (msg.processingTime) {
        this.stats.totalProcessingTime += msg.processingTime
      }
    }

    // Update average confidence
    if (this.stats.messagesDecoded > 0) {
      const sumConfidence = this.recentMessages.reduce((sum, m) => sum + m.confidence, 0)
      this.stats.averageConfidence = sumConfidence / this.recentMessages.length
    }

    return messages
  }

  /**
   * Encode text with active modem
   */
  encode(text: string): AudioBuffer | Float32Array | null {
    const modem = this.modems.get(this.activeMode)
    if (!modem) return null

    return modem.encode(text)
  }

  /**
   * Get decoder state
   */
  getState(): DecoderState {
    return {
      activeMode: this.activeMode,
      isRunning: true,
      recentMessages: this.recentMessages,
      stats: { ...this.stats }
    }
  }

  /**
   * Get recent messages (last N)
   */
  getRecentMessages(count: number = 10): DecodedMessage[] {
    return this.recentMessages.slice(0, count)
  }

  /**
   * Clear message history
   */
  clearMessages(): void {
    this.recentMessages = []
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      messagesDecoded: 0,
      averageConfidence: 0,
      lastDecodeTime: 0,
      totalProcessingTime: 0
    }
  }

  /**
   * Dispose all modems
   */
  dispose(): void {
    for (const modem of this.modems.values()) {
      modem.dispose()
    }
    this.modems.clear()
  }
}

// Singleton instance
export const globalModemManager = new ModemManager()
