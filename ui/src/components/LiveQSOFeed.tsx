import { useEffect, useState } from 'react'
import '../styles/LiveQSOFeed.css'

export interface QSOLogEntry {
  id: string
  stationId: string
  contestId?: string | null
  callsign: string
  band: string
  mode: string
  qsoDate: string
  qsoTime: string
  frequency?: number | string | null
  rstSent?: string | null
  rstRcvd?: string | null
  power?: number
  points: number
  source?: string
  rawPayload?: string | null
}

interface LiveQSOFeedProps {
  maxEntries?: number
  contestId?: string
  contestFieldKeys?: string[]
}

export function LiveQSOFeed({ maxEntries = 10, contestId, contestFieldKeys = [] }: LiveQSOFeedProps) {
  const [qsos, setQsos] = useState<QSOLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<{
    callsign: string
    band: string
    mode: string
    rstSent: string
    rstRcvd: string
    power: string
    exchangeFields: Record<string, string>
    notes: string
  }>({
    callsign: '',
    band: '',
    mode: '',
    rstSent: '',
    rstRcvd: '',
    power: '',
    exchangeFields: {},
    notes: '',
  })

  const parseRawPayload = (rawPayload?: string | Record<string, any> | null): { exchange?: Record<string, string>; notes?: string } => {
    if (!rawPayload) return {}
    if (typeof rawPayload === 'object') {
      return rawPayload as { exchange?: Record<string, string>; notes?: string }
    }
    try {
      return JSON.parse(rawPayload)
    } catch {
      return {}
    }
  }

  const startEdit = (qso: QSOLogEntry) => {
    const raw = parseRawPayload(qso.rawPayload)
    const sourceExchange = raw.exchange || {}
    const exchangeKeys = Array.from(new Set([...contestFieldKeys, ...Object.keys(sourceExchange)]))
    const exchangeFields = exchangeKeys.reduce((acc, key) => {
      acc[key] = sourceExchange[key] || ''
      return acc
    }, {} as Record<string, string>)

    setEditingId(qso.id)
    setEditForm({
      callsign: qso.callsign || '',
      band: qso.band || '',
      mode: qso.mode || '',
      rstSent: qso.rstSent || '',
      rstRcvd: qso.rstRcvd || '',
      power: qso.power != null ? String(qso.power) : '',
      exchangeFields,
      notes: raw.notes || '',
    })
  }

  const updateExchangeField = (field: string, value: string) => {
    setEditForm((prev) => ({
      ...prev,
      exchangeFields: {
        ...prev.exchangeFields,
        [field]: value,
      },
    }))
  }

  const saveEdit = async (id: string) => {
    const token = localStorage.getItem('yahaml:sessionToken')
    const payload: Record<string, any> = {
      callsign: editForm.callsign.toUpperCase(),
      band: editForm.band,
      mode: editForm.mode.toUpperCase(),
      rstSent: editForm.rstSent || null,
      rstRcvd: editForm.rstRcvd || null,
      power: editForm.power ? Number(editForm.power) : null,
      notes: editForm.notes || null,
    }

    const cleanedExchange = Object.fromEntries(
      Object.entries(editForm.exchangeFields).filter(([, value]) => value && value.trim().length > 0)
    )
    payload.exchange = Object.keys(cleanedExchange).length > 0 ? cleanedExchange : null

    let response = await fetch(`/api/qso-logs/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(payload),
    })

    // Backward-compatible fallback path for older API route layouts
    if (response.status === 404) {
      response = await fetch(`/api/logs/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      })
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      const statusMessage = response.status ? ` (HTTP ${response.status})` : ''
      alert(data.error || `Failed to update QSO${statusMessage}`)
      return
    }

    const updated = await response.json()
    setQsos((prev) => prev.map((q) => (q.id === id ? { ...q, ...updated } : q)))
    setEditingId(null)
  }

  useEffect(() => {
    let isMounted = true
    let isDisposing = false

    const fetchQSOs = async () => {
      try {
        const primaryUrl = contestId
          ? `/api/qso-logs/contest/${contestId}?limit=${maxEntries}`
          : `/api/qso-logs?limit=${maxEntries}`

        let response = await fetch(primaryUrl)
        let data: any[] = []

        if (!response.ok && contestId) {
          // Fallback path for compatibility: fetch all and filter client-side
          response = await fetch(`/api/qso-logs?limit=${Math.max(maxEntries * 5, 50)}`)
          if (!response.ok) {
            throw new Error(`Failed to fetch QSOs (${response.status})`)
          }
          const fallback = await response.json()
          data = (Array.isArray(fallback) ? fallback : []).filter((qso) => qso.contestId === contestId)
        } else {
          if (!response.ok) {
            throw new Error(`Failed to fetch QSOs (${response.status})`)
          }
          data = await response.json()
        }

        if (isMounted) {
          setQsos((Array.isArray(data) ? data : []).slice(0, maxEntries))
        }
      } catch (err) {
        console.error('Failed to fetch QSOs:', err)
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    fetchQSOs()

    // WebSocket for immediate updates
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`)

    ws.onopen = () => {
      if (!contestId) return
      ws.send(
        JSON.stringify({
          type: 'subscribe',
          channel: `contest:${contestId}`,
        })
      )
    }

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data)
        if (message.type === 'logEntry:created' && message.data) {
          setQsos((prev) => {
            const next = [message.data as QSOLogEntry, ...prev.filter((p) => p.id !== message.data.id)]
            return next.slice(0, maxEntries)
          })
        } else if (message.type === 'logEntry:updated' && message.data) {
          setQsos((prev) => prev.map((p) => (p.id === message.data.id ? { ...p, ...message.data } : p)))
        }
      } catch {
        // ignore parse errors for unrelated messages
      }
    }

    ws.onerror = () => {
      if (isDisposing || ws.readyState === WebSocket.CLOSING || ws.readyState === WebSocket.CLOSED) {
        return
      }
      // Avoid noisy console spam from Vite/React strict-mode mount/unmount cycles.
    }

    // Refresh every 5 seconds
    const timer = setInterval(fetchQSOs, 5000)
    return () => {
      isMounted = false
      isDisposing = true
      clearInterval(timer)
      if (ws.readyState === WebSocket.OPEN && contestId) {
        ws.send(
          JSON.stringify({
            type: 'unsubscribe',
            channel: `contest:${contestId}`,
          })
        )
      }
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
        ws.close()
      }
    }
  }, [maxEntries, contestId])

  if (loading && qsos.length === 0) {
    return <div className="live-qso-feed loading">Loading QSOs...</div>
  }

  return (
    <div className="live-qso-feed" data-testid="live-qso-feed">
      <h3>Live QSO Feed</h3>
      {qsos.length === 0 ? (
        <div className="empty-message">No QSOs logged yet. Start logging!</div>
      ) : (
        <div className="qso-list">
          {qsos.map((qso) => {
            const raw = parseRawPayload(qso.rawPayload)
            const exchangeEntries = raw.exchange ? Object.entries(raw.exchange) : []

            return (
              <div key={qso.id} className="qso-entry" data-testid="qso-feed-entry">
                <div className="qso-time">
                  {qso.qsoTime.substring(0, 5)}
                </div>
                <div className="qso-details">
                  <div className="qso-summary-row">
                    <div className="qso-callsign" data-testid="qso-feed-entry-callsign">{qso.callsign}</div>
                    <div className="qso-band-mode">
                      {qso.band} {qso.mode}
                      {qso.frequency && <span className="frequency">{String(qso.frequency)}</span>}
                    </div>
                    <div className="qso-meta compact">
                      {qso.rstSent && <span>RST S:{qso.rstSent}</span>}
                      {qso.rstRcvd && <span>RST R:{qso.rstRcvd}</span>}
                      {qso.power != null && <span>{qso.power}W</span>}
                      {qso.source && <span>src:{qso.source}</span>}
                    </div>
                    {exchangeEntries.length > 0 && (
                      <div className="qso-meta exchange-detail">
                        {exchangeEntries.map(([k, v]) => (
                          <span key={k}>{k}:{String(v)}</span>
                        ))}
                      </div>
                    )}
                    {raw.notes && <div className="qso-notes">{raw.notes}</div>}
                  </div>

                  {editingId === qso.id && (
                    <div className="qso-edit-panel">
                      <input value={editForm.callsign} onChange={(e) => setEditForm((p) => ({ ...p, callsign: e.target.value }))} placeholder="Callsign" />
                      <input value={editForm.band} onChange={(e) => setEditForm((p) => ({ ...p, band: e.target.value }))} placeholder="Band" />
                      <input value={editForm.mode} onChange={(e) => setEditForm((p) => ({ ...p, mode: e.target.value }))} placeholder="Mode" />
                      <input value={editForm.rstSent} onChange={(e) => setEditForm((p) => ({ ...p, rstSent: e.target.value }))} placeholder="RST Sent" />
                      <input value={editForm.rstRcvd} onChange={(e) => setEditForm((p) => ({ ...p, rstRcvd: e.target.value }))} placeholder="RST Rcvd" />
                      <input value={editForm.power} onChange={(e) => setEditForm((p) => ({ ...p, power: e.target.value }))} placeholder="Power" />

                      {(Array.from(new Set([...contestFieldKeys, ...Object.keys(editForm.exchangeFields)]))).map((field) => (
                        <input
                          key={field}
                          value={editForm.exchangeFields[field] || ''}
                          onChange={(e) => updateExchangeField(field, e.target.value)}
                          placeholder={`Contest: ${field}`}
                        />
                      ))}

                      <textarea value={editForm.notes} onChange={(e) => setEditForm((p) => ({ ...p, notes: e.target.value }))} placeholder="Notes" rows={1} data-testid="qso-edit-notes" />
                      <div className="qso-edit-actions">
                        <button className="btn small primary" onClick={() => saveEdit(qso.id)} data-testid="qso-save-button">Save</button>
                        <button className="btn small secondary" onClick={() => setEditingId(null)} data-testid="qso-cancel-button">Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
                <div className="qso-actions-col">
                  <div className="qso-points">{qso.points} pts</div>
                  <button className="btn small secondary" onClick={() => startEdit(qso)} data-testid="qso-edit-button">
                    Edit
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
