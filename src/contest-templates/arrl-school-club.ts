import type { ContestTemplate } from './types';

export const ARRL_SCHOOL_CLUB_ROUNDUP: ContestTemplate = {
  type: 'ARRL_SCR',
  name: 'ARRL School Club Roundup',
  description: 'School club contest encouraging youth participation',
  organization: 'ARRL',
  scoringRules: {
    pointsPerQso: 1,
    formula: '1 point per QSO',
  },
  requiredFields: {
    exchange: {
      required: true,
      format: 'School/Club Name + Class (School/Club/Individual) + State/Province',
      description: 'SCR exchange fields',
    },
  },
  validationRules: {
    bands: ['80', '40', '20', '15', '10'],
    modes: ['CW', 'SSB', 'DIGITAL'],
    duplicateRule: 'band-mode',
    exchange: {
      sent: ['name', 'class', 'state'],
      received: ['name', 'class', 'state'],
    },
  },
  schedule: {
    type: 'relative',
    relative: {
      occurrence: 'second',
      dayOfWeek: 'weekend',
      month: 10,
    },
    duration: {
      hours: 24,
      startTime: '13:00 UTC Monday',
      endTime: '12:59 UTC Tuesday',
    },
    recurrence: 'annual',
    timezone: 'UTC',
  },
  uiConfig: {
    primaryColor: '#EF4444',
    icon: '🏫exclamation',
    helpUrl: 'https://www.arrl.org/school-club-roundup',
  },
  isActive: true,
  isPublic: true,
};
