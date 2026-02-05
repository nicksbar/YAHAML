import { useEffect, useState, useRef } from 'react'
import '../styles/LoggingPage.css'
import { QSOEntryForm } from './QSOEntryForm'
import { LiveQSOFeed } from './LiveQSOFeed'
import { BandOccupancy } from './BandOccupancy'
import { StatsPanel } from './StatsPanel'
import { useLoggingContext } from '../hooks/useLoggingContext'
import { useQSOSubmit } from '../hooks/useQSOSubmit'

interface LoggingPageProps {
  stationId: string
  isActive?: boolean
}

export function LoggingPage({ stationId, isActive = true }: LoggingPageProps) {
  const { contest, stations, loading, error } = useLoggingContext({ pollInterval: 5000 })
  const { submit, loading: submitting, error: submitError } = useQSOSubmit({
    contestId: contest?.id,
  })
  const [lastQsoId, setLastQsoId] = useState<string | null>(null)
  const [assignedRadio, setAssignedRadio] = useState<any | null>(null)
  const [radioState, setRadioState] = useState<any | null>(null)
  const [radioError, setRadioError] = useState<string | null>(null)
  const [ws, setWs] = useState<WebSocket | null>(null)
  const [radioAudioMuted, setRadioAudioMuted] = useState(false)
  const [radioAudioVolume, setRadioAudioVolume] = useState(100)
  const [radioAudioPtt, setRadioAudioPtt] = useState(false)
  const radioAudioRef = useRef<HTMLAudioElement | null>(null)
  const janusConnectionRef = useRef<any | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const loopbackNodesRef = useRef<{
    whiteNoise?: AudioBufferSourceNode
    micInput?: MediaStreamAudioSourceNode
    micGain?: GainNode
    masterGain?: GainNode
    cwOscillator?: OscillatorNode
    cwGain?: GainNode
    cwInterval?: NodeJS.Timeout
    keepAliveInterval?: NodeJS.Timeout
    visibilityCleanup?: () => void
    // Advanced audio processing
    lowFilter?: BiquadFilterNode
    midFilter?: BiquadFilterNode
    highFilter?: BiquadFilterNode
    compressor?: DynamicsCompressorNode
    noiseGate?: GainNode
    analyzer?: AnalyserNode
  }>({})
  const [bassGain, setBassGain] = useState(0)
  const [midGain, setMidGain] = useState(0)
  const [trebleGain, setTrebleGain] = useState(0)
  const [compressionEnabled, setCompressionEnabled] = useState(false)
  const [noiseGateEnabled, setNoiseGateEnabled] = useState(false)
  const [noiseGateThreshold, setNoiseGateThreshold] = useState(-50)
  const [showAdvancedControls, setShowAdvancedControls] = useState(false)
  const [keepAudioAlive, setKeepAudioAlive] = useState(
    localStorage.getItem('yahaml:keepAudioAlive') !== 'false' // default true
  )
  const keepAudioAliveRef = useRef(keepAudioAlive)

  const token = localStorage.getItem('yahaml:sessionToken')
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {}

  const formatFrequencyMHz = (freq?: string | null) => {
    if (!freq) return '---.---'
    const value = parseFloat(freq)
    if (Number.isNaN(value)) return '---.---'
    return (value / 1_000_000).toFixed(3)
  }

  useEffect(() => {
    if (!isActive) return
    const callsign = localStorage.getItem('yahaml:callsign') || 'Not set'
    const frequency = radioState?.frequency ? `${formatFrequencyMHz(String(radioState.frequency))} MHz` : '---.--- MHz'
    const mode = radioState?.mode ? String(radioState.mode).toUpperCase() : '---'
    document.title = `YAHAML — ${callsign} — ${frequency} ${mode}`
  }, [radioState?.frequency, radioState?.mode, isActive])

  // Morse code patterns (dit = 1 unit, dah = 3 units, gap = 1 unit, letter gap = 3 units)
  const morseCode: Record<string, string> = {
    'A': '.-',     'B': '-...',   'C': '-.-.',   'D': '-..',
    'E': '.',      'F': '..-.',   'G': '--.',    'H': '....',
    'I': '..',     'J': '.---',   'K': '-.-',    'L': '.-..',
    'M': '--',     'N': '-.',     'O': '---',    'P': '.--.',
    'Q': '--.-',   'R': '.-.',    'S': '...',    'T': '-',
    'U': '..-',    'V': '...-',   'W': '.--',    'X': '-..-',
    'Y': '-.--',   'Z': '--..',
    '0': '-----',  '1': '.----',  '2': '..---',  '3': '...--',
    '4': '....-',  '5': '.....',  '6': '-....',  '7': '--...',
    '8': '---..',  '9': '----.',
  }

  // Generate white noise for radio static
  const createWhiteNoise = (ctx: AudioContext): AudioBufferSourceNode => {
    const bufferSize = ctx.sampleRate * 2 // 2 seconds of noise
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * 0.1 // Low volume static
    }
    const source = ctx.createBufferSource()
    source.buffer = buffer
    source.loop = true
    return source
  }

  // Play CW morse code
  const playCW = async (text: string, ctx: AudioContext, destination: AudioNode) => {
    const ditDuration = 80 // ms
    const frequency = 700 // Hz

    const osc = ctx.createOscillator()
    const gainNode = ctx.createGain()
    
    osc.type = 'sine'
    osc.frequency.value = frequency
    osc.connect(gainNode)
    gainNode.connect(destination)
    
    osc.start()
    gainNode.gain.value = 0

    let time = 0
    for (const char of text.toUpperCase()) {
      const pattern = morseCode[char]
      if (!pattern) continue

      for (const symbol of pattern) {
        // Key down
        gainNode.gain.setValueAtTime(0.3, ctx.currentTime + time / 1000)
        
        // Hold for dit or dah duration
        if (symbol === '.') {
          time += ditDuration
        } else if (symbol === '-') {
          time += ditDuration * 3
        }
        
        // Key up (after the tone duration)
        gainNode.gain.setValueAtTime(0, ctx.currentTime + time / 1000)
        time += ditDuration // gap between elements (inter-element gap)
      }
      
      time += ditDuration * 2 // gap between letters (total 3 units including the 1 from above)
    }

    // Stop oscillator after all morse is played
    setTimeout(() => {
      osc.stop()
    }, time + 100)
  }

  useEffect(() => {
    keepAudioAliveRef.current = keepAudioAlive
  }, [keepAudioAlive])

  // Setup loopback audio (static + CW + mic echo)
  const setupLoopbackAudio = async () => {
    try {
      const ctx = new AudioContext()
      audioContextRef.current = ctx

      // Keep audio context alive when tab is hidden (if enabled)
      const handleVisibilityChange = () => {
        if (keepAudioAliveRef.current && ctx.state === 'suspended') {
          ctx.resume()
          console.log('[AUDIO] Resumed audio context (tab became visible)')
        }
      }
      document.addEventListener('visibilitychange', handleVisibilityChange)

      const keepAliveInterval = setInterval(() => {
        if (keepAudioAliveRef.current && ctx.state === 'suspended') {
          ctx.resume()
          console.log('[AUDIO] Resumed audio context (keep-alive)')
        }
      }, 5000)
      loopbackNodesRef.current.keepAliveInterval = keepAliveInterval
      
      // Store cleanup function
      loopbackNodesRef.current.visibilityCleanup = () => {
        document.removeEventListener('visibilitychange', handleVisibilityChange)
      }

      // Create audio processing chain: source -> EQ -> compressor -> noise gate -> master gain -> destination
      
      // 3-band EQ
      const lowFilter = ctx.createBiquadFilter()
      lowFilter.type = 'lowshelf'
      lowFilter.frequency.value = 200
      lowFilter.gain.value = bassGain

      const midFilter = ctx.createBiquadFilter()
      midFilter.type = 'peaking'
      midFilter.frequency.value = 1000
      midFilter.Q.value = 0.5
      midFilter.gain.value = midGain

      const highFilter = ctx.createBiquadFilter()
      highFilter.type = 'highshelf'
      highFilter.frequency.value = 3000
      highFilter.gain.value = trebleGain

      // Compressor
      const compressor = ctx.createDynamicsCompressor()
      compressor.threshold.value = -24
      compressor.knee.value = 30
      compressor.ratio.value = 12
      compressor.attack.value = 0.003
      compressor.release.value = 0.25

      // Noise gate (using gain node)
      const noiseGate = ctx.createGain()
      noiseGate.gain.value = 1

      // Analyzer for level detection
      const analyzer = ctx.createAnalyser()
      analyzer.fftSize = 256

      // Master gain
      const masterGain = ctx.createGain()
      masterGain.gain.value = radioAudioVolume / 100

      // Connect processing chain
      lowFilter.connect(midFilter)
      midFilter.connect(highFilter)
      highFilter.connect(compressor)
      compressor.connect(noiseGate)
      noiseGate.connect(analyzer)
      analyzer.connect(masterGain)
      masterGain.connect(ctx.destination)

      // Store nodes
      loopbackNodesRef.current.lowFilter = lowFilter
      loopbackNodesRef.current.midFilter = midFilter
      loopbackNodesRef.current.highFilter = highFilter
      loopbackNodesRef.current.compressor = compressor
      loopbackNodesRef.current.noiseGate = noiseGate
      loopbackNodesRef.current.analyzer = analyzer
      loopbackNodesRef.current.masterGain = masterGain

      console.log('[AUDIO] Loopback audio chain initialized with advanced processing')

      // 1. White noise (radio static)
      const whiteNoise = createWhiteNoise(ctx)
      const noiseGainNode = ctx.createGain()
      noiseGainNode.gain.value = 0.15 // Subtle background static
      whiteNoise.connect(noiseGainNode)
      noiseGainNode.connect(lowFilter) // Connect to EQ chain
      whiteNoise.start()
      loopbackNodesRef.current.whiteNoise = whiteNoise
      console.log('[AUDIO] White noise generator started')

      // 2. Microphone input (parrot/echo)
      try {
        console.log('[AUDIO] Requesting microphone access...')
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const micSource = ctx.createMediaStreamSource(stream)
        const micGain = ctx.createGain()
        micGain.gain.value = 0 // Start muted - use PTT to enable
        micSource.connect(micGain)
        micGain.connect(lowFilter) // Connect to EQ chain
        loopbackNodesRef.current.micInput = micSource
        loopbackNodesRef.current.micGain = micGain
        console.log('[AUDIO] Microphone connected to loopback (muted - use PTT)')
      } catch (err) {
        console.warn('[AUDIO] Microphone access denied:', err)
      }

      // 3. Periodic CW callsign (N7U)
      const playCWPeriodically = () => {
        console.log('[AUDIO] Playing CW: Contributors...')
        playCW('N7UF', ctx, lowFilter) // Connect CW to EQ chain
      }

      // Play immediately, then every 15-30 seconds
      playCWPeriodically()
      const cwInterval = setInterval(() => {
        const delay = 15000 + Math.random() * 15000 // 15-30 seconds
        setTimeout(playCWPeriodically, delay)
      }, 30000)
      
      loopbackNodesRef.current.cwInterval = cwInterval

    } catch (err) {
      console.error('Failed to setup loopback audio:', err)
      setRadioError('Failed to setup loopback audio')
    }
  }

  // Teardown loopback audio
  const teardownLoopbackAudio = () => {
    if (loopbackNodesRef.current.whiteNoise) {
      loopbackNodesRef.current.whiteNoise.stop()
    }
    if (loopbackNodesRef.current.cwInterval) {
      clearInterval(loopbackNodesRef.current.cwInterval)
    }
    if (loopbackNodesRef.current.keepAliveInterval) {
      clearInterval(loopbackNodesRef.current.keepAliveInterval)
    }
    if (loopbackNodesRef.current.micInput) {
      loopbackNodesRef.current.micInput.mediaStream.getTracks().forEach(track => track.stop())
    }
    if (loopbackNodesRef.current.visibilityCleanup) {
      loopbackNodesRef.current.visibilityCleanup()
    }
    if (audioContextRef.current) {
      audioContextRef.current.close()
      audioContextRef.current = null
    }
    loopbackNodesRef.current = {}
  }

  const fetchAssignedRadio = async () => {
    if (!token) return
    try {
      const response = await fetch('/api/radio-assignments/me', { headers: authHeaders })
      if (response.ok) {
        const data = await response.json()
        setAssignedRadio(data)
        setRadioError(null)
        // Update with latest state from radio (if available)
        if (data?.radio?.id) {
          setRadioState({
            frequency: data.radio.frequency,
            mode: data.radio.mode,
            bandwidth: data.radio.bandwidth,
            power: data.radio.power,
            ptt: data.radio.ptt,
          })
        }
      } else {
        const data = await response.json().catch(() => ({}))
        setRadioError(data.error || 'Failed to load radio assignment')
      }
    } catch (err) {
      setRadioError(err instanceof Error ? err.message : 'Failed to load radio assignment')
    }
  }

  const togglePtt = async (radioId: string, enabled: boolean) => {
    if (!token) return
    try {
      await fetch(`/api/radios/${radioId}/ptt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders },
        body: JSON.stringify({ enabled }),
      })
    } catch (err) {
      setRadioError(err instanceof Error ? err.message : 'Failed to set PTT')
    }
  }

  const toggleRadioAudioMute = () => {
    setRadioAudioMuted(!radioAudioMuted)
    if (radioAudioRef.current) {
      radioAudioRef.current.muted = !radioAudioMuted
    }
    if (loopbackNodesRef.current.masterGain) {
      loopbackNodesRef.current.masterGain.gain.value = radioAudioMuted ? (radioAudioVolume / 100) : 0
    }
  }

  const toggleRadioAudioPtt = async () => {
    if (!assignedRadio?.radio?.id) return
    const newPttState = !radioAudioPtt
    setRadioAudioPtt(newPttState)
    
    // For loopback mode, control the microphone gain
    if (assignedRadio.radio.audioSourceType === 'loopback' && loopbackNodesRef.current.micGain) {
      if (newPttState) {
        // PTT pressed - enable mic
        loopbackNodesRef.current.micGain.gain.value = 0.5
        console.log('[AUDIO] PTT ON - mic enabled')
      } else {
        // PTT released - mute mic
        loopbackNodesRef.current.micGain.gain.value = 0
        console.log('[AUDIO] PTT OFF - mic muted')
      }
    }
    
    // Also notify radio backend
    await togglePtt(assignedRadio.radio.id, newPttState)
  }

  const updateRadioAudioVolume = (newVolume: number) => {
    const vol = Math.max(0, Math.min(100, newVolume))
    setRadioAudioVolume(vol)
    if (radioAudioRef.current) {
      radioAudioRef.current.volume = vol / 100
    }
    if (loopbackNodesRef.current.masterGain && !radioAudioMuted) {
      loopbackNodesRef.current.masterGain.gain.value = vol / 100
    }
  }

  // Setup audio stream for assigned radio
  const setupRadioAudio = () => {
    if (!assignedRadio?.radio) return

    const radio = assignedRadio.radio
    
    // Clean up existing audio
    teardownRadioAudio()

    if (radio.audioSourceType === 'loopback') {
      // Loopback mode - static + CW + mic echo
      setupLoopbackAudio()
    } else if (radio.audioSourceType === 'http-stream' && radio.httpStreamUrl) {
      // HTTP stream - simple audio element
      const audio = new Audio(radio.httpStreamUrl)
      audio.volume = radioAudioVolume / 100
      audio.muted = radioAudioMuted
      audio.autoplay = true
      audio.loop = false
      radioAudioRef.current = audio
      
      audio.play().catch(err => {
        console.error('Failed to play HTTP stream:', err)
        setRadioError('Failed to play audio stream. Click to enable.')
      })
    } else if (radio.audioSourceType === 'janus' && radio.janusRoomId) {
      // Janus Gateway - would need Janus client library
      console.log('Janus audio source configured:', { room: radio.janusRoomId, stream: radio.janusStreamId })
      // TODO: Implement Janus client connection
      // This would involve connecting to Janus WebRTC gateway
      // and subscribing to the audiobridge room/stream
    }
  }

  // Teardown audio stream
  const teardownRadioAudio = () => {
    teardownLoopbackAudio()
    if (radioAudioRef.current) {
      radioAudioRef.current.pause()
      radioAudioRef.current.src = ''
      radioAudioRef.current = null
    }
    if (janusConnectionRef.current) {
      // TODO: Cleanup Janus connection
      janusConnectionRef.current = null
    }
  }

  // Initialize WebSocket connection
  useEffect(() => {
    if (!token) return

    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
    const wsUrl = `${protocol}://${window.location.host}/ws`
    const websocket = new WebSocket(wsUrl)

    websocket.onopen = () => {
      console.log('WebSocket connected to radio channel')
      // Subscribe to radio channel
      websocket.send(JSON.stringify({ type: 'subscribe', channel: 'radio' }))
    }

    websocket.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'radioStateUpdate') {
          // Only update if this is our assigned radio
          if (assignedRadio?.radio?.id === message.data.radioId) {
            const state = message.data.state
            setRadioState({
              frequency: state.frequency,
              mode: state.mode,
              bandwidth: state.bandwidth,
              power: state.power,
              ptt: state.ptt,
              vfo: state.vfo,
              isConnected: state.isConnected,
              lastError: state.lastError,
            })
          }
        }
      } catch (error) {
        console.error('WebSocket message parse error:', error)
      }
    }

    websocket.onerror = (error) => {
      console.error('WebSocket error:', error)
    }

    websocket.onclose = () => {
      console.log('WebSocket disconnected')
    }

    setWs(websocket)

    return () => {
      if (websocket.readyState === WebSocket.OPEN) {
        websocket.close()
      }
    }
  }, [token])

  useEffect(() => {
    fetchAssignedRadio()
  }, [token])

  // Setup/teardown radio audio when assigned radio changes
  useEffect(() => {
    if (assignedRadio?.radio?.audioSourceType) {
      setupRadioAudio()
    }
    return () => {
      teardownRadioAudio()
    }
  }, [assignedRadio?.radio?.id, assignedRadio?.radio?.audioSourceType, assignedRadio?.radio?.httpStreamUrl, assignedRadio?.radio?.janusRoomId])

  // Update audio volume/mute when controls change
  useEffect(() => {
    if (radioAudioRef.current) {
      radioAudioRef.current.volume = radioAudioVolume / 100
      radioAudioRef.current.muted = radioAudioMuted
    }
  }, [radioAudioVolume, radioAudioMuted])

  // Update EQ when bass/mid/treble change
  useEffect(() => {
    if (loopbackNodesRef.current.lowFilter) {
      loopbackNodesRef.current.lowFilter.gain.value = bassGain
      console.log(`[AUDIO] Bass updated: ${bassGain}dB`)
    }
  }, [bassGain])

  useEffect(() => {
    if (loopbackNodesRef.current.midFilter) {
      loopbackNodesRef.current.midFilter.gain.value = midGain
      console.log(`[AUDIO] Mid updated: ${midGain}dB`)
    }
  }, [midGain])

  useEffect(() => {
    if (loopbackNodesRef.current.highFilter) {
      loopbackNodesRef.current.highFilter.gain.value = trebleGain
      console.log(`[AUDIO] Treble updated: ${trebleGain}dB`)
    }
  }, [trebleGain])

  // Update compressor bypass
  useEffect(() => {
    if (loopbackNodesRef.current.compressor && loopbackNodesRef.current.highFilter && loopbackNodesRef.current.noiseGate) {
      // Disconnect and reconnect to bypass or enable compressor
      try {
        loopbackNodesRef.current.highFilter.disconnect()
        if (compressionEnabled) {
          loopbackNodesRef.current.highFilter.connect(loopbackNodesRef.current.compressor)
          loopbackNodesRef.current.compressor.disconnect()
          loopbackNodesRef.current.compressor.connect(loopbackNodesRef.current.noiseGate)
          console.log('[AUDIO] Compressor enabled')
        } else {
          loopbackNodesRef.current.highFilter.connect(loopbackNodesRef.current.noiseGate)
          console.log('[AUDIO] Compressor bypassed')
        }
      } catch (err) {
        console.warn('[AUDIO] Failed to toggle compressor:', err)
      }
    }
  }, [compressionEnabled])

  // Update noise gate
  useEffect(() => {
    if (loopbackNodesRef.current.noiseGate && loopbackNodesRef.current.analyzer) {
      if (noiseGateEnabled) {
        console.log(`[AUDIO] Noise gate enabled, threshold: ${noiseGateThreshold}dB`)
        // Start monitoring audio level
        const checkLevel = () => {
          if (!noiseGateEnabled || !loopbackNodesRef.current.analyzer) return
          
          const dataArray = new Uint8Array(loopbackNodesRef.current.analyzer.frequencyBinCount)
          loopbackNodesRef.current.analyzer.getByteFrequencyData(dataArray)
          
          // Calculate RMS level
          const sum = dataArray.reduce((a, b) => a + b, 0)
          const avg = sum / dataArray.length
          const dbLevel = 20 * Math.log10(avg / 255) // Convert to dB
          
          // Apply gate
          if (dbLevel < noiseGateThreshold) {
            loopbackNodesRef.current.noiseGate!.gain.value = 0
          } else {
            loopbackNodesRef.current.noiseGate!.gain.value = 1
          }
          
          requestAnimationFrame(checkLevel)
        }
        checkLevel()
      } else {
        loopbackNodesRef.current.noiseGate.gain.value = 1
        console.log('[AUDIO] Noise gate disabled')
      }
    }
  }, [noiseGateEnabled, noiseGateThreshold])

  if (loading) {
    return (
      <div className="logging-page">
        <div className="loading-state">Loading contest and stations...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="logging-page">
        <div className="error-state">Error: {error}</div>
      </div>
    )
  }

  const handleSubmit = async (qsoData: any) => {
    const result = await submit({
      ...qsoData,
      contestId: contest?.id,
    })

    if (result.success && result.id) {
      setLastQsoId(result.id)
      // Clear the ID after a short delay
      setTimeout(() => setLastQsoId(null), 2000)
    } else if (result.errors) {
      // Errors are shown in the form component
      console.error('QSO validation failed:', result.errors)
    }
  }

  return (
    <div className="logging-page">
      {submitError && (
        <div className="submit-error">
          <span>Error: {submitError}</span>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      )}

      <div className="logging-layout">
        {/* Main Logging Form */}
        <div className="logging-column main">
          <QSOEntryForm
            stations={stations}
            stationId={stationId}
            activeContest={contest || undefined}
            onSubmit={handleSubmit}
            loading={submitting}
          />

          {/* Live QSO Feed */}
          <LiveQSOFeed contestId={contest?.id} maxEntries={15} />
        </div>

        {/* Right Sidebar: Stats & Band Occupancy */}
        <div className="logging-column sidebar">
          <section className="panel compact-radio">
            <div className="compact-radio-header">
              <h3>📻 Assigned Radio</h3>
              {assignedRadio?.radio?.isConnected ? (
                <span className="status-pill connected">Connected</span>
              ) : (
                <span className="status-pill disconnected">Disconnected</span>
              )}
            </div>
            {radioError && <div className="compact-radio-error">{radioError}</div>}
            {!assignedRadio && (
              <div className="compact-radio-empty">
                <p>No radio assigned to this callsign.</p>
                <span>Assign one in the Radio Control screen.</span>
              </div>
            )}
            {assignedRadio?.radio && (
              <div className="compact-radio-body">
                <div className="compact-radio-frequency">
                  {formatFrequencyMHz(radioState?.frequency)}
                  <span className="compact-radio-unit">MHz</span>
                </div>
                <div className="compact-radio-meta">
                  <span>{radioState?.mode || '---'}</span>
                  <span>{radioState?.vfo || 'VFO?'}</span>
                  <span>{radioState?.power != null ? `${radioState.power}W` : '---'}</span>
                </div>
                <div className="compact-radio-actions">
                  <button
                    className={`btn ${radioState?.ptt ? 'danger' : 'primary'}`}
                    onClick={() => togglePtt(assignedRadio.radio.id, !radioState?.ptt)}
                  >
                    {radioState?.ptt ? 'TX' : 'RX'}
                  </button>
                </div>

                {/* Radio Audio Controls */}
                <div className="radio-audio-section">
                  <div className="radio-audio-header">
                    <span className="radio-audio-label">🔊 Audio</span>
                    <div className="radio-audio-header-buttons">
                      <button
                        className={`radio-audio-ptt ${radioAudioPtt ? 'active' : ''}`}
                        onClick={toggleRadioAudioPtt}
                        title={radioAudioPtt ? 'Release PTT' : 'Press PTT'}
                      >
                        {radioAudioPtt ? '📡 TX' : '🎤 PTT'}
                      </button>
                      <button
                        className={`radio-audio-mute ${radioAudioMuted ? 'muted' : ''}`}
                        onClick={toggleRadioAudioMute}
                        title={radioAudioMuted ? 'Unmute' : 'Mute'}
                      >
                        {radioAudioMuted ? '🔇' : '🔊'}
                      </button>
                    </div>
                  </div>
                  <div className="radio-audio-controls">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={radioAudioVolume}
                      onChange={(e) => updateRadioAudioVolume(parseInt(e.target.value))}
                      className="radio-audio-slider"
                      disabled={radioAudioMuted}
                    />
                    <span className="radio-audio-label-value">{radioAudioVolume}%</span>
                  </div>

                  {/* Keep Audio Alive Toggle */}
                  <div className="radio-audio-keep-alive">
                    <label className="audio-control-checkbox">
                      <input
                        type="checkbox"
                        checked={keepAudioAlive}
                        onChange={(e) => {
                          const enabled = e.target.checked
                          setKeepAudioAlive(enabled)
                          localStorage.setItem('yahaml:keepAudioAlive', enabled.toString())
                          console.log('[AUDIO] Keep audio alive:', enabled)
                        }}
                      />
                      <span>Keep audio alive when tab hidden</span>
                    </label>
                  </div>

                  {/* Advanced Audio Controls (Loopback Only) */}
                  {assignedRadio.radio.audioSourceType === 'loopback' && (
                    <div className="radio-audio-advanced">
                      <button
                        className="radio-audio-advanced-toggle"
                        onClick={() => setShowAdvancedControls(!showAdvancedControls)}
                      >
                        {showAdvancedControls ? '▼' : '▶'} Advanced
                      </button>

                      {showAdvancedControls && (
                        <div className="radio-audio-advanced-panel">
                          {/* 3-Band Equalizer */}
                          <div className="audio-control-group">
                            <label className="audio-control-label">Equalizer</label>
                            <div className="audio-eq-controls">
                              <div className="audio-eq-band">
                                <label>Bass</label>
                                <input
                                  type="range"
                                  min="-12"
                                  max="12"
                                  step="1"
                                  value={bassGain}
                                  onChange={(e) => setBassGain(parseInt(e.target.value))}
                                  className="audio-slider"
                                />
                                <span>{bassGain > 0 ? '+' : ''}{bassGain}dB</span>
                              </div>
                              <div className="audio-eq-band">
                                <label>Mid</label>
                                <input
                                  type="range"
                                  min="-12"
                                  max="12"
                                  step="1"
                                  value={midGain}
                                  onChange={(e) => setMidGain(parseInt(e.target.value))}
                                  className="audio-slider"
                                />
                                <span>{midGain > 0 ? '+' : ''}{midGain}dB</span>
                              </div>
                              <div className="audio-eq-band">
                                <label>Treble</label>
                                <input
                                  type="range"
                                  min="-12"
                                  max="12"
                                  step="1"
                                  value={trebleGain}
                                  onChange={(e) => setTrebleGain(parseInt(e.target.value))}
                                  className="audio-slider"
                                />
                                <span>{trebleGain > 0 ? '+' : ''}{trebleGain}dB</span>
                              </div>
                            </div>
                          </div>

                          {/* Compressor */}
                          <div className="audio-control-group">
                            <label className="audio-control-checkbox">
                              <input
                                type="checkbox"
                                checked={compressionEnabled}
                                onChange={(e) => setCompressionEnabled(e.target.checked)}
                              />
                              <span>Compressor (normalize levels)</span>
                            </label>
                          </div>

                          {/* Noise Gate */}
                          <div className="audio-control-group">
                            <label className="audio-control-checkbox">
                              <input
                                type="checkbox"
                                checked={noiseGateEnabled}
                                onChange={(e) => setNoiseGateEnabled(e.target.checked)}
                              />
                              <span>Noise Gate</span>
                            </label>
                            {noiseGateEnabled && (
                              <div className="audio-control-slider">
                                <label>Threshold</label>
                                <input
                                  type="range"
                                  min="-60"
                                  max="0"
                                  step="1"
                                  value={noiseGateThreshold}
                                  onChange={(e) => setNoiseGateThreshold(parseInt(e.target.value))}
                                  className="audio-slider"
                                />
                                <span>{noiseGateThreshold}dB</span>
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* Statistics Panel */}
          {contest && <StatsPanel contestId={contest.id} />}

          {/* Band Occupancy */}
          <BandOccupancy />
        </div>
      </div>

      {/* Success Toast */}
      {lastQsoId && (
        <div className="toast success">
          ✓ QSO logged successfully! (ID: {lastQsoId})
        </div>
      )}
    </div>
  )
}
