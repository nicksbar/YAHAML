/**
 * Abstract base class for digital modems
 */

import type { DigitalMode, DecodedMessage, ModeConfig, DigitalModem } from './types';

export abstract class BaseModem implements DigitalModem {
  name: DigitalMode
  abbreviation: string
  config: ModeConfig
  protected isInitialized = false

  constructor(name: DigitalMode, abbreviation: string, config: ModeConfig) {
    this.name = name
    this.abbreviation = abbreviation
    this.config = config
  }

  abstract decode(audioBuffer: Float32Array, sampleRate: number): DecodedMessage[]

  abstract encode(text: string): AudioBuffer | Float32Array

  setConfig(config: Partial<ModeConfig>): void {
    this.config = { ...this.config, ...config }
  }

  dispose(): void {
    this.isInitialized = false
  }

  protected getTimestamp(): number {
    return Date.now()
  }
}

/**
 * CW Decoder using tone detection and Morse parsing
 * Uses Goertzel algorithm for efficient tone detection
 */

export class CWDecoder extends BaseModem {
  private morseMap: Record<string, string> = {
    '.-': 'A',
    '-...': 'B',
    '-.-.': 'C',
    '-..': 'D',
    '.': 'E',
    '..-.': 'F',
    '--.': 'G',
    '....': 'H',
    '..': 'I',
    '.---': 'J',
    '-.-': 'K',
    '.-..': 'L',
    '--': 'M',
    '-.': 'N',
    '---': 'O',
    '.--.': 'P',
    '--.-': 'Q',
    '.-.': 'R',
    '...': 'S',
    '-': 'T',
    '..-': 'U',
    '...-': 'V',
    '.--': 'W',
    '-..-': 'X',
    '-.--': 'Y',
    '--..': 'Z',
    '.----': '1',
    '..---': '2',
    '...--': '3',
    '....-': '4',
    '.....': '5',
    '-....': '6',
    '--...': '7',
    '---..': '8',
    '----.': '9',
    '-----': '0',
    '.-.-.-': '.',
    '--..--': ',',
    '..--..': '?',
    '---...': ':'
  }

  private reverseMorseMap: Record<string, string> = {}
  private inTone = false
  private toneSamples = 0
  private silenceSamples = 0
  private currentSymbol = ''
  private decodedStream = ''
  private lastEmittedText = ''
  private noiseFloor = 0
  private signalPeak = 0
  private lastSampleRate = 0
  private toneRatioFloor = 1
  private toneQualityEma = 1
  private adaptiveDitSamples = 0
  private lastElementSamples = 0
  private recentDotCandidates: number[] = []
  private recentPairDotCandidates: number[] = []
  private elementsSincePair = 0
  private speedSwitchCounter = 0
  private pairDitSamples = 0
  private timingConfidence = 0
  private lastTimingUpdateMs = 0
  private toneOnCandidateWindows = 0
  private toneOffCandidateWindows = 0

  constructor(config?: Partial<ModeConfig>) {
    const defaultConfig: ModeConfig = {
      wpm: 20,
      toneFrequency: 800,
      toneBandwidth: 180,
      sampleRate: 8000,
      frequencyRange: [600, 1200],
      ...config
    }
    super('CW', 'CW', defaultConfig)

    // Build reverse map
    for (const [morse, char] of Object.entries(this.morseMap)) {
      this.reverseMorseMap[char] = morse
    }

    this.isInitialized = true
  }

