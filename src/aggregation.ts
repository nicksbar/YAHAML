import { PrismaClient, LogEntry, LogAggregate } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Get hourly bucket start time for a given date
 */
function getHourlyBucket(date: Date): Date {
  const bucket = new Date(date);
  bucket.setMinutes(0, 0, 0);
  return bucket;
}

/**
 * Update aggregates when a new LogEntry is created
 */
export async function updateAggregates(entry: LogEntry): Promise<LogAggregate> {
  const periodStart = getHourlyBucket(entry.qsoDate);

  const contestIdValue = entry.contestId || '';

  // Find or create aggregate record (use empty string for clubId when not club-specific)
  let aggregate = await prisma.logAggregate.findUnique({
    where: {
      contestId_clubId_periodStart: {
        contestId: contestIdValue,
        clubId: '',
        periodStart,
      },
    },
  });

  if (!aggregate) {
    // Create new aggregate record without club relation
    aggregate = await prisma.logAggregate.create({
      data: {
        contestId: contestIdValue,
        clubId: '',  // Empty string when not club-specific
        periodStart,
        totalQsos: 0,
        totalDupes: 0,
        cwContacts: 0,
        ssbContacts: 0,
        ftxContacts: 0,
        bandBreakdown: '{}',
        modeBreakdown: '{}',
        operatorStats: '{}',
      },
    });
  }

  // Parse JSON fields
  const bandBreakdown: Record<string, number> = JSON.parse(aggregate.bandBreakdown);
  const modeBreakdown: Record<string, number> = JSON.parse(aggregate.modeBreakdown);
  const operatorStats: Record<string, number> = JSON.parse(aggregate.operatorStats);

  // Determine if this is a duplicate
  const isDupe = entry.merge_status === 'duplicate_of';

  // Update counters
  const updates: any = {
    totalQsos: isDupe ? aggregate.totalQsos : aggregate.totalQsos + 1,
    totalDupes: isDupe ? aggregate.totalDupes + 1 : aggregate.totalDupes,
  };

  // Update mode counters (normalize mode names)
  if (!isDupe) {
    const mode = entry.mode.toUpperCase();
    if (mode === 'CW') {
      updates.cwContacts = aggregate.cwContacts + 1;
    } else if (mode === 'SSB' || mode === 'PH' || mode === 'USB' || mode === 'LSB') {
      updates.ssbContacts = aggregate.ssbContacts + 1;
    } else if (mode.includes('FT') || mode === 'DIGITAL' || mode === 'DIG') {
      updates.ftxContacts = aggregate.ftxContacts + 1;
    }

    // Update band breakdown
    if (entry.band) {
      bandBreakdown[entry.band] = (bandBreakdown[entry.band] || 0) + 1;
    }

    // Update mode breakdown
    if (entry.mode) {
      modeBreakdown[entry.mode] = (modeBreakdown[entry.mode] || 0) + 1;
    }

    // Update operator stats
    if (entry.operatorCallsign) {
      operatorStats[entry.operatorCallsign] =
        (operatorStats[entry.operatorCallsign] || 0) + 1;
    }
  }

  // Update aggregate record
  const updatedAggregate = await prisma.logAggregate.update({
    where: { id: aggregate.id },
    data: {
      ...updates,
      bandBreakdown: JSON.stringify(bandBreakdown),
      modeBreakdown: JSON.stringify(modeBreakdown),
      operatorStats: JSON.stringify(operatorStats),
    },
  });

  return updatedAggregate;
}

/**
 * Get aggregates for a contest within a date range
 */
export async function getAggregates(
  contestId: string,
  startDate?: Date,
  endDate?: Date
): Promise<LogAggregate[]> {
  const where: any = { contestId };

  if (startDate || endDate) {
    where.periodStart = {};
    if (startDate) {
      where.periodStart.gte = startDate;
    }
    if (endDate) {
      where.periodStart.lte = endDate;
    }
  }

  return await prisma.logAggregate.findMany({
    where,
    orderBy: { periodStart: 'asc' },
  });
}

/**
 * Get scoreboard (operator rankings) for a contest
 */
export async function getScoreboard(contestId: string): Promise<
  Array<{
    operator: string;
    qsos: number;
    cwContacts: number;
    ssbContacts: number;
    ftxContacts: number;
    bands: Record<string, number>;
    modes: Record<string, number>;
  }>
