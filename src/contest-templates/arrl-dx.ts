import type { ContestTemplate } from './types';

export const ARRL_DX_CW: ContestTemplate = {
  type: 'ARRL_DX_CW',
  name: 'ARRL International DX Contest (CW)',
  description: 'Worldwide DX contest sponsored by ARRL (CW weekend)',
  organization: 'ARRL',
  scoringRules: {
    pointsPerQso: 3,
    multipliers: [
      {
        type: 'dxcc',
        perBand: true,
        perMode: false,
        description: 'DXCC countries per band',
      },
    ],
    formula: '3 points per DX QSO × DXCC multipliers',
  },
  requiredFields: {
    exchange: {
      required: true,
      format: 'RST + Power (DX) / State (US/CA)',
      description: 'DX sends power; US/CA sends state/province',
    },
  },
  validationRules: {
    bands: ['160', '80', '40', '20', '15', '10'],
    modes: ['CW'],
    duplicateRule: 'band',
    exchange: {
      sent: ['rst', 'stateOrPower'],
      received: ['rst', 'stateOrPower'],
    },
  },
  schedule: {
    type: 'relative',
    relative: {
      occurrence: 'third',
      dayOfWeek: 'weekend',
      month: 2,
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
    primaryColor: '#0EA5E9',
    icon: '🌍',
    helpUrl: 'https://www.arrl.org/dx',
  },
  isActive: true,
  isPublic: true,
};

export const ARRL_DX_SSB: ContestTemplate = {
  type: 'ARRL_DX_SSB',
  name: 'ARRL International DX Contest (SSB)',
  description: 'Worldwide DX contest sponsored by ARRL (SSB weekend)',
  organization: 'ARRL',
  scoringRules: {
    pointsPerQso: 3,
    multipliers: [
      {
        type: 'dxcc',
        perBand: true,
        perMode: false,
        description: 'DXCC countries per band',
      },
    ],
    formula: '3 points per DX QSO × DXCC multipliers',
  },
  requiredFields: {
    exchange: {
      required: true,
      format: 'RST + Power (DX) / State (US/CA)',
      description: 'DX sends power; US/CA sends state/province',
    },
  },
  validationRules: {
    bands: ['160', '80', '40', '20', '15', '10'],
    modes: ['SSB'],
    duplicateRule: 'band',
    exchange: {
      sent: ['rst', 'stateOrPower'],
      received: ['rst', 'stateOrPower'],
    },
  },
  schedule: {
    type: 'relative',
    relative: {
      occurrence: 'first',
      dayOfWeek: 'weekend',
      month: 3,
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
    primaryColor: '#22C55E',
    icon: '📣',
    helpUrl: 'https://www.arrl.org/dx',
  },
  isActive: true,
  isPublic: true,
};