  /**
   * Detect CW tone and decode Morse to text
   */
  decode(audioBuffer: Float32Array, sampleRate: number): DecodedMessage[] {
    if (!this.isInitialized || audioBuffer.length === 0) {
      return []
    }

    if (this.lastSampleRate !== sampleRate) {
      this.resetTimingState()
      this.lastSampleRate = sampleRate
    }

    const startTime = performance.now()
    const toneFreq = this.config.toneFrequency || 800
    const toneBandwidth = this.config.toneBandwidth || 180

    // Detect tone energy around the configured CW pitch
    const toneEnergy = this.getBandEnergy(audioBuffer, toneFreq, toneBandwidth, sampleRate)
    const lowerSideEnergy = this.getBandEnergy(
      audioBuffer,
      Math.max(80, toneFreq - toneBandwidth * 1.8),
      toneBandwidth,
      sampleRate
    )
    const upperSideEnergy = this.getBandEnergy(
      audioBuffer,
      Math.min(sampleRate / 2 - 80, toneFreq + toneBandwidth * 1.8),
      toneBandwidth,
      sampleRate
    )
    const sideEnergy = lowerSideEnergy + upperSideEnergy
    const avgEnergy = this.getAverageEnergy(audioBuffer)
    const signalRatio = avgEnergy > 0 ? toneEnergy / avgEnergy : 0
    const tonePurity = toneEnergy > 0 ? toneEnergy / (toneEnergy + sideEnergy) : 0

    // Streaming decode (persist state across chunks)
    const wpm = this.config.wpm || 20
    const configuredDitDuration = this.calculateDitDuration(wpm, sampleRate)
    const ditDuration = this.getActiveDitDuration(configuredDitDuration)
    this.processStreamingEnvelope(audioBuffer, sampleRate, ditDuration, toneFreq, toneBandwidth)

    // Flush pending symbol when enough silence passes, even without a following tone
    if (!this.inTone && this.currentSymbol && this.silenceSamples >= ditDuration * 3) {
      this.flushCurrentSymbol()
    }

    // Insert word gap on long silence
    if (!this.inTone && this.silenceSamples >= ditDuration * 7) {
      this.appendWordGap()
    }

    const text = this.decodedStream.trim()

    // Confidence based on signal ratio (0-1)
    const confidence = this.estimateConfidence(signalRatio, tonePurity)
    const snr = this.noiseFloor > 0 && this.signalPeak > 0
      ? 20 * Math.log10(Math.max(this.signalPeak / this.noiseFloor, 1e-6))
      : undefined

    const processingTime = performance.now() - startTime
    const estimatedWpm = this.getEstimatedWpm()

    if (text.length > 0 && text !== this.lastEmittedText) {
      this.lastEmittedText = text
      return [
        {
          text,
          confidence,
          frequency: toneFreq,
          snr,
          wpm: estimatedWpm,
          timestamp: this.getTimestamp(),
          processingTime
        }
      ]
    }

    return []
  }

  getEstimatedWpm(): number {
    const sampleRate = this.lastSampleRate || this.config.sampleRate || 8000
    if (this.pairDitSamples > 0 && Date.now() - this.lastTimingUpdateMs < 2500) {
      const pairWpm = this.estimateWpmFromDit(this.pairDitSamples, sampleRate)
      if (this.adaptiveDitSamples > 0) {
        const adaptiveWpm = this.estimateWpmFromDit(this.adaptiveDitSamples, sampleRate)
        return Math.round(pairWpm * 0.75 + adaptiveWpm * 0.25)
      }
      return pairWpm
    }

    if (this.adaptiveDitSamples > 0) {
      return this.estimateWpmFromDit(this.adaptiveDitSamples, sampleRate)
    }
    return this.config.wpm || 20
  }

  getTimingConfidence(): number {
    const ageMs = Date.now() - this.lastTimingUpdateMs
    const freshness = ageMs < 1200 ? 1 : ageMs < 2500 ? 0.65 : ageMs < 4000 ? 0.35 : 0
    return Math.max(0, Math.min(1, this.timingConfidence * freshness))
  }

  /**
   * Reset streaming decoder state and buffers.
   * Useful for UI "clear" actions so stale text doesn't reappear on next decode.
   */
  reset(): void {
    this.resetTimingState()
  }

