import type { ContestTemplate } from './types';

/**
 * ARRL Field Day Template
 */
export const ARRL_FIELD_DAY: ContestTemplate = {
  type: 'ARRL_FD',
  name: 'ARRL Field Day',
  description: 'Annual emergency preparedness exercise held on the 4th full weekend of June',
  organization: 'ARRL',
  scoringRules: {
    pointsPerQso: 1,
    pointsByMode: {
      CW: 2,
      PHONE: 1,
      DIGITAL: 2,
    },
    multipliers: [
      {
        type: 'section',
        perBand: false,
        perMode: false,
        description: 'ARRL/RAC sections worked',
      },
    ],
    bonuses: [
      {
        name: '100% Emergency Power',
        points: 100,
        description: 'No commercial power used',
        condition: 'Battery or generator only',
      },
      {
        name: 'Media Publicity',
        points: 100,
        description: 'Official news media visit',
        condition: 'Documented media coverage',
      },
      {
        name: 'Set up in Public Place',
        points: 100,
        description: 'Operate from publicly accessible location',
        condition: 'Public space with signage',
      },
      {
        name: 'Information Booth',
        points: 100,
        description: 'Booth with info for public',
        condition: 'Staffed information table',
      },
      {
        name: 'NTS Message to SM/SEC',
        points: 10,
        description: 'NTS message to Section Manager',
        condition: 'Formal NTS traffic message',
      },
      {
        name: 'W1AW Field Day Message',
        points: 100,
        description: 'Copy official W1AW FD message',
        condition: 'Complete W1AW bulletin copy',
      },
      {
        name: 'Satellite QSO',
        points: 100,
        description: 'At least one satellite contact',
        condition: 'Confirmed sat QSO',
      },
      {
        name: 'Site Visited by Elected Official',
        points: 100,
        description: 'Visit by elected government official',
        condition: 'Documented official visit',
      },
      {
        name: 'Site Visited by ARRL Official',
        points: 100,
        description: 'Visit by ARRL Section/Division official',
        condition: 'Documented ARRL official visit',
      },
      {
        name: 'GOTA Bonus',
        points: 20,
        description: 'Get On The Air station bonus (per QSO, max 400)',
        condition: 'GOTA station QSOs',
      },
      {
        name: 'Youth Participation',
        points: 20,
        description: 'Youth participant bonus (per youth, max 400)',
        condition: 'Licensed youth under 18',
      },
      {
        name: 'Home Station',
        points: 100,
        description: 'Operate from home using emergency power',
        condition: 'Class D or E using backup power',
      },
    ],
    formula: '(QSO Points × Power Multiplier) + Bonuses',
  },
  requiredFields: {
    class: {
      required: true,
      options: ['1A', '2A', '3A', '4A', '5A', '6A', '1B', '1C', '1D', '1E', '2E', '3E', '1F', '2F', '3F'],
      description: 'Number of transmitters and class (A=Field, B=Home Battery, C=Mobile, D=Home, E=Home Emergency, F=EOC)',
    },
    section: {
      required: true,
      description: 'ARRL Section (e.g., ORG, ENY, NFL)',
    },
    power: {
      required: true,
      options: ['HIGH', 'LOW', 'QRP'],
      description: 'Power level multiplier: HIGH=1x, LOW=2x (≤150W), QRP=5x (≤5W)',
    },
    participants: {
      min: 1,
      description: 'Number of participants in the group',
    },
  },
  validationRules: {
    bands: ['160', '80', '40', '20', '15', '10', '6', '2', '1.25', '70CM', 'SAT'],
    modes: ['CW', 'PHONE', 'DIGITAL', 'SSB', 'FM', 'FT8', 'FT4', 'PSK', 'RTTY'],
    timeWindow: {
      start: 'June 4th weekend, 1800 UTC Saturday',
      end: 'June 4th weekend, 2059 UTC Sunday',
    },
    duplicateRule: 'band-mode',
    exchange: {
      sent: ['class', 'section'],
      received: ['class', 'section'],
    },
  },
  schedule: {
    type: 'relative',
    relative: {
      occurrence: 'fourth',
      dayOfWeek: 'weekend',
      month: 6,
    },
    duration: {
      hours: 27,
      startTime: '18:00 UTC Saturday',
      endTime: '20:59 UTC Sunday',
    },
    recurrence: 'annual',
    timezone: 'UTC',
  },
  uiConfig: {
    primaryColor: '#FF6B35',
    icon: '🎯',
    logForm: {
      fields: ['callsign', 'band', 'mode', 'exchange', 'section'],
      layout: 'standard',
    },
    dashboard: {
      widgets: ['qso-count', 'multipliers', 'bonuses', 'power-multiplier'],
      stats: ['totalQsos', 'totalPoints', 'sectionsWorked', 'estimatedScore'],
    },
    helpUrl: 'http://www.arrl.org/field-day',
  },
  isActive: true,
  isPublic: true,
};
