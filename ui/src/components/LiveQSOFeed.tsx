import { useEffect, useState } from 'react'
import '../styles/LiveQSOFeed.css'

export interface QSOLogEntry {
  id: string
  stationId: string
  callsign: string
  band: string
  mode: string
  qsoDate: string
  qsoTime: string
  frequency?: number
  rst?: string
  power?: number
  points: number
}

interface LiveQSOFeedProps {
  maxEntries?: number
  contestId?: string
}

export function LiveQSOFeed({ maxEntries = 10, contestId }: LiveQSOFeedProps) {
  const [qsos, setQsos] = useState<QSOLogEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchQSOs = async () => {
      try {
        const url = contestId
          ? `/api/qso-logs/contest/${contestId}?limit=${maxEntries}`
          : `/api/qso-logs?limit=${maxEntries}`

        const response = await fetch(url)
        if (response.ok) {
          const data = await response.json()
          setQsos(Array.isArray(data) ? data : [])
        }
      } catch (err) {
        console.error('Failed to fetch QSOs:', err)
      } finally {
        setLoading(false)
      }
    }

    fetchQSOs()

    // Refresh every 5 seconds
    const timer = setInterval(fetchQSOs, 5000)
    return () => clearInterval(timer)
  }, [maxEntries, contestId])

  if (loading && qsos.length === 0) {
    return <div className="live-qso-feed loading">Loading QSOs...</div>
  }

  return (
    <div className="live-qso-feed">
      <h3>Live QSO Feed</h3>
      {qsos.length === 0 ? (
        <div className="empty-message">No QSOs logged yet. Start logging!</div>
      ) : (
        <div className="qso-list">
          {qsos.map((qso) => (
            <div key={qso.id} className="qso-entry">
              <div className="qso-time">
                {qso.qsoTime.substring(0, 5)}
              </div>
              <div className="qso-details">
                <div className="qso-callsign">{qso.callsign}</div>
                <div className="qso-band-mode">
                  {qso.band} {qso.mode}
                  {qso.frequency && <span className="frequency">{qso.frequency.toFixed(3)}</span>}
                </div>
              </div>
              <div className="qso-points">{qso.points} pts</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
