/**
 * Session Management Tests
 */

import { describe, it, expect, beforeEach } from '@jest/globals';
import {
  createSession,
  validateSession,
  logout,
  cleanupExpiredSessions,
  getActiveSessionsCount,
  getSessionStats,
  getExpiredSessions,
  extendSession,
  getSessionByToken,
  getStaleSessions,
  generateSessionToken,
} from '../src/session-management';
import prisma from '../src/db';

describe('Session Management', () => {
  beforeEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    await prisma.$disconnect();
  });

  describe('generateSessionToken', () => {
    it('should generate a 32-character token', () => {
      const token = generateSessionToken();
      expect(token).toHaveLength(32);
      expect(token).toMatch(/^[A-Za-z0-9]+$/);
    });

    it('should generate unique tokens', () => {
      const token1 = generateSessionToken();
      const token2 = generateSessionToken();
      expect(token1).not.toEqual(token2);
    });
  });

  describe('createSession', () => {
    it('should create a session with default options', async () => {
      jest.spyOn(prisma.session, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.session, 'create').mockResolvedValue({
        id: '1' as string,
        token: 'test-token-123',
        callsign: 'TEST',
        stationId: 'station-1',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 20 * 60 * 1000),
        lastActivity: new Date(),
        browserId: null,
        sourceType: 'web',
        sourceInfo: null,
      });

      const result = await createSession({
        callsign: 'TEST',
        stationId: 'station-1',
      });

      expect(result.token).toBe('test-token-123');
      expect(result.callsign).toBe('TEST');
      expect(result.stationId).toBe('station-1');
    });

    it('should use provided callsign', async () => {
      jest.spyOn(prisma.session, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.session, 'create').mockResolvedValue({
        id: '1' as string,
        token: 'test-token-456',
        callsign: 'CUSTOM',
        stationId: 'station-1',
        createdAt: new Date(),
        expiresAt: new Date(),
        lastActivity: new Date(),
        browserId: null,
        sourceType: 'web',
        sourceInfo: null,
      });

      const result = await createSession({
        callsign: 'CUSTOM',
        stationId: 'station-1',
      });

      expect(result.callsign).toBe('CUSTOM');
    });

    it('should use default UNASSIGNED callsign if not provided', async () => {
      jest.spyOn(prisma.session, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.session, 'create').mockResolvedValue({
        id: '1' as string,
        token: 'test-token-789',
        callsign: 'UNASSIGNED',
        stationId: 'unknown',
        createdAt: new Date(),
        expiresAt: new Date(),
        lastActivity: new Date(),
        browserId: null,
        sourceType: 'web',
        sourceInfo: null,
      });

      const result = await createSession({ stationId: 'unknown' });
      expect(result.callsign).toBe('UNASSIGNED');
    });

    it('should accept optional browserId and source info', async () => {
      jest.spyOn(prisma.session, 'findMany').mockResolvedValue([]);
      jest.spyOn(prisma.session, 'create').mockResolvedValue({
        id: '1' as string,
        token: 'test-token-abc',
        callsign: 'TEST',
        stationId: 'station-1',
        createdAt: new Date(),
        expiresAt: new Date(),
        lastActivity: new Date(),
        browserId: 'chrome-desktop',
        sourceType: 'web',
        sourceInfo: 'Mozilla/5.0',
      });

      const result = await createSession({
        callsign: 'TEST',
        stationId: 'station-1',
        browserId: 'chrome-desktop',
        sourceType: 'web',
        sourceInfo: 'Mozilla/5.0',
      });

      expect(result.browserId).toBe('chrome-desktop');
      expect(result.sourceType).toBe('web');
    });
  });

  describe('validateSession', () => {
    it('should return valid session if token exists and is not expired', async () => {
      const mockSession = {
        id: '1' as string,
        token: 'valid-token',
        callsign: 'TEST',
        stationId: 'station-1',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        lastActivity: new Date(Date.now() - 10 * 60 * 1000),
        browserId: null,
        sourceType: 'web',
        sourceInfo: null,
      };

      jest.spyOn(prisma.session, 'findUnique').mockResolvedValue(mockSession);
      jest.spyOn(prisma.session, 'update').mockResolvedValue(mockSession);

      const result = await validateSession('valid-token');

      expect(result.valid).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.session?.token).toBe('valid-token');
      expect(result.reason).toBeUndefined();
    });

    it('should return invalid if session not found', async () => {
      jest.spyOn(prisma.session, 'findUnique').mockResolvedValue(null);

      const result = await validateSession('invalid-token');

      expect(result.valid).toBe(false);
      expect(result.reason).toBe('Session not found');
    });

    it('should return invalid if session has expired', async () => {
      const expiredSession = {
        id: '1' as string,
        token: 'expired-token',
        callsign: 'TEST',
        stationId: 'station-1',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() - 10 * 60 * 1000),
        lastActivity: new Date(Date.now() - 30 * 60 * 1000),
        browserId: null,
        sourceType: 'web',
        sourceInfo: null,
      };

      jest.spyOn(prisma.session, 'findUnique').mockResolvedValue(expiredSession);
      jest.spyOn(prisma.session, 'update').mockResolvedValue(expiredSession);
      jest.spyOn(prisma.station, 'update').mockResolvedValue({} as any);

      const result = await validateSession('expired-token');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('expired');
    });

    it('should return invalid if session is inactive for more than 20 minutes', async () => {
      const inactiveSession = {
        id: '1' as string,
        token: 'inactive-token',
        callsign: 'TEST',
        stationId: 'station-1',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        lastActivity: new Date(Date.now() - 25 * 60 * 1000),
        browserId: null,
        sourceType: 'web',
        sourceInfo: null,
      };

      jest.spyOn(prisma.session, 'findUnique').mockResolvedValue(inactiveSession);
      jest.spyOn(prisma.session, 'update').mockResolvedValue(inactiveSession);
      jest.spyOn(prisma.station, 'update').mockResolvedValue({} as any);

      const result = await validateSession('inactive-token');

      expect(result.valid).toBe(false);
      expect(result.reason).toContain('inactive');
    });

    it('should return valid if session is recently active', async () => {
      const activeSession = {
        id: '1' as string,
        token: 'active-token',
        callsign: 'TEST',
        stationId: 'station-1',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        lastActivity: new Date(Date.now() - 5 * 60 * 1000),
        browserId: null,
        sourceType: 'web',
        sourceInfo: null,
      };

      jest.spyOn(prisma.session, 'findUnique').mockResolvedValue(activeSession);
      jest.spyOn(prisma.session, 'update').mockResolvedValue(activeSession);

      const result = await validateSession('active-token');

      expect(result.valid).toBe(true);
    });
  });

  describe('extendSession', () => {
    it('should extend session expiration', async () => {
      const mockSession = {
        id: '1' as string,
        token: 'extend-token',
        callsign: 'TEST',
        stationId: 'station-1',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        lastActivity: new Date(),
        browserId: null,
        sourceType: 'web',
        sourceInfo: null,
      };

      jest.spyOn(prisma.session, 'findUnique').mockResolvedValue(mockSession);
      jest.spyOn(prisma.session, 'update').mockResolvedValue(mockSession);

      const result = await extendSession('extend-token');

      expect(result).toBe(true);
    });

    it('should return false if session not found', async () => {
      jest.spyOn(prisma.session, 'findUnique').mockResolvedValue(null);

      const result = await extendSession('nonexistent-token');

      expect(result).toBe(false);
    });

    it('should return false if session already expired', async () => {
      const expiredSession = {
        id: '1' as string,
        token: 'expired-token',
        callsign: 'TEST',
        stationId: 'station-1',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() - 10 * 60 * 1000),
        lastActivity: new Date(Date.now() - 30 * 60 * 1000),
        browserId: null,
        sourceType: 'web',
        sourceInfo: null,
      };

      jest.spyOn(prisma.session, 'findUnique').mockResolvedValue(expiredSession);

      const result = await extendSession('expired-token');

      expect(result).toBe(false);
    });
  });

  describe('logout', () => {
    it('should successfully logout and delete session', async () => {
      jest.spyOn(prisma.session, 'deleteMany').mockResolvedValue({ count: 1 });

      const result = await logout('logout-token');

      expect(result).toBe(true);
    });

    it('should return false if session not found', async () => {
      jest.spyOn(prisma.session, 'deleteMany').mockResolvedValue({ count: 0 });

      const result = await logout('nonexistent-token');

      expect(result).toBe(false);
    });
  });

  describe('cleanupExpiredSessions', () => {
    it('should cleanup sessions inactive for more than maxInactiveMinutes', async () => {
      const now = new Date();
      const mockSessions = [
        {
          id: '1' as string,
          token: 'expired-1',
          callsign: 'TEST',
          stationId: 'station-1',
          createdAt: new Date(),
          lastActivity: new Date(now.getTime() - 25 * 60 * 1000),
          expiresAt: new Date(),
          browserId: null,
          sourceType: 'web',
          sourceInfo: null,
        },
        {
          id: '2' as string,
          token: 'expired-2',
          callsign: 'TEST2',
          stationId: 'station-2',
          createdAt: new Date(),
          lastActivity: new Date(now.getTime() - 30 * 60 * 1000),
          expiresAt: new Date(),
          browserId: null,
          sourceType: 'web',
          sourceInfo: null,
        },
      ];

      jest.spyOn(prisma.session, 'findMany').mockResolvedValue(mockSessions);
      jest.spyOn(prisma.station, 'update').mockResolvedValue({} as any);
      jest.spyOn(prisma.session, 'delete').mockResolvedValue({ id: '1' } as any);
      jest.spyOn(prisma.session, 'delete').mockResolvedValue({ id: '2' } as any);

      const result = await cleanupExpiredSessions(20);

      expect(result).toBe(2);
    });

    it('should return 0 if no sessions to cleanup', async () => {
      jest.spyOn(prisma.session, 'findMany').mockResolvedValue([]);

      const result = await cleanupExpiredSessions(20);

      expect(result).toBe(0);
    });
  });

  describe('getActiveSessionsCount', () => {
    it('should return count of active sessions', async () => {
      jest.spyOn(prisma.session, 'count').mockResolvedValue(5);

      const result = await getActiveSessionsCount();

      expect(result).toBe(5);
    });
  });

  describe('getSessionStats', () => {
    it('should return comprehensive session statistics', async () => {
      let callIndex = 0;
      const mockCountImpl = () => {
        callIndex++;
        switch (callIndex) {
          case 1: return Promise.resolve(100);
          case 2: return Promise.resolve(80);
          case 3: return Promise.resolve(20);
          default: return Promise.resolve(0);
        }
      };
      jest.spyOn(prisma.session, 'count').mockImplementation(mockCountImpl as any);

      const mockGroupBy = [
        { id: '1', token: '1', callsign: '1', stationId: '1', sourceType: 'web', _count: 50 },
        { id: '2', token: '2', callsign: '2', stationId: '2', sourceType: 'mobile', _count: 30 },
        { id: '3', token: '3', callsign: '3', stationId: '3', sourceType: 'desktop', _count: 20 },
      ] as any;
      jest.spyOn(prisma.session, 'groupBy').mockResolvedValue(mockGroupBy);

      const result = await getSessionStats();

      expect(result.totalSessions).toBe(100);
      expect(result.activeSessions).toBe(80);
      expect(result.expiredSessions).toBe(20);
      expect(result.sessionsBySource.web).toBe(50);
      expect(result.sessionsBySource.mobile).toBe(30);
      expect(result.sessionsBySource.desktop).toBe(20);
    });
  });

  describe('getExpiredSessions', () => {
    it('should return list of expired sessions', async () => {
      const now = new Date();
      const mockSessions = [
        {
          id: '1' as string,
          token: 'expired-1',
          callsign: 'TEST',
          stationId: 'station-1',
          createdAt: new Date(),
          expiresAt: new Date(now.getTime() - 10 * 60 * 1000),
          lastActivity: new Date(),
          browserId: null,
          sourceType: 'web',
          sourceInfo: null,
        },
      ];

      jest.spyOn(prisma.session, 'findMany').mockResolvedValue(mockSessions);

      const result = await getExpiredSessions();

      expect(result.length).toBe(1);
      expect(result[0].token).toBe('expired-1');
    });
  });

  describe('getStaleSessions', () => {
    it('should return sessions inactive for more than maxInactiveMinutes', async () => {
      const now = new Date();
      const mockSessions = [
        {
          id: '1' as string,
          token: 'stale-1',
          callsign: 'TEST',
          stationId: 'station-1',
          createdAt: new Date(),
          lastActivity: new Date(now.getTime() - 25 * 60 * 1000),
          expiresAt: new Date(),
          browserId: null,
          sourceType: 'web',
          sourceInfo: null,
        },
        {
          id: '2' as string,
          token: 'stale-2',
          callsign: 'TEST2',
          stationId: 'station-2',
          createdAt: new Date(),
          lastActivity: new Date(now.getTime() - 30 * 60 * 1000),
          expiresAt: new Date(),
          browserId: null,
          sourceType: 'web',
          sourceInfo: null,
        },
      ];

      jest.spyOn(prisma.session, 'findMany').mockResolvedValue(mockSessions);

      const result = await getStaleSessions(20);

      expect(result.length).toBe(2);
    });
  });

  describe('getSessionByToken', () => {
    it('should return null for expired session', async () => {
      const now = new Date();
      const expiredSession = {
        id: '1' as string,
        token: 'expired-token',
        callsign: 'TEST',
        stationId: 'station-1',
        createdAt: new Date(),
        expiresAt: new Date(now.getTime() - 10 * 60 * 1000),
        lastActivity: new Date(),
        browserId: null,
        sourceType: 'web',
        sourceInfo: null,
      };

      jest.spyOn(prisma.session, 'findUnique').mockResolvedValue(expiredSession);

      const result = await getSessionByToken('expired-token');

      expect(result).toBeNull();
    });

    it('should return valid session data', async () => {
      const validSession = {
        id: '1' as string,
        token: 'valid-token',
        callsign: 'TEST',
        stationId: 'station-1',
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        lastActivity: new Date(),
        browserId: 'chrome',
        sourceType: 'web',
        sourceInfo: 'Mozilla/5.0',
      };

      jest.spyOn(prisma.session, 'findUnique').mockResolvedValue(validSession);

      const result = await getSessionByToken('valid-token');

      expect(result).toBeDefined();
      expect(result?.token).toBe('valid-token');
      expect(result?.callsign).toBe('TEST');
    });
  });
});
