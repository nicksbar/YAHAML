import { useEffect, useState } from 'react';

export interface OperatorMessage {
  id: string;
  fromCall: string;
  toCall: string;
  content: string;
  messageType: 'DIRECT' | 'BROADCAST' | 'SYSTEM';
  timestamp: string;
  source: string;
}

/**
 * Hook to subscribe to real-time operator messages
 * Displays DMs and broadcast messages from contest
 */
export function useOperatorMessages(contestId?: string) {
  const [messages, setMessages] = useState<OperatorMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    // Fetch recent messages (last hour)
    const fetchMessages = async () => {
      try {
        const url = contestId
          ? `/api/operator-messages?contestId=${contestId}&limit=20`
          : '/api/operator-messages?limit=20';
        
        const response = await fetch(url);
        if (!response.ok) throw new Error('Failed to fetch messages');
        
        const data = await response.json();
        setMessages(data);
        setUnreadCount(data.length); // All initial messages are "new"
        setLoading(false);
      } catch (err: any) {
        setError(err.message);
        setLoading(false);
      }
    };

    fetchMessages();

    // Connect to WebSocket for real-time updates
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);

    ws.onopen = () => {
      // Subscribe to messages
      ws.send(JSON.stringify({
        type: 'subscribe',
        channel: 'messages',
        filters: contestId ? { contestId } : undefined,
      }));
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        if (message.type === 'newMessage') {
          const newMsg = message.data;
          setMessages((prev) => {
            const updated = [newMsg, ...prev];
            // Keep last 50 messages
            return updated.slice(0, 50);
          });
          setUnreadCount((prev) => prev + 1);
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
          channel: 'messages',
        }));
        ws.close();
      }
    };
  }, [contestId]);

  const clearUnread = () => setUnreadCount(0);

  return { messages, loading, error, unreadCount, clearUnread };
}
