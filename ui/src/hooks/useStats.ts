import { useEffect, useState } from 'react';

export interface ContestStatsSnapshot {
  qsoCount: number;
  pointsTotal: number;
  mults: number;
  dupeCount: number;
  qsoPerHour: number;
  topCalls: Array<{
    callsign: string;
    qsoCount: number;
  }>;
  bandDist: Record<string, number>;
  modeDist: Record<string, number>;
  lastUpdated: string;
}

/**
 * Hook to subscribe to real-time contest stats
 * Stats are pre-aggregated server-side every 5 minutes
 */
export function useStats(contestId?: string) {
  const [stats, setStats] = useState<ContestStatsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch current stats
    const fetchStats = async () => {
      try {
        const url = contestId
          ? `/api/contest-stats?contestId=${contestId}&period=hour`
          : '/api/contest-stats?period=hour';
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch stats');
        
        const data = await response.json();
        setStats(data);
        setLoading(false);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    };

    fetchStats();

    // Connect to WebSocket for real-time updates
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      // Subscribe to stats updates (roughly 5-min interval)
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'stats',
        filters: contestId ? { contestId } : undefined,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'statsUpdate') {
          setStats(message.data);
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
          channel: 'stats',
        }));
        ws.close();
      }
    };
  }, [contestId]);

  return { stats, loading, error };
}
