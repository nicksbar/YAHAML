import React from 'react';
import { useOperatorMessages } from '../hooks/useOperatorMessages';
import '../styles/MessageCenter.css';

interface Props {
  contestId?: string;
  className?: string;
  maxMessages?: number;
}

export const MessageCenter: React.FC<Props> = ({ 
  contestId, 
  className = '', 
  maxMessages = 15 
}) => {
  const { messages, loading, error, unreadCount, clearUnread } = useOperatorMessages(contestId);

  const displayMessages = messages.slice(0, maxMessages);

  const handleClick = () => {
    clearUnread();
  };

  if (error) {
    return <div className={`message-center error ${className}`}>Error: {error}</div>;
  }

  return (
    <div className={`message-center ${className}`} onClick={handleClick}>
      <h3>
        Operator Messages
        {unreadCount > 0 && <span className="unread-badge">{unreadCount} new</span>}
      </h3>
      
      {loading ? (
        <div className="messages-loading">Loading messages...</div>
      ) : displayMessages.length === 0 ? (
        <div className="messages-empty">No messages yet</div>
      ) : (
        <div className="messages-list">
          {displayMessages.map((msg) => (
            <div key={msg.id} className={`message-item message-${msg.messageType.toLowerCase()}`}>
              <div className="message-header">
                <span className="from-call">{msg.fromCall}</span>
                {msg.toCall !== 'ALL' && <span className="to-call">→ {msg.toCall}</span>}
                {msg.toCall === 'ALL' && <span className="broadcast-badge">BROADCAST</span>}
                <span className="source-badge">{msg.source}</span>
                <span className="timestamp">
                  {new Date(msg.timestamp).toLocaleTimeString()}
                </span>
              </div>
              <div className="message-content">{msg.content}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
