import { describe, it, expect } from '@jest/globals';
import { 
  calculateNextOccurrence, 
  getUpcomingContests,
  formatContestDate 
} from '../src/contest-templates/scheduler';
import type { ContestTemplate } from '../src/contest-templates/types';

describe('Contest Scheduler', () => {
  const mockFieldDayTemplate: ContestTemplate = {
    type: 'ARRL_FD',
    name: 'ARRL Field Day',
    description: 'Test',
    organization: 'ARRL',
    scoringRules: { pointsPerQso: 1 },
    requiredFields: {},
    validationRules: {},
    schedule: {
      type: 'relative',
      relative: {
        occurrence: 'fourth',
        dayOfWeek: 'weekend',
        month: 6, // June
      },
      duration: {
        hours: 27,
        startTime: '18:00 UTC Saturday',
        endTime: '20:59 UTC Sunday',
      },
      recurrence: 'annual',
      timezone: 'UTC',
    },
    isActive: true,
    isPublic: true,
  };

  const mockWinterFDTemplate: ContestTemplate = {
    type: 'WINTER_FD',
    name: 'Winter Field Day',
    description: 'Test',
    organization: 'Winter FD',
    scoringRules: { pointsPerQso: 1 },
    requiredFields: {},
    validationRules: {},
    schedule: {
      type: 'relative',
      relative: {
        occurrence: 'last',
        dayOfWeek: 'weekend',
        month: 1, // January
      },
      duration: {
        hours: 24,
      },
      recurrence: 'annual',
      timezone: 'UTC',
    },
    isActive: true,
    isPublic: true,
  };

  const mockPOTA: ContestTemplate = {
    type: 'POTA',
    name: 'Parks on the Air',
    description: 'Year-round',
    organization: 'POTA',
    scoringRules: { pointsPerQso: 1 },
    requiredFields: {},
    validationRules: {},
    schedule: {
      type: 'year-round',
      recurrence: 'none',
    },
    isActive: true,
    isPublic: true,
  };

  describe('calculateNextOccurrence', () => {
    it('should calculate Field Day 2026 (4th weekend of June)', () => {
      const fromDate = new Date('2026-02-01T12:00:00Z');
      const result = calculateNextOccurrence(mockFieldDayTemplate, fromDate);

      expect(result).not.toBeNull();
      expect(result?.template.name).toBe('ARRL Field Day');
      expect(result?.startDate.getMonth()).toBe(5); // June (0-indexed)
      expect(result?.startDate.getFullYear()).toBe(2026);
      expect(result?.status).toBe('upcoming');
      
      // Should be 4th Saturday of June 2026 (June 27)
      const expectedDate = 27;
      expect(result?.startDate.getDate()).toBe(expectedDate);
    });

    it('should calculate Winter FD 2027 (last weekend of January, since Jan 2026 passed)', () => {
      const fromDate = new Date('2026-02-01T12:00:00Z');
      const result = calculateNextOccurrence(mockWinterFDTemplate, fromDate);

      expect(result).not.toBeNull();
      expect(result?.template.name).toBe('Winter Field Day');
      expect(result?.startDate.getMonth()).toBe(0); // January
      expect(result?.startDate.getFullYear()).toBe(2027); // Should be next year
      expect(result?.status).toBe('upcoming');
    });

    it('should handle year-round contests (POTA)', () => {
      const fromDate = new Date('2026-02-01T12:00:00Z');
      const result = calculateNextOccurrence(mockPOTA, fromDate);

      expect(result).not.toBeNull();
      expect(result?.template.name).toBe('Parks on the Air');
      expect(result?.status).toBe('active');
    });

    it('should calculate daysUntil correctly', () => {
      const fromDate = new Date('2026-02-01T12:00:00Z');
      const result = calculateNextOccurrence(mockFieldDayTemplate, fromDate);

      expect(result).not.toBeNull();
      expect(result?.daysUntil).toBeGreaterThan(100); // June is 4+ months away
      expect(result?.daysUntil).toBeLessThan(200); // But less than 6 months
    });
  });

  describe('getUpcomingContests', () => {
    it('should return sorted list of upcoming contests', () => {
      const templates = [mockFieldDayTemplate, mockWinterFDTemplate];
      const upcoming = getUpcomingContests(templates, false, 10);

      expect(upcoming.length).toBeGreaterThan(0);
      
      // Should be sorted by date
      if (upcoming.length > 1) {
        expect(upcoming[0].startDate.getTime()).toBeLessThanOrEqual(
          upcoming[1].startDate.getTime()
        );
      }
    });

    it('should filter out year-round by default', () => {
      const templates = [mockFieldDayTemplate, mockPOTA];
      const upcoming = getUpcomingContests(templates, false, 10);

      const yearRound = upcoming.filter(c => c.template.schedule?.type === 'year-round');
      expect(yearRound.length).toBe(0);
    });

    it('should include year-round when requested', () => {
      const templates = [mockFieldDayTemplate, mockPOTA];
      const upcoming = getUpcomingContests(templates, true, 10);

      const yearRound = upcoming.filter(c => c.template.schedule?.type === 'year-round');
      expect(yearRound.length).toBeGreaterThan(0);
    });

    it('should respect maxResults limit', () => {
      const templates = [mockFieldDayTemplate, mockWinterFDTemplate];
      const upcoming = getUpcomingContests(templates, false, 1);

      expect(upcoming.length).toBeLessThanOrEqual(1);
    });
  });

  describe('formatContestDate', () => {
    it('should format single-day contest correctly', () => {
      const fromDate = new Date('2026-02-01T12:00:00Z');
      const result = calculateNextOccurrence(mockWinterFDTemplate, fromDate);

      expect(result).not.toBeNull();
      const formatted = formatContestDate(result!);
      expect(formatted).toContain('2027'); // Next year
      expect(formatted).toContain('January');
    });

    it('should format multi-day contest correctly', () => {
      const fromDate = new Date('2026-02-01T12:00:00Z');
      const result = calculateNextOccurrence(mockFieldDayTemplate, fromDate);

      expect(result).not.toBeNull();
      const formatted = formatContestDate(result!);
      expect(formatted).toContain('2026');
      expect(formatted).toContain('-'); // Should have date range
    });

    it('should format year-round contests', () => {
      const fromDate = new Date('2026-02-01T12:00:00Z');
      const result = calculateNextOccurrence(mockPOTA, fromDate);

      expect(result).not.toBeNull();
      const formatted = formatContestDate(result!);
      expect(formatted).toBe('Year-round');
    });
  });
});
