export interface VoiceRoom {
  id: string
  name: string
  description?: string
  radioId?: string | null
  participantCount: number
  maxParticipants?: number
  createdAt: string
  isActive: boolean
}

export interface Participant {
  id: string
  displayName: string
  joinedAt: string
  isActive: boolean
  audioSourceType: 'microphone' | 'radio' | 'janus' | 'http-stream' | 'system'
  role?: 'operator' | 'listener'
}

export interface VoiceRoomProps {
  stationId?: string
  sessionToken?: string
  compact?: boolean
}

export type SignalMessage = {
  from: string
  type: 'offer' | 'answer' | 'ice-candidate'
  data: unknown
}
