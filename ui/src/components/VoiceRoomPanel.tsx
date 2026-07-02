import { useCallback, useEffect, useState, useRef } from 'react'
import { resolveWebSocketUrl } from '../routing'

interface VoiceRoom {
  id: string
  name: string
  description?: string
  radioId?: string | null
  participantCount: number
  maxParticipants?: number
  createdAt: string
  isActive: boolean
}

interface Participant {
  id: string
  displayName: string
  joinedAt: string
  isActive: boolean
  audioSourceType: 'microphone' | 'radio' | 'janus' | 'http-stream' | 'system'
  role?: 'operator' | 'listener'
}

interface VoiceRoomProps {
  stationId?: string
  sessionToken?: string
  compact?: boolean
}

export function VoiceRoomPanel({ stationId, sessionToken, compact = false }: VoiceRoomProps) {
  const [rooms, setRooms] = useState<VoiceRoom[]>([])
  const [activeRoom, setActiveRoom] = useState<VoiceRoom | null>(null)
  const [participants, setParticipants] = useState<Participant[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(100)
  const [isPTT, setIsPTT] = useState(false)
  const [joinMode, setJoinMode] = useState<'operator' | 'listener'>('operator')
  const [userRole, setUserRole] = useState<'operator' | 'listener' | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map())
  const remoteStreamsRef = useRef<Map<string, MediaStream>>(new Map())
  const remoteAudioElsRef = useRef<Map<string, HTMLAudioElement>>(new Map())
  const wsRef = useRef<WebSocket | null>(null)

  type SignalMessage = {
    from: string
    type: 'offer' | 'answer' | 'ice-candidate'
    data: unknown
  }

  const getAuthHeaders = useCallback(
    (): Record<string, string> => (sessionToken ? { Authorization: `Bearer ${sessionToken}` } : {}),
    [sessionToken]
  )

  // Fetch available rooms
  const fetchRooms = useCallback(async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/voice-rooms', {
        headers: getAuthHeaders(),
      })
      if (response.ok) {
        const data = await response.json()
        setRooms(data)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch rooms')
    } finally {
      setLoading(false)
    }
  }, [getAuthHeaders])

  const hydrateCurrentRoom = useCallback(async () => {
    if (!stationId) return

    try {
      const meResponse = await fetch('/api/voice-rooms/me', {
        headers: getAuthHeaders(),
      })

      if (!meResponse.ok) return

      const meData = await meResponse.json()
      const currentRoomId = String(meData?.roomId || '')
      if (!currentRoomId) {
        setActiveRoom(null)
        setParticipants([])
        setUserRole(null)
        return
      }

      const roomResponse = await fetch(`/api/voice-rooms/${currentRoomId}`, {
        headers: getAuthHeaders(),
      })

      if (!roomResponse.ok) return

      const roomData = await roomResponse.json()
      setActiveRoom({
        id: roomData.id,
        name: roomData.name,
        description: roomData.description,
        radioId: roomData.radioId,
        participantCount: Array.isArray(roomData.participants) ? roomData.participants.length : 0,
        maxParticipants: roomData.maxParticipants,
        createdAt: roomData.createdAt,
        isActive: Boolean(roomData.isActive),
      })

      const roomParticipants = Array.isArray(roomData.participants) ? roomData.participants : []
      setParticipants(roomParticipants)

      const self = roomParticipants.find((participant: Participant) => participant.id === stationId)
      if (self?.role === 'operator' || self?.role === 'listener') {
        setUserRole(self.role)
      } else if (self) {
        setUserRole(self.audioSourceType === 'system' ? 'listener' : 'operator')
      }

      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
        setupWebSocket()
      }
    } catch {
      // best effort hydration; panel still allows manual join
    }
  }, [getAuthHeaders, stationId])

  // Create peer connection for a remote participant
  const createPeerConnection = (peerId: string): RTCPeerConnection => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
      ],
    })

    // Add local tracks to connection
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => {
        if (localStreamRef.current) {
          pc.addTrack(track, localStreamRef.current)
        }
      })
    }

    // Handle incoming tracks
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams
      if (remoteStream) {
        remoteStreamsRef.current.set(peerId, remoteStream)
        playRemoteStream(peerId, remoteStream)
      }
    }

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate && activeRoom) {
        fetch(`/api/voice-rooms/${activeRoom.id}/signal`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({
            type: 'ice-candidate',
            to: peerId,
            data: event.candidate,
          }),
        }).catch(err => console.error('Failed to send ICE candidate:', err))
      }
    }

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log(`Peer ${peerId} connection state:`, pc.connectionState)
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        cleanupPeerConnection(peerId)
      }
    }

    peerConnectionsRef.current.set(peerId, pc)
    return pc
  }

  // Cleanup peer connection
  const cleanupPeerConnection = (peerId: string) => {
    const pc = peerConnectionsRef.current.get(peerId)
    if (pc) {
      pc.close()
      peerConnectionsRef.current.delete(peerId)
    }
    remoteStreamsRef.current.delete(peerId)
    const audioEl = remoteAudioElsRef.current.get(peerId)
    if (audioEl) {
      audioEl.pause()
      audioEl.srcObject = null
      audioEl.remove()
      remoteAudioElsRef.current.delete(peerId)
    }
  }

  // Play remote audio stream
  const playRemoteStream = (peerId: string, stream: MediaStream) => {
    const existing = remoteAudioElsRef.current.get(peerId)
    if (existing) {
      existing.srcObject = stream
      existing.volume = volume / 100
      return
    }
    const audio = new Audio()
    audio.srcObject = stream
    audio.autoplay = true
    audio.volume = volume / 100
    audio.setAttribute('data-voice-peer', 'true')
    audio.setAttribute('data-peer-id', peerId)
    document.body.appendChild(audio)
    remoteAudioElsRef.current.set(peerId, audio)
  }

  // Handle signaling messages
  const handleSignalMessage = async (message: SignalMessage) => {
    const { from, type, data } = message

    switch (type) {
      case 'offer':
        {
          if (!data || typeof data !== 'object') break
          const pc = createPeerConnection(from)
          await pc.setRemoteDescription(new RTCSessionDescription(data as RTCSessionDescriptionInit))
          const answer = await pc.createAnswer()
          await pc.setLocalDescription(answer)
          
          if (activeRoom) {
            fetch(`/api/voice-rooms/${activeRoom.id}/signal`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                ...getAuthHeaders(),
              },
              body: JSON.stringify({
                type: 'answer',
                to: from,
                data: answer,
              }),
            }).catch(err => console.error('Failed to send answer:', err))
          }
        }
        break

      case 'answer':
        {
          if (!data || typeof data !== 'object') break
          const pc = peerConnectionsRef.current.get(from)
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(data as RTCSessionDescriptionInit))
          }
        }
        break

      case 'ice-candidate':
        {
          if (!data || typeof data !== 'object') break
          const pc = peerConnectionsRef.current.get(from)
          if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(data as RTCIceCandidateInit))
          }
        }
        break
    }
  }

  // Create offer for a peer
  const createOfferForPeer = async (peerId: string) => {
    const pc = createPeerConnection(peerId)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    if (activeRoom) {
      fetch(`/api/voice-rooms/${activeRoom.id}/signal`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({
          type: 'offer',
          to: peerId,
          data: offer,
        }),
      }).catch(err => console.error('Failed to send offer:', err))
    }
  }

  // Join a room
  const joinRoom = async (roomId: string, audioSourceType: 'microphone' | 'radio' | 'system' = 'microphone', mode: 'operator' | 'listener' = 'operator') => {
    if (!stationId) return

    try {
      // Request microphone access if joining with mic
      if (audioSourceType === 'microphone') {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
          video: false,
        })
        localStreamRef.current = stream
      }

      // Call join endpoint
      const response = await fetch(`/api/voice-rooms/${roomId}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ audioSourceType, joinMode: mode }),
      })

      if (response.ok) {
        const data = await response.json()
        const room = rooms.find(r => r.id === roomId)
        if (room) {
          setActiveRoom(room)
          setParticipants(data.peers || [])
          setUserRole(data.role || mode)
          setError(null)

          // Setup WebSocket for signaling
          setupWebSocket()

          // Create offers for existing peers
          if (data.peers && data.peers.length > 0) {
            data.peers.forEach((peer: Participant) => {
              createOfferForPeer(peer.id)
            })
          }
        }
      } else {
        const err = await response.json().catch(() => ({}))
        setError(err.error || 'Failed to join room')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to access microphone')
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop())
        localStreamRef.current = null
      }
    }
  }

  // Setup WebSocket connection
  const setupWebSocket = () => {
    const wsUrl = resolveWebSocketUrl(`/ws${sessionToken ? `?token=${encodeURIComponent(sessionToken)}` : ''}`)
    const ws = new WebSocket(wsUrl)

    ws.onopen = () => {
      console.log('WebSocket connected for voice signaling')
      ws.send(JSON.stringify({ type: 'subscribe', channel: 'voice' }))
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        
        if (message.channel === 'voice') {
          if (message.type === 'signal') {
            // Extract the actual signal message
            const signalData = message.data?.message || message.data
            handleSignalMessage(signalData)
          } else if (message.type === 'participantJoined') {
            const payloadRoomId = String(message.data?.roomId || '')
            if (activeRoom && payloadRoomId && payloadRoomId !== activeRoom.id) {
              return
            }

            const newPeer = message.data?.participant
            if (!newPeer?.id) return

            if (newPeer.id !== stationId) {
              createOfferForPeer(newPeer.id)
            }

            setParticipants(prev => {
              if (prev.some((participant) => participant.id === newPeer.id)) {
                return prev
              }
              return [...prev, newPeer]
            })
          } else if (message.type === 'participantLeft') {
            const leftPeerId = message.data.participantId
            cleanupPeerConnection(leftPeerId)
            setParticipants(prev => prev.filter(p => p.id !== leftPeerId))
          }
        }
      } catch (err) {
        console.error('WebSocket message error:', err)
      }
    }

    ws.onerror = (error) => {
      console.error('WebSocket error:', error)
    }

    ws.onclose = () => {
      console.log('WebSocket disconnected')
    }

    wsRef.current = ws
  }

  // Leave room
  const leaveRoom = async () => {
    if (!activeRoom || !stationId) return

    try {
      const response = await fetch(`/api/voice-rooms/${activeRoom.id}/leave`, {
        method: 'POST',
        headers: getAuthHeaders(),
      })

      if (response.ok) {
        // Cleanup media streams
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach(track => track.stop())
          localStreamRef.current = null
        }

        // Cleanup all peer connections
        peerConnectionsRef.current.forEach((pc, peerId) => {
          cleanupPeerConnection(peerId)
        })
        peerConnectionsRef.current.clear()
        remoteStreamsRef.current.clear()
        remoteAudioElsRef.current.forEach((audio) => {
          audio.pause()
          audio.srcObject = null
          audio.remove()
        })
        remoteAudioElsRef.current.clear()

        // Close WebSocket
        if (wsRef.current) {
          wsRef.current.close()
          wsRef.current = null
        }

        setActiveRoom(null)
        setParticipants([])
        setIsMuted(false)
        await fetchRooms()
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to leave room')
    }
  }

  // Toggle mute
  const toggleMute = () => {
    if (localStreamRef.current) {
      const audioTracks = localStreamRef.current.getAudioTracks()
      const nextMuted = !isMuted
      audioTracks.forEach(track => {
        track.enabled = !nextMuted
      })
      setIsMuted(nextMuted)

      // Update server
      if (activeRoom) {
        fetch(`/api/voice-rooms/${activeRoom.id}/mute`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...getAuthHeaders(),
          },
          body: JSON.stringify({ isMuted: nextMuted }),
        }).catch(err => console.error('Failed to update mute:', err))
      }
    }
  }

  // Update volume
  const updateVolume = (newVolume: number) => {
    setVolume(newVolume)
    
    // Update remote audio elements
    remoteAudioElsRef.current.forEach((audio) => {
      audio.volume = newVolume / 100
    })

    if (activeRoom) {
      fetch(`/api/voice-rooms/${activeRoom.id}/volume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getAuthHeaders(),
        },
        body: JSON.stringify({ volume: newVolume }),
      }).catch(err => console.error('Failed to update volume:', err))
    }
  }

  // Cleanup on unmount
  useEffect(() => {
    const peerConnections = peerConnectionsRef.current
    const remoteAudioEls = remoteAudioElsRef.current

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop())
      }
      peerConnections.forEach((pc) => pc.close())
      remoteAudioEls.forEach((audio) => {
        audio.pause()
        audio.srcObject = null
        audio.remove()
      })
      if (wsRef.current) {
        wsRef.current.close()
      }
    }
  }, [])

  useEffect(() => {
    if (!sessionToken) return
    fetchRooms()
    hydrateCurrentRoom()
    // Only poll every 30 seconds to avoid excessive page re-renders
    const interval = setInterval(() => {
      fetchRooms()
      hydrateCurrentRoom()
    }, 30000)
    return () => clearInterval(interval)
  }, [sessionToken, fetchRooms, hydrateCurrentRoom])

  if (!sessionToken) {
    return <div className="voice-room-panel-empty">Sign in to use voice rooms</div>
  }

  // Compact toolbar mode
  if (compact && activeRoom) {
    return (
      <div className="voice-room-toolbar">
        <button
          className="voice-room-room-btn"
          title={`In ${activeRoom.name}`}
        >
          🎙 {activeRoom.name}
        </button>
        <button
          className={`voice-room-ptt ${isPTT ? 'active' : ''}`}
          onMouseDown={() => { setIsPTT(true); toggleMute(); }}
          onMouseUp={() => { setIsPTT(false); toggleMute(); }}
          onTouchStart={() => { setIsPTT(true); toggleMute(); }}
          onTouchEnd={() => { setIsPTT(false); toggleMute(); }}
          title="Push-to-talk (hold to speak)"
        >
          📡 PTT
        </button>
        <button
          className={`voice-room-mute ${isMuted ? 'muted' : ''}`}
          onClick={toggleMute}
          title={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? '🔇' : '🎤'}
        </button>
        <button
          className="voice-room-leave-btn"
          onClick={leaveRoom}
          title="Leave voice room"
        >
          📴
        </button>
      </div>
    )
  }

  if (compact && !activeRoom) {
    return (
      <button
        className="voice-room-join-toolbar-btn"
        onClick={() => {
          if (rooms.length > 0) {
            joinRoom(rooms[0].id, 'microphone')
          }
        }}
        title="Join voice room (Shack)"
      >
        🎙 Join
      </button>
    )
  }

  return (
    <div className="voice-room-panel">
      <div className="voice-room-header">
        <h3>🎙 Voice Rooms</h3>
      </div>

      {error && <div className="voice-room-error">{error}</div>}

      {!activeRoom ? (
        <div className="voice-room-list">
          {loading && <p>Loading rooms...</p>}
          {rooms.length === 0 && !loading && <p>No voice rooms available</p>}
          {rooms.map(room => (
            <div key={room.id} className="voice-room-item">
              <div className="voice-room-info">
                <h4>{room.name}</h4>
                {room.description && <p className="hint">{room.description}</p>}
                <span className="voice-room-count">
                  {room.participantCount} / {room.maxParticipants || '∞'} participants
                </span>
              </div>
              <div className="voice-room-join-controls">
                <div className="voice-room-join-mode">
                  <label>
                    <input
                      type="radio"
                      value="operator"
                      checked={joinMode === 'operator'}
                      onChange={(e) => setJoinMode(e.target.value as 'operator' | 'listener')}
                    />
                    <span>🎤 Operator</span>
                  </label>
                  <label>
                    <input
                      type="radio"
                      value="listener"
                      checked={joinMode === 'listener'}
                      onChange={(e) => setJoinMode(e.target.value as 'operator' | 'listener')}
                    />
                    <span>📻 Listener</span>
                  </label>
                </div>
                <button
                  className="btn btn-primary"
                  onClick={() => joinRoom(room.id, 'microphone', joinMode)}
                  disabled={loading}
                >
                  Join
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="voice-room-active">
          <div className="voice-room-active-header">
            <div className="voice-room-active-title">
              <h4>{activeRoom.name}</h4>
              <span className="voice-room-role-badge" title={userRole || 'unknown'}>
                {userRole === 'operator' && '🎤 Operator'}
                {userRole === 'listener' && '📻 Listener'}
              </span>
            </div>
            <button
              className="btn btn-small"
              onClick={leaveRoom}
            >
              Leave
            </button>
          </div>

        <div className="voice-room-controls">
            <button
              className={`btn ${isMuted ? 'muted' : ''}`}
              onClick={toggleMute}
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? '🔇' : '🎤'} {isMuted ? 'Muted' : 'Live'}
            </button>
            <div className="voice-room-volume">
              <label>Vol</label>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => updateVolume(Number(e.target.value))}
                className="volume-slider"
              />
              <span>{volume}%</span>
            </div>
          </div>

          <div className="voice-room-participants">
            <p className="hint">Participants ({participants.length})</p>
            <div className="participant-list">
              {participants.map(p => (
                <div key={p.id} className="participant-item">
                  <span className="participant-role" title={p.role || 'unknown'}>
                    {p.role === 'operator' && '🎤'}
                    {p.role === 'listener' && '📻'}
                  </span>
                  <span className="participant-name">{p.displayName}</span>
                  <span className={`participant-source ${p.audioSourceType}`}>
                    {p.audioSourceType === 'microphone' && '🎙'}
                    {p.audioSourceType === 'radio' && '📡'}
                    {p.audioSourceType === 'janus' && '🛰️'}
                    {p.audioSourceType === 'http-stream' && '🌐'}
                    {p.audioSourceType === 'system' && '🔊'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
