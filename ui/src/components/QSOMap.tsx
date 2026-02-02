import React, { useState } from 'react';
import { useQSOContacts } from '../hooks/useQSOContacts';
import '../styles/QSOMap.css';

interface Props {
  contestId?: string;
  className?: string;
  height?: string;
}

type TimeWindow = 'last-30min' | 'last-1h' | 'last-6h' | 'last-24h';

export const QSOMap: React.FC<Props> = ({ 
  contestId, 
  className = '',
  height = '400px'
}) => {
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('last-30min');
  const { contacts, loading, error } = useQSOContacts(contestId, timeWindow);

  const bandColors: Record<string, string> = {
    '160': '#FF0000',
    '80': '#FF6600',
    '40': '#FFCC00',
    '20': '#00CC00',
    '15': '#00CCCC',
    '10': '#0066FF',
    '6': '#9933FF',
    '2': '#FF00FF',
  };

  const getBandColor = (band: string): string => bandColors[band] || '#999999';

  if (error) {
    return <div className={`qso-map error ${className}`}>Error: {error}</div>;
  }

  return (
    <div className={`qso-map ${className}`}>
      <div className="map-controls">
        <h3>Recent QSO Contacts</h3>
        <div className="time-window-selector">
          {(['last-30min', 'last-1h', 'last-6h', 'last-24h'] as TimeWindow[]).map((w) => (
            <button
              key={w}
              className={`window-btn ${timeWindow === w ? 'active' : ''}`}
              onClick={() => setTimeWindow(w)}
            >
              {w === 'last-30min' ? '30m' : w === 'last-1h' ? '1h' : w === 'last-6h' ? '6h' : '24h'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="map-placeholder" style={{ height }}>
          <p>Loading map...</p>
        </div>
      ) : contacts.length === 0 ? (
        <div className="map-placeholder" style={{ height }}>
          <p>No QSO contacts in this time window</p>
        </div>
      ) : (
        <div className="map-container" style={{ height }}>
          {/* TODO: Integrate Leaflet map component here */}
          <div className="map-grid">
            <h4>QSO Cluster View (Map integration coming soon)</h4>
            <div className="contacts-summary">
              <div>Total QSOs: <strong>{contacts.length}</strong></div>
              <div>Unique calls: <strong>{new Set(contacts.map(c => c.callsign)).size}</strong></div>
              <div>Bands active: <strong>{new Set(contacts.map(c => c.band)).size}</strong></div>
            </div>
            
            <div className="contacts-list">
              {contacts.slice(0, 20).map((contact) => (
                <div key={contact.id} className="contact-item">
                  <div className="contact-call">
                    <span
                      className="band-indicator"
                      style={{ backgroundColor: getBandColor(contact.band) }}
                      title={contact.band}
                    />
                    <strong>{contact.callsign}</strong>
                  </div>
                  <div className="contact-details">
                    <span>{contact.band}m {contact.mode}</span>
                    {contact.grid && <span>Grid: {contact.grid}</span>}
                    {contact.state && <span>{contact.state}</span>}
                    <span className="contact-time">
                      {new Date(contact.qsoDateTime).toLocaleTimeString()}
                    </span>
                  </div>
                  <div className="contact-source">{contact.source}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
