import { EventEmitter } from 'events';

export interface VoiceRoomConfig {
  id: string;
  name: string;
  description?: string;
  radioId?: string | null; // if assigned to a radio stream
  maxParticipants?: number;
}

export interface VoiceParticipant {
  id: string;
  displayName: string;
  joinedAt: Date;
  isActive: boolean;
  isMuted: boolean;
  volume: number; // 0-100
  audioSourceType: 'microphone' | 'radio' | 'janus' | 'http-stream' | 'system';
}

export interface VoiceRoom extends VoiceRoomConfig {
  participants: Map<string, VoiceParticipant>;
  createdAt: Date;
  isActive: boolean;
}

class VoiceRoomManager extends EventEmitter {
  private rooms: Map<string, VoiceRoom> = new Map();
  private participantRooms: Map<string, string> = new Map(); // participantId -> roomId

  createRoom(config: VoiceRoomConfig): VoiceRoom {
    if (this.rooms.has(config.id)) {
      throw new Error(`Room ${config.id} already exists`);
    }

    const room: VoiceRoom = {
      ...config,
      participants: new Map(),
      createdAt: new Date(),
      isActive: true,
      maxParticipants: config.maxParticipants || 50,
    };

    this.rooms.set(config.id, room);
    this.emit('roomCreated', room);
    return room;
  }

  getRoom(roomId: string): VoiceRoom | null {
    return this.rooms.get(roomId) || null;
  }

  listRooms(): VoiceRoom[] {
    return Array.from(this.rooms.values());
  }

  addParticipant(roomId: string, participantId: string, displayName: string, audioSourceType: 'microphone' | 'radio' | 'janus' | 'http-stream' | 'system' = 'microphone'): VoiceParticipant {
    const room = this.getRoom(roomId);
    if (!room) {
      throw new Error(`Room ${roomId} not found`);
    }

    if (room.participants.size >= (room.maxParticipants || 50)) {
      throw new Error(`Room ${roomId} is full`);
    }

    if (this.participantRooms.has(participantId)) {
      const currentRoom = this.participantRooms.get(participantId)!;
      if (currentRoom !== roomId) {
        this.removeParticipant(currentRoom, participantId);
      }
    }

    const participant: VoiceParticipant = {
      id: participantId,
      displayName,
      joinedAt: new Date(),
      isActive: true,
      isMuted: false,
      volume: 100,
      audioSourceType,
    };

    room.participants.set(participantId, participant);
    this.participantRooms.set(participantId, roomId);
    this.emit('participantJoined', { roomId, participant });
    return participant;
  }

  updateParticipantMute(roomId: string, participantId: string, isMuted: boolean): boolean {
    const room = this.getRoom(roomId);
    if (!room) return false;

    const participant = room.participants.get(participantId);
    if (!participant) return false;

    participant.isMuted = isMuted;
    this.emit('participantMuteChanged', { roomId, participantId, isMuted });
    return true;
  }

  updateParticipantVolume(roomId: string, participantId: string, volume: number): boolean {
    const room = this.getRoom(roomId);
    if (!room) return false;

    const participant = room.participants.get(participantId);
    if (!participant) return false;

    participant.volume = Math.max(0, Math.min(100, volume));
    this.emit('participantVolumeChanged', { roomId, participantId, volume: participant.volume });
    return true;
  }

  removeParticipant(roomId: string, participantId: string): boolean {
    const room = this.getRoom(roomId);
    if (!room) return false;

    const removed = room.participants.delete(participantId);
    if (removed) {
      this.participantRooms.delete(participantId);
      this.emit('participantLeft', { roomId, participantId });
    }

    return removed;
  }

  getRoomParticipants(roomId: string): VoiceParticipant[] {
    const room = this.getRoom(roomId);
    if (!room) return [];
    return Array.from(room.participants.values());
  }

  getParticipantRoom(participantId: string): string | null {
    return this.participantRooms.get(participantId) || null;
  }

  deleteRoom(roomId: string): boolean {
    const room = this.getRoom(roomId);
    if (!room) return false;

    // Remove all participants
    const participantIds = Array.from(room.participants.keys());
    for (const pId of participantIds) {
      this.participantRooms.delete(pId);
    }

    const removed = this.rooms.delete(roomId);
    if (removed) {
      this.emit('roomDeleted', roomId);
    }

    return removed;
  }
}

export const voiceRoomManager = new VoiceRoomManager();
