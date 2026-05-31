import React, { useState, useEffect } from 'react'
import '../styles/CWDecoder.css'
import type { DecodedMessage, DigitalMode } from '../audio/types';
import { globalModemManager } from '../audio/modem-manager'
import { formatDecodedTranscript } from '../audio/decode-transcript'

interface ToneAnalysis {
  peakFreq: number
  peakPower: number
  avgPower: number
  quality: number
  bandwidthHz: number
  recommendedBandwidthHz: number
}

type CWDecoderRuntimeModem = {
  setConfig: (config: { wpm?: number; toneFrequency?: number; toneBandwidth?: number }) => void
  getEstimatedWpm?: () => number
  getTimingConfidence?: () => number
  reset?: () => void
}

type WindowWithWebkitAudioContext = Window & {
  webkitAudioContext?: typeof AudioContext
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

const goertzelPower = (buffer: Float32Array, frequency: number, sampleRate: number): number => {
  const k = (buffer.length * frequency) / sampleRate
  const w = (2 * Math.PI * k) / buffer.length
  const coeff = 2 * Math.cos(w)

  let s0 = 0
  let s1 = 0
  let s2 = 0

  for (let i = 0; i < buffer.length; i++) {
    s0 = buffer[i] + coeff * s1 - s2
    s2 = s1
    s1 = s0
  }

  return Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2)
}

const analyzeCWTone = (
  buffer: Float32Array,
  sampleRate: number,
  minHz: number = 350,
  maxHz: number = 1400
): ToneAnalysis | null => {
  if (!buffer.length) return null

  const stepHz = 20
  const bins: Array<{ f: number; p: number }> = []
  let peakPower = 0
  let peakFreq = 0
  let sum = 0

  for (let f = minHz; f <= maxHz; f += stepHz) {
    const p = goertzelPower(buffer, f, sampleRate)
    bins.push({ f, p })
    sum += p
    if (p > peakPower) {
      peakPower = p
      peakFreq = f
    }
  }

  if (bins.length === 0) return null

  const avgPower = sum / bins.length
  const quality = peakPower > 0 && avgPower > 0 ? peakPower / avgPower : 0

  const halfPower = peakPower * 0.5
  const peakIdx = bins.findIndex((b) => b.f === peakFreq)
  let left = peakIdx
  let right = peakIdx
  while (left > 0 && bins[left - 1].p >= halfPower) left--
  while (right < bins.length - 1 && bins[right + 1].p >= halfPower) right++
  const bandwidthHz = Math.max(stepHz, bins[right].f - bins[left].f + stepHz)

  return {
    peakFreq,
    peakPower,
    avgPower,
    quality,
    bandwidthHz,
    recommendedBandwidthHz: clamp(Math.round(bandwidthHz * 1.8), 80, 420)
  }
}

const buildTuningAdvice = (
  analysis: ToneAnalysis | null,
  configuredToneHz: number,
): string => {
  if (!analysis || analysis.quality < 1.2) {
    return 'Weak CW tone lock. Tune for a clear single whistle around 600–900 Hz and reduce nearby signals if possible.'
  }

  const delta = Math.round(analysis.peakFreq - configuredToneHz)
  const absDelta = Math.abs(delta)

  if (absDelta > 120) {
    return `You are about ${absDelta} Hz off target. Auto-centering is helping, but tune VFO/RIT so the tone sits near ${configuredToneHz} Hz.`
  }
  if (absDelta > 40) {
    return `Close but not centered (${delta > 0 ? '+' : ''}${delta} Hz). Nudge tuning ${delta > 0 ? 'down' : 'up'} a little for better copy.`
  }

  return 'Good tone lock. If decode is still rough, narrow IF/RX bandwidth and keep the tone steady near center.'
}

interface CWDecoderProps {
  onCallsignDetected?: (callsign: string, confidence: number) => void
  onExchangeDetected?: (exchange: string) => void
  audioStream?: MediaStream
  compact?: boolean
}

