import type { AgentAuditEvent } from './types';

export class MemoryAuditLog {
  private readonly events: AgentAuditEvent[] = [];

  append(event: Omit<AgentAuditEvent, 'timestamp'>): AgentAuditEvent {
    const auditEvent: AgentAuditEvent = {
      timestamp: Date.now(),
      ...event,
    };
    this.events.push(auditEvent);
    return auditEvent;
  }

  recent(limit: number = 25): AgentAuditEvent[] {
    return this.events.slice(-limit);
  }
}