> {
  const aggregates = await prisma.logAggregate.findMany({
    where: { contestId },
  });

  // Combine all aggregates to build operator stats
  const operatorMap = new Map<
    string,
    {
      qsos: number;
      cwContacts: number;
      ssbContacts: number;
      ftxContacts: number;
      bands: Record<string, number>;
      modes: Record<string, number>;
    }
  >();

  aggregates.forEach((agg) => {
    const operatorStats: Record<string, number> = JSON.parse(agg.operatorStats);
    const bandBreakdown: Record<string, number> = JSON.parse(agg.bandBreakdown);
    const modeBreakdown: Record<string, number> = JSON.parse(agg.modeBreakdown);

    Object.entries(operatorStats).forEach(([operator, qsos]) => {
      if (!operatorMap.has(operator)) {
        operatorMap.set(operator, {
          qsos: 0,
          cwContacts: 0,
          ssbContacts: 0,
          ftxContacts: 0,
          bands: {},
          modes: {},
        });
      }

      const stats = operatorMap.get(operator)!;
      stats.qsos += qsos;

      // Distribute mode counts proportionally (simplified approach)
      const totalQsos = agg.totalQsos || 1;
      stats.cwContacts += Math.round((agg.cwContacts / totalQsos) * qsos);
      stats.ssbContacts += Math.round((agg.ssbContacts / totalQsos) * qsos);
      stats.ftxContacts += Math.round((agg.ftxContacts / totalQsos) * qsos);

      // Add band/mode breakdowns
      Object.entries(bandBreakdown).forEach(([band, count]) => {
        stats.bands[band] = (stats.bands[band] || 0) + count;
      });
      Object.entries(modeBreakdown).forEach(([mode, count]) => {
        stats.modes[mode] = (stats.modes[mode] || 0) + count;
      });
    });
  });

  // Convert to array and sort by QSO count
  return Array.from(operatorMap.entries())
    .map(([operator, stats]) => ({ operator, ...stats }))
    .sort((a, b) => b.qsos - a.qsos);
}

/**
 * Get band occupancy (last hour) for a contest
 */
export async function getBandOccupancy(contestId: string): Promise<{
  lastHour: Date;
  bands: Array<{
    band: string;
    qsos: number;
    modes: Record<string, number>;
  }>;
}> {
  // Get latest hour's aggregate
  const latestAggregate = await prisma.logAggregate.findFirst({
    where: { contestId },
    orderBy: { periodStart: 'desc' },
  });

  if (!latestAggregate) {
    return {
      lastHour: new Date(),
      bands: [],
    };
  }

  const bandBreakdown: Record<string, number> = JSON.parse(
    latestAggregate.bandBreakdown
  );

  // Get mode distribution per band from log entries in last hour
  const recentEntries = await prisma.logEntry.findMany({
    where: {
      contestId,
      qsoDate: { gte: latestAggregate.periodStart },
      merge_status: { not: 'duplicate_of' },
    },
  });

  const bandModes = new Map<string, Record<string, number>>();

  recentEntries.forEach((entry) => {
    if (!bandModes.has(entry.band)) {
      bandModes.set(entry.band, {});
    }
    const modes = bandModes.get(entry.band)!;
    modes[entry.mode] = (modes[entry.mode] || 0) + 1;
  });

  const bands = Object.entries(bandBreakdown).map(([band, qsos]) => ({
    band,
    qsos,
    modes: bandModes.get(band) || {},
  }));

  // Sort by QSO count descending
  bands.sort((a, b) => b.qsos - a.qsos);

  return {
    lastHour: latestAggregate.periodStart,
    bands,
  };
}

/**
 * Get operator activity stats
 */
export async function getOperatorActivity(
  contestId: string,
  operatorCallsign: string
): Promise<{
  operator: string;
  totalQsos: number;
  hourlyActivity: Array<{
    hour: Date;
    qsos: number;
  }>;
  bandDistribution: Record<string, number>;
  modeDistribution: Record<string, number>;
}> {
  // Get all aggregates for this contest
  const aggregates = await prisma.logAggregate.findMany({
    where: { contestId },
    orderBy: { periodStart: 'asc' },
  });

  let totalQsos = 0;
  const hourlyActivity: Array<{ hour: Date; qsos: number }> = [];
  const bandDistribution: Record<string, number> = {};
  const modeDistribution: Record<string, number> = {};

  aggregates.forEach((agg) => {
    const operatorStats: Record<string, number> = JSON.parse(agg.operatorStats);
    const qsos = operatorStats[operatorCallsign] || 0;

    if (qsos > 0) {
      totalQsos += qsos;
      hourlyActivity.push({
        hour: agg.periodStart,
        qsos,
      });
    }
  });

  // Get detailed band/mode distribution from log entries
  const entries = await prisma.logEntry.findMany({
    where: {
      contestId,
      operatorCallsign,
      merge_status: { not: 'duplicate_of' },
    },
  });

  entries.forEach((entry) => {
    bandDistribution[entry.band] = (bandDistribution[entry.band] || 0) + 1;
    modeDistribution[entry.mode] = (modeDistribution[entry.mode] || 0) + 1;
  });

  return {
    operator: operatorCallsign,
    totalQsos,
    hourlyActivity,
    bandDistribution,
    modeDistribution,
  };
}
