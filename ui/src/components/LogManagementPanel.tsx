import { useEffect, useMemo, useState } from 'react'
import '../styles/LogManagementPanel.css'

type LogEntry = {
  id: string
  callsign: string
  band: string
  mode: string
  qsoDate: string
  qsoTime: string
  power?: number | null
}

interface LogManagementPanelProps {
  stationId: string
  contestId?: string
}

export function LogManagementPanel({ stationId, contestId }: LogManagementPanelProps) {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [callsignFilter, setCallsignFilter] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkBand, setBulkBand] = useState('')
  const [bulkMode, setBulkMode] = useState('')
  const [bulkPower, setBulkPower] = useState('')
  const [applying, setApplying] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const loadEntries = async () => {
    setLoading(true)
    setError(null)
    try {
      const url = contestId
        ? `/api/qso-logs/contest/${contestId}?limit=500`
        : `/api/qso-logs/${stationId}?limit=500`
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Failed to load logs (HTTP ${response.status})`)
      }
      const data = await response.json()
      setEntries(Array.isArray(data) ? data : [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load logs')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadEntries()
  }, [contestId, stationId])

  const filteredEntries = useMemo(() => {
    const callsignNeedle = callsignFilter.trim().toUpperCase()
    const start = startDate ? new Date(`${startDate}T00:00:00Z`).getTime() : null
    const end = endDate ? new Date(`${endDate}T23:59:59Z`).getTime() : null

    return entries.filter((entry) => {
      if (callsignNeedle && !String(entry.callsign || '').toUpperCase().includes(callsignNeedle)) {
        return false
      }

      const ts = new Date(entry.qsoDate).getTime()
      if (start !== null && ts < start) return false
      if (end !== null && ts > end) return false
      return true
    })
  }, [entries, callsignFilter, startDate, endDate])

  const selectedCount = selectedIds.size

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const selectFiltered = () => {
    setSelectedIds(new Set(filteredEntries.map((entry) => entry.id)))
  }

  const clearSelection = () => {
    setSelectedIds(new Set())
  }

  const applyBulkUpdate = async () => {
    if (!selectedCount) {
      setStatus('Select at least one log entry first.')
      return
    }

    const patch: Record<string, any> = {}
    if (bulkBand.trim()) patch.band = bulkBand.trim()
    if (bulkMode.trim()) patch.mode = bulkMode.trim().toUpperCase()
    if (bulkPower.trim()) patch.power = Number(bulkPower)

    if (!Object.keys(patch).length) {
      setStatus('Choose at least one field to update (band, mode, or power).')
      return
    }

    const token = localStorage.getItem('yahaml:sessionToken')
    setApplying(true)
    setStatus(null)

    let success = 0
    let failed = 0

    for (const id of selectedIds) {
      try {
        let response = await fetch(`/api/qso-logs/${id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(patch),
        })

        if (response.status === 404) {
          response = await fetch(`/api/logs/${id}`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(patch),
          })
        }

        if (!response.ok) {
          failed += 1
          continue
        }

        success += 1
      } catch {
        failed += 1
      }
    }

    setApplying(false)
    setStatus(`Bulk update complete — updated ${success}, failed ${failed}.`)
    await loadEntries()
  }

  const adifExportUrl = contestId ? `/api/export/adif?contestId=${encodeURIComponent(contestId)}&format=3` : ''
  const cabrilloExportUrl = contestId
    ? `/api/export/cabrillo?contestId=${encodeURIComponent(contestId)}&stationId=${encodeURIComponent(stationId)}`
    : ''

  return (
    <section className="panel log-management-panel" data-testid="log-management-panel">
      <div className="log-mgmt-header">
        <h3>Log Management</h3>
        <button className="btn secondary" onClick={loadEntries} disabled={loading || applying}>
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      <p className="log-mgmt-hint">
        Filter by callsign/time period, select entries, then apply bulk corrections. Great for post-event cleanup.
      </p>

      <div className="log-mgmt-filters">
        <input
          value={callsignFilter}
          onChange={(e) => setCallsignFilter(e.target.value.toUpperCase())}
          placeholder="Filter callsign (e.g. W1AW)"
        />
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </div>

      <div className="log-mgmt-actions">
        <button className="btn secondary" onClick={selectFiltered} disabled={!filteredEntries.length || applying}>
          Select filtered ({filteredEntries.length})
        </button>
        <button className="btn secondary" onClick={clearSelection} disabled={!selectedCount || applying}>
          Clear selection
        </button>
        <span className="selection-count">Selected: {selectedCount}</span>
      </div>

      <div className="log-mgmt-bulk">
        <input value={bulkBand} onChange={(e) => setBulkBand(e.target.value)} placeholder="Set band (e.g. 20m)" />
        <input value={bulkMode} onChange={(e) => setBulkMode(e.target.value)} placeholder="Set mode (e.g. CW)" />
        <input value={bulkPower} onChange={(e) => setBulkPower(e.target.value)} placeholder="Set power (W)" type="number" min="0" />
        <button className="btn primary" onClick={applyBulkUpdate} disabled={applying || !selectedCount}>
          {applying ? 'Applying…' : 'Apply to selected'}
        </button>
      </div>

      <div className="log-mgmt-export">
        <span>Export:</span>
        {contestId ? (
          <>
            <a className="btn secondary" href={adifExportUrl}>ADIF</a>
            <a className="btn secondary" href={cabrilloExportUrl}>Cabrillo</a>
          </>
        ) : (
          <span className="log-mgmt-muted">Select an active contest to enable export links.</span>
        )}
      </div>

      {status && <div className="log-mgmt-status">{status}</div>}
      {error && <div className="log-mgmt-error">{error}</div>}

      <div className="log-mgmt-table-wrap">
        <table className="log-mgmt-table">
          <thead>
            <tr>
              <th></th>
              <th>Time</th>
              <th>Callsign</th>
              <th>Band</th>
              <th>Mode</th>
              <th>Power</th>
            </tr>
          </thead>
          <tbody>
            {filteredEntries.slice(0, 200).map((entry) => (
              <tr key={entry.id}>
                <td>
                  <input
                    type="checkbox"
                    checked={selectedIds.has(entry.id)}
                    onChange={() => toggleSelected(entry.id)}
                  />
                </td>
                <td>{`${String(entry.qsoDate).slice(0, 10)} ${String(entry.qsoTime || '').slice(0, 5)}`}</td>
                <td>{entry.callsign}</td>
                <td>{entry.band}</td>
                <td>{entry.mode}</td>
                <td>{entry.power ?? ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