  /**
   * Encode text to Morse to audio
   */
  encode(text: string): Float32Array {
    const wpm = this.config.wpm || 20
    const toneFreq = this.config.toneFrequency || 800
    const sampleRate = this.config.sampleRate

    const ditDuration = this.calculateDitDuration(wpm, sampleRate)
    const dahDuration = ditDuration * 3
    const symbolSpace = ditDuration
    const charSpace = ditDuration * 3
    const wordSpace = ditDuration * 7

    let totalSamples = 0
    const morse = text
      .toUpperCase()
      .split('')
      .map((ch) => this.reverseMorseMap[ch] || '')
      .join(' ')

    // Calculate total duration
    for (const symbol of morse) {
      if (symbol === '.') totalSamples += ditDuration
      else if (symbol === '-') totalSamples += dahDuration
      else if (symbol === ' ') totalSamples += symbolSpace
    }
    totalSamples += charSpace * text.length

    // Generate audio
    const audioBuffer = new Float32Array(totalSamples)
    let sampleIdx = 0

    for (let i = 0; i < morse.length; i++) {
      const symbol = morse[i]

      if (symbol === '.') {
        this.fillTone(audioBuffer, sampleIdx, ditDuration, toneFreq, sampleRate)
        sampleIdx += ditDuration
      } else if (symbol === '-') {
        this.fillTone(audioBuffer, sampleIdx, dahDuration, toneFreq, sampleRate)
        sampleIdx += dahDuration
      } else if (symbol === ' ') {
        sampleIdx += symbolSpace
      }

      sampleIdx += symbolSpace
    }

    return audioBuffer
  }

  // Helper methods

  private goertzel(buffer: Float32Array, frequency: number, sampleRate: number): number {
    const k = (buffer.length * frequency) / sampleRate
    const w = (2 * Math.PI * k) / buffer.length
    const coeff = 2 * Math.cos(w)

    let s0 = 0,
      s1 = 0,
      s2 = 0

    for (let i = 0; i < buffer.length; i++) {
      s0 = buffer[i] + coeff * s1 - s2
      s2 = s1
      s1 = s0
    }

    const power = s1 * s1 + s2 * s2 - coeff * s1 * s2
    return power
  }

  private getBandEnergy(
    buffer: Float32Array,
    centerHz: number,
    bandwidthHz: number,
    sampleRate: number
  ): number {
    const nyquist = sampleRate / 2
    const halfBw = Math.max(20, bandwidthHz / 2)
    const minHz = Math.max(40, centerHz - halfBw)
    const maxHz = Math.min(nyquist - 40, centerHz + halfBw)
    const stepHz = Math.max(20, Math.round(bandwidthHz / 6))

    let sum = 0
    let bins = 0
    for (let f = minHz; f <= maxHz; f += stepHz) {
      sum += this.goertzel(buffer, f, sampleRate)
      bins++
    }

    if (bins === 0) {
      return this.goertzel(buffer, centerHz, sampleRate)
    }

    return sum / bins
  }

  private getAverageEnergy(buffer: Float32Array): number {
    let sum = 0
    for (let i = 0; i < buffer.length; i++) {
      sum += buffer[i] * buffer[i]
    }
    return sum / buffer.length
  }

  private calculateDitDuration(wpm: number, sampleRate: number): number {
    // Paris convention: 50 dots per word at wpm
    const ditDurationMs = 1200 / wpm
    return Math.round((ditDurationMs * sampleRate) / 1000)
  }

  private processStreamingEnvelope(
    buffer: Float32Array,
    sampleRate: number,
    ditDuration: number,
    toneFreq: number,
    toneBandwidth: number
  ): void {
    const windowSize = Math.max(16, Math.round(sampleRate * 0.005)) // ~5ms windows

    for (let i = 0; i < buffer.length; i += windowSize) {
      const end = Math.min(i + windowSize, buffer.length)
      const window = buffer.slice(i, end)
      let energy = 0
      for (let j = i; j < end; j++) {
        const s = buffer[j]
        energy += s * s
      }

      const rms = Math.sqrt(energy / Math.max(1, end - i))
      this.updateAdaptiveLevels(rms)

      const tonePower = this.getBandEnergy(window, toneFreq, toneBandwidth, sampleRate)
      const lowerSidePower = this.getBandEnergy(
        window,
        Math.max(80, toneFreq - toneBandwidth * 1.8),
        toneBandwidth,
        sampleRate
      )
      const upperSidePower = this.getBandEnergy(
        window,
        Math.min(sampleRate / 2 - 80, toneFreq + toneBandwidth * 1.8),
        toneBandwidth,
        sampleRate
      )
      const sidePower = lowerSidePower + upperSidePower + 1e-12
      const toneRatio = tonePower / sidePower
      this.toneQualityEma = this.toneQualityEma * 0.97 + toneRatio * 0.03

      if (!this.inTone) {
        this.toneRatioFloor = this.toneRatioFloor * 0.98 + toneRatio * 0.02
      }

      const ampOn = rms >= Math.max(0.004, this.noiseFloor * 1.3)
      const ampOff = rms < Math.max(0.0025, this.noiseFloor * 1.05)
      const ratioOnThreshold = Math.max(2.6, this.toneRatioFloor * 1.55)
      const ratioOffThreshold = Math.max(1.55, this.toneRatioFloor * 1.15)

      const isTone = this.inTone
        ? !ampOff && toneRatio >= ratioOffThreshold
        : ampOn && toneRatio >= ratioOnThreshold

      // Debounce state transitions so short static spikes don't become Morse elements
      const confirmWindows = this.toneQualityEma >= 2.0 ? 2 : 3
      if (isTone) {
        this.toneOnCandidateWindows += 1
        this.toneOffCandidateWindows = 0
      } else {
        this.toneOffCandidateWindows += 1
        this.toneOnCandidateWindows = 0
      }

      const stableTone = this.inTone
        ? this.toneOffCandidateWindows < confirmWindows
        : this.toneOnCandidateWindows >= confirmWindows

      this.consumeWindow(stableTone, end - i, ditDuration)
    }
  }

