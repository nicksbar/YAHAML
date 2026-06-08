import prisma from './db';

/**
 * Session Cleanup Utility
 * 
 * Handles cleanup of stale sessions and associated station data
 */

export interface CleanupOptions {
  maxAgeMinutes?: number;
  cleanStations?: boolean;
  cleanBandActivity?: boolean;
  cleanBandOccupancy?: boolean;
  cleanOperatorMessages?: boolean;
  cleanContextLogs?: boolean;
}

export interface CleanupResult {
  sessionsCleaned: number;
  stationsCleaned: number;
  bandActivityCleaned: number;
  bandOccupancyCleaned: number;
  messagesCleaned: number;
  logsCleaned: number;
  errors: string[];
}

/**
 * Get stations that have only expired sessions
 */
export async function getStationsWithExpiredSessions(): Promise<{
  stationId: string;
  callsign: string;
  sessionCount: number;
}[]> {
  const now = new Date();
  
  const expiredSessions = await prisma.session.findMany({
    where: {
      expiresAt: {
        lte: now,
      },
    },
    include: {
      station: true,
    },
  });

  const stationsWithExpiredSessions: Map<string, { stationId: string; callsign: string; sessionCount: number }> = new Map();

  for (const session of expiredSessions) {
    if (session.stationId && session.station) {
      const stationId = session.stationId;
      const existing = stationsWithExpiredSessions.get(stationId);

      if (!existing) {
        stationsWithExpiredSessions.set(stationId, {
          stationId,
          callsign: session.station.callsign,
          sessionCount: 0,
        });
      }

      stationsWithExpiredSessions.get(stationId)!.sessionCount++;
    }
  }

  return Array.from(stationsWithExpiredSessions.values());
}

/**
 * Cleanup station when all sessions are expired
 */
export async function cleanupStation(stationId: string): Promise<void> {
  try {
    console.log(`[Cleanup] Cleaning up station ${stationId}...`);

    const station = await prisma.station.findUnique({
      where: { id: stationId },
      include: {
        bandActivities: true,
        bandOccupancy: true,
        operatorMessages: true,
        contextLogs: true,
      },
    });

    if (!station) {
      console.warn(`[Cleanup] Station ${stationId} not found`);
      return;
    }

    if (station.bandActivities.length > 0) {
      await prisma.bandActivity.deleteMany({
        where: { stationId },
      });
      console.log(`[Cleanup] Deleted ${station.bandActivities.length} band activities`);
    }

    if (station.bandOccupancy.length > 0) {
      await prisma.bandOccupancy.deleteMany({
        where: { stationId },
      });
      console.log(`[Cleanup] Deleted ${station.bandOccupancy.length} band occupancy records`);
    }

    if (station.operatorMessages.length > 0) {
      await prisma.operatorMessage.deleteMany({
        where: { stationId },
      });
      console.log(`[Cleanup] Deleted ${station.operatorMessages.length} operator messages`);
    }

    if (station.contextLogs.length > 100) {
      const toDelete = station.contextLogs.slice(0, station.contextLogs.length - 100);
      await prisma.contextLog.deleteMany({
        where: {
          id: { in: toDelete.map(log => log.id) },
        },
      });
      console.log(`[Cleanup] Archived ${toDelete.length} context logs`);
    }

    await prisma.station.update({
      where: { id: stationId },
      data: {
        callsign: 'DELETED',
        name: 'DELETED',
      },
    });

    console.log(`[Cleanup] Station ${stationId} cleaned up successfully`);
  } catch (error) {
    console.error(`[Cleanup] Failed to cleanup station ${stationId}:`, error);
  }
}

/**
 * Cleanup expired sessions for a station
 */
export async function cleanupExpiredSessionsForStation(stationId: string): Promise<number> {
  try {
    const now = new Date();
    const cutoff = new Date(now.getTime() - 20 * 60 * 1000);

    const sessions = await prisma.session.findMany({
      where: {
        stationId,
        lastActivity: {
          lte: cutoff,
        },
      },
    });

    let deletedCount = 0;

    for (const session of sessions) {
      try {
        await prisma.session.delete({
          where: { id: (session as any).id },
        });
        deletedCount++;
      } catch (error) {
        console.error(`[Cleanup] Failed to delete session:`, error);
      }
    }

    console.log(`[Cleanup] Deleted ${deletedCount} expired sessions for station ${stationId}`);
    return deletedCount;
  } catch (error) {
    console.error(`[Cleanup] Failed to cleanup sessions for station ${stationId}:`, error);
    return 0;
  }
}

/**
 * Full cleanup of stale session and station data
 */
