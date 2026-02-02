import { useEffect, useState } from 'react';

export interface QSOContact {
  id: string;
  callsign: string;
  band: string;
  mode: string;
  qsoDateTime: string;
  grid?: string;
  state?: string;
  latitude?: number;
  longitude?: number;
  rstSent?: string;
  rstRcvd?: string;
  source: string;
  stationId: string;
}

/**
 * Hook to subscribe to real-time QSO contacts
 * Used for map display and recent contacts list
 */
export function useQSOContacts(
  contestId?: string,
  timeWindow: 'last-30min' | 'last-1h' | 'last-6h' | 'last-24h' = 'last-30min'
) {
  const [contacts, setContacts] = useState<QSOContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch initial contacts
    const fetchContacts = async () => {
      try {
        const params = new URLSearchParams();
        if (contestId) params.append('contestId', contestId);
        params.append('timeWindow', timeWindow);
        
        const response = await fetch(`/api/qso-contacts?${params}`);
        if (!response.ok) throw new Error('Failed to fetch QSO contacts');
        
        const data = await response.json();
        setContacts(data);
        setLoading(false);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    };

    fetchContacts();

    // Connect to WebSocket for real-time updates
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      // Subscribe to QSO events
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'qsos',
        filters: contestId ? { contestId } : undefined,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'newQSO') {
          const newContact = message.data;
          setContacts((prev) => {
            const updated = [newContact, ...prev];
            // Keep only recent contacts based on time window
            const limit = timeWindow === 'last-30min' ? 50 : 
                         timeWindow === 'last-1h' ? 100 : 200;
            return updated.slice(0, limit);
          });
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onerror = (err) => {
      console.error('WebSocket error:', err);
      setError('WebSocket connection error');
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
          type: 'unsubscribe',
          channel: 'qsos',
        }));
        ws.close();
      }
    };
  }, [contestId, timeWindow]);

  return { contacts, loading, error };
}
