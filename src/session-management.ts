import prisma from './db';
import { randomBytes } from 'crypto';

/**
 * Session Management Module
 * 
 * Handles session lifecycle, cleanup, and prepares for future authentication
 */

export interface SessionData {
  token: string;
  callsign: string;
  stationId: string;
  expiresAt: Date;
  lastActivity: Date;
  browserId?: string | null;
  sourceType?: string;
  sourceInfo?: string | null;
}

export interface SessionOptions {
  callsign?: string;
  stationId?: string;
  expiresAt?: Date;
  browserId?: string;
  sourceType?: string;
  sourceInfo?: string;
}

const SESSION_TIMEOUT_MINUTES = 20;

function mapSession(session: {
  token: string;
  callsign: string;
  stationId: string;
  expiresAt: Date;
  lastActivity: Date;
  browserId: string | null;
  sourceType: string;
  sourceInfo: string | null;
}): SessionData {
  return {
    token: session.token,
    callsign: session.callsign,
    stationId: session.stationId,
    expiresAt: session.expiresAt,
    lastActivity: session.lastActivity,
    browserId: session.browserId,
    sourceType: session.sourceType,
    sourceInfo: session.sourceInfo,
  };
}

/**
 * Generate a secure session token
 */
export function generateSessionToken(): string {
  return randomBytes(24).toString('base64url').slice(0, 32);
}

/**
 * Create a new session
 */
export async function createSession(options: SessionOptions): Promise<SessionData> {
  const now = new Date();
  const defaultExpiresAt = new Date(now.getTime() + SESSION_TIMEOUT_MINUTES * 60 * 1000);
  const expiresAt = options.expiresAt || defaultExpiresAt;

  const existingSessions = await prisma.session.findMany({
    where: {
      stationId: options.stationId,
      expiresAt: {
        gte: now,
      },
    },
  });

  if (existingSessions.length > 0) {
    console.warn(`[Session] Station ${options.stationId} already has active sessions`);
  }

  const session = await prisma.session.create({
    data: {
      token: generateSessionToken(),
      callsign: options.callsign || 'UNASSIGNED',
      stationId: options.stationId || 'unknown',
      expiresAt,
      lastActivity: now,
      browserId: options.browserId,
      sourceType: options.sourceType ?? 'web',
      sourceInfo: options.sourceInfo,
    },
  });

  return mapSession(session);
}

/**
 * Extend session expiration
 */
export async function extendSession(sessionToken: string): Promise<boolean> {
  const now = new Date();
  const newExpiresAt = new Date(now.getTime() + SESSION_TIMEOUT_MINUTES * 60 * 1000);

  const session = await prisma.session.findUnique({ where: { token: sessionToken } });

  if (!session) {
    return false;
  }

  if (now > session.expiresAt) {
    return false;
  }

  const updated = await prisma.session.update({
    where: { id: session.id },
    data: {
      expiresAt: newExpiresAt,
      lastActivity: now,
    },
  });

  return !!updated;
}

/**
 * Validate and activate session
 */
export async function validateSession(sessionToken: string): Promise<{
  valid: boolean;
  session?: SessionData;
  reason?: string;
}> {
  const now = new Date();
  const session = await prisma.session.findUnique({ where: { token: sessionToken } });

  if (!session) {
    return {
      valid: false,
      reason: 'Session not found',
    };
  }

  if (now > session.expiresAt) {
    await cleanExpiredSession(mapSession(session));
    return {
      valid: false,
      reason: 'Session expired',
    };
  }

  const inactiveMs = now.getTime() - session.lastActivity.getTime();
  const inactiveMin = inactiveMs / (1000 * 60);

  if (inactiveMin > SESSION_TIMEOUT_MINUTES) {
    await cleanExpiredSession(mapSession(session));
    return {
      valid: false,
      reason: `Session inactive for ${Math.round(inactiveMin)} minutes`,
    };
  }

  await prisma.session.update({
    where: { id: session.id },
    data: { lastActivity: now },
  });

  return {
    valid: true,
    session: mapSession(session),
  };
}

/**
 * Logout and invalidate session
 */
export async function logout(sessionToken: string): Promise<boolean> {
  const deleted = await prisma.session.deleteMany({
    where: { token: sessionToken },
  });
  return deleted.count > 0;
}

/**
 * Unset station callsign when session ends
 */
export async function unsetStationCallsign(stationId: string): Promise<void> {
  // Station callsign is a required + unique field in the schema.
  // Keep this helper as a compatibility no-op for callers/docs.
  void stationId;
}

/**
 * Clean up expired session and associated data
 * Ensures station callsign is unset even if session delete fails
 */
export async function cleanExpiredSession(session: SessionData): Promise<void> {
  try {
    await prisma.session.deleteMany({
      where: { token: session.token },
    });
    console.log(`[Session] Cleaned up expired session for station ${session.stationId}`);
  } catch (error) {
    console.error(`[Session] Failed to clean up session:`, error);
  }
}

/**
 * Get session by token
 */
export async function getSessionByToken(sessionToken: string): Promise<SessionData | null> {
  const now = new Date();
  const session = await prisma.session.findUnique({ where: { token: sessionToken } });

  if (!session || now > session.expiresAt) {
    return null;
  }

  return mapSession(session);
}

/**
 * Get active sessions count
 */
export async function getActiveSessionsCount(): Promise<number> {
  const now = new Date();
  return prisma.session.count({
    where: {
      expiresAt: {
        gte: now,
      },
    },
  });
}

/**
 * Get active sessions by station
 */
