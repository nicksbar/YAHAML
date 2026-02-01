import type { ContestTemplate } from './types';

export const ARRL_RTTY_ROUNDUP: ContestTemplate = {
  type: 'ARRL_RTTY',
  name: 'ARRL RTTY Roundup',
  description: 'Annual ARRL RTTY Roundup',
  organization: 'ARRL',
  scoringRules: {
    pointsPerQso: 1,
    multipliers: [
      {
        type: 'state',
        perBand: false,
        perMode: false,
        description: 'US states and Canadian provinces',
      },
    ],
    formula: '1 point per QSO × multipliers',
  },
  requiredFields: {
    exchange: {
      required: true,
      format: 'RST + State/Province (US/CA) or Serial (DX)',
      description: 'US/CA sends state/province; DX sends serial number',
    },
  },
  validationRules: {
    bands: ['80', '40', '20', '15', '10'],
    modes: ['RTTY', 'DIGITAL'],
    duplicateRule: 'band',
    exchange: {
      sent: ['rst', 'stateOrSerial'],
      received: ['rst', 'stateOrSerial'],
    },
  },
  schedule: {
    type: 'relative',
    relative: {
      occurrence: 'first',
      dayOfWeek: 'weekend',
      month: 1,
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
    primaryColor: '#8B5CF6',
    icon: '⌨️',
    helpUrl: 'https://www.arrl.org/rtty-roundup',
  },
  isActive: true,
  isPublic: true,
};
