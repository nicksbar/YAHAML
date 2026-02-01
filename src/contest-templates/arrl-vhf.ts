import type { ContestTemplate } from './types';

export const ARRL_VHF_SWEEPSTAKES: ContestTemplate = {
  type: 'ARRL_VHF_SWEEPSTAKES',
  name: 'ARRL VHF Sweepstakes',
  description: 'VHF contest covering 6m and above',
  organization: 'ARRL',
  scoringRules: {
    pointsPerQso: 1,
    multipliers: [
      {
        type: 'grid',
        perBand: true,
        perMode: false,
        description: 'Grid squares per band',
      },
    ],
    formula: '1 point per QSO × grid squares per band',
  },
  requiredFields: {
    exchange: {
      required: true,
      format: 'Grid square',
      description: '4 or 6 character grid square',
    },
  },
  validationRules: {
    bands: ['6', '2', '1.25', '70CM', '33CM', '23CM', '13CM', '6CM', '3CM', '1.25CM'],
    modes: ['CW', 'SSB', 'FM', 'DIGITAL'],
    duplicateRule: 'band',
    exchange: {
      sent: ['grid'],
      received: ['grid'],
    },
  },
  uiConfig: {
    primaryColor: '#14B8A6',
    icon: '📡',
    helpUrl: 'https://www.arrl.org/vhf',
  },
  isActive: true,
  isPublic: true,
};

export const ARRL_JANUARY_VHF: ContestTemplate = {
  type: 'ARRL_JAN_VHF',
  name: 'ARRL January VHF Contest',
  description: 'Winter VHF contest focused on 6m and above',
  organization: 'ARRL',
  scoringRules: {
    pointsPerQso: 1,
    multipliers: [
      {
        type: 'grid',
        perBand: true,
        perMode: false,
        description: 'Grid squares per band',
      },
    ],
  },
  requiredFields: {
    exchange: {
      required: true,
      format: 'Grid square',
      description: '4 or 6 character grid square',
    },
  },
  validationRules: {
    bands: ['6', '2', '1.25', '70CM', '33CM', '23CM', '13CM', '6CM', '3CM', '1.25CM'],
    modes: ['CW', 'SSB', 'FM', 'DIGITAL'],
    duplicateRule: 'band',
    exchange: {
      sent: ['grid'],
      received: ['grid'],
    },
  },
  schedule: {
    type: 'relative',
    relative: {
      occurrence: 'third',
      dayOfWeek: 'weekend',
      month: 1,
    },
    duration: {
      hours: 33,
      startTime: '19:00 UTC Saturday',
      endTime: '03:59 UTC Monday',
    },
    recurrence: 'annual',
    timezone: 'UTC',
  },
  uiConfig: {
    primaryColor: '#3B82F6',
    icon: '❄️',
    helpUrl: 'https://www.arrl.org/january-vhf',
  },
  isActive: true,
  isPublic: true,
};

export const ARRL_JUNE_VHF: ContestTemplate = {
  type: 'ARRL_JUNE_VHF',
  name: 'ARRL June VHF Contest',
  description: 'Summer VHF contest focused on 6m and above',
  organization: 'ARRL',
  scoringRules: {
    pointsPerQso: 1,
    multipliers: [
      {
        type: 'grid',
        perBand: true,
        perMode: false,
        description: 'Grid squares per band',
      },
    ],
  },
  requiredFields: {
    exchange: {
      required: true,
      format: 'Grid square',
      description: '4 or 6 character grid square',
    },
  },
  validationRules: {
    bands: ['6', '2', '1.25', '70CM', '33CM', '23CM', '13CM', '6CM', '3CM', '1.25CM'],
    modes: ['CW', 'SSB', 'FM', 'DIGITAL'],
    duplicateRule: 'band',
    exchange: {
      sent: ['grid'],
      received: ['grid'],
    },
  },
  schedule: {
    type: 'relative',
    relative: {
      occurrence: 'second',
      dayOfWeek: 'weekend',
      month: 6,
    },
    duration: {
      hours: 33,
      startTime: '18:00 UTC Saturday',
      endTime: '02:59 UTC Monday',
    },
    recurrence: 'annual',
    timezone: 'UTC',
  },
  uiConfig: {
    primaryColor: '#06B6D4',
    icon: '🌤️',
    helpUrl: 'https://www.arrl.org/june-vhf',
  },
  isActive: true,
  isPublic: true,
};

export const ARRL_SEPTEMBER_VHF: ContestTemplate = {
  type: 'ARRL_SEPT_VHF',
  name: 'ARRL September VHF Contest',
  description: 'Fall VHF contest focused on 6m and above',
  organization: 'ARRL',
  scoringRules: {
    pointsPerQso: 1,
    multipliers: [
      {
        type: 'grid',
        perBand: true,
        perMode: false,
        description: 'Grid squares per band',
      },
    ],
  },
  requiredFields: {
    exchange: {
      required: true,
      format: 'Grid square',
      description: '4 or 6 character grid square',
    },
  },
  validationRules: {
    bands: ['6', '2', '1.25', '70CM', '33CM', '23CM', '13CM', '6CM', '3CM', '1.25CM'],
    modes: ['CW', 'SSB', 'FM', 'DIGITAL'],
    duplicateRule: 'band',
    exchange: {
      sent: ['grid'],
      received: ['grid'],
    },
  },
  schedule: {
    type: 'relative',
    relative: {
      occurrence: 'second',
      dayOfWeek: 'weekend',
      month: 9,
    },
    duration: {
      hours: 33,
      startTime: '18:00 UTC Saturday',
      endTime: '02:59 UTC Monday',
    },
    recurrence: 'annual',
    timezone: 'UTC',
  },
  uiConfig: {
    primaryColor: '#F97316',
    icon: '🍂',
    helpUrl: 'https://www.arrl.org/september-vhf',
  },
  isActive: true,
  isPublic: true,
};

export const ARRL_10_GHZ_UP: ContestTemplate = {
  type: 'ARRL_10GHZ_UP',
  name: 'ARRL 10 GHz & Up Contest',
  description: 'Microwave contest covering 10 GHz and higher bands',
  organization: 'ARRL',
  scoringRules: {
    pointsPerQso: 1,
    multipliers: [
      {
        type: 'grid',
        perBand: true,
        perMode: false,
        description: 'Grid squares per band',
      },
    ],
  },
  requiredFields: {
    exchange: {
      required: true,
      format: 'Grid square',
      description: '4 or 6 character grid square',
    },
  },
  validationRules: {
    bands: ['10GHZ', '24GHZ', '47GHZ', '76GHZ', '122GHZ', '134GHZ', '241GHZ'],
    modes: ['CW', 'SSB', 'FM', 'DIGITAL'],
    duplicateRule: 'band',
    exchange: {
      sent: ['grid'],
      received: ['grid'],
    },
  },
  schedule: {
    type: 'relative',
    relative: {
      occurrence: 'third',
      dayOfWeek: 'weekend',
      month: 8,
    },
    duration: {
      hours: 33,
      startTime: '06:00 UTC Saturday',
      endTime: '00:00 UTC Monday',
    },
    recurrence: 'annual',
    timezone: 'UTC',
  },
  uiConfig: {
    primaryColor: '#A855F7',
    icon: '🛰️',
    helpUrl: 'https://www.arrl.org/10-ghz-and-up',
  },
  isActive: true,
  isPublic: true,
};
