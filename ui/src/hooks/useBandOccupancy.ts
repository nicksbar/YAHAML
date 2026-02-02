import { useEffect, useState } from 'react';

export interface BandOccupancyEntry {
  band: string;
  mode: string;
  activeStations: Array<{
    callsign: string;
    source: string;
    lastSeen: string;
  }>;
  count: number;
}

/**
 * Hook to subscribe to real-time band occupancy updates
 * Connects to WebSocket 'stations' and 'band-occupancy' channels
 */
export function useBandOccupancy(contestId?: string) {
  const [occupancy, setOccupancy] = useState<BandOccupancyEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch function
  const fetchOccupancy = async () => {
    try {
      const url = contestId 
        ? `/api/band-occupancy?contestId=${contestId}`
        : '/api/band-occupancy';
      
      const response = await fetch(url);
      if (!response.ok) throw new Error('Failed to fetch band occupancy');
      
      const data = await response.json();
      setOccupancy(data);
      setLoading(false);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOccupancy();

    // Connect to WebSocket with auto-reconnect
    let ws: WebSocket | null = null;
    let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
    let reconnectAttempts = 0;
    const MAX_RECONNECT_ATTEMPTS = 10;
    const BASE_RECONNECT_DELAY = 1000; // 1 second

    const connectWebSocket = () => {
      try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

        ws.onopen = () => {
          reconnectAttempts = 0;
          console.log('Band occupancy WebSocket connected');
          // Subscribe to band changes
          ws?.send(
            JSON.stringify({
              type: 'subscribe',
              channel: 'stations',
              filters: contestId ? { contestId } : undefined,
            })
          );
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            
            if (message.type === 'bandModeChange') {
              // Re-fetch band occupancy on any band/mode change
              console.log('Band/mode change detected, refreshing occupancy');
              fetchOccupancy();
            }
          } catch (err) {
            console.error('Failed to parse WebSocket message:', err);
          }
        };

        ws.onerror = (err) => {
          console.error('WebSocket error:', err);
          setError('WebSocket connection error');
        };

        ws.onclose = () => {
          console.log('Band occupancy WebSocket disconnected, attempting reconnect...');
          attemptReconnect();
        };
      } catch (err) {
        console.error('Failed to create WebSocket:', err);
        attemptReconnect();
      }
    };

    const attemptReconnect = () => {
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        setError('WebSocket reconnection failed after multiple attempts');
        return;
      }

      reconnectAttempts++;
      const delay = BASE_RECONNECT_DELAY * Math.pow(1.5, reconnectAttempts - 1);
      console.log(`Scheduling reconnect in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

      reconnectTimeout = setTimeout(() => {
        connectWebSocket();
      }, delay);
    };

    connectWebSocket();

    return () => {
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(
          JSON.stringify({
            type: 'unsubscribe',
            channel: 'stations',
          })
        );
        ws.close();
      }
    };
  }, [contestId]);

  return { occupancy, loading, error };
}
