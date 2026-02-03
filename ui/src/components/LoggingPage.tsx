import { useEffect, useState } from 'react'
import '../styles/LoggingPage.css'
import { QSOEntryForm } from './QSOEntryForm'
import { LiveQSOFeed } from './LiveQSOFeed'
import { BandOccupancy } from './BandOccupancy'
import { StatsPanel } from './StatsPanel'
import { useLoggingContext } from '../hooks/useLoggingContext'
import { useQSOSubmit } from '../hooks/useQSOSubmit'

interface LoggingPageProps {
  stationId: string
}

export function LoggingPage({ stationId }: LoggingPageProps) {
  const { contest, stations, loading, error } = useLoggingContext({ pollInterval: 5000 })
  const { submit, loading: submitting, error: submitError } = useQSOSubmit({
    contestId: contest?.id,
  })
  const [lastQsoId, setLastQsoId] = useState<string | null>(null)
  const [assignedRadio, setAssignedRadio] = useState<any | null>(null)
  const [radioState, setRadioState] = useState<any | null>(null)
  const [radioError, setRadioError] = useState<string | null>(null)
  const [ws, setWs] = useState<WebSocket | null>(null)

  const token = localStorage.getItem('yahaml:sessionToken')
  const authHeaders = token ? { Authorization: `Bearer ${token}` } : {}

  const formatFrequencyMHz = (freq?: string | null) => {
    if (!freq) return '---.---'
    const value = parseFloat(freq)
    if (Number.isNaN(value)) return '---.---'
    return (value / 1_000_000).toFixed(3)
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
