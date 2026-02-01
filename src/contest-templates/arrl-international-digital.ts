import type { ContestTemplate } from './types';

export const ARRL_INTERNATIONAL_DIGITAL: ContestTemplate = {
  type: 'ARRL_IDXC',
  name: 'ARRL International Digital Contest',
  description: 'Worldwide digital contest sponsored by ARRL',
  organization: 'ARRL',
  scoringRules: {
    pointsPerQso: 2,
    multipliers: [
      {
        type: 'dxcc',
        perBand: true,
        perMode: false,
        description: 'DXCC countries per band',
      },
    ],
    formula: '2 points per QSO × DXCC multipliers',
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
    modes: ['FT8', 'FT4', 'RTTY', 'DIGITAL'],
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
      month: 9,
    },
    duration: {
      hours: 24,
      startTime: '00:00 UTC Saturday',
      endTime: '23:59 UTC Saturday',
    },
    recurrence: 'annual',
    timezone: 'UTC',
  },
  uiConfig: {
    primaryColor: '#0F766E',
    icon: '💻',
    helpUrl: 'https://www.arrl.org/international-digital-contest',
  },
  isActive: true,
  isPublic: true,
};