  private consumeWindow(isTone: boolean, windowSamples: number, ditDuration: number): void {
    if (isTone) {
      if (!this.inTone) {
        this.handleSilenceGap(this.silenceSamples, ditDuration)
        this.inTone = true
        this.toneSamples = windowSamples
        this.silenceSamples = 0
      } else {
        this.toneSamples += windowSamples
      }
      return
    }

    if (this.inTone) {
      this.classifyAndAppendTone(this.toneSamples, ditDuration)
      this.inTone = false
      this.toneSamples = 0
      this.silenceSamples = windowSamples
      return
    }

    this.silenceSamples += windowSamples
  }

  private classifyAndAppendTone(toneSamples: number, ditDuration: number): void {
    // Reject implausibly short/long events likely caused by noise or speech transients
    const sampleRate = this.lastSampleRate || 8000
    const minAbsoluteTone = Math.round(sampleRate * 0.018) // 18 ms
    const qualityFactor = this.toneQualityEma >= 2.5 ? 0.35 : this.toneQualityEma >= 1.8 ? 0.4 : 0.5
    const minRelativeTone = Math.round(ditDuration * qualityFactor)
    const minTone = Math.max(minAbsoluteTone, minRelativeTone)

    if (toneSamples < minTone || toneSamples > ditDuration * 8) {
      return
    }

    if (toneSamples < ditDuration * 2.4) {
      this.currentSymbol += '.'
    } else {
      this.currentSymbol += '-'
    }

    this.updateAdaptiveTiming(toneSamples, ditDuration)

    // Morse symbols longer than 6 elements are almost always garbage in this context
    if (this.currentSymbol.length > 6) {
      this.currentSymbol = ''
    }
  }

  private handleSilenceGap(gapSamples: number, ditDuration: number): void {
    if (gapSamples < ditDuration * 2) {
      // Inter-element gap within the same character
      return
    }

    if (gapSamples < ditDuration * 6) {
      // Character boundary
      this.flushCurrentSymbol()
      return
    }

    // Word boundary
    this.flushCurrentSymbol()
    this.appendWordGap()
  }

  private flushCurrentSymbol(): void {
    if (!this.currentSymbol) return

    if (!this.isSymbolReliable(this.currentSymbol)) {
      this.currentSymbol = ''
      return
    }

    const ch = this.morseMap[this.currentSymbol] || ''
    if (ch) {
      this.decodedStream += ch
      // Keep buffer bounded so UI/history stay responsive
      if (this.decodedStream.length > 512) {
        this.decodedStream = this.decodedStream.slice(-512)
      }
    }

    this.currentSymbol = ''
  }

