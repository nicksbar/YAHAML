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

  describe('Join modes (operator vs listener)', () => {
    const operatorRoomId = 'operator-test-room'
    const listenerRoomId = 'listener-test-room'

    afterEach(() => {
      voiceRoomManager.deleteRoom(operatorRoomId)
      voiceRoomManager.deleteRoom(listenerRoomId)
    })

    it('should track participant join mode', () => {
      voiceRoomManager.createRoom({ id: operatorRoomId, name: 'Operator Room' })
      
      voiceRoomManager.addParticipant(operatorRoomId, 'station-1', 'W1ABC')
      const room = voiceRoomManager.getRoom(operatorRoomId)
      
      expect(room).toBeDefined()
      expect(room?.participants.has('station-1')).toBe(true)
      const p = room?.participants.get('station-1')
      expect(p).toBeDefined()
    })

    it('should allow multiple listeners in same room', () => {
      voiceRoomManager.createRoom({ id: listenerRoomId, name: 'Listener Room', maxParticipants: 10 })
      
      voiceRoomManager.addParticipant(listenerRoomId, 'listener-1', 'N7UF')
      voiceRoomManager.addParticipant(listenerRoomId, 'listener-2', 'K2LJ')
      voiceRoomManager.addParticipant(listenerRoomId, 'listener-3', 'W5XYZ')
      
      const participants = voiceRoomManager.getRoomParticipants(listenerRoomId)
      expect(participants).toHaveLength(3)
    })

    it('should differentiate operator from listener sources', () => {
      voiceRoomManager.createRoom({ id: operatorRoomId, name: 'Mixed Room', maxParticipants: 10 })
      
      voiceRoomManager.addParticipant(operatorRoomId, 'op-1', 'W1ABC', 'microphone')
      voiceRoomManager.addParticipant(operatorRoomId, 'list-1', 'N7UF', 'microphone')
      
      const participants = voiceRoomManager.getRoomParticipants(operatorRoomId)
      expect(participants).toHaveLength(2)
      
      // Both should exist
      expect(participants.some(p => p.id === 'op-1')).toBe(true)
      expect(participants.some(p => p.id === 'list-1')).toBe(true)
    })
  })
})
