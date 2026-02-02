import React from 'react';
import { useStats } from '../hooks/useStats';
import '../styles/StatsPanel.css';

interface Props {
  contestId?: string;
  className?: string;
}

export const StatsPanel: React.FC<Props> = ({ contestId, className = '' }) => {
  const { stats, loading, error } = useStats(contestId);

  if (error) {
    return <div className={`stats-panel error ${className}`}>Error: {error}</div>;
  }

  if (loading) {
    return <div className={`stats-panel ${className}`}>Loading stats...</div>;
  }

  if (!stats) {
    return <div className={`stats-panel ${className}`}>No stats available</div>;
  }

  const bandEntries = Object.entries(stats.bandDist || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const modeEntries = Object.entries(stats.modeDist || {})
    .sort(([, a], [, b]) => b - a);

  return (
    <div className={`stats-panel ${className}`}>
      <h3>Contest Statistics</h3>
      
      <div className="stats-grid">
        {/* Main metrics */}
        <div className="stat-card">
          <div className="stat-label">QSOs</div>
          <div className="stat-value">{stats.qsoCount}</div>
          <div className="stat-sub">{stats.qsoPerHour.toFixed(1)}/hour</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Points</div>
          <div className="stat-value">{stats.pointsTotal}</div>
          <div className="stat-sub">
            {stats.qsoCount > 0 ? (stats.pointsTotal / stats.qsoCount).toFixed(1) : 0} per QSO
          </div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Multipliers</div>
          <div className="stat-value">{stats.mults}</div>
          <div className="stat-sub">Score: {(stats.pointsTotal * stats.mults).toLocaleString()}</div>
        </div>

        <div className="stat-card">
          <div className="stat-label">Dupes</div>
          <div className="stat-value">{stats.dupeCount}</div>
          <div className="stat-sub">
            {stats.qsoCount > 0 ? ((stats.dupeCount / stats.qsoCount) * 100).toFixed(1) : 0}%
          </div>
        </div>
      </div>

      {/* Distribution charts */}
      <div className="stats-distribution">
        <div className="dist-section">
          <h4>Band Distribution</h4>
          <div className="band-bars">
            {bandEntries.map(([band, count]) => {
              const maxCount = Math.max(...Object.values(stats.bandDist || {}));
              const percent = (count / maxCount) * 100;
              return (
                <div key={band} className="band-bar-row">
                  <span className="band-label">{band}m</span>
                  <div className="band-bar">
                    <div
                      className="band-bar-fill"
                      style={{ width: `${percent}%` }}
                    >
                      {count}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="dist-section">
          <h4>Mode Distribution</h4>
          <div className="mode-bars">
            {modeEntries.map(([mode, count]) => {
              const maxCount = Math.max(...Object.values(stats.modeDist || {}));
              const percent = (count / maxCount) * 100;
              return (
                <div key={mode} className="mode-bar-row">
                  <span className="mode-label">{mode}</span>
                  <div className="mode-bar">
                    <div
                      className="mode-bar-fill"
                      style={{ width: `${percent}%` }}
                    >
                      {count}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Top calls */}
      {stats.topCalls && stats.topCalls.length > 0 && (
        <div className="stats-top-calls">
          <h4>Most Active Operators</h4>
          <div className="calls-list">
            {stats.topCalls.slice(0, 5).map((entry, idx) => (
              <div key={entry.callsign} className="call-entry">
                <span className="rank">#{idx + 1}</span>
                <span className="call">{entry.callsign}</span>
                <span className="count">{entry.qsoCount} QSOs</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="stats-footer">
        Last updated: {new Date(stats.lastUpdated).toLocaleTimeString()}
      </div>
    </div>
  );
};
