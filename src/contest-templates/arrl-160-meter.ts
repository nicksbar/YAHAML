import type { ContestTemplate } from './types';

export const ARRL_160_METER: ContestTemplate = {
  type: 'ARRL_160M',
  name: 'ARRL 160 Meter Contest',
  description: 'Top band contest focused on 160m CW',
  organization: 'ARRL',
  scoringRules: {
    pointsPerQso: 2,
    multipliers: [
      {
        type: 'section',
        perBand: false,
        perMode: false,
        description: 'ARRL/RAC sections worked',
      },
    ],
    formula: '2 points per QSO × sections worked',
  },
  requiredFields: {
    exchange: {
      required: true,
      format: 'RST + Section (US/CA) or Country (DX)',
      description: 'US/CA sends ARRL section; DX sends country',
    },
  },
  validationRules: {
    bands: ['160'],
    modes: ['CW'],
    duplicateRule: 'band',
    exchange: {
      sent: ['rst', 'sectionOrCountry'],
      received: ['rst', 'sectionOrCountry'],
    },
  },
  schedule: {
    type: 'relative',
    relative: {
      occurrence: 'first',
      dayOfWeek: 'weekend',
      month: 12,
    },
    duration: {
      hours: 48,
      startTime: '22:00 UTC Friday',
      endTime: '15:59 UTC Sunday',
    },
    recurrence: 'annual',
    timezone: 'UTC',
  },
  uiConfig: {
    primaryColor: '#1F2937',
    icon: '🌙',
    helpUrl: 'https://www.arrl.org/160-meter',
  },
  isActive: true,
  isPublic: true,
};
