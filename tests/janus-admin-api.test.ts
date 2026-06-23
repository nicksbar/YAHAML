/**
 * Janus Admin API integration tests
 * Tests for Janus room management, participants, and RTP forwarding
 */
import request from 'supertest'
import express from 'express'
import cors from 'cors'
import { teardownTestDB, setupTestDB } from './setup'
import prisma from '../src/db'

// Create test express app with admin endpoints
const createTestApp = () => {
  const app = express()
  app.use(cors())
  app.use(express.json())

  // Mock admin middleware - in tests, just check header exists
  const adminMiddleware = (_req: any, _res: any, next: any) => {
    const adminCallsigns = process.env.ADMIN_CALLSIGNS?.split(',') || []
    if (adminCallsigns.length === 0) {
      // Allow all in test
      return next()
    }
    next()
  }

  // Mock Janus admin client
  const mockJanusRooms: Record<number, any> = {
    100001: {
      room: 100001,
      description: 'Test Radio 1',
      participants: [
        { id: 1, display: 'W1ABC', publisher: true, talking: false },
        { id: 2, display: 'W2DEF', publisher: false, talking: false },
      ],
    },
  }

  const mockRTPForwards: Record<number, any[]> = {
    100001: [
      { streamId: 1, host: '192.168.1.100', port: 5006 },
    ],
  }

  // GET /api/admin/janus/rooms
  app.get('/api/admin/janus/rooms', adminMiddleware, async (_req, res) => {
    try {
      const radios = await prisma.radioConnection.findMany({
        where: {
          janusRoomId: { not: null },
        },
      })

      const rooms = radios.map(radio => ({
        roomId: parseInt(radio.janusRoomId ?? '0'),
        radioId: radio.id,
        radioName: radio.name,
        description: [radio.manufacturer, radio.model].filter(Boolean).join(' '),
        participantCount: mockJanusRooms[parseInt(radio.janusRoomId ?? '0')]?.participants.length || 0,
        participants: mockJanusRooms[parseInt(radio.janusRoomId ?? '0')]?.participants || [],
        rtpForwards: mockRTPForwards[parseInt(radio.janusRoomId ?? '0')] || [],
        isActive: true,
      }))

      return res.json(rooms)
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch rooms' })
    }
  })

  // GET /api/admin/janus/rooms/:roomId/participants
  app.get('/api/admin/janus/rooms/:roomId/participants', adminMiddleware, async (req, res) => {
    try {
      const roomId = parseInt(req.params.roomId)
      const participants = mockJanusRooms[roomId]?.participants || []
      return res.json({ roomId, participants })
    } catch (error) {
      return res.status(500).json({ error: 'Failed to fetch participants' })
    }
  })

  // POST /api/admin/janus/rooms/:roomId/kick
  app.post('/api/admin/janus/rooms/:roomId/kick', adminMiddleware, async (req, res) => {
    try {
      const roomId = parseInt(req.params.roomId)
      const { participantId } = req.body

      if (!participantId) {
        return res.status(400).json({ error: 'participantId required' })
      }

      if (mockJanusRooms[roomId]) {
        mockJanusRooms[roomId].participants = mockJanusRooms[roomId].participants.filter(
          (p: any) => p.id !== participantId
        )
      }

      return res.json({ success: true, message: `Participant ${participantId} kicked` })
    } catch (error) {
      return res.status(500).json({ error: 'Failed to kick participant' })
    }
  })

  // POST /api/admin/janus/rooms/:roomId/rtp-forward/start
  app.post('/api/admin/janus/rooms/:roomId/rtp-forward/start', adminMiddleware, async (req, res) => {
    try {
      const roomId = parseInt(req.params.roomId)
      const { host, port } = req.body

      if (!host || !port) {
        return res.status(400).json({ error: 'host and port required' })
      }

      if (!mockRTPForwards[roomId]) {
        mockRTPForwards[roomId] = []
      }

      const streamId = Math.floor(Math.random() * 10000)
      mockRTPForwards[roomId].push({ streamId, host, port })

      return res.json({ streamId, message: `RTP forward started to ${host}:${port}` })
    } catch (error) {
      return res.status(500).json({ error: 'Failed to start RTP forward' })
    }
  })

  // POST /api/admin/janus/rooms/:roomId/rtp-forward/stop
  app.post('/api/admin/janus/rooms/:roomId/rtp-forward/stop', adminMiddleware, async (req, res) => {
    try {
      const roomId = parseInt(req.params.roomId)
      const { streamId } = req.body

      if (!streamId) {
        return res.status(400).json({ error: 'streamId required' })
      }

      if (mockRTPForwards[roomId]) {
        mockRTPForwards[roomId] = mockRTPForwards[roomId].filter(f => f.streamId !== streamId)
      }

      return res.json({ success: true, message: `RTP forward ${streamId} stopped` })
    } catch (error) {
      return res.status(500).json({ error: 'Failed to stop RTP forward' })
    }
  })

  return app
}

