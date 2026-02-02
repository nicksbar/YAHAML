import { useState, useMemo } from 'react'
import { useDebugLogs, type DebugLog } from '../hooks/useDebugLogs'
import '../styles/DebugPanel.css'

type FilterLevel = 'ALL' | 'ERROR' | 'WARN' | 'INFO' | 'SUCCESS'
type SortBy = 'newest' | 'oldest' | 'level'

export function DebugPanel() {
  const { logs, summary, loading, error } = useDebugLogs()
  const [filterLevel, setFilterLevel] = useState<FilterLevel>('ALL')
  const [filterCategory, setFilterCategory] = useState<string>('ALL')
  const [filterStation, setFilterStation] = useState<string>('ALL')
  const [sortBy, setSortBy] = useState<SortBy>('newest')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Filter and sort logs
  const filteredLogs = useMemo(() => {
    let filtered = [...logs]

    // Filter by level
    if (filterLevel !== 'ALL') {
      filtered = filtered.filter((log) => log.level === filterLevel)
    }

    // Filter by category
    if (filterCategory !== 'ALL') {
      filtered = filtered.filter((log) => log.category === filterCategory)
    }

    // Filter by station
    if (filterStation !== 'ALL') {
      filtered = filtered.filter((log) => log.stationId === filterStation)
    }

    // Sort
    if (sortBy === 'newest') {
      filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    } else if (sortBy === 'oldest') {
      filtered.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
    } else if (sortBy === 'level') {
      const levelOrder = { ERROR: 0, WARN: 1, SUCCESS: 2, INFO: 3 }
      filtered.sort((a, b) => levelOrder[a.level as keyof typeof levelOrder] - levelOrder[b.level as keyof typeof levelOrder])
    }

    return filtered
  }, [logs, filterLevel, filterCategory, filterStation, sortBy])

  if (loading) {
    return <div className="debug-panel loading">Loading debug logs...</div>
  }

  if (error) {
    return <div className="debug-panel error">Error: {error}</div>
  }

  const getLevelBadgeClass = (level: string) => {
    switch (level) {
      case 'ERROR':
        return 'badge-error'
      case 'WARN':
        return 'badge-warning'
      case 'SUCCESS':
        return 'badge-success'
      default:
        return 'badge-info'
    }
  }

  const formatTime = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffSecs = Math.floor(diffMs / 1000)
    const diffMins = Math.floor(diffSecs / 60)
    const diffHours = Math.floor(diffMins / 60)

    if (diffSecs < 60) return `${diffSecs}s ago`
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    return date.toLocaleString()
  }

  return (
    <div className="debug-panel">
      {/* Summary Cards */}
      <div className="debug-summary">
        <div className="summary-card total">
          <div className="summary-value">{summary.total}</div>
          <div className="summary-label">Total Events</div>
        </div>
        <div className="summary-card error">
          <div className="summary-value">{summary.errors}</div>
          <div className="summary-label">Errors</div>
          {summary.latestError && (
            <div className="summary-detail">{summary.latestError.message}</div>
          )}
        </div>
        <div className="summary-card warning">
          <div className="summary-value">{summary.warnings}</div>
          <div className="summary-label">Warnings</div>
          {summary.latestWarning && (
            <div className="summary-detail">{summary.latestWarning.message}</div>
          )}
        </div>
        <div className="summary-card success">
          <div className="summary-value">{summary.success}</div>
          <div className="summary-label">Success</div>
        </div>
      </div>

      {/* Categories Overview */}
      <div className="debug-categories">
        <h4>By Category</h4>
        <div className="categories-grid">
          {Object.entries(summary.byCategory)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 8)
            .map(([category, count]) => (
              <button
                key={category}
                className={`category-btn ${filterCategory === category ? 'active' : ''}`}
                onClick={() => setFilterCategory(filterCategory === category ? 'ALL' : category)}
              >
                {category} <span className="count">{count}</span>
              </button>
            ))}
        </div>
      </div>

      {/* Filters */}
      <div className="debug-filters">
        <div className="filter-group">
          <label>Level</label>
          <div className="filter-buttons">
            {(['ALL', 'ERROR', 'WARN', 'INFO', 'SUCCESS'] as const).map((level) => (
              <button
                key={level}
                className={`filter-btn ${filterLevel === level ? 'active' : ''}`}
                onClick={() => setFilterLevel(level)}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        <div className="filter-group">
          <label>Category</label>
          <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)}>
            <option value="ALL">All Categories</option>
            {Object.keys(summary.byCategory)
              .sort()
              .map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Source (Station)</label>
          <select value={filterStation} onChange={(e) => setFilterStation(e.target.value)}>
            <option value="ALL">All Stations</option>
            {Object.keys(summary.bySource)
              .sort()
              .map((stationId) => (
                <option key={stationId} value={stationId}>
                  {stationId.slice(0, 8)}... ({summary.bySource[stationId].length})
                </option>
              ))}
          </select>
        </div>

        <div className="filter-group">
          <label>Sort</label>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as SortBy)}>
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="level">By Severity</option>
          </select>
        </div>
      </div>

      {/* Log Entries */}
      <div className="debug-logs">
        <h4>
          Events ({filteredLogs.length} / {logs.length})
        </h4>
        <div className="logs-list">
          {filteredLogs.length === 0 ? (
            <div className="logs-empty">No events match filters</div>
          ) : (
            filteredLogs.map((log: DebugLog, idx) => (
              <div
                key={`${log.id}-${log.createdAt}-${idx}`}
                className={`log-entry log-${log.level.toLowerCase()}`}
                onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
              >
                <div className="log-header">
                  <span className={`log-level ${getLevelBadgeClass(log.level)}`}>
                    {log.level}
                  </span>
                  <span className="log-category">{log.category}</span>
                  <span className="log-message">{log.message}</span>
                  <span className="log-time">{formatTime(log.createdAt)}</span>
                </div>

                {expandedId === log.id && (
                  <div className="log-details">
                    <div className="detail-row">
                      <span className="detail-label">Station ID:</span>
                      <span className="detail-value">{log.stationId}</span>
                    </div>
                    <div className="detail-row">
                      <span className="detail-label">Timestamp:</span>
                      <span className="detail-value">
                        {new Date(log.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {log.details && (
                      <div className="detail-row">
                        <span className="detail-label">Details:</span>
                        <pre className="detail-value">{log.details}</pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