export async function getActiveSessionsByStation(stationId: string): Promise<number> {
  const now = new Date();
  return prisma.session.count({
    where: {
      stationId,
      expiresAt: {
        gte: now,
      },
    },
  });
}

/**
 * Get all expired sessions for cleanup
 */
export async function getExpiredSessions(): Promise<SessionData[]> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - SESSION_TIMEOUT_MINUTES * 60 * 1000);
  const sessions = await prisma.session.findMany({
    where: {
      OR: [
        { expiresAt: { lte: now } },
        { lastActivity: { lte: cutoff } },
      ],
    },
  });

  return sessions.map(mapSession);
}

/**
 * Bulk cleanup expired sessions
 */
export async function cleanupExpiredSessions(maxInactiveMinutes: number): Promise<number> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - maxInactiveMinutes * 60 * 1000);

  const sessions = await prisma.session.findMany({
    where: {
      OR: [
        { lastActivity: { lte: cutoff } },
        { expiresAt: { lte: now } },
      ],
    },
  });

  for (const session of sessions) {
    try {
      await prisma.session.delete({
        where: { id: session.id },
      });
    } catch (error) {
      console.error(`[Session] Failed to cleanup session:`, error);
    }
  }

  console.log(`[Session] Cleaned up ${sessions.length} expired sessions`);
  return sessions.length;
}

/**
 * Cleanup sessions with expired timestamps
 */
export async function cleanupExpiredTimestamps(maxAgeMinutes: number): Promise<number> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - maxAgeMinutes * 60 * 1000);

  const sessions = await prisma.session.findMany({
    where: {
      expiresAt: {
        lte: cutoff,
      },
    },
    include: {
      station: true,
    },
  });

  let deletedCount = 0;

  for (const session of sessions) {
    try {
      await prisma.session.delete({
        where: { id: session.id },
      });

      deletedCount++;
    } catch (error) {
      console.error(`[Session] Failed to cleanup expired timestamp session ${session.id}:`, error);
    }
  }

  console.log(`[Session] Cleaned up ${deletedCount} sessions with expired timestamps`);
  return deletedCount;
}

/**
 * Prepare for future authentication system
 */
export async function prepareForUserAuth(stationId: string): Promise<void> {
  await prisma.station.update({
    where: { id: stationId },
    data: {
      name: 'Awaiting Authentication',
    },
  });

  console.log(`[Session] Station ${stationId} prepared for user authentication`);
}

/**
 * Get session statistics
 */
export async function getSessionStats(): Promise<{
  totalSessions: number;
  activeSessions: number;
  expiredSessions: number;
  sessionsBySource: Record<string, number>;
}> {
  const now = new Date();

  const totalSessions = await prisma.session.count();
  const activeSessions = await prisma.session.count({
    where: {
      expiresAt: {
        gte: now,
      },
    },
  });

  const expiredSessions = await prisma.session.count({
    where: {
      expiresAt: {
        lte: now,
      },
    },
  });

  const sessionsBySource = await prisma.session.groupBy({
    by: ['sourceType'],
    _count: true,
  });

  const grouped: Record<string, number> = {};
  for (const { sourceType, _count } of sessionsBySource) {
    grouped[sourceType || 'unknown'] = _count;
  }

  return {
    totalSessions,
    activeSessions,
    expiredSessions,
    sessionsBySource: grouped,
  };
}

/**
 * Force reset station callsign to undefined (for testing)
 */
export async function forceResetStationCallsign(stationId: string): Promise<boolean> {
  try {
    await prisma.station.update({
      where: { id: stationId },
      data: { name: stationId },
    });
    console.log(`[Session] Force reset station metadata for ${stationId}`);
    return true;
  } catch (error) {
    console.error(`[Session] Failed to force reset station ${stationId}:`, error);
    return false;
  }
}

/**
 * Get stale sessions (inactive for more than max minutes)
 */
export async function getStaleSessions(maxInactiveMinutes: number): Promise<SessionData[]> {
  const now = new Date();
  const cutoff = new Date(now.getTime() - maxInactiveMinutes * 60 * 1000);

  const sessions = await prisma.session.findMany({
    where: {
      lastActivity: {
        lte: cutoff,
      },
    },
  });

  return sessions.map(mapSession);
}

/**
 * Manual session cleanup for debugging/testing
 */
export async function manualSessionCleanup(sessionId: string): Promise<boolean> {
  try {
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      console.warn(`[Session] Session ${sessionId} not found`);
      return false;
    }

    await prisma.session.delete({
      where: { id: sessionId },
    });

    console.log(`[Session] Manually cleaned up session ${sessionId}`);
    return true;
  } catch (error) {
    console.error(`[Session] Failed to manually cleanup session ${sessionId}:`, error);
    return false;
  }
}

/**
 * Cleanup cron job - runs periodically to clean up expired sessions
 */
export async function cleanupExpiredSessionsCron(maxInactiveMinutes: number = 20): Promise<number> {
  console.log('[Session] Running cleanup cron job...');
  const cleaned = await cleanupExpiredSessions(maxInactiveMinutes);
  console.log(`[Session] Cleanup cron job completed: ${cleaned} sessions cleaned up`);
  return cleaned;
}

/**
 * Set up session cleanup interval (for testing)
 */
let cleanupInterval: NodeJS.Timeout | null = null;

export function startCleanupInterval(intervalMinutes: number): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
  }

  cleanupInterval = setInterval(async () => {
    await cleanupExpiredSessionsCron();
  }, intervalMinutes * 60 * 1000);

  console.log(`[Session] Cleanup interval started: ${intervalMinutes} minutes`);
}

export function stopCleanupInterval(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('[Session] Cleanup interval stopped');
  }
}