  private isSymbolReliable(symbol: string): boolean {
    const signalRatio = this.noiseFloor > 0 ? this.signalPeak / this.noiseFloor : 0
    const timingLock = this.getTimingConfidence()

    // Reject weak single-dot decodes (common false-positive "E" from static)
    if (symbol === '.') {
      const hasPairLock = this.recentPairDotCandidates.length >= 3 && timingLock >= 0.35
      const strongSpectralLock = signalRatio >= 1.8 && this.toneQualityEma >= 2.6

      // Accept a single-dot only when we either have solid timing lock OR very strong spectral lock.
      if (!hasPairLock && !strongSpectralLock) return false

      // Additional guard for static bursts when timing lock is weak
      if (timingLock < 0.25 && this.toneQualityEma < 2.9) return false
    }

    // One-element symbols are most vulnerable to noise; require some lock quality.
    if (symbol.length === 1 && timingLock < 0.2 && this.toneQualityEma < 2.3) {
      return false
    }

    // Generic squelch for all symbols in very poor tone discrimination conditions
    if (signalRatio < 1.2 || this.toneQualityEma < 1.45) {
      return false
    }

    return true
  }

  private appendWordGap(): void {
    if (this.decodedStream.length > 0 && !this.decodedStream.endsWith(' ')) {
      this.decodedStream += ' '
    }
  }

  private updateAdaptiveLevels(rms: number): void {
    if (this.signalPeak === 0 && this.noiseFloor === 0) {
      this.signalPeak = rms
      this.noiseFloor = rms * 0.5
      return
    }

    // Slow noise floor tracking + gentle decay for peak hold
    this.noiseFloor = this.noiseFloor * 0.99 + rms * 0.01
    this.signalPeak = Math.max(rms, this.signalPeak * 0.995)

    // Prevent collapse where peak drops below floor
    if (this.signalPeak < this.noiseFloor) {
      this.signalPeak = this.noiseFloor
    }
  }

  private estimateConfidence(signalRatio: number, tonePurity: number): number {
    const dynamicRatio = this.noiseFloor > 0 ? this.signalPeak / this.noiseFloor : 1
    const combined = Math.max(signalRatio, dynamicRatio)
    const ratioScore = Math.min(1, combined / 3)
    const purityScore = Math.max(0, Math.min(1, tonePurity))
    return ratioScore * 0.75 + purityScore * 0.25
  }

  private getActiveDitDuration(configuredDitDuration: number): number {
    if (this.adaptiveDitSamples <= 0) {
      return configuredDitDuration
    }

    // Blend tracked speed with manual anchor to reduce feedback runaway
    return Math.round(configuredDitDuration * 0.3 + this.adaptiveDitSamples * 0.7)
  }

