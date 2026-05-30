import { useEffect, useState, useRef } from 'react'
import '../styles/LoggingPage.css'
import { QSOEntryForm } from './QSOEntryForm'
import { LiveQSOFeed } from './LiveQSOFeed'
import { LogManagementPanel } from './LogManagementPanel'
import { BandOccupancy } from './BandOccupancy'
import { StatsPanel } from './StatsPanel'
import { useLoggingContext } from '../hooks/useLoggingContext'
import { useQSOSubmit } from '../hooks/useQSOSubmit'

interface LoggingPageProps {
  stationId: string
  isActive?: boolean
}

type LoggingTab = 'standard' | 'gota'

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
  const [radioAudioMuted, setRadioAudioMuted] = useState(() => localStorage.getItem('yahaml:radioAudioMuted') === 'true')
  const [radioAudioVolume, setRadioAudioVolume] = useState(() => {
    const raw = Number(localStorage.getItem('yahaml:radioAudioVolume') || '100')
    if (!Number.isFinite(raw)) return 100
    return Math.max(0, Math.min(100, Math.round(raw)))
  })
  const [radioAudioPtt, setRadioAudioPtt] = useState(() => localStorage.getItem('yahaml:radioAudioPtt') === 'true')
  const [janusStatus, setJanusStatus] = useState<'idle' | 'connecting' | 'connected' | 'error'>('idle')
  const [janusTransportStats, setJanusTransportStats] = useState<{
    iceState: string
    connectionState: string
    remoteAudioTracks: number
    bytesReceived: number
    packetsReceived: number
  } | null>(null)
  const radioAudioRef = useRef<HTMLAudioElement | null>(null)
  const janusConnectionRef = useRef<any | null>(null)
  const janusPollAbortRef = useRef<AbortController | null>(null)
  const janusUnlockPlaybackRef = useRef<(() => void) | null>(null)
  const syncingSharedAudioRef = useRef(false)
  const assignedRadioIdRef = useRef<string | null>(null)
  const applyingBandModeRef = useRef(false)
  const lastAppliedBandModeRef = useRef<string | null>(null)
  const assignmentFetchInFlightRef = useRef(false)
  const lastAssignmentSignatureRef = useRef<string>('')
  const audioContextRef = useRef<AudioContext | null>(null)
  const loopbackNodesRef = useRef<{
    whiteNoise?: AudioBufferSourceNode
    micInput?: MediaStreamAudioSourceNode
    micGain?: GainNode
    masterGain?: GainNode
    cwOscillator?: OscillatorNode
    cwGain?: GainNode
    cwInterval?: ReturnType<typeof setInterval>
    keepAliveInterval?: ReturnType<typeof setInterval>
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
  const [activeLoggingTab, setActiveLoggingTab] = useState<LoggingTab>('standard')
  const [gotaStationId, setGotaStationId] = useState(stationId)
  const [gotaOperatorCallsign, setGotaOperatorCallsign] = useState(localStorage.getItem('yahaml:callsign') || '')
  const [gotaRadio, setGotaRadio] = useState<any | null>(null)
  const keepAudioAliveRef = useRef(keepAudioAlive)
  const lastPublishedBandModeRef = useRef<string | null>(null)

  const token = localStorage.getItem('yahaml:sessionToken')
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {}
  const audioDebugEnabled = localStorage.getItem('yahaml:audioDebug') === 'true'

  const buildAssignmentSignature = (data: any) => {
    const radio = data?.radio || {}
    return JSON.stringify({
      assignmentId: data?.id || null,
      assignmentActive: Boolean(data?.isActive),
      radioId: radio?.id || null,
      source: radio?.audioSourceType || null,
      room: radio?.janusRoomId || null,
      stream: radio?.janusStreamId || null,
      http: radio?.httpStreamUrl || null,
      host: radio?.host || null,
      connected: radio?.isConnected ?? null,
    })
  }

  const janusTxn = () => `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`

  const janusPost = async (url: string, payload: Record<string, any>) => {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!response.ok) {
      throw new Error(`Janus HTTP ${response.status}`)
    }
    return response.json()
  }

  const fetchWithTimeout = async (input: RequestInfo | URL, init: RequestInit = {}, timeoutMs = 8000) => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      return await fetch(input, { ...init, signal: controller.signal })
    } finally {
      clearTimeout(timeout)
    }
  }

  const resolveJanusApiCandidates = (radio: any): string[] => {
    const explicit = localStorage.getItem('yahaml:janusApiUrl')?.trim()
    const hostFromRadio = (radio?.host || '').trim()
    const browserHost = window.location.hostname
    const hostCandidates = [
      explicit || '',
      hostFromRadio ? `http://${hostFromRadio}:8088/janus` : '',
      `http://${browserHost}:8088/janus`,
      `https://${browserHost}:8089/janus`,
    ].filter(Boolean)

    return Array.from(new Set(hostCandidates))
  }

  const createJanusSession = async (candidates: string[]) => {
    let lastError: unknown = null
    for (const baseUrl of candidates) {
      try {
        console.log('[JANUS] Trying endpoint:', baseUrl)
        const createResp = await janusPost(baseUrl, {
          janus: 'create',
          transaction: janusTxn(),
        })
        if (createResp?.janus === 'success' && createResp?.data?.id) {
          console.log('[JANUS] Session created:', { baseUrl, sessionId: createResp.data.id })
          return {
            baseUrl,
            sessionId: Number(createResp.data.id),
          }
        }
      } catch (error) {
        lastError = error
        console.warn('[JANUS] Endpoint failed:', baseUrl, error)
      }
    }
    throw lastError instanceof Error ? lastError : new Error('Unable to connect to Janus API')
  }

  const setupJanusAudio = async (radio: any) => {
    const configuredRoom = String(radio?.janusRoomId ?? '').trim()
    if (!configuredRoom) {
      setRadioError('Janus room ID is missing')
      setJanusStatus('error')
      return
    }

    const candidates = resolveJanusApiCandidates(radio)
    if (!candidates.length) {
      setRadioError('No Janus API endpoint candidates available')
      setJanusStatus('error')
      return
    }

    setJanusStatus('connecting')
    console.log('[JANUS] Starting AudioBridge setup', {
      configuredRoom,
      streamId: radio?.janusStreamId,
      candidates,
    })

    let sessionId = 0
    let handleId = 0
    let baseUrl = ''

    try {
      const session = await createJanusSession(candidates)
      sessionId = session.sessionId
      baseUrl = session.baseUrl

      const attachResp = await janusPost(`${baseUrl}/${sessionId}`, {
        janus: 'attach',
        plugin: 'janus.plugin.audiobridge',
        transaction: janusTxn(),
      })
      if (attachResp?.janus !== 'success' || !attachResp?.data?.id) {
        throw new Error('Failed to attach Janus AudioBridge plugin')
      }

      handleId = Number(attachResp.data.id)

      let roomId = Number(configuredRoom)
      if (!Number.isFinite(roomId) || roomId <= 0) {
        const listResp = await janusPost(`${baseUrl}/${sessionId}/${handleId}`, {
          janus: 'message',
          body: { request: 'list' },
          transaction: janusTxn(),
        })

        const rooms = listResp?.plugindata?.data?.list || []
        const normalizedRoom = configuredRoom.toLowerCase()
        const matchedRoom = rooms.find((room: any) => {
          const byId = String(room?.room || '').trim() === configuredRoom
          const desc = String(room?.description || '').trim().toLowerCase()
          const byDescription = desc === normalizedRoom || desc.includes(normalizedRoom)
          return byId || byDescription
        })

        if (!matchedRoom?.room) {
          const availableRooms = rooms
            .slice(0, 8)
            .map((room: any) => `${room?.room}:${room?.description || 'unnamed'}`)
            .join(', ')
          throw new Error(
            availableRooms
              ? `Configured room \"${configuredRoom}\" not found. Available: ${availableRooms}`
              : `Configured room \"${configuredRoom}\" not found and Janus returned no rooms`
          )
        }

        roomId = Number(matchedRoom.room)
        console.log('[JANUS] Resolved room identifier', {
          configuredRoom,
          resolvedRoomId: roomId,
          description: matchedRoom.description,
        })
      }

      const pc = new RTCPeerConnection({
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      })

      pc.oniceconnectionstatechange = () => {
        console.log('[JANUS] ICE connection state:', pc.iceConnectionState)
      }

      pc.onconnectionstatechange = () => {
        console.log('[JANUS] PeerConnection state:', pc.connectionState)
      }

      let janusHandleActive = true

      pc.onicecandidate = (event) => {
        if (!janusHandleActive) return
        const payload = event.candidate
          ? { janus: 'trickle', candidate: event.candidate, transaction: janusTxn() }
          : { janus: 'trickle', candidate: { completed: true }, transaction: janusTxn() }

        janusPost(`${baseUrl}/${sessionId}/${handleId}`, payload).catch(() => {
          // best-effort trickle
        })
      }

      const remoteStream = new MediaStream()
      pc.ontrack = (event) => {
        event.streams.forEach((stream) => {
          stream.getAudioTracks().forEach((track) => remoteStream.addTrack(track))
        })
      }

      pc.addTransceiver('audio', { direction: 'recvonly' })

      const audio = new Audio()
      audio.autoplay = true
      audio.setAttribute('playsinline', 'true')
      audio.volume = radioAudioVolume / 100
      audio.muted = radioAudioMuted
      audio.srcObject = remoteStream
      radioAudioRef.current = audio

      const clearUnlockPlayback = () => {
        if (janusUnlockPlaybackRef.current) {
          janusUnlockPlaybackRef.current()
          janusUnlockPlaybackRef.current = null
        }
      }

      const registerUnlockPlayback = () => {
        clearUnlockPlayback()
        const unlock = () => {
          audio.play().catch(() => {
            // ignore repeated failures; we'll keep the click/key listeners until next attempt
          })
        }
        const onUserInteraction = () => {
          unlock()
        }
        window.addEventListener('pointerdown', onUserInteraction)
        window.addEventListener('keydown', onUserInteraction)
        window.addEventListener('touchstart', onUserInteraction)
        janusUnlockPlaybackRef.current = () => {
          window.removeEventListener('pointerdown', onUserInteraction)
          window.removeEventListener('keydown', onUserInteraction)
          window.removeEventListener('touchstart', onUserInteraction)
        }
      }

      const attemptPlayback = async () => {
        try {
          await audio.play()
          clearUnlockPlayback()
          setRadioError(null)
          setJanusStatus('connected')
        } catch {
          registerUnlockPlayback()
          setRadioError('Janus connected. Click anywhere then unmute to start playback.')
        }
      }

      let playbackAttemptedOnTrack = false
      remoteStream.addEventListener('addtrack', () => {
        if (playbackAttemptedOnTrack) return
        playbackAttemptedOnTrack = true
        attemptPlayback().catch(() => {
          // no-op
        })
      })

      const offer = await pc.createOffer({ offerToReceiveAudio: true })
      await pc.setLocalDescription(offer)

      const display = radio?.janusStreamId || localStorage.getItem('yahaml:callsign') || 'YAHAML'

      const applyJanusAnswer = async (jsep: any) => {
        if (!jsep?.sdp || jsep?.type !== 'answer') return false
        const desc = new RTCSessionDescription({
          type: 'answer',
          sdp: jsep.sdp,
        })
        if (!pc.currentRemoteDescription) {
          await pc.setRemoteDescription(desc)
          await attemptPlayback()
          return true
        }
        return false
      }

      // Follow Janus AudioBridge demo flow: join first, then configure with SDP.
      const joinResp = await janusPost(`${baseUrl}/${sessionId}/${handleId}`, {
        janus: 'message',
        body: {
          request: 'join',
          room: roomId,
          display,
          muted: true,
        },
        transaction: janusTxn(),
      })

      if (joinResp?.janus === 'error') {
        throw new Error(String(joinResp?.error?.reason || 'Janus join failed'))
      }

      const configureResp = await janusPost(`${baseUrl}/${sessionId}/${handleId}`, {
        janus: 'message',
        body: {
          request: 'configure',
          muted: true,
        },
        jsep: {
          type: offer.type,
          sdp: offer.sdp,
        },
        transaction: janusTxn(),
      })

      const configureAppliedAnswer = await applyJanusAnswer(configureResp?.jsep)
      if (!configureAppliedAnswer) {
        console.log('[JANUS] Configure acknowledged; awaiting SDP answer via long-poll event')
      }

      const statsTimer = setInterval(async () => {
        try {
          const report = await pc.getStats()
          let bytesReceived = 0
          let packetsReceived = 0
          report.forEach((entry) => {
            const type = (entry as any)?.type
            const kind = (entry as any)?.kind
            if (type === 'inbound-rtp' && kind === 'audio') {
              bytesReceived += Number((entry as any)?.bytesReceived || 0)
              packetsReceived += Number((entry as any)?.packetsReceived || 0)
            }
          })

          setJanusTransportStats({
            iceState: pc.iceConnectionState,
            connectionState: pc.connectionState,
            remoteAudioTracks: remoteStream.getAudioTracks().length,
            bytesReceived,
            packetsReceived,
          })
        } catch {
          // ignore stats races while closing
        }
      }, 2000)

      let keepAliveTimer: ReturnType<typeof setInterval> | null = setInterval(async () => {
        try {
          await janusPost(`${baseUrl}/${sessionId}`, {
            janus: 'keepalive',
            transaction: janusTxn(),
          })
        } catch {
          // best-effort keepalive
        }
      }, 25000)

      const pollAbort = new AbortController()
      janusPollAbortRef.current = pollAbort

      const pollLoop = async () => {
        while (!pollAbort.signal.aborted) {
          try {
            const rid = Date.now()
            const response = await fetch(`${baseUrl}/${sessionId}?rid=${rid}&maxev=1`, {
              signal: pollAbort.signal,
            })
            if (!response.ok) {
              throw new Error(`Janus long-poll HTTP ${response.status}`)
            }

            const event = await response.json()
            if (event?.janus === 'error') {
              const reason = String(event?.error?.reason || 'Janus error')
              if (/invalid session/i.test(reason)) {
                // Stale/teardown race in dev or during rapid reconnect; do not surface as a hard error.
                if (pollAbort.signal.aborted || janusConnectionRef.current?.sessionId !== sessionId) {
                  break
                }
                setJanusStatus('connecting')
                setRadioError('Re-establishing Janus session…')
                break
              }
              throw new Error(reason)
            }

            if (event?.janus === 'event' && event?.sender === handleId && event?.jsep?.type === 'answer' && event?.jsep?.sdp) {
              await applyJanusAnswer(event.jsep)
            }

            if (event?.janus === 'trickle' && event?.sender === handleId) {
              const candidate = event?.candidate
              if (candidate?.completed) {
                try {
                  await pc.addIceCandidate(null)
                } catch {
                  // ignore completion race
                }
              } else if (candidate?.candidate) {
                try {
                  await pc.addIceCandidate(candidate)
                } catch (error) {
                  console.warn('[JANUS] Failed to apply remote ICE candidate', error)
                }
              }
            }

            if (event?.janus === 'hangup' || event?.janus === 'detached' || event?.janus === 'destroyed') {
              throw new Error('Janus session ended')
            }
          } catch (error: any) {
            if (pollAbort.signal.aborted) break
            if (/invalid session/i.test(String(error?.message || ''))) {
              if (janusConnectionRef.current?.sessionId !== sessionId) {
                break
              }
            }
            setRadioError(error?.message || 'Janus polling error')
            break
          }
        }
      }

      pollLoop()

      janusConnectionRef.current = {
        baseUrl,
        sessionId,
        handleId,
        pc,
        audio,
        pollAbort,
        cleanup: async () => {
          janusHandleActive = false
          clearInterval(statsTimer)
          clearUnlockPlayback()
          try {
            pollAbort.abort()
          } catch {
            // ignore
          }

          if (keepAliveTimer) {
            clearInterval(keepAliveTimer)
            keepAliveTimer = null
          }

          try {
            pc.getSenders().forEach((sender) => sender.track?.stop())
            pc.getReceivers().forEach((receiver) => receiver.track?.stop())
            pc.close()
          } catch {
            // ignore
          }

          try {
            await janusPost(`${baseUrl}/${sessionId}/${handleId}`, {
              janus: 'detach',
              transaction: janusTxn(),
            })
          } catch {
            // ignore
          }

          try {
            await janusPost(`${baseUrl}/${sessionId}`, {
              janus: 'destroy',
              transaction: janusTxn(),
            })
          } catch {
            // ignore
          }
        },
      }

      setRadioError(null)
      setJanusStatus('connecting')
      console.log('Janus audio connected', { baseUrl, sessionId, roomId })
    } catch (error) {
      console.error('Failed to setup Janus audio:', error)
      setRadioError(error instanceof Error ? `Janus connect failed: ${error.message}` : 'Failed to connect Janus audio')
      setJanusStatus('error')

      if (handleId && sessionId && baseUrl) {
        try {
          await janusPost(`${baseUrl}/${sessionId}/${handleId}`, {
            janus: 'detach',
            transaction: janusTxn(),
          })
        } catch {
          // ignore
        }
      }
      if (sessionId && baseUrl) {
        try {
          await janusPost(`${baseUrl}/${sessionId}`, {
            janus: 'destroy',
            transaction: janusTxn(),
          })
        } catch {
          // ignore
        }
      }
    }
  }

  const formatFrequencyMHz = (freq?: string | null) => {
    if (!freq) return '---.---'
    const value = parseFloat(freq)
    if (Number.isNaN(value)) return '---.---'
    return (value / 1_000_000).toFixed(3)
  }

  const frequencyToBand = (freq?: string | number | null) => {
    if (freq === null || freq === undefined) return ''
    const value = typeof freq === 'number' ? freq : Number.parseInt(String(freq), 10)
    if (!Number.isFinite(value) || value <= 0) return ''
    if (value >= 1800000 && value <= 2000000) return '160m'
    if (value >= 3500000 && value <= 4000000) return '80m'
    if (value >= 7000000 && value <= 7300000) return '40m'
    if (value >= 14000000 && value <= 14350000) return '20m'
    if (value >= 21000000 && value <= 21450000) return '15m'
    if (value >= 28000000 && value <= 29700000) return '10m'
    if (value >= 50000000 && value <= 54000000) return '6m'
    if (value >= 144000000 && value <= 148000000) return '2m'
    if (value >= 420000000 && value <= 450000000) return '70cm'
    return ''
  }

  const bandToFrequencyHz = (bandValue?: string | null): number | null => {
    if (!bandValue) return null
    const normalized = bandValue.trim().toLowerCase()
    if (!normalized) return null

    const compact = normalized.replace(/\s+/g, '')
    const mhzBand = compact.endsWith('m') ? compact.slice(0, -1) : compact

    if (compact.endsWith('cm')) {
      if (compact === '70cm') return 433500000
      return null
    }

    switch (mhzBand) {
      case '160': return 1900000
      case '80': return 3750000
      case '40': return 7150000
      case '20': return 14250000
      case '15': return 21250000
      case '10': return 28400000
      case '6': return 50300000
      case '2': return 146520000
      default: return null
    }
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
    if (!token) {
      if (audioDebugEnabled) {
        console.warn('[AUDIO] No session token; skipping assigned-radio fetch')
      }
      return
    }

    if (assignmentFetchInFlightRef.current) {
      if (audioDebugEnabled) {
        console.log('[AUDIO] Assigned radio fetch skipped (request already in-flight)')
      }
      return
    }

    assignmentFetchInFlightRef.current = true

    try {
      if (audioDebugEnabled) {
        console.log('[AUDIO] Fetching assigned radio...')
      }
      const response = await fetch('/api/radio-assignments/me', { headers: authHeaders })
      if (response.ok) {
        const data = await response.json()
        const signature = buildAssignmentSignature(data)
        const hasChanged = signature !== lastAssignmentSignatureRef.current

        if (hasChanged) {
          if (audioDebugEnabled) {
            console.log('[AUDIO] Assigned radio changed:', data)
          }
          lastAssignmentSignatureRef.current = signature
          setAssignedRadio(data)
        }

        setRadioError(null)
        // Keep radio state current even when assignment metadata is unchanged.
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
        if (audioDebugEnabled) {
          console.warn('[AUDIO] Assigned radio fetch failed:', response.status, data)
        }
        setRadioError(data.error || 'Failed to load radio assignment')
      }
    } catch (err) {
      if (audioDebugEnabled) {
        console.error('[AUDIO] Assigned radio fetch exception:', err)
      }
      setRadioError(err instanceof Error ? err.message : 'Failed to load radio assignment')
    } finally {
      assignmentFetchInFlightRef.current = false
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
    if (!assignedRadio?.radio) {
      console.warn('[AUDIO] setupRadioAudio skipped: no assigned radio')
      return
    }

    const radio = assignedRadio.radio
    console.log('[AUDIO] setupRadioAudio start:', {
      radioId: radio.id,
      audioSourceType: radio.audioSourceType,
      janusRoomId: radio.janusRoomId,
      janusStreamId: radio.janusStreamId,
      httpStreamUrl: radio.httpStreamUrl,
    })
    
    // Clean up existing audio
    teardownRadioAudio()

    if (radio.audioSourceType === 'loopback') {
      setJanusStatus('idle')
      // Loopback mode - static + CW + mic echo
      setupLoopbackAudio()
    } else if (radio.audioSourceType === 'http-stream' && radio.httpStreamUrl) {
      setJanusStatus('idle')
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
      setupJanusAudio(radio)
    } else {
      console.warn('[AUDIO] No playable source configured for assigned radio')
      setJanusStatus('idle')
    }
  }

  // Teardown audio stream
  const teardownRadioAudio = () => {
    setJanusTransportStats(null)
    if (janusUnlockPlaybackRef.current) {
      janusUnlockPlaybackRef.current()
      janusUnlockPlaybackRef.current = null
    }
    teardownLoopbackAudio()
    if (radioAudioRef.current) {
      radioAudioRef.current.pause()
      radioAudioRef.current.src = ''
      radioAudioRef.current = null
    }
    if (janusConnectionRef.current) {
      try {
        janusPollAbortRef.current?.abort()
      } catch {
        // ignore
      }
      janusPollAbortRef.current = null
      const connection = janusConnectionRef.current
      if (connection.audio) {
        try {
          connection.audio.pause()
          connection.audio.srcObject = null
        } catch {
          // ignore
        }
      }
      if (connection.cleanup) {
        connection.cleanup().catch(() => {
          // ignore cleanup errors
        })
      }
      janusConnectionRef.current = null
    }
  }

  // Initialize WebSocket connection
  useEffect(() => {
    assignedRadioIdRef.current = assignedRadio?.radio?.id || null
  }, [assignedRadio?.radio?.id])

  useEffect(() => {
    if (!token) return

    let isDisposing = false
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
          if (assignedRadioIdRef.current === message.data.radioId) {
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
      if (isDisposing || websocket.readyState === WebSocket.CLOSING || websocket.readyState === WebSocket.CLOSED) {
        return
      }
      console.error('WebSocket error:', error)
    }

    websocket.onclose = () => {
      console.log('WebSocket disconnected')
    }

    setWs(websocket)

    return () => {
      isDisposing = true
      if (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING) {
        websocket.close()
      }
    }
  }, [token])

  useEffect(() => {
    fetchAssignedRadio()
  }, [token, isActive])

  useEffect(() => {
    if (!token || !isActive) return
    const timer = setInterval(() => {
      fetchAssignedRadio()
    }, 5000)
    return () => clearInterval(timer)
  }, [token, isActive])

  useEffect(() => {
    if (stationId && !gotaStationId) {
      setGotaStationId(stationId)
    }
  }, [stationId, gotaStationId])

  useEffect(() => {
    const fetchGotaRadio = async () => {
      if (!gotaStationId) {
        setGotaRadio(null)
        return
      }
      try {
        const response = await fetch(`/api/stations/${gotaStationId}/radio`)
        if (!response.ok) return
        const data = await response.json()
        setGotaRadio(data?.radio || null)
      } catch {
        setGotaRadio(null)
      }
    }
    fetchGotaRadio()
  }, [gotaStationId])

  // Setup/teardown radio audio when assigned radio changes
  useEffect(() => {
    console.log('[AUDIO] setup effect triggered:', {
      assignedRadioId: assignedRadio?.radio?.id,
      source: assignedRadio?.radio?.audioSourceType,
      janusRoomId: assignedRadio?.radio?.janusRoomId,
      isActive,
    })
    if (assignedRadio?.radio?.audioSourceType) {
      setupRadioAudio()
    }
    return () => {
      teardownRadioAudio()
    }
  }, [assignedRadio?.radio?.id, assignedRadio?.radio?.audioSourceType, assignedRadio?.radio?.httpStreamUrl, assignedRadio?.radio?.janusRoomId])

  useEffect(() => {
    const onSharedAudioSettings = (event: Event) => {
      const customEvent = event as CustomEvent<{ source?: 'app' | 'logging'; muted?: boolean; volume?: number; ptt?: boolean }>
      if (customEvent.detail?.source !== 'app') return

      const nextMuted = Boolean(customEvent.detail?.muted)
      const nextPtt = Boolean(customEvent.detail?.ptt)
      const nextVolume = Number(customEvent.detail?.volume)
      syncingSharedAudioRef.current = true

      setRadioAudioMuted((prev) => (prev === nextMuted ? prev : nextMuted))
      setRadioAudioPtt((prev) => (prev === nextPtt ? prev : nextPtt))
      if (Number.isFinite(nextVolume)) {
        const safeVolume = Math.max(0, Math.min(100, Math.round(nextVolume)))
        setRadioAudioVolume((prev) => (prev === safeVolume ? prev : safeVolume))
      }
    }

    window.addEventListener('yahaml:radioAudioSettings', onSharedAudioSettings as EventListener)
    return () => {
      window.removeEventListener('yahaml:radioAudioSettings', onSharedAudioSettings as EventListener)
    }
  }, [])

  useEffect(() => {
    if (syncingSharedAudioRef.current) {
      syncingSharedAudioRef.current = false
      return
    }
    localStorage.setItem('yahaml:radioAudioMuted', String(radioAudioMuted))
    localStorage.setItem('yahaml:radioAudioVolume', String(radioAudioVolume))
    localStorage.setItem('yahaml:radioAudioPtt', String(radioAudioPtt))
    window.dispatchEvent(new CustomEvent('yahaml:radioAudioSettings', {
      detail: {
        source: 'logging',
        muted: radioAudioMuted,
        volume: radioAudioVolume,
        ptt: radioAudioPtt,
      },
    }))
  }, [radioAudioMuted, radioAudioVolume, radioAudioPtt])

  // Update audio volume/mute when controls change
  useEffect(() => {
    if (radioAudioRef.current) {
      radioAudioRef.current.volume = radioAudioVolume / 100
      radioAudioRef.current.muted = radioAudioMuted
    }
  }, [radioAudioVolume, radioAudioMuted])

  useEffect(() => {
    if (radioState?.ptt === null || radioState?.ptt === undefined) return
    setRadioAudioPtt(Boolean(radioState.ptt))
  }, [radioState?.ptt])

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

  const parseMaybeJson = <T,>(value: T | string | undefined | null): T | undefined => {
    if (!value) return undefined
    if (typeof value !== 'string') return value
    try {
      return JSON.parse(value) as T
    } catch {
      return undefined
    }
  }

  const validationRules = parseMaybeJson<any>(contest?.template?.validationRules)
  const requiredFields = parseMaybeJson<Record<string, { required?: boolean }>>(contest?.template?.requiredFields)
  const uiConfig = parseMaybeJson<any>(contest?.template?.uiConfig)
  const gotaEnabled = Boolean(uiConfig?.gota?.enabled || uiConfig?.logging?.gotaEnabled)
  const contestFieldKeys = Array.from(
    new Set([
      ...(validationRules?.exchange?.required || []),
      ...(validationRules?.exchange?.sent || []),
      ...(validationRules?.exchange?.received || []),
      ...Object.entries(requiredFields || {})
        .filter(([, config]) => Boolean(config?.required))
        .map(([key]) => key),
    ])
  )

  useEffect(() => {
    if (!gotaEnabled && activeLoggingTab === 'gota') {
      setActiveLoggingTab('standard')
    }
  }, [gotaEnabled, activeLoggingTab])

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

  const handleGotaSubmit = async (qsoData: any) => {
    const result = await submit({
      ...qsoData,
      stationId: gotaStationId || stationId,
      contestId: contest?.id,
      source: 'gota-ui',
      operatorCallsign: gotaOperatorCallsign || undefined,
    })

    if (result.success && result.id) {
      setLastQsoId(result.id)
      setTimeout(() => setLastQsoId(null), 2000)
    }
  }

  const normalizeBandForOccupancy = (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) return ''
    const lower = trimmed.toLowerCase()

    if (lower.endsWith('cm')) {
      return trimmed.toUpperCase()
    }

    if (lower.endsWith('m')) {
      return trimmed.slice(0, -1).toUpperCase()
    }

    return trimmed.toUpperCase()
  }

  const applyBandModeToAssignedRadio = async ({ stationId: selectedStationId, band, mode }: { stationId: string; band: string; mode: string }) => {
    if (!token || selectedStationId !== stationId || !assignedRadio?.radio?.id || !assignedRadio?.radio?.isConnected) return

    const normalizedBand = band.trim().toLowerCase()
    const normalizedMode = mode.trim().toUpperCase()
    if (!normalizedBand || !normalizedMode) return

    const applyKey = `${selectedStationId}|${normalizedBand}|${normalizedMode}`
    if (lastAppliedBandModeRef.current === applyKey || applyingBandModeRef.current) {
      return
    }

    applyingBandModeRef.current = true
    try {
      const radioId = assignedRadio.radio.id
      const targetFrequencyHz = bandToFrequencyHz(normalizedBand)
      const currentBand = frequencyToBand(radioState?.frequency).toLowerCase()
      const targetBand = targetFrequencyHz ? frequencyToBand(targetFrequencyHz).toLowerCase() : ''
      const currentMode = String(radioState?.mode || '').toUpperCase()

      if (targetFrequencyHz && targetBand && targetBand !== currentBand) {
        const frequencyResponse = await fetchWithTimeout(`/api/radios/${radioId}/frequency`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({ frequencyHz: targetFrequencyHz }),
        })
        if (!frequencyResponse.ok) {
          const data = await frequencyResponse.json().catch(() => ({}))
          throw new Error(data?.error || 'Failed to set frequency from logging selection')
        }
      }

      if (normalizedMode && normalizedMode !== currentMode) {
        const radioBandwidth = Number(radioState?.bandwidth ?? assignedRadio.radio.bandwidth ?? 3000)
        const modeResponse = await fetchWithTimeout(`/api/radios/${radioId}/mode`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders },
          body: JSON.stringify({
            mode: normalizedMode,
            bandwidth: radioBandwidth,
          }),
        })
        const modeData = await modeResponse.json().catch(() => ({}))
        if (!modeResponse.ok || modeData?.success === false) {
          throw new Error(modeData?.error || `Radio rejected mode ${normalizedMode}`)
        }
      }

      await fetchAssignedRadio()
      lastAppliedBandModeRef.current = applyKey
    } catch (error) {
      console.error('[RADIO] Failed to apply band/mode from logging form', error)
    } finally {
      applyingBandModeRef.current = false
    }
  }

  const publishBandModeSelection = async ({ stationId: selectedStationId, band, mode }: { stationId: string; band: string; mode: string }) => {
    if (!token || !selectedStationId || !band || !mode) return

    const normalizedBand = normalizeBandForOccupancy(band)
    const normalizedMode = mode.trim().toUpperCase()
    const dedupeKey = `${selectedStationId}|${contest?.id || 'none'}|${normalizedBand}|${normalizedMode}`

    if (lastPublishedBandModeRef.current === dedupeKey) {
      return
    }

    try {
      const response = await fetch('/api/band-occupancy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders,
        },
        body: JSON.stringify({
          stationId: selectedStationId,
          contestId: contest?.id || null,
          band: normalizedBand,
          mode: normalizedMode,
          source: 'ui',
        }),
      })

      if (response.ok) {
        lastPublishedBandModeRef.current = dedupeKey
      }
    } catch {
      // non-blocking UX enhancement only
    }
  }

  const handleBandModeSelected = async (payload: { stationId: string; band: string; mode: string }) => {
    await publishBandModeSelection(payload)
    await applyBandModeToAssignedRadio(payload)
  }

  return (
    <div className="logging-page" data-testid="logging-page">
      {submitError && (
        <div className="submit-error">
          <span>Error: {submitError}</span>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      )}

      <div className="logging-tabs">
        <button
          className={`logging-tab ${activeLoggingTab === 'standard' ? 'active' : ''}`}
          onClick={() => setActiveLoggingTab('standard')}
          data-testid="logging-tab-standard"
        >
          Standard Log
        </button>
        {gotaEnabled && (
          <button
            className={`logging-tab ${activeLoggingTab === 'gota' ? 'active' : ''}`}
            onClick={() => setActiveLoggingTab('gota')}
            data-testid="logging-tab-gota"
          >
            GOTA Station
          </button>
        )}
      </div>

      <div className="logging-layout">
        {/* Main Logging Workspace */}
        <div className="logging-column main">
          {activeLoggingTab === 'standard' ? (
            <QSOEntryForm
              stations={stations}
              stationId={stationId}
              activeContest={contest || undefined}
              radioDefaults={{
                band: frequencyToBand(radioState?.frequency),
                mode: radioState?.mode ? String(radioState.mode).toUpperCase() : '',
                frequencyMHz: radioState?.frequency ? formatFrequencyMHz(String(radioState.frequency)) : '',
                power: radioState?.power,
              }}
              onSubmit={handleSubmit}
              onBandModeSelected={handleBandModeSelected}
              loading={submitting}
            />
          ) : (
            <section className="panel gota-panel">
              <h3>🧢 GOTA Logging</h3>
              <p className="gota-hint">
                Track Get-On-The-Air station contacts separately while keeping shared contest context.
              </p>
              <div className="gota-controls">
                <div className="field">
                  <label>GOTA Station</label>
                  <select value={gotaStationId} onChange={(e) => setGotaStationId(e.target.value)}>
                    {stations.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.callsign} {s.class ? `(${s.class})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label>GOTA Operator</label>
                  <input
                    value={gotaOperatorCallsign}
                    onChange={(e) => setGotaOperatorCallsign(e.target.value.toUpperCase())}
                    placeholder="Operator callsign"
                  />
                </div>
              </div>
              <div className="gota-meta">
                <div>Assigned Radio: {gotaRadio ? `${gotaRadio.name} (${gotaRadio.host}:${gotaRadio.port})` : 'None assigned'}</div>
                <div className="gota-rule">Tip: Keep GOTA operators and transmitter assignments consistent for bonus tracking.</div>
              </div>
            </section>
          )}

          {gotaEnabled && activeLoggingTab === 'gota' && (
            <QSOEntryForm
              stations={stations}
              stationId={gotaStationId || stationId}
              activeContest={contest || undefined}
              onSubmit={handleGotaSubmit}
              onBandModeSelected={handleBandModeSelected}
              loading={submitting}
            />
          )}

          {/* Live QSO Feed */}
          <LiveQSOFeed contestId={contest?.id} contestFieldKeys={contestFieldKeys} maxEntries={15} />

          {/* Bulk log management and export tools */}
          <LogManagementPanel stationId={activeLoggingTab === 'gota' ? (gotaStationId || stationId) : stationId} contestId={contest?.id} />
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
