import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import {
  updateAggregates,
  getAggregates,
  getScoreboard,
  getBandOccupancy,
  getOperatorActivity,
} from '../src/aggregation';

const prisma = new PrismaClient();

describe('Aggregation Service', () => {
  let stationId: string;
  let contestId: string;

  beforeEach(async () => {
    const timestamp = Date.now();
    
    // Create test station
    const station = await prisma.station.create({
      data: {
        callsign: `W5AGG${timestamp}`,
        name: 'Test Aggregation Station',
      },
    });
    stationId = station.id;

    // Create test contest
    const contest = await prisma.contest.create({
      data: {
        name: `Aggregation Test Contest ${timestamp}`,
      },
    });
    contestId = contest.id;
  });

  afterEach(async () => {
    // Clean up
    await prisma.logAggregate.deleteMany({ where: { contestId } });
    await prisma.logEntry.deleteMany({ where: { contestId } });
    await prisma.contest.deleteMany({ where: { id: contestId } });
    await prisma.station.deleteMany({ where: { id: stationId } });
  });

  describe('updateAggregates', () => {
    it('should create new aggregate record for first entry', async () => {
      const entry = await prisma.logEntry.create({
        data: {
          stationId,
          contestId,
          callsign: 'W0XYZ',
          band: '40m',
          mode: 'SSB',
          qsoDate: new Date('2026-01-31T15:30:00Z'),
          qsoTime: '1530',
          frequency: '7050',
          rstSent: '599',
          rstRcvd: '599',
          operatorCallsign: 'W5ABC',
          source: 'test',
          dedupeKey: `agg-test-1-${Date.now()}`,
        },
      });

      const aggregate = await updateAggregates(entry);

      expect(aggregate).toBeDefined();
      expect(aggregate.contestId).toBe(contestId);
      expect(aggregate.totalQsos).toBe(1);
      expect(aggregate.totalDupes).toBe(0);
      expect(aggregate.ssbContacts).toBe(1);
      
      const bandBreakdown = JSON.parse(aggregate.bandBreakdown);
      expect(bandBreakdown['40m']).toBe(1);
      
      const operatorStats = JSON.parse(aggregate.operatorStats);
      expect(operatorStats['W5ABC']).toBe(1);
    });

    it('should update existing aggregate record for same hour', async () => {
      const baseTime = new Date('2026-01-31T15:30:00Z');
      
      // First entry
      const entry1 = await prisma.logEntry.create({
        data: {
          stationId,
          contestId,
          callsign: 'W0XYZ',
          band: '40m',
          mode: 'SSB',
          qsoDate: baseTime,
          qsoTime: '1530',
          operatorCallsign: 'W5ABC',
          source: 'test',
          dedupeKey: `agg-test-2a-${Date.now()}`,
        },
      });

      await updateAggregates(entry1);

      // Second entry in same hour
      const entry2 = await prisma.logEntry.create({
        data: {
          stationId,
          contestId,
          callsign: 'N0ABC',
          band: '20m',
          mode: 'CW',
          qsoDate: new Date('2026-01-31T15:45:00Z'),
          qsoTime: '1545',
          operatorCallsign: 'W5XYZ',
          source: 'test',
          dedupeKey: `agg-test-2b-${Date.now()}`,
        },
      });

      const aggregate = await updateAggregates(entry2);

      expect(aggregate.totalQsos).toBe(2);
      expect(aggregate.ssbContacts).toBe(1);
      expect(aggregate.cwContacts).toBe(1);
      
      const bandBreakdown = JSON.parse(aggregate.bandBreakdown);
      expect(bandBreakdown['40m']).toBe(1);
      expect(bandBreakdown['20m']).toBe(1);
      
      const operatorStats = JSON.parse(aggregate.operatorStats);
      expect(operatorStats['W5ABC']).toBe(1);
      expect(operatorStats['W5XYZ']).toBe(1);
    });

    it('should track duplicate entries separately', async () => {
      const baseTime = new Date('2026-01-31T15:30:00Z');
      
      // Primary entry
      const primary = await prisma.logEntry.create({
        data: {
          stationId,
          contestId,
          callsign: 'W0XYZ',
          band: '40m',
          mode: 'SSB',
          qsoDate: baseTime,
          qsoTime: '1530',
          operatorCallsign: 'W5ABC',
          source: 'test',
          dedupeKey: `agg-test-3a-${Date.now()}`,
          merge_status: 'primary',
        },
      });

      await updateAggregates(primary);

      // Duplicate entry
      const duplicate = await prisma.logEntry.create({
        data: {
          stationId,
          contestId,
          callsign: 'W0XYZ',
          band: '40m',
          mode: 'SSB',
          qsoDate: baseTime,
          qsoTime: '1530',
          operatorCallsign: 'W5ABC',
          source: 'test',
          dedupeKey: `agg-test-3b-${Date.now()}`,
          merge_status: 'duplicate_of',
          merged_into_id: primary.id,
        },
      });

      const aggregate = await updateAggregates(duplicate);

      // Should not increment totalQsos, only totalDupes
      expect(aggregate.totalQsos).toBe(1);
      expect(aggregate.totalDupes).toBe(1);
    });

    it('should normalize mode names correctly', async () => {
      const baseTime = new Date('2026-01-31T15:30:00Z');
      
      // USB mode (should count as SSB)
      const entry1 = await prisma.logEntry.create({
        data: {
          stationId,
          contestId,
          callsign: 'W0XYZ',
          band: '20m',
          mode: 'USB',
          qsoDate: baseTime,
          qsoTime: '1530',
          operatorCallsign: 'W5ABC',
          source: 'test',
          dedupeKey: `agg-test-4a-${Date.now()}`,
        },
      });

      const agg1 = await updateAggregates(entry1);
      expect(agg1.ssbContacts).toBe(1);

      // FT8 mode (should count as FTX)
      const entry2 = await prisma.logEntry.create({
        data: {
          stationId,
          contestId,
          callsign: 'N0ABC',
          band: '40m',
          mode: 'FT8',
          qsoDate: baseTime,
          qsoTime: '1535',
          operatorCallsign: 'W5ABC',
          source: 'test',
          dedupeKey: `agg-test-4b-${Date.now()}`,
        },
      });

      const agg2 = await updateAggregates(entry2);
      expect(agg2.ftxContacts).toBe(1);
    });

    it('should create separate aggregates for different hours', async () => {
      // Entry at 15:00
      const entry1 = await prisma.logEntry.create({
        data: {
          stationId,
          contestId,
          callsign: 'W0XYZ',
          band: '40m',
          mode: 'CW',
          qsoDate: new Date('2026-01-31T15:30:00Z'),
          qsoTime: '1530',
          operatorCallsign: 'W5ABC',
          source: 'test',
          dedupeKey: `agg-test-5a-${Date.now()}`,
        },
      });

      const agg1 = await updateAggregates(entry1);

      // Entry at 16:00
      const entry2 = await prisma.logEntry.create({
        data: {
          stationId,
          contestId,
          callsign: 'N0ABC',
          band: '20m',
          mode: 'SSB',
          qsoDate: new Date('2026-01-31T16:30:00Z'),
          qsoTime: '1630',
          operatorCallsign: 'W5XYZ',
          source: 'test',
          dedupeKey: `agg-test-5b-${Date.now()}`,
        },
      });

      const agg2 = await updateAggregates(entry2);

      // Should be different aggregate records
      expect(agg1.id).not.toBe(agg2.id);
      expect(agg1.totalQsos).toBe(1);
      expect(agg2.totalQsos).toBe(1);
    });
  });

  describe('getAggregates', () => {
    it('should return all aggregates for a contest', async () => {
      // Create entries at different hours
      const entry1 = await prisma.logEntry.create({
        data: {
          stationId,
          contestId,
          callsign: 'W0XYZ',
          band: '40m',
          mode: 'CW',
          qsoDate: new Date('2026-01-31T15:00:00Z'),
          qsoTime: '1500',
          operatorCallsign: 'W5ABC',
          source: 'test',
          dedupeKey: `agg-get-1a-${Date.now()}`,
        },
      });
      await updateAggregates(entry1);

      const entry2 = await prisma.logEntry.create({
        data: {
          stationId,
          contestId,
          callsign: 'N0ABC',
          band: '20m',
          mode: 'SSB',
          qsoDate: new Date('2026-01-31T16:00:00Z'),
          qsoTime: '1600',
          operatorCallsign: 'W5XYZ',
          source: 'test',
          dedupeKey: `agg-get-1b-${Date.now()}`,
        },
      });
      await updateAggregates(entry2);

      const aggregates = await getAggregates(contestId);

      expect(aggregates).toHaveLength(2);
      expect(aggregates[0].periodStart < aggregates[1].periodStart).toBe(true);
    });

    it('should filter by date range', async () => {
      // Create entries
      await Promise.all([
        prisma.logEntry.create({
          data: {
            stationId,
            contestId,
            callsign: 'W0XYZ',
            band: '40m',
            mode: 'CW',
            qsoDate: new Date('2026-01-30T15:00:00Z'),
            qsoTime: '1500',
            operatorCallsign: 'W5ABC',
            source: 'test',
            dedupeKey: `agg-get-2a-${Date.now()}`,
          },
        }).then(updateAggregates),
        prisma.logEntry.create({
          data: {
            stationId,
            contestId,
            callsign: 'N0ABC',
            band: '20m',
            mode: 'SSB',
            qsoDate: new Date('2026-01-31T15:00:00Z'),
            qsoTime: '1500',
            operatorCallsign: 'W5XYZ',
            source: 'test',
            dedupeKey: `agg-get-2b-${Date.now()}`,
          },
        }).then(updateAggregates),
      ]);

      // Filter to only Jan 31
      const aggregates = await getAggregates(
        contestId,
        new Date('2026-01-31T00:00:00Z'),
        new Date('2026-01-31T23:59:59Z')
      );

      expect(aggregates).toHaveLength(1);
    });
  });

  describe('getScoreboard', () => {
    it('should return operator rankings', async () => {
      const timestamp = Date.now();
      
      // Create multiple entries for different operators
      await prisma.logEntry.create({
        data: {
          stationId,
          contestId,
          callsign: 'W0XYZ',
          band: '40m',
          mode: 'CW',
          qsoDate: new Date('2026-01-31T15:00:00Z'),
          qsoTime: '1500',
          operatorCallsign: 'W5ABC',
          source: 'test',
          dedupeKey: `scoreboard-1-${timestamp}`,
        },
      }).then(updateAggregates);

      await prisma.logEntry.create({
        data: {
          stationId,
          contestId,
          callsign: 'N0ABC',
          band: '20m',
          mode: 'SSB',
          qsoDate: new Date('2026-01-31T15:10:00Z'),
          qsoTime: '1510',
          operatorCallsign: 'W5ABC',
          source: 'test',
          dedupeKey: `scoreboard-2-${timestamp}`,
        },
      }).then(updateAggregates);

      await prisma.logEntry.create({
        data: {
          stationId,
          contestId,
          callsign: 'K0DEF',
          band: '40m',
          mode: 'CW',
          qsoDate: new Date('2026-01-31T15:20:00Z'),
          qsoTime: '1520',
          operatorCallsign: 'W5XYZ',
          source: 'test',
          dedupeKey: `scoreboard-3-${timestamp}`,
        },
      }).then(updateAggregates);

      const scoreboard = await getScoreboard(contestId);

      expect(scoreboard).toHaveLength(2);
      expect(scoreboard[0].operator).toBe('W5ABC');
      expect(scoreboard[0].qsos).toBe(2);
      expect(scoreboard[1].operator).toBe('W5XYZ');
      expect(scoreboard[1].qsos).toBe(1);
    });

    it('should include band and mode breakdowns', async () => {
      const timestamp = Date.now();
      
      await prisma.logEntry.create({
        data: {
          stationId,
          contestId,
          callsign: 'W0XYZ',
          band: '40m',
          mode: 'CW',
          qsoDate: new Date('2026-01-31T15:00:00Z'),
          qsoTime: '1500',
          operatorCallsign: 'W5ABC',
          source: 'test',
          dedupeKey: `scoreboard-breakdown-1-${timestamp}`,
        },
      }).then(updateAggregates);

      const scoreboard = await getScoreboard(contestId);

      expect(scoreboard[0].bands).toBeDefined();
      expect(scoreboard[0].bands['40m']).toBeGreaterThan(0);
      expect(scoreboard[0].modes).toBeDefined();
      expect(scoreboard[0].modes['CW']).toBeGreaterThan(0);
    });
  });

  describe('getBandOccupancy', () => {
    it('should return band activity for last hour', async () => {
      const timestamp = Date.now();
      const now = new Date();
      
      await prisma.logEntry.create({
        data: {
          stationId,
          contestId,
          callsign: 'W0XYZ',
          band: '40m',
          mode: 'CW',
          qsoDate: now,
          qsoTime: now.toISOString().slice(11, 16),
          operatorCallsign: 'W5ABC',
          source: 'test',
          dedupeKey: `occupancy-1-${timestamp}`,
        },
      }).then(updateAggregates);

      await prisma.logEntry.create({
        data: {
          stationId,
          contestId,
          callsign: 'N0ABC',
          band: '40m',
          mode: 'SSB',
          qsoDate: now,
          qsoTime: now.toISOString().slice(11, 16),
          operatorCallsign: 'W5XYZ',
          source: 'test',
          dedupeKey: `occupancy-2-${timestamp}`,
        },
      }).then(updateAggregates);

      const occupancy = await getBandOccupancy(contestId);

      expect(occupancy.bands).toBeDefined();
      expect(occupancy.bands.length).toBeGreaterThan(0);
      expect(occupancy.bands[0].band).toBe('40m');
      expect(occupancy.bands[0].qsos).toBe(2);
      expect(occupancy.bands[0].modes).toEqual({ CW: 1, SSB: 1 });
    });

    it('should return empty if no recent activity', async () => {
      const occupancy = await getBandOccupancy(contestId);

      expect(occupancy.bands).toEqual([]);
    });
  });

  describe('getOperatorActivity', () => {
    it('should return stats for specific operator', async () => {
      const timestamp = Date.now();
      
      // Create entries at different times
      await prisma.logEntry.create({
        data: {
          stationId,
          contestId,
          callsign: 'W0XYZ',
          band: '40m',
          mode: 'CW',
          qsoDate: new Date('2026-01-31T15:00:00Z'),
          qsoTime: '1500',
          operatorCallsign: 'W5ABC',
          source: 'test',
          dedupeKey: `operator-1-${timestamp}`,
        },
      }).then(updateAggregates);

      await prisma.logEntry.create({
        data: {
          stationId,
          contestId,
          callsign: 'N0ABC',
          band: '20m',
          mode: 'SSB',
          qsoDate: new Date('2026-01-31T16:00:00Z'),
          qsoTime: '1600',
          operatorCallsign: 'W5ABC',
          source: 'test',
          dedupeKey: `operator-2-${timestamp}`,
        },
      }).then(updateAggregates);

      const activity = await getOperatorActivity(contestId, 'W5ABC');

      expect(activity.operator).toBe('W5ABC');
      expect(activity.totalQsos).toBe(2);
      expect(activity.hourlyActivity).toHaveLength(2);
      expect(activity.bandDistribution['40m']).toBe(1);
      expect(activity.bandDistribution['20m']).toBe(1);
      expect(activity.modeDistribution['CW']).toBe(1);
      expect(activity.modeDistribution['SSB']).toBe(1);
    });

    it('should return zero stats for operator with no activity', async () => {
      const activity = await getOperatorActivity(contestId, 'W5NONE');

      expect(activity.totalQsos).toBe(0);
      expect(activity.hourlyActivity).toEqual([]);
    });
  });
});