export async function cleanupStaleData(options: CleanupOptions = {}): Promise<CleanupResult> {
  const now = new Date();
  const maxAgeMinutes = options.maxAgeMinutes || 20;
  const cutoff = new Date(now.getTime() - maxAgeMinutes * 60 * 1000);

  const result: CleanupResult = {
    sessionsCleaned: 0,
    stationsCleaned: 0,
    bandActivityCleaned: 0,
    bandOccupancyCleaned: 0,
    messagesCleaned: 0,
    logsCleaned: 0,
    errors: [],
  };

  try {
    const oldSessions = await prisma.session.findMany({
      where: {
        lastActivity: {
          lte: cutoff,
        },
      },
      include: {
        station: true,
      },
    });

    for (const session of oldSessions) {
      try {
        await prisma.session.delete({
          where: { id: (session as any).id },
        });
        result.sessionsCleaned++;
      } catch (error) {
        result.errors.push(`Failed to delete session: ${error}`);
      }

      if (session.stationId && options.cleanStations) {
        try {
          await cleanupStation(session.stationId);
          result.stationsCleaned++;
        } catch (error) {
          result.errors.push(`Failed to cleanup station ${session.stationId}: ${error}`);
        }
      }
    }

    if (options.cleanBandActivity) {
      try {
        const oldBandActivities = await prisma.bandActivity.findMany({
          where: {
            lastSeen: {
              lte: cutoff,
            },
          },
        });

        if (oldBandActivities.length > 0) {
          await prisma.bandActivity.deleteMany({
            where: {
              lastSeen: {
                lte: cutoff,
              },
            },
          });
          result.bandActivityCleaned = oldBandActivities.length;
          console.log(`[Cleanup] Deleted ${result.bandActivityCleaned} stale band activities`);
        }
      } catch (error) {
        result.errors.push(`Failed to cleanup band activity: ${error}`);
      }
    }

    if (options.cleanBandOccupancy) {
      try {
        const oldOccupancy = await prisma.bandOccupancy.findMany({
          where: {
            lastSeen: {
              lte: cutoff,
            },
          },
        });

        if (oldOccupancy.length > 0) {
          await prisma.bandOccupancy.deleteMany({
            where: {
              lastSeen: {
                lte: cutoff,
              },
            },
          });
          result.bandOccupancyCleaned = oldOccupancy.length;
          console.log(`[Cleanup] Deleted ${result.bandOccupancyCleaned} stale band occupancy records`);
        }
      } catch (error) {
        result.errors.push(`Failed to cleanup band occupancy: ${error}`);
      }
    }

    if (options.cleanOperatorMessages) {
      try {
        const totalMessages = await prisma.operatorMessage.count();
        const keepCount = 1000;

        if (totalMessages > keepCount) {
          const toDelete = await prisma.operatorMessage.findMany({
            take: totalMessages - keepCount,
            orderBy: { createdAt: 'asc' },
          });

          await prisma.operatorMessage.deleteMany({
            where: {
              id: { in: toDelete.map(m => (m as any).id) },
            },
          });
          result.messagesCleaned = toDelete.length;
          console.log(`[Cleanup] Archived ${result.messagesCleaned} old operator messages`);
        }
      } catch (error) {
        result.errors.push(`Failed to cleanup operator messages: ${error}`);
      }
    }

    if (options.cleanContextLogs) {
      try {
        const totalLogs = await prisma.contextLog.count();
        const keepCount = 5000;

        if (totalLogs > keepCount) {
          const toDelete = await prisma.contextLog.findMany({
            take: totalLogs - keepCount,
            orderBy: { createdAt: 'asc' },
          });

          await prisma.contextLog.deleteMany({
            where: {
              id: { in: toDelete.map(l => (l as any).id) },
            },
          });
          result.logsCleaned = toDelete.length;
          console.log(`[Cleanup] Archived ${result.logsCleaned} old context logs`);
        }
      } catch (error) {
        result.errors.push(`Failed to cleanup context logs: ${error}`);
      }
    }

    console.log(`[Cleanup] Completed: ${result.sessionsCleaned} sessions, ${result.stationsCleaned} stations`);
  } catch (error) {
    console.error('[Cleanup] Cleanup failed:', error);
    result.errors.push(`Cleanup failed: ${error}`);
  }

  return result;
}

/**
 * Cron job runner for session cleanup
 */
export function runCleanupCron(
  cleanupIntervalMs: number = 60000,
  options: CleanupOptions = {}
): { intervalId: NodeJS.Timeout; stop: () => void } {
  let lastCleanup = Date.now();
  let cleanupInProgress = false;

  const cleanup = async () => {
    if (cleanupInProgress) {
      console.log('[Cleanup] Cleanup already in progress, skipping...');
      return;
    }

    cleanupInProgress = true;
    
    try {
      const now = Date.now();
      const elapsed = now - lastCleanup;

      console.log(`[Cleanup] Running cleanup (${elapsed}ms since last run)...`);

      await cleanupStaleData(options);
      console.log('[Cleanup] Done');

      lastCleanup = Date.now();
    } catch (error) {
      console.error('[Cleanup] Error:', error);
    } finally {
      cleanupInProgress = false;
    }
  };

  cleanup();

  const intervalId = setInterval(cleanup, cleanupIntervalMs);

  const stop = () => {
    clearInterval(intervalId);
    console.log('[Cleanup] Stopped');
  };

  return { intervalId, stop };
}
