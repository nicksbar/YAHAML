import { EventEmitter } from 'events';

export interface WebRTCSignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'mute' | 'unmute' | 'source-change';
  from: string;
  to?: string;
  data?: any;
  timestamp: number;
}

class WebRTCSignalingManager extends EventEmitter {
  private peers: Map<string, Set<string>> = new Map(); // roomId -> Set<participantIds>
  private pendingOffers: Map<string, WebRTCSignalingMessage[]> = new Map();

  registerPeer(roomId: string, participantId: string): void {
    if (!this.peers.has(roomId)) {
      this.peers.set(roomId, new Set());
    }
    this.peers.get(roomId)!.add(participantId);
  }

  unregisterPeer(roomId: string, participantId: string): void {
    const room = this.peers.get(roomId);
    if (room) {
      room.delete(participantId);
      if (room.size === 0) {
        this.peers.delete(roomId);
      }
    }
  }

  getPeersInRoom(roomId: string): string[] {
    const peers = this.peers.get(roomId);
    return peers ? Array.from(peers) : [];
  }

  broadcastSignal(roomId: string, message: WebRTCSignalingMessage): void {
    this.emit('signal', { roomId, message });
  }

  sendSignal(message: WebRTCSignalingMessage): void {
    this.emit('signal', message);
  }

  queueOffer(participantId: string, message: WebRTCSignalingMessage): void {
    if (!this.pendingOffers.has(participantId)) {
      this.pendingOffers.set(participantId, []);
    }
    this.pendingOffers.get(participantId)!.push(message);
  }

  getPendingOffers(participantId: string): WebRTCSignalingMessage[] {
    const offers = this.pendingOffers.get(participantId) || [];
    this.pendingOffers.delete(participantId);
    return offers;
  }
}

export const webrtcSignaling = new WebRTCSignalingManager();
