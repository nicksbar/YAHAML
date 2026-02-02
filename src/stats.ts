import prisma from './db';
import { wsManager } from './websocket';

/**
 * Aggregate contest statistics at regular intervals
 * Called every 5 minutes during active contests
 */
export async function aggregateContestStats(contestId: string) {
  try {
    const now = new Date();
    const hourStart = new Date(now);
    hourStart.setMinutes(0, 0, 0);

    // Get all QSOs in the last hour for this contest
    const qsos = await prisma.logEntry.findMany({
      where: {
        contestId,
        qsoDate: {
          gte: hourStart,
          lt: now,
        },
      },
      include: {
        station: true,
      },
    });

    if (qsos.length === 0) {
      return null; // No new QSOs to aggregate
    }

    // Calculate aggregates
    const qsoCount = qsos.length;
    const pointsTotal = qsos.reduce((sum, q) => sum + (q.points || 0), 0);
    const dupeCount = qsos.filter((q) => q.merge_status === 'duplicate_of').length;

    // Band distribution
    const bandDist: Record<string, number> = {};
    qsos.forEach((q) => {
      bandDist[q.band] = (bandDist[q.band] || 0) + 1;
    });

    // Mode distribution
    const modeDist: Record<string, number> = {};
    qsos.forEach((q) => {
      modeDist[q.mode] = (modeDist[q.mode] || 0) + 1;
    });

    // Operator stats (top callers)
    const operatorCounts: Record<string, number> = {};
    qsos.forEach((q) => {
      const call = q.operatorCallsign || q.station.callsign;
      operatorCounts[call] = (operatorCounts[call] || 0) + 1;
    });

    const topCalls = Object.entries(operatorCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([call]) => ({
        callsign: call,
        qsoCount: operatorCounts[call],
      }));

    // Calculate QSO per hour
    const hourDuration = (now.getTime() - hourStart.getTime()) / (1000 * 60 * 60);
    const qsoPerHour = qsoCount / Math.max(hourDuration, 1);

    // Estimate multipliers (unique callsigns for simplicity)
    const uniqueCallsigns = new Set(qsos.map((q) => q.callsign));
    const mults = uniqueCallsigns.size;

    // Store in ContestStats table
    const stats = await prisma.contestStats.upsert({
      where: {
        contestId_stationId_periodStart_period: {
          contestId,
          stationId: null as any,
          periodStart: hourStart,
          period: 'hour',
        },
      },
      create: {
        contestId,
        stationId: null as any,
        periodStart: hourStart,
        periodEnd: now,
        period: 'hour',
        qsoCount,
        pointsTotal,
        mults,
        dupeCount,
        topCallsign: topCalls[0]?.callsign || undefined,
        topCallCount: topCalls[0]?.qsoCount || 0,
        bandDist: JSON.stringify(bandDist),
        modeDist: JSON.stringify(modeDist),
      },
      update: {
        qsoCount,
        pointsTotal,
        mults,
        dupeCount,
        topCallsign: topCalls[0]?.callsign || undefined,
        topCallCount: topCalls[0]?.qsoCount || 0,
        bandDist: JSON.stringify(bandDist),
        modeDist: JSON.stringify(modeDist),
        periodEnd: now,
      },
    });

    // Broadcast stats update via WebSocket
    wsManager.broadcast('stats', 'statsUpdate', {
      qsoCount,
      pointsTotal,
      mults,
      dupeCount,
      qsoPerHour,
      topCalls,
      bandDist,
      modeDist,
      lastUpdated: now.toISOString(),
    });

    console.log(
      `[STATS] Contest ${contestId}: ${qsoCount} QSOs, ${pointsTotal} pts, ${mults} mults`
    );

    return stats;
  } catch (error: any) {
    console.error('Error aggregating contest stats:', error.message);
    return null;
  }
}

/**
 * Aggregate stats for individual operators
 * Called every 5 minutes
 */
