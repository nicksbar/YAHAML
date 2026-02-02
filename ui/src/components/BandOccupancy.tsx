import React from 'react';
import { useBandOccupancy } from '../hooks/useBandOccupancy';
import '../styles/BandOccupancy.css';

interface Props {
  contestId?: string;
  className?: string;
}

export const BandOccupancy: React.FC<Props> = ({ contestId, className = '' }) => {
  const { occupancy, loading, error } = useBandOccupancy(contestId);

  if (loading) {
    return <div className={`band-occupancy ${className}`}>Loading...</div>;
  }

  if (error) {
    return <div className={`band-occupancy error ${className}`}>Error: {error}</div>;
  }

  if (occupancy.length === 0) {
    return <div className={`band-occupancy ${className}`}>No active band occupancy</div>;
  }

  return (
    <div className={`band-occupancy ${className}`}>
      <h3>Band & Mode Occupation</h3>
      <table className="occupancy-table">
        <thead>
          <tr>
            <th>Band</th>
            <th>Mode</th>
            <th>Active Stations</th>
            <th>Count</th>
            <th>Sources</th>
          </tr>
        </thead>
        <tbody>
          {occupancy.map((entry) => (
            <tr key={`${entry.band}-${entry.mode}`}>
              <td className="band-cell">{entry.band}m</td>
              <td className="mode-cell">{entry.mode}</td>
              <td className="stations-cell">
                <span className="callsign-list">
                  {entry.activeStations.map((s) => (
                    <span key={s.callsign} className="callsign-badge" title={`Last seen: ${s.lastSeen}`}>
                      {s.callsign}
                    </span>
                  ))}
                </span>
              </td>
              <td className="count-cell">{entry.count}</td>
              <td className="source-cell">
                {Array.from(new Set(entry.activeStations.map((s) => s.source))).map((source) => (
                  <span key={source} className={`source-badge source-${source.toLowerCase()}`}>
                    {source}
                  </span>
                ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