export const CWDecoder: React.FC<CWDecoderProps> = ({
  onCallsignDetected,
  onExchangeDetected,
  audioStream,
  compact = false,
}) => {
  const [decodedText, setDecodedText] = useState<string>('')
  const [recentMessages, setRecentMessages] = useState<DecodedMessage[]>([])
  const [confidence, setConfidence] = useState<number>(0)
  const [isActive, setIsActive] = useState<boolean>(true)
  const [activeMode, setActiveMode] = useState<DigitalMode>('CW')
  const [wpm, setWpm] = useState<number>(20)
  const [toneFreq, setToneFreq] = useState<number>(800)
  const [toneWidth, setToneWidth] = useState<number>(180)
  const [estimatedWpm, setEstimatedWpm] = useState<number | null>(null)
  const [detectedToneHz, setDetectedToneHz] = useState<number | null>(null)
  const [detectedToneWidthHz, setDetectedToneWidthHz] = useState<number | null>(null)
  const [signalQuality, setSignalQuality] = useState<number>(0)
  const [tuningAdvice, setTuningAdvice] = useState<string>('Waiting for CW signal...')
  const audioContextRef = React.useRef<AudioContext | null>(null)
  const processorRef = React.useRef<ScriptProcessorNode | null>(null)
  const bandpassRef = React.useRef<BiquadFilterNode | null>(null)
  const analysisCounterRef = React.useRef<number>(0)
  const wpmRef = React.useRef<number>(wpm)
  const toneFreqRef = React.useRef<number>(toneFreq)
  const toneWidthRef = React.useRef<number>(toneWidth)
  const autoToneTrackRef = React.useRef<boolean>(true)
  const autoToneWidthRef = React.useRef<boolean>(true)
  const autoWpmTrackRef = React.useRef<boolean>(true)
  const lastWpmAutoAdjustMsRef = React.useRef<number>(0)

  useEffect(() => {
    wpmRef.current = wpm
  }, [wpm])

  useEffect(() => {
    toneFreqRef.current = toneFreq
  }, [toneFreq])

  useEffect(() => {
    toneWidthRef.current = toneWidth
  }, [toneWidth])

  useEffect(() => {
    const ctx = audioContextRef.current
    const bandpass = bandpassRef.current
    if (!ctx || !bandpass) return

    const q = clamp(toneFreq / Math.max(20, toneWidth), 0.5, 30)
    bandpass.frequency.setTargetAtTime(clamp(toneFreq, 300, 1800), ctx.currentTime, 0.03)
    bandpass.Q.setTargetAtTime(q, ctx.currentTime, 0.03)
  }, [toneFreq, toneWidth])

  // Set up audio pipeline when audioStream is provided
  useEffect(() => {
    if (!audioStream || !isActive) return

    // Create AudioContext if needed
    if (!audioContextRef.current) {
      const AudioContextCtor =
        window.AudioContext || (window as WindowWithWebkitAudioContext).webkitAudioContext
      if (!AudioContextCtor) {
        console.error('[CWDecoder] AudioContext API is unavailable in this browser')
        return
      }
      audioContextRef.current = new AudioContextCtor()
    }
    const audioContext = audioContextRef.current

    try {
      // Create source from the media stream
      const source = audioContext.createMediaStreamSource(audioStream)

      // Narrow the audio to the current CW pitch region before decoding
      const bandpass = audioContext.createBiquadFilter()
      bandpass.type = 'bandpass'
      bandpass.frequency.value = clamp(toneFreqRef.current, 300, 1800)
      bandpass.Q.value = clamp(toneFreqRef.current / Math.max(20, toneWidthRef.current), 0.5, 30)
      bandpassRef.current = bandpass

      // Create script processor to extract audio
      const processor = audioContext.createScriptProcessor(4096, 1, 1)

      processor.onaudioprocess = (event) => {
        if (!isActive) return
        
        // Extract audio data
        const inputData = event.inputBuffer.getChannelData(0)
        const audioBuffer = new Float32Array(inputData)
        const sampleRate = audioContext.sampleRate

        // Decode with active modem
        globalModemManager.decode(audioBuffer, sampleRate)

        analysisCounterRef.current += 1
        if (analysisCounterRef.current % 4 === 0) {
          const analysis = analyzeCWTone(audioBuffer, sampleRate)
          if (analysis) {
            const qualityNorm = clamp((analysis.quality - 1) / 7, 0, 1)
            setDetectedToneHz(Math.round(analysis.peakFreq))
            setDetectedToneWidthHz(Math.round(analysis.bandwidthHz))
            setSignalQuality(qualityNorm)
            setTuningAdvice(buildTuningAdvice(analysis, toneFreqRef.current))

            const modem = globalModemManager.getModem('CW')
            if (modem && autoToneTrackRef.current && analysis.quality >= 1.5) {
              const tuned = Math.round(
                toneFreqRef.current * 0.85 + clamp(analysis.peakFreq, 350, 1400) * 0.15
              )
              if (Math.abs(tuned - toneFreqRef.current) >= 3) {
                toneFreqRef.current = tuned
                setToneFreq(tuned)
                modem.setConfig({ toneFrequency: tuned })
              }
            }

            if (modem && autoToneWidthRef.current && analysis.quality >= 1.5) {
              const proposed = analysis.recommendedBandwidthHz
              const adjusted = Math.round(toneWidthRef.current * 0.8 + proposed * 0.2)
              const bounded = clamp(adjusted, 80, 420)
              if (Math.abs(bounded - toneWidthRef.current) >= 5) {
                toneWidthRef.current = bounded
                setToneWidth(bounded)
                modem.setConfig({ toneBandwidth: bounded })
              }
            }
          }
        }
        
        // The modem manager handles updating internal state
        // Component UI updates via the display interval below
      }

      // Connect the audio graph: stream → bandpass → processor → destination
      source.connect(bandpass)
      bandpass.connect(processor)
      processor.connect(audioContext.destination)

      processorRef.current = processor

      return () => {
        processor.disconnect()
        bandpass.disconnect()
        source.disconnect()
        bandpassRef.current = null
      }
    } catch (err) {
      console.error('[CWDecoder] Audio setup failed:', err)
    }
  }, [audioStream, isActive])

  // Update display from modem state
  useEffect(() => {
    const updateDisplay = () => {
      const state = globalModemManager.getState()
      const recent = state.recentMessages.slice(0, 1)
      const cwModem = globalModemManager.getModem('CW') as CWDecoderRuntimeModem | undefined
      const liveEstimatedWpm = typeof cwModem?.getEstimatedWpm === 'function'
        ? clamp(Math.round(cwModem.getEstimatedWpm()), 5, 70)
        : null
      const timingConfidence = typeof cwModem?.getTimingConfidence === 'function'
        ? clamp(cwModem.getTimingConfidence(), 0, 1)
        : 0

      if (liveEstimatedWpm) {
        setEstimatedWpm(liveEstimatedWpm)

        if (autoWpmTrackRef.current && timingConfidence >= 0.35) {
          const delta = Math.abs(liveEstimatedWpm - wpmRef.current)
          const now = Date.now()
          if (delta < 2 || now - lastWpmAutoAdjustMsRef.current < 450) {
            // Hold position for tiny differences and limit update rate
            return
          }

          const baseAlpha = delta >= 12 ? 0.22 : delta >= 7 ? 0.16 : delta >= 3 ? 0.11 : 0.07
          const alpha = baseAlpha * timingConfidence
          const newWpm = clamp(
            Math.round(wpmRef.current * (1 - alpha) + liveEstimatedWpm * alpha),
            5,
            70
          )
          if (Math.abs(newWpm - wpmRef.current) >= 1) {
            wpmRef.current = newWpm
            lastWpmAutoAdjustMsRef.current = now
            setWpm(newWpm)
            const modem = globalModemManager.getModem('CW')
            if (modem) {
              modem.setConfig({ wpm: newWpm })
            }
          }
        }
      }

      if (recent.length > 0) {
        const msg = recent[0]
        setDecodedText(msg.text)
        setConfidence(msg.confidence)

        if (typeof msg.wpm === 'number' && Number.isFinite(msg.wpm)) {
          const bounded = clamp(Math.round(msg.wpm), 5, 70)
          setEstimatedWpm(bounded)
        }

        // Try to extract callsign (simple pattern: alphanumeric + numbers)
        const callsignMatch = msg.text.match(/([A-Z0-9]{2,7})/)
        if (callsignMatch && onCallsignDetected) {
          onCallsignDetected(callsignMatch[1], msg.confidence)
        }

        if (onExchangeDetected) {
          const parts = msg.text.trim().split(/\s+/)
          if (parts.length > 1) {
            onExchangeDetected(parts.slice(1).join(' '))
          }
        }
      }

      setRecentMessages(state.recentMessages)
      setActiveMode(state.activeMode)
    }

    const interval = setInterval(updateDisplay, 100)
    return () => clearInterval(interval)
  }, [onCallsignDetected, onExchangeDetected])

  const handleModeChange = (mode: DigitalMode) => {
    globalModemManager.setActiveMode(mode)
    setActiveMode(mode)
  }

  const toggleDecoder = () => {
    setIsActive(!isActive)
  }

  const clearHistory = () => {
    globalModemManager.clearMessages()
    globalModemManager.resetStats()
    const modem = globalModemManager.getModem('CW') as { reset?: () => void } | undefined
    if (modem && typeof modem.reset === 'function') {
      modem.reset()
    }
    setDecodedText('')
    setRecentMessages([])
    setConfidence(0)
    setEstimatedWpm(null)
    setDetectedToneHz(null)
    setDetectedToneWidthHz(null)
    setSignalQuality(0)
    setTuningAdvice('Waiting for CW signal...')
  }

  const transcriptLines = formatDecodedTranscript(decodedText)

  return (
    <div className={`cw-decoder${compact ? ' compact' : ''}`}>
      <div className="decoder-header">
        <h3>📡 CW & Digital Decoder</h3>
        <button
          className={`decoder-toggle ${isActive ? 'active' : ''}`}
          onClick={toggleDecoder}
        >
          {isActive ? '🟢 Active' : '⚫ Inactive'}
        </button>
      </div>

      {!compact && (
        <div className="decoder-mode-selector">
          <label>Mode</label>
          <select value={activeMode} onChange={(e) => handleModeChange(e.target.value as DigitalMode)}>
            <option value="CW">CW</option>
            <option value="FT8" disabled>
              FT8 (coming soon)
            </option>
            <option value="FT4" disabled>
              FT4 (coming soon)
            </option>
            <option value="PSK31" disabled>
              PSK31 (coming soon)
            </option>
          </select>
        </div>
      )}

      {activeMode === 'CW' && (
        <div className="decoder-cw-controls">
          <div className="decoder-info-panel">
            <div className="decoder-status-grid">
              <div className="status-row">
                <span>Configured WPM:</span>
                <strong>{wpm}</strong>
              </div>
              <div className="status-row">
                <span>RX estimate:</span>
                <strong>{estimatedWpm ? `${estimatedWpm} WPM` : '---'}</strong>
              </div>
              <div className="status-row">
                <span>Tone center:</span>
                <strong>{toneFreq} Hz</strong>
              </div>
              <div className="status-row">
                <span>Tone width:</span>
                <strong>{toneWidth} Hz</strong>
              </div>
              <div className="status-row">
                <span>Tracking:</span>
                <strong>Auto</strong>
              </div>
              <div className="status-row">
                <span>Detected tone:</span>
                <strong>{detectedToneHz ? `${detectedToneHz} Hz` : '---'}</strong>
              </div>
              <div className="status-row">
                <span>Detected width:</span>
                <strong>{detectedToneWidthHz ? `${detectedToneWidthHz} Hz` : '---'}</strong>
              </div>
              <div className="status-row">
                <span>Signal quality:</span>
                <strong>{Math.round(signalQuality * 100)}%</strong>
              </div>
            </div>
            <div className="advisor-text">{tuningAdvice}</div>
          </div>
        </div>
      )}

      <div className="decoder-output">
        <div className="decoded-text">
          <div className="decoded-header">
            <strong>Decoded:</strong>
            <button className="clear-btn" onClick={clearHistory} type="button">
              Clear Decode
            </button>
          </div>
          <div className="text-display">
            {transcriptLines.length === 0 ? (
              '(waiting for signal...)'
            ) : (
              transcriptLines.map((line, lineIdx) => (
                <div key={`line-${lineIdx}`} className="decode-line">
                  {line.map((part, partIdx) => (
                    <span
                      key={`part-${lineIdx}-${partIdx}`}
                      className={`decode-part ${part.type}`}
                    >
                      {part.type === 'callsign' ? `[${part.token}]` : part.token}
                    </span>
                  ))}
                </div>
              ))
            )}
          </div>
          <div className="confidence-bar">
            <div className="bar-fill" style={{ width: `${confidence * 100}%` }} />
            <span className="confidence-label">{(confidence * 100).toFixed(0)}%</span>
          </div>
        </div>
      </div>

      {!compact && <div className="decoder-history">
        <div className="history-header">
          <h4>Recent Decodes</h4>
          <button className="clear-btn" onClick={clearHistory}>
            Clear
          </button>
        </div>
        <div className="history-list">
          {recentMessages.length === 0 ? (
            <div className="empty-state">No messages decoded yet</div>
          ) : (
            recentMessages.slice(0, 10).map((msg, idx) => (
              <div key={idx} className="history-item">
                <span className="history-text">{msg.text}</span>
                <span className="history-confidence">{(msg.confidence * 100).toFixed(0)}%</span>
                <span className="history-time">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))
          )}
        </div>
      </div>}
    </div>
  )
}
