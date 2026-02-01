/**
 * Contest Scheduler - Calculate upcoming contest dates from templates
 */

import type { ContestTemplate } from './types';

export interface UpcomingContest {
  template: ContestTemplate;
  startDate: Date;
  endDate: Date;
  daysUntil: number;
  status: 'past' | 'active' | 'upcoming';
}

/**
 * Calculate the next occurrence of a contest based on its schedule rule
 */
export function calculateNextOccurrence(
  template: ContestTemplate,
  fromDate: Date = new Date()
): UpcomingContest | null {
  if (!template.schedule) return null;

  const schedule = template.schedule;

  switch (schedule.type) {
    case 'year-round':
      // Year-round contests are always active
      return {
        template,
        startDate: new Date('2020-01-01'),
        endDate: new Date('2099-12-31'),
        daysUntil: 0,
        status: 'active',
      };

    case 'fixed':
      if (!schedule.fixedDate) return null;
      const fixedDate = new Date(schedule.fixedDate);
      const duration = schedule.duration?.hours || 24;
      const endDate = new Date(fixedDate.getTime() + duration * 60 * 60 * 1000);
      
      return {
        template,
        startDate: fixedDate,
        endDate,
        daysUntil: Math.ceil((fixedDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)),
        status: determineStatus(fixedDate, endDate, fromDate),
      };

    case 'relative':
      if (!schedule.relative) return null;
      const nextDate = calculateRelativeDate(schedule.relative, fromDate);
      if (!nextDate) return null;

      const durationHours = schedule.duration?.hours || 24;
      const end = new Date(nextDate.getTime() + durationHours * 60 * 60 * 1000);

      return {
        template,
        startDate: nextDate,
        endDate: end,
        daysUntil: Math.ceil((nextDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60 * 24)),
        status: determineStatus(nextDate, end, fromDate),
      };

    case 'flexible':
      // For flexible contests, admin sets the date manually
      return null;

    default:
      return null;
  }
}

/**
 * Calculate relative date (e.g., "4th weekend of June", "last Sunday in October")
 */
function calculateRelativeDate(
  rule: {
    occurrence: 'first' | 'second' | 'third' | 'fourth' | 'last';
    dayOfWeek?: 'saturday' | 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'weekend';
    month?: number;
  },
  fromDate: Date
): Date | null {
  if (!rule.month) return null;

  const year = fromDate.getMonth() < rule.month - 1 ? fromDate.getFullYear() : fromDate.getFullYear() + 1;
  const month = rule.month - 1; // 0-indexed

  // Handle "weekend" - use Saturday
  const targetDayOfWeek = rule.dayOfWeek === 'weekend' ? 6 : getDayOfWeekNumber(rule.dayOfWeek);
  
  if (rule.occurrence === 'last') {
    // Find last occurrence of day in month
    const lastDay = new Date(year, month + 1, 0);
    let date = lastDay.getDate();
    
    while (new Date(year, month, date).getDay() !== targetDayOfWeek) {
      date--;
    }
    
    return new Date(year, month, date, 18, 0, 0); // Default 18:00 UTC
  } else {
    // Find nth occurrence of day in month
    const occurrenceMap = { first: 1, second: 2, third: 3, fourth: 4 };
    const targetOccurrence = occurrenceMap[rule.occurrence];
    
    let count = 0;
    let date = 1;
    
    while (date <= 31 && count < targetOccurrence) {
      const testDate = new Date(year, month, date);
      if (testDate.getMonth() !== month) break;
      
      if (testDate.getDay() === targetDayOfWeek) {
        count++;
        if (count === targetOccurrence) {
          return new Date(year, month, date, 18, 0, 0); // Default 18:00 UTC
        }
      }
      date++;
    }
  }

  return null;
}

/**
 * Get numeric day of week (0=Sunday, 6=Saturday)
 */
function getDayOfWeekNumber(day?: string): number {
  const dayMap: { [key: string]: number } = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  return day ? dayMap[day] : 0;
}

/**
 * Determine if contest is past, active, or upcoming
 */
function determineStatus(startDate: Date, endDate: Date, now: Date): 'past' | 'active' | 'upcoming' {
  if (now < startDate) return 'upcoming';
  if (now > endDate) return 'past';
  return 'active';
}

/**
 * Get all upcoming contests sorted by date
 */
export function getUpcomingContests(
  templates: ContestTemplate[],
  includeYearRound: boolean = false,
  maxResults: number = 10
): UpcomingContest[] {
  const now = new Date();
  const upcoming: UpcomingContest[] = [];

  for (const template of templates) {
    const next = calculateNextOccurrence(template, now);
    if (next) {
      // Filter year-round unless requested
      if (!includeYearRound && next.status === 'active' && template.schedule?.type === 'year-round') {
        continue;
      }
      // Only include upcoming and active contests
      if (next.status !== 'past') {
        upcoming.push(next);
      }
    }
  }

  // Sort by start date
  upcoming.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());

  return upcoming.slice(0, maxResults);
}

/**
 * Format contest date for display
 */
export function formatContestDate(contest: UpcomingContest): string {
  const start = contest.startDate;
  const month = start.toLocaleString('en-US', { month: 'long' });
  const year = start.getFullYear();

  if (contest.template.schedule?.type === 'year-round') {
    return 'Year-round';
  }

  // Check if multi-day
  const durationHours = contest.template.schedule?.duration?.hours || 24;
  if (durationHours > 24) {
    const startDay = start.getDate();
    const endDay = contest.endDate.getDate();
    return `${month} ${startDay}-${endDay}, ${year}`;
  }

  return `${month} ${start.getDate()}, ${year}`;
}
