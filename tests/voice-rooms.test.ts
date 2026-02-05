import { voiceRoomManager } from '../src/voice-rooms'

describe('VoiceRoomManager', () => {
  const roomId = 'test-room-1'

  afterEach(() => {
    voiceRoomManager.deleteRoom(roomId)
  })

  it('creates a room and manages participants', () => {
    const room = voiceRoomManager.createRoom({ id: roomId, name: 'Test Room' })
    expect(room.id).toBe(roomId)
    expect(room.participants.size).toBe(0)

    const participant = voiceRoomManager.addParticipant(roomId, 'station-1', 'N7UF')
    expect(participant.id).toBe('station-1')
    expect(voiceRoomManager.getRoomParticipants(roomId)).toHaveLength(1)

    const muted = voiceRoomManager.updateParticipantMute(roomId, 'station-1', true)
    expect(muted).toBe(true)

    const volumeUpdated = voiceRoomManager.updateParticipantVolume(roomId, 'station-1', 42)
    expect(volumeUpdated).toBe(true)

    const removed = voiceRoomManager.removeParticipant(roomId, 'station-1')
    expect(removed).toBe(true)
    expect(voiceRoomManager.getRoomParticipants(roomId)).toHaveLength(0)
  })

  it('prevents duplicate rooms and enforces max participants', () => {
    voiceRoomManager.createRoom({ id: roomId, name: 'Test Room', maxParticipants: 1 })
    voiceRoomManager.addParticipant(roomId, 'station-1', 'N7UF')
    expect(() => voiceRoomManager.addParticipant(roomId, 'station-2', 'W1AW')).toThrow()
    expect(() => voiceRoomManager.createRoom({ id: roomId, name: 'Test Room' })).toThrow()
  })
})
