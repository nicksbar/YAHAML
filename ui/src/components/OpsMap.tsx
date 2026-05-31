import React, { useEffect, useMemo, useState } from 'react'
import '../styles/OpsMap.css'

type TimeWindow = 'last-30min' | 'last-1h' | 'last-6h' | 'last-24h' | 'contest'

type RegionType = 'state' | 'grid4' | 'grid6'

type OpsContact = {
  id: string
  stationId: string
  contestId?: string | null
  callsign: string
  band: string
  mode: string
  state?: string | null
  grid?: string | null
  latitude?: number | null
  longitude?: number | null
  qsoDateTime: string
  source?: string | null
}

type RegionStat = {
  region: string
  count: number
  uniqueCalls: number
  byMode: Record<string, number>
  byBand: Record<string, number>
  isHighlighted: boolean
  highlightLabel?: string | null
  highlightColor?: string | null
  highlightModes: string[]
  modeCoverage: number
}

type HighlightStatus = {
  region: string
  label?: string | null
  color?: string | null
  notes?: string | null
  requiredModes: string[]
  worked: boolean
  workedCount: number
  workedModes: string[]
  missingModes: string[]
  completed: boolean
}

type OpsMapResponse = {
  filters: {
    contestId?: string | null
    timeWindow: TimeWindow
    band?: string | null
    mode?: string | null
    stationId?: string | null
    regionType: RegionType
  }
  templateMapConfig: {
    enabled: boolean
    regionType: RegionType
    title?: string | null
    subtitle?: string | null
    objective?: string | null
    highlightsDefined: number
  }
  summary: {
    totalContacts: number
    uniqueCalls: number
    uniqueBands: number
    uniqueModes: number
    regionsWorked: number
    highlightedRegionsWorked: number
    highlightedRegionsCompleted: number
  }
  contacts: OpsContact[]
  regionStats: RegionStat[]
  highlightedStatus: HighlightStatus[]
}

interface OpsMapProps {
  contestId?: string
}

const timeWindows: TimeWindow[] = ['last-30min', 'last-1h', 'last-6h', 'last-24h', 'contest']
const regionTypes: RegionType[] = ['state', 'grid4', 'grid6']

const getBandColor = (band: string) => {
  const colors: Record<string, string> = {
    '160': '#ef4444',
    '80': '#f97316',
    '40': '#f59e0b',
    '20': '#22c55e',
    '15': '#06b6d4',
    '10': '#3b82f6',
    '6': '#8b5cf6',
    '2': '#ec4899',
  }
  return colors[(band || '').toUpperCase()] || '#64748b'
}

const projectLonLat = (lon: number, lat: number) => {
  const x = ((lon + 180) / 360) * 100
  const y = ((90 - lat) / 180) * 100
  return {
    x: Math.max(0, Math.min(100, x)),
    y: Math.max(0, Math.min(100, y)),
  }
}

