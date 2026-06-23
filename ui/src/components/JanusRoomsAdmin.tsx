import { useCallback, useEffect, useState } from 'react'

interface Participant {
  id: number
  display: string
  publisher: boolean
  talking: boolean
}

interface RTPForward {
  streamId: number
  host: string
  port: number
}

interface JanusRoomWithDetails {
  roomId: number
  radioId: string
  radioName: string
  description: string
  participantCount: number
  participants: Participant[]
  rtpForwards: RTPForward[]
  isActive: boolean
}

interface JanusRoomsAdminProps {
  apiUrl?: string
  sessionToken?: string
}

export function JanusRoomsAdmin({ apiUrl = '', sessionToken }: JanusRoomsAdminProps) {
  const [rooms, setRooms] = useState<JanusRoomWithDetails[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedRoom, setSelectedRoom] = useState<JanusRoomWithDetails | null>(null)
  const [rtpStarting, setRtpStarting] = useState<Record<number, boolean>>({})
  const [kicking, setKicking] = useState<Record<string, boolean>>({})
  const [showRtpForm, setShowRtpForm] = useState<number | null>(null)
  const [rtpConfig, setRtpConfig] = useState({ host: '127.0.0.1', port: 5006 })

  const getHeaders = useCallback((): Record<string, string> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (sessionToken) {
      headers.Authorization = `Bearer ${sessionToken}`
    }
    return headers
  }, [sessionToken])

  // Fetch rooms list
  const fetchRooms = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const response = await fetch(`${apiUrl}/api/admin/janus/rooms`, {
        headers: getHeaders(),
      })
      if (response.ok) {
        const data: JanusRoomWithDetails[] = await response.json()
        setRooms(data)
        if (data.length === 0) {
          setSelectedRoom(null)
        }
      } else {
        throw new Error(`Failed to fetch rooms: ${response.statusText}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch rooms')
    } finally {
      setLoading(false)
    }
  }, [apiUrl, getHeaders])

  // Refresh rooms periodically
  useEffect(() => {
    fetchRooms()
    const interval = setInterval(fetchRooms, 5000) // Refresh every 5 seconds
    return () => clearInterval(interval)
  }, [fetchRooms])

  // Kick participant
  const kickParticipant = async (roomId: number, participantId: number) => {
    const key = `${roomId}-${participantId}`
    try {
      setKicking(prev => ({ ...prev, [key]: true }))
      const response = await fetch(`${apiUrl}/api/admin/janus/rooms/${roomId}/kick`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ participantId }),
      })
      if (response.ok) {
        // Refresh the room details
        await fetchRooms()
      } else {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to kick participant')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to kick participant')
    } finally {
      setKicking(prev => ({ ...prev, [key]: false }))
    }
  }

  // Start RTP forward
  const startRtpForward = async (roomId: number) => {
    try {
      setRtpStarting(prev => ({ ...prev, [roomId]: true }))
      const response = await fetch(`${apiUrl}/api/admin/janus/rooms/${roomId}/rtp-forward/start`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify(rtpConfig),
      })
      if (response.ok) {
        // Refresh and clear form
        await fetchRooms()
        setShowRtpForm(null)
      } else {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to start RTP forward')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start RTP forward')
    } finally {
      setRtpStarting(prev => ({ ...prev, [roomId]: false }))
    }
  }

  // Stop RTP forward
  const stopRtpForward = async (roomId: number, streamId: number) => {
    const key = `${roomId}-${streamId}`
    try {
      setKicking(prev => ({ ...prev, [key]: true }))
      const response = await fetch(`${apiUrl}/api/admin/janus/rooms/${roomId}/rtp-forward/stop`, {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({ streamId }),
      })
      if (response.ok) {
        await fetchRooms()
      } else {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to stop RTP forward')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop RTP forward')
    } finally {
      setKicking(prev => ({ ...prev, [key]: false }))
    }
  }

  const room = selectedRoom

  return (
    <div className="janus-rooms-admin">
      <h2 style={{ marginBottom: '0.75rem' }}>Janus Rooms Admin</h2>

      {error && (
        <div className="mb-4 p-3 bg-red-100 text-red-800 rounded border border-red-300">
          {error}
          <button
            onClick={() => setError(null)}
            className="btn small secondary"
            style={{ marginLeft: '0.5rem' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {loading && rooms.length === 0 && (
        <div className="text-center py-8 text-gray-500">
          Loading rooms...
        </div>
      )}

      {rooms.length === 0 && !loading && (
        <div className="text-center py-8 text-gray-500">
          No Janus rooms configured. Create radios with audioSourceType 'remote-rtp' to enable.
        </div>
      )}

      {rooms.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Room list */}
          <div className="lg:col-span-1">
            <h3 className="font-semibold mb-2 text-gray-700">Rooms ({rooms.length})</h3>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {rooms.map(r => (
                <button
                  key={r.roomId}
                  onClick={() => setSelectedRoom(r)}
                  className={`w-full text-left p-3 rounded border-l-4 transition ${
                    selectedRoom?.roomId === r.roomId
                      ? 'bg-blue-50 border-l-blue-500'
                      : 'bg-white border-l-gray-300 hover:bg-gray-50'
                  }`}
                >
                  <div style={{ fontFamily: 'monospace', fontSize: '0.82rem' }}>{r.radioName}</div>
                  <div className="text-xs text-gray-500">{r.description}</div>
                  <div className="text-xs font-semibold text-blue-600 mt-1">
                    {r.participantCount} participant{r.participantCount !== 1 ? 's' : ''}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Room details */}
          {room && (
            <div className="lg:col-span-2">
              <div className="bg-white rounded border border-gray-200 p-4">
                <h3 className="font-bold text-lg mb-3">{room.radioName}</h3>

                {/* Room info */}
                <div className="mb-4 p-3 bg-gray-50 rounded text-sm">
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="text-gray-600">Room ID</div>
                      <div className="font-mono">{room.roomId}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Radio ID</div>
                      <div className="font-mono text-sm">{room.radioId}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Participants</div>
                      <div className="font-bold text-lg">{room.participantCount}</div>
                    </div>
                    <div>
                      <div className="text-gray-600">Status</div>
                      <div className={`font-semibold ${room.isActive ? 'text-green-600' : 'text-gray-500'}`}>
                        {room.isActive ? '🟢 Active' : '⚫ Idle'}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Participants */}
                <div className="mb-4">
                  <h4 className="font-semibold text-gray-700 mb-2">Participants</h4>
                  {room.participants.length === 0 ? (
                    <div className="text-sm text-gray-500 p-2">No participants</div>
                  ) : (
                    <div className="space-y-1 max-h-48 overflow-y-auto">
                      {room.participants.map(p => {
                        const kickKey = `${room.roomId}-${p.id}`
                        return (
                          <div key={p.id} className="flex items-center justify-between bg-gray-50 p-2 rounded text-sm">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className={`text-lg ${p.publisher ? '🎤' : '📻'}`} title={p.publisher ? 'Operator' : 'Listener'} />
                              <span className="truncate">{p.display}</span>
                              {p.talking && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded">talking</span>}
                            </div>
                            <button
                              onClick={() => kickParticipant(room.roomId, p.id)}
                              disabled={kicking[kickKey]}
                              className="btn small danger"
                              style={{ marginLeft: '0.5rem' }}
                            >
                              {kicking[kickKey] ? '...' : 'Kick'}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* RTP Forwards */}
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="font-semibold text-gray-700">RTP Forwards</h4>
                    <button
                      onClick={() => setShowRtpForm(showRtpForm === room.roomId ? null : room.roomId)}
                      className="btn small secondary"
                    >
                      {showRtpForm === room.roomId ? 'Cancel' : '+ Add'}
                    </button>
                  </div>

                  {room.rtpForwards.length === 0 ? (
                    <div className="text-sm text-gray-500 p-2">No RTP forwards active</div>
                  ) : (
                    <div className="space-y-1">
                      {room.rtpForwards.map(fwd => {
                        const stopKey = `${room.roomId}-${fwd.streamId}`
                        return (
                          <div key={fwd.streamId} className="flex items-center justify-between bg-green-50 p-2 rounded text-sm border border-green-200">
                            <div className="font-mono text-xs flex-1">
                              {fwd.host}:{fwd.port}
                            </div>
                            <button
                              onClick={() => stopRtpForward(room.roomId, fwd.streamId)}
                              disabled={kicking[stopKey]}
                              className="btn small danger"
                              style={{ marginLeft: '0.5rem' }}
                            >
                              {kicking[stopKey] ? '...' : 'Stop'}
                            </button>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* RTP Form */}
                  {showRtpForm === room.roomId && (
                    <div className="mt-2 p-3 bg-blue-50 rounded border border-blue-200">
                      <div className="space-y-2 mb-3">
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Host
                          </label>
                          <input
                            type="text"
                            value={rtpConfig.host}
                            onChange={e => setRtpConfig(prev => ({ ...prev, host: e.target.value }))}
                            placeholder="127.0.0.1 or Pi IP"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold text-gray-700 mb-1">
                            Port
                          </label>
                          <input
                            type="number"
                            value={rtpConfig.port}
                            onChange={e => setRtpConfig(prev => ({ ...prev, port: parseInt(e.target.value) || 5006 }))}
                            placeholder="5006"
                            className="w-full px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <button
                        onClick={() => startRtpForward(room.roomId)}
                        disabled={rtpStarting[room.roomId]}
                        className="btn success"
                        style={{ width: '100%' }}
                      >
                        {rtpStarting[room.roomId] ? 'Starting...' : 'Start Forward'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Auto-refresh indicator */}
      <div className="mt-4 text-xs text-gray-500 flex items-center gap-2">
        <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
        Auto-refreshing every 5 seconds
        <button
          onClick={() => fetchRooms()}
          className="btn small secondary"
          style={{ marginLeft: 'auto' }}
        >
          Refresh now
        </button>
      </div>
    </div>
  )
}
