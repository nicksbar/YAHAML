import { useState } from 'react'
import '../styles/LoggingPage.css'
import { QSOEntryForm } from './QSOEntryForm'
import { LiveQSOFeed } from './LiveQSOFeed'
import { BandOccupancy } from './BandOccupancy'
import { StatsPanel } from './StatsPanel'
import { useLoggingContext } from '../hooks/useLoggingContext'
import { useQSOSubmit } from '../hooks/useQSOSubmit'

export function LoggingPage() {
  const { contest, stations, loading, error } = useLoggingContext({ pollInterval: 5000 })
  const { submit, loading: submitting, error: submitError } = useQSOSubmit({
    contestId: contest?.id,
  })
  const [lastQsoId, setLastQsoId] = useState<string | null>(null)

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
            activeContest={contest || undefined}
            onSubmit={handleSubmit}
            loading={submitting}
          />

          {/* Live QSO Feed */}
          <LiveQSOFeed contestId={contest?.id} maxEntries={15} />
        </div>

        {/* Right Sidebar: Stats & Band Occupancy */}
        <div className="logging-column sidebar">
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
