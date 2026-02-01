import type { ContestTemplate } from './types';

export const ARRL_10_METER: ContestTemplate = {
  type: 'ARRL_10M',
  name: 'ARRL 10 Meter Contest',
  description: 'Annual ARRL 10 Meter Contest focusing on 10m propagation',
  organization: 'ARRL',
  scoringRules: {
    pointsPerQso: 2,
    pointsByMode: { CW: 4, SSB: 2 },
    multipliers: [
      {
        type: 'state',
        perBand: false,
        perMode: false,
        description: 'US states and Canadian provinces worked',
      },
    ],
    formula: '(CW QSOs × 4) + (SSB QSOs × 2) × Multipliers',
  },
  requiredFields: {
    exchange: {
      required: true,
      format: 'RST + State/Province (US/CA) or Serial (DX)',
      description: 'US/CA send state/province; DX sends serial number',
    },
  },
  validationRules: {
    bands: ['10'],
    modes: ['CW', 'SSB'],
    duplicateRule: 'band-mode',
    exchange: {
      sent: ['rst', 'stateOrSerial'],
      received: ['rst', 'stateOrSerial'],
    },
  },
  schedule: {
    type: 'relative',
    relative: {
      occurrence: 'second',
      dayOfWeek: 'weekend',
      month: 12,
    },
    duration: {
      hours: 48,
      startTime: '00:00 UTC Saturday',
      endTime: '23:59 UTC Sunday',
    },
    recurrence: 'annual',
    timezone: 'UTC',
  },
  uiConfig: {
    primaryColor: '#F59E0B',
    icon: '🌞',
    helpUrl: 'https://www.arrl.org/10-meter',
  },
  isActive: true,
  isPublic: true,
};