  private updateAdaptiveTiming(currentElementSamples: number, baselineDit: number): void {
    const last = this.lastElementSamples
    this.lastElementSamples = currentElementSamples

    if (last <= 0 || this.lastSampleRate <= 0) {
      return
    }

    let inferredDot = 0
    let fromPair = false

    // Dot-dash sequence
    if (currentElementSamples > 2 * last && currentElementSamples < 4 * last) {
      inferredDot = last
      fromPair = true
    }
    // Dash-dot sequence
    else if (last > 2 * currentElementSamples && last < 4 * currentElementSamples) {
      inferredDot = currentElementSamples
      fromPair = true
    }

    if (!inferredDot) {
      // Fallback: learn from single elements only when classification is unambiguous.
      // Ambiguous zone is ignored to prevent inverted WPM feedback.
      if (currentElementSamples <= baselineDit * 1.6) {
        inferredDot = currentElementSamples
      } else if (currentElementSamples >= baselineDit * 2.6) {
        inferredDot = Math.round(currentElementSamples / 3)
      } else {
        return
      }
    }

    // Keep adaptive dit within sane CW range (5..70 WPM)
    const maxDit = this.calculateDitDuration(5, this.lastSampleRate)
    const minDit = this.calculateDitDuration(70, this.lastSampleRate)
    const bounded = Math.round(Math.max(minDit, Math.min(maxDit, inferredDot)))

    this.pushDotCandidate(bounded, fromPair)
    const robustDot = this.getRobustDotEstimate() || bounded

    if (this.adaptiveDitSamples <= 0) {
      this.adaptiveDitSamples = robustDot
      return
    }

    if (fromPair) {
      this.elementsSincePair = 0
      this.lastTimingUpdateMs = Date.now()
      this.timingConfidence = Math.min(1, this.timingConfidence + 0.12)
      this.pairDitSamples = this.pairDitSamples > 0
        ? Math.round(this.pairDitSamples * 0.7 + robustDot * 0.3)
        : robustDot
    } else {
      this.elementsSincePair++
      this.lastTimingUpdateMs = Date.now()
      this.timingConfidence = Math.min(0.85, this.timingConfidence + 0.02)
    }

    const relDiff = Math.abs(robustDot - this.adaptiveDitSamples) / Math.max(1, this.adaptiveDitSamples)

    // Detect abrupt sender speed changes and relock quickly
    if (relDiff > 0.45) {
      this.speedSwitchCounter++
    } else {
      this.speedSwitchCounter = Math.max(0, this.speedSwitchCounter - 1)
    }

    if (this.speedSwitchCounter >= 2) {
      const quickRelock = Math.round(this.adaptiveDitSamples * 0.25 + robustDot * 0.75)
      const lower = Math.round(baselineDit * 0.35)
      const upper = Math.round(baselineDit * 2.8)
      this.adaptiveDitSamples = Math.max(lower, Math.min(upper, quickRelock))
      this.speedSwitchCounter = 0
      return
    }

    // Smooth updates to avoid WPM jitter from fist variation/noise
    const baseAlpha = relDiff > 0.25 ? 0.24 : relDiff > 0.12 ? 0.14 : 0.08
    const alpha = fromPair
      ? baseAlpha
      : this.elementsSincePair <= 4
        ? Math.max(0.05, baseAlpha * 0.6)
        : Math.max(0.035, baseAlpha * 0.45)
    const smoothed = Math.round(this.adaptiveDitSamples * (1 - alpha) + robustDot * alpha)

    // Never allow absurd jumps from a single bad pair
    const lower = Math.round(baselineDit * 0.4)
    const upper = Math.round(baselineDit * 2.4)
    this.adaptiveDitSamples = Math.max(lower, Math.min(upper, smoothed))
  }

  private pushDotCandidate(dotSamples: number, fromPair: boolean): void {
    this.recentDotCandidates.push(dotSamples)
    if (this.recentDotCandidates.length > 12) {
      this.recentDotCandidates.shift()
    }

    if (fromPair) {
      this.recentPairDotCandidates.push(dotSamples)
      if (this.recentPairDotCandidates.length > 10) {
        this.recentPairDotCandidates.shift()
      }
    }
  }

  private getRobustDotEstimate(): number | null {
    const source = this.recentPairDotCandidates.length >= 3
      ? this.recentPairDotCandidates
      : this.recentDotCandidates

    if (source.length < 4) {
      return null
    }

    const sorted = [...source].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    if (sorted.length % 2 === 0) {
      return Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    }
    return sorted[mid]
  }

  private estimateWpmFromDit(ditSamples: number, sampleRate: number): number {
    if (ditSamples <= 0 || sampleRate <= 0) {
      return this.config.wpm || 20
    }

    const ditMs = (ditSamples * 1000) / sampleRate
    const wpm = 1200 / Math.max(10, ditMs)
    return Math.max(5, Math.min(70, Math.round(wpm)))
  }

  private resetTimingState(): void {
    this.inTone = false
    this.toneSamples = 0
    this.silenceSamples = 0
    this.currentSymbol = ''
    this.decodedStream = ''
    this.lastEmittedText = ''
    this.noiseFloor = 0
    this.signalPeak = 0
    this.toneRatioFloor = 1
    this.toneQualityEma = 1
    this.adaptiveDitSamples = 0
    this.lastElementSamples = 0
    this.recentDotCandidates = []
    this.recentPairDotCandidates = []
    this.elementsSincePair = 0
    this.speedSwitchCounter = 0
    this.pairDitSamples = 0
    this.timingConfidence = 0
    this.lastTimingUpdateMs = 0
    this.toneOnCandidateWindows = 0
    this.toneOffCandidateWindows = 0
  }

  private fillTone(
    buffer: Float32Array,
    startIdx: number,
    duration: number,
    frequency: number,
    sampleRate: number
  ): void {
    for (let i = 0; i < duration; i++) {
      const t = (startIdx + i) / sampleRate
      buffer[startIdx + i] = Math.sin(2 * Math.PI * frequency * t) * 0.3
    }
  }
}