export const OpsMap: React.FC<OpsMapProps> = ({ contestId }) => {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('last-6h')
  const [regionType, setRegionType] = useState<RegionType>('state')
  const [bandFilter, setBandFilter] = useState<string>('all')
  const [modeFilter, setModeFilter] = useState<string>('all')
  const [data, setData] = useState<OpsMapResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const handleManualRefresh = () => {
    setRefreshKey(k => k + 1)
  }

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      setLoading(true)
      setError(null)
      try {
        const params = new URLSearchParams()
        if (contestId) params.append('contestId', contestId)
        params.append('timeWindow', timeWindow)
        params.append('regionType', regionType)
        if (bandFilter !== 'all') params.append('band', bandFilter)
        if (modeFilter !== 'all') params.append('mode', modeFilter)

        const response = await fetch(`/api/map/ops?${params.toString()}`)
        if (!response.ok) {
          throw new Error('Failed to load ops map data')
        }

        const next = (await response.json()) as OpsMapResponse
        if (cancelled) return
        setData(next)
      } catch (err: unknown) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load ops map data')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [contestId, timeWindow, regionType, bandFilter, modeFilter, refreshKey])

  const bandOptions = useMemo(() => {
    const set = new Set((data?.contacts || []).map((c) => (c.band || '').toUpperCase()).filter(Boolean))
    return Array.from(set).sort()
  }, [data?.contacts])

  const modeOptions = useMemo(() => {
    const set = new Set((data?.contacts || []).map((c) => (c.mode || '').toUpperCase()).filter(Boolean))
    return Array.from(set).sort()
  }, [data?.contacts])

  const contactsWithCoordinates = useMemo(
    () => (data?.contacts || []).filter((c) => typeof c.latitude === 'number' && typeof c.longitude === 'number'),
    [data?.contacts],
  )

  const topRegions = (data?.regionStats || []).slice(0, 12)
  const pendingHighlights = (data?.highlightedStatus || []).filter((h) => !h.completed)

  return (
    <div className="ops-map" data-testid="ops-map-view">
      <div className="ops-map-header">
        <div>
          <h2>{data?.templateMapConfig.title || 'Ops Map'}</h2>
          <p>
            {data?.templateMapConfig.subtitle || 'Live contact geography + contest-aware region intelligence'}
          </p>
        </div>
        {data?.templateMapConfig.objective ? (
          <div className="ops-map-objective">🎯 {data.templateMapConfig.objective}</div>
        ) : null}
      </div>

      <div className="ops-map-controls">
        <label>
          Time
          <select value={timeWindow} onChange={(e) => setTimeWindow(e.target.value as TimeWindow)}>
            {timeWindows.map((window) => (
              <option key={window} value={window}>
                {window}
              </option>
            ))}
          </select>
        </label>

        <label>
          Region Mode
          <select value={regionType} onChange={(e) => setRegionType(e.target.value as RegionType)}>
            {regionTypes.map((type) => (
              <option key={type} value={type}>
                {type.toUpperCase()}
              </option>
            ))}
          </select>
        </label>

        <label>
          Band
          <select value={bandFilter} onChange={(e) => setBandFilter(e.target.value)}>
            <option value="all">All</option>
            {bandOptions.map((band) => (
              <option key={band} value={band}>
                {band}m
              </option>
            ))}
          </select>
        </label>

        <label>
          Mode
          <select value={modeFilter} onChange={(e) => setModeFilter(e.target.value)}>
            <option value="all">All</option>
            {modeOptions.map((mode) => (
              <option key={mode} value={mode}>
                {mode}
              </option>
            ))}
          </select>
        </label>

        <button 
          className="ops-map-refresh-btn" 
          onClick={handleManualRefresh}
          disabled={loading}
          title="Manually refresh ops map data"
        >
          🔄 {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>

      {loading ? (
        <div className="ops-map-loading">Loading ops map…</div>
      ) : error ? (
        <div className="ops-map-error">{error}</div>
      ) : (
        <>
          <div className="ops-map-summary">
            <div><span>Contacts</span><strong>{data?.summary.totalContacts || 0}</strong></div>
            <div><span>Unique Calls</span><strong>{data?.summary.uniqueCalls || 0}</strong></div>
            <div><span>Regions Worked</span><strong>{data?.summary.regionsWorked || 0}</strong></div>
            <div><span>Highlights Complete</span><strong>{data?.summary.highlightedRegionsCompleted || 0}/{data?.templateMapConfig.highlightsDefined || 0}</strong></div>
          </div>

          <div className="ops-map-grid">
            <section className="ops-map-panel map-canvas-panel">
              <h3>Contact Plot</h3>
              <div className="ops-map-canvas">
                {contactsWithCoordinates.length === 0 ? (
                  <div className="ops-map-empty">No geocoded contacts in this filter set yet.</div>
                ) : (
                  contactsWithCoordinates.map((contact) => {
                    const point = projectLonLat(contact.longitude as number, contact.latitude as number)
                    return (
                      <div
                        key={contact.id}
                        className="ops-map-point"
                        style={{
                          left: `${point.x}%`,
                          top: `${point.y}%`,
                          background: getBandColor(contact.band),
                        }}
                        title={`${contact.callsign} • ${contact.band}m ${contact.mode}${contact.state ? ` • ${contact.state}` : ''}${contact.grid ? ` • ${contact.grid}` : ''}`}
                      />
                    )
                  })
                )}
              </div>
              <div className="ops-map-legend">
                {bandOptions.slice(0, 8).map((band) => (
                  <span key={band}><i style={{ background: getBandColor(band) }} />{band}m</span>
                ))}
              </div>
            </section>

            <section className="ops-map-panel">
              <h3>Top Regions ({regionType.toUpperCase()})</h3>
              <div className="ops-region-list">
                {topRegions.length === 0 ? (
                  <div className="ops-map-empty">No regional stats yet.</div>
                ) : topRegions.map((region) => (
                  <div key={region.region} className={`ops-region-item ${region.isHighlighted ? 'highlight' : ''}`}>
                    <div className="ops-region-main">
                      <strong>{region.highlightLabel || region.region}</strong>
                      <span>{region.count} QSOs</span>
                    </div>
                    <div className="ops-region-meta">
                      <span>{region.uniqueCalls} calls</span>
                      {region.highlightModes.length > 0 ? <span>Modes: {region.highlightModes.join(', ')}</span> : null}
                      {region.isHighlighted ? (
                        <span className="region-chip" style={{ borderColor: region.highlightColor || undefined }}>
                          target
                        </span>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="ops-map-panel">
              <h3>Priority Targets Remaining</h3>
              <div className="ops-highlight-list">
                {pendingHighlights.length === 0 ? (
                  <div className="ops-map-empty">All highlighted template targets are complete. 🚀</div>
                ) : pendingHighlights.map((item) => (
                  <div key={item.region} className="ops-highlight-item">
                    <div>
                      <strong>{item.label || item.region}</strong>
                      <div className="muted">{item.notes || 'Template target'}</div>
                    </div>
                    <div>
                      {item.requiredModes.length > 0 ? (
                        <div className="muted">Missing: {item.missingModes.join(', ') || 'none'}</div>
                      ) : (
                        <div className="muted">Not yet worked</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="ops-map-panel">
              <h3>Recent Contacts</h3>
              <div className="ops-contact-list">
                {(data?.contacts || []).slice(0, 20).map((contact) => (
                  <div key={contact.id} className="ops-contact-item">
                    <div>
                      <strong>{contact.callsign}</strong>
                      <span>{contact.band}m {contact.mode}</span>
                    </div>
                    <div>
                      <span>{contact.state || contact.grid || '—'}</span>
                      <span>{new Date(contact.qsoDateTime).toLocaleTimeString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  )
}