export async function aggregateOperatorStats(contestId: string, stationId: string) {
  try {
    const now = new Date();
    const hourStart = new Date(now);
    hourStart.setMinutes(0, 0, 0);

    // Get operator's QSOs in the last hour
    const qsos = await prisma.logEntry.findMany({
      where: {
        contestId,
        stationId,
        qsoDate: {
          gte: hourStart,
          lt: now,
        },
      },
    });

    if (qsos.length === 0) {
      return null; // No new QSOs
    }

    // Calculate aggregates
    const qsoCount = qsos.length;
    const pointsTotal = qsos.reduce((sum, q) => sum + (q.points || 0), 0);
    const dupeCount = qsos.filter((q) => q.merge_status === 'duplicate_of').length;

    // Band/mode distribution
    const bandDist: Record<string, number> = {};
    const modeDist: Record<string, number> = {};
    qsos.forEach((q) => {
      bandDist[q.band] = (bandDist[q.band] || 0) + 1;
      modeDist[q.mode] = (modeDist[q.mode] || 0) + 1;
    });

    // Store operator stats
    const stats = await prisma.contestStats.upsert({
      where: {
        contestId_stationId_periodStart_period: {
          contestId,
          stationId: stationId as any,
          periodStart: hourStart,
          period: 'hour',
        },
      },
      create: {
        contestId,
        stationId: stationId as any,
        periodStart: hourStart,
        periodEnd: now,
        period: 'hour',
        qsoCount,
        pointsTotal,
        mults: new Set(qsos.map((q) => q.callsign)).size, // Unique calls contacted
        dupeCount,
        bandDist: JSON.stringify(bandDist),
        modeDist: JSON.stringify(modeDist),
      },
      update: {
        qsoCount,
        pointsTotal,
        mults: new Set(qsos.map((q) => q.callsign)).size,
        dupeCount,
        bandDist: JSON.stringify(bandDist),
        modeDist: JSON.stringify(modeDist),
        periodEnd: now,
      },
    });

    return stats;
  } catch (error: any) {
    console.error('Error aggregating operator stats:', error.message);
    return null;
  }
}

/**
 * Band occupancy aggregation
 * Should be called when band/mode changes detected
 */
export async function updateBandOccupancySnapshot() {
  try {
    // Get current band activities
    const activities = await prisma.bandActivity.findMany({
      where: {
        createdAt: {
          gte: new Date(Date.now() - 5 * 60 * 1000), // Last 5 minutes
        },
      },
      include: {
        station: true,
      },
    });

    if (activities.length === 0) {
      return;
    }

    // Group by band/mode
    const grouped: Record<string, any> = {};
    activities.forEach((activity) => {
      const key = `${activity.band}-${activity.mode}`;
      if (!grouped[key]) {
        grouped[key] = {
          band: activity.band,
          mode: activity.mode,
          stations: [],
        };
      }
      grouped[key].stations.push({
        callsign: activity.station.callsign,
        source: 'n3fjp',
        lastSeen: activity.lastSeen,
      });
    });

    // Broadcast band occupancy updates
    Object.values(grouped).forEach((entry) => {
      wsManager.broadcast('band-occupancy', 'occupancyUpdate', {
        band: entry.band,
        mode: entry.mode,
        activeStations: entry.stations,
        count: entry.stations.length,
      });
    });
  } catch (error: any) {
    console.error('Error updating band occupancy snapshot:', error.message);
  }
}

/**
 * Start automatic stats aggregation job
 * Runs every 5 minutes during active contests
 */
export function startStatsAggregationJob(intervalMinutes: number = 5) {
  const intervalMs = intervalMinutes * 60 * 1000;

  const jobInterval = setInterval(async () => {
    try {
      // Find active contests
      const activeContests = await prisma.contest.findMany({
        where: { isActive: true },
      });

      // Aggregate stats for each active contest
      for (const contest of activeContests) {
        await aggregateContestStats(contest.id);

        // Also aggregate for each participating station
        const stations = await prisma.station.findMany({
          include: {
            _count: {
              select: { qsoLogs: true },
            },
          },
        });

        for (const station of stations) {
          if (station._count.qsoLogs > 0) {
            await aggregateOperatorStats(contest.id, station.id);
          }
        }
      }

      // Update band occupancy snapshot
      await updateBandOccupancySnapshot();
    } catch (error: any) {
      console.error('Stats aggregation job failed:', error.message);
    }
  }, intervalMs);

  console.log(`Stats aggregation job started (every ${intervalMinutes} minutes)`);

  return jobInterval;
}