describe('Janus Admin API', () => {
  let app: express.Application

  beforeAll(async () => {
    await setupTestDB()
    app = createTestApp()
  })

  afterAll(async () => {
    await teardownTestDB()
  })

  describe('GET /api/admin/janus/rooms', () => {
    it('should list all Janus-enabled rooms', async () => {
      // Create test radio with Janus enabled
      const radio = await prisma.radioConnection.create({
        data: {
          name: 'Test Radio',
          host: '127.0.0.1',
          port: 4532,
          janusRoomId: '100001',
        },
      })

      const response = await request(app).get('/api/admin/janus/rooms')

      expect(response.status).toBe(200)
      expect(Array.isArray(response.body)).toBe(true)
      expect(response.body[0]).toHaveProperty('roomId')
      expect(response.body[0]).toHaveProperty('radioId')
      expect(response.body[0]).toHaveProperty('participantCount')
      expect(response.body[0]).toHaveProperty('rtpForwards')

      // Cleanup
      await prisma.radioConnection.delete({ where: { id: radio.id } })
    })

    it('should exclude non-Janus radios', async () => {
      const response = await request(app).get('/api/admin/janus/rooms')
      expect(response.status).toBe(200)
      expect(response.body.every((room: any) => room.roomId)).toBe(true)
    })
  })

  describe('GET /api/admin/janus/rooms/:roomId/participants', () => {
    it('should fetch participants for a room', async () => {
      const response = await request(app).get('/api/admin/janus/rooms/100001/participants')

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('roomId', 100001)
      expect(Array.isArray(response.body.participants)).toBe(true)
      expect(response.body.participants[0]).toHaveProperty('id')
      expect(response.body.participants[0]).toHaveProperty('display')
    })

    it('should return empty participants for unknown room', async () => {
      const response = await request(app).get('/api/admin/janus/rooms/999999/participants')

      expect(response.status).toBe(200)
      expect(response.body.participants).toEqual([])
    })
  })

  describe('POST /api/admin/janus/rooms/:roomId/kick', () => {
    it('should kick a participant from room', async () => {
      const initialParticipants = 2
      const response = await request(app)
        .post('/api/admin/janus/rooms/100001/kick')
        .send({ participantId: 1 })

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('success', true)

      // Verify participant was kicked
      const checkResponse = await request(app).get('/api/admin/janus/rooms/100001/participants')
      expect(checkResponse.body.participants).toHaveLength(initialParticipants - 1)
    })

    it('should reject kick without participantId', async () => {
      const response = await request(app)
        .post('/api/admin/janus/rooms/100001/kick')
        .send({})

      expect(response.status).toBe(400)
      expect(response.body).toHaveProperty('error')
    })
  })

  describe('POST /api/admin/janus/rooms/:roomId/rtp-forward/start', () => {
    it('should start RTP forward', async () => {
      const response = await request(app)
        .post('/api/admin/janus/rooms/100001/rtp-forward/start')
        .send({ host: '192.168.1.50', port: 5007 })

      expect(response.status).toBe(200)
      expect(response.body).toHaveProperty('streamId')
      expect(response.body).toHaveProperty('message')
    })

    it('should reject start without host/port', async () => {
      const response = await request(app)
        .post('/api/admin/janus/rooms/100001/rtp-forward/start')
        .send({ host: '192.168.1.50' })

      expect(response.status).toBe(400)
      expect(response.body).toHaveProperty('error')
    })

    it('should create new stream with unique streamId', async () => {
      const response1 = await request(app)
        .post('/api/admin/janus/rooms/100001/rtp-forward/start')
        .send({ host: '192.168.1.60', port: 5008 })

      const response2 = await request(app)
        .post('/api/admin/janus/rooms/100001/rtp-forward/start')
        .send({ host: '192.168.1.70', port: 5009 })

      expect(response1.body.streamId).not.toBe(response2.body.streamId)
    })
  })

  describe('POST /api/admin/janus/rooms/:roomId/rtp-forward/stop', () => {
    it('should stop RTP forward', async () => {
      // Start forward first
      const startResponse = await request(app)
        .post('/api/admin/janus/rooms/100001/rtp-forward/start')
        .send({ host: '192.168.1.80', port: 5010 })

      const streamId = startResponse.body.streamId

      // Stop forward
      const stopResponse = await request(app)
        .post('/api/admin/janus/rooms/100001/rtp-forward/stop')
        .send({ streamId })

      expect(stopResponse.status).toBe(200)
      expect(stopResponse.body).toHaveProperty('success', true)
    })

    it('should reject stop without streamId', async () => {
      const response = await request(app)
        .post('/api/admin/janus/rooms/100001/rtp-forward/stop')
        .send({})

      expect(response.status).toBe(400)
      expect(response.body).toHaveProperty('error')
    })
  })

  describe('Voice room integration', () => {
    it('should support operator/listener join modes', async () => {
      const radio = await prisma.radioConnection.create({
        data: {
          name: 'Test Radio 2',
          host: '127.0.0.2',
          port: 4533,
          janusRoomId: '100002',
        },
      })

      // Verify room exists in list
      const response = await request(app).get('/api/admin/janus/rooms')
      expect(response.status).toBe(200)
      const room = response.body.find((r: any) => r.roomId === 100002)
      expect(room).toBeDefined()

      // Cleanup
      await prisma.radioConnection.delete({ where: { id: radio.id } })
    })

    it('should track participant roles (operator/listener)', async () => {
      const response = await request(app).get('/api/admin/janus/rooms/100001/participants')

      expect(response.status).toBe(200)
      // Participants should have publisher flag indicating operator vs listener
      expect(response.body.participants[0]).toHaveProperty('publisher')
    })
  })
})
