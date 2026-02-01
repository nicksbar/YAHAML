import type { ContestTemplate } from './types';

/**
 * Winter Field Day Template
 */
export const WINTER_FIELD_DAY: ContestTemplate = {
  type: 'WINTER_FD',
  name: 'Winter Field Day',
  description: 'Emergency preparedness exercise held in winter conditions',
  organization: 'Winter Field Day Association',
  scoringRules: {
    pointsPerQso: 1,
    pointsByMode: {
      CW: 2,
      DIGITAL: 2,
      PHONE: 1,
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
        name: 'Outdoor Setup',
        points: 100,
        description: 'Operate outdoors in winter conditions',
        condition: 'Setup outside in winter weather',
      },
    ],
    formula: '(QSO Points × Power Multiplier) + Bonuses',
  },
  requiredFields: {
    class: {
      required: true,
      options: ['1O', '2O', '3O', '1I', '2I', '3I', '1H'],
      description: 'Class: O=Outdoor, I=Indoor, H=Home',
    },
    section: {
      required: true,
      description: 'ARRL Section',
    },
  },
  validationRules: {
    bands: ['160', '80', '40', '20', '15', '10', '6', '2', '1.25', '70CM'],
    modes: ['CW', 'PHONE', 'DIGITAL', 'SSB', 'FM', 'FT8', 'FT4', 'RTTY'],
    duplicateRule: 'band-mode',
    exchange: {
      sent: ['class', 'section'],
      received: ['class', 'section'],
    },
  },
  schedule: {
    type: 'relative',
    relative: {
      occurrence: 'last',
      dayOfWeek: 'weekend',
      month: 1,
    },
    duration: {
      hours: 24,
      startTime: '19:00 UTC Saturday',
      endTime: '19:00 UTC Sunday',
    },
    recurrence: 'annual',
    timezone: 'UTC',
  },
  uiConfig: {
    primaryColor: '#4A90E2',
    icon: '❄️',
    logForm: {
      fields: ['callsign', 'band', 'mode', 'exchange', 'section'],
      layout: 'standard',
    },
    dashboard: {
      widgets: ['qso-count', 'multipliers', 'bonuses', 'power-multiplier'],
      stats: ['totalQsos', 'totalPoints', 'sectionsWorked', 'estimatedScore'],
    },
    helpUrl: 'https://winterfieldday.org',
  },
  isActive: true,
  isPublic: true,
};
