import type { ContestTemplate } from './types';

export const ARRL_ROOKIE_ROUNDUP_CW: ContestTemplate = {
  type: 'ARRL_RR_CW',
  name: 'ARRL Rookie Roundup (CW)',
  description: 'Rookie-focused CW contest for new operators',
  organization: 'ARRL',
  scoringRules: {
    pointsPerQso: 1,
    formula: '1 point per QSO',
  },
  requiredFields: {
    exchange: {
      required: true,
      format: 'Name + Check (Year Licensed) + State/Province',
      description: 'Rookie exchange fields',
    },
  },
  validationRules: {
    bands: ['80', '40', '20', '15', '10'],
    modes: ['CW'],
    duplicateRule: 'band',
    exchange: {
      sent: ['name', 'check', 'state'],
      received: ['name', 'check', 'state'],
    },
  },
  schedule: {
    type: 'relative',
    relative: {
      occurrence: 'third',
      dayOfWeek: 'sunday',
      month: 12,
    },
    duration: {
      hours: 18,
      startTime: '13:00 UTC',
      endTime: '06:59 UTC',
    },
    recurrence: 'annual',
    timezone: 'UTC',
  },
  uiConfig: {
    primaryColor: '#10B981',
    icon: '🧭exclamation',
    helpUrl: 'https://www.arrl.org/rookie-roundup',
  },
  isActive: true,
  isPublic: true,
};

export const ARRL_ROOKIE_ROUNDUP_SSB: ContestTemplate = {
  type: 'ARRL_RR_SSB',
  name: 'ARRL Rookie Roundup (SSB)',
  description: 'Rookie-focused SSB contest for new operators',
  organization: 'ARRL',
  scoringRules: {
    pointsPerQso: 1,
    formula: '1 point per QSO',
  },
  requiredFields: {
    exchange: {
      required: true,
      format: 'Name + Check (Year Licensed) + State/Province',
      description: 'Rookie exchange fields',
    },
  },
  validationRules: {
    bands: ['80', '40', '20', '15', '10'],
    modes: ['SSB'],
    duplicateRule: 'band',
    exchange: {
      sent: ['name', 'check', 'state'],
      received: ['name', 'check', 'state'],
    },
  },
  schedule: {
    type: 'relative',
    relative: {
      occurrence: 'third',
      dayOfWeek: 'sunday',
      month: 4,
    },
    duration: {
      hours: 18,
      startTime: '13:00 UTC',
      endTime: '06:59 UTC',
    },
    recurrence: 'annual',
    timezone: 'UTC',
  },
  uiConfig: {
    primaryColor: '#F97316',
    icon: '🎙️',
    helpUrl: 'https://www.arrl.org/rookie-roundup',
  },
  isActive: true,
  isPublic: true,
};

export const ARRL_ROOKIE_ROUNDUP_RTTY: ContestTemplate = {
  type: 'ARRL_RR_RTTY',
  name: 'ARRL Rookie Roundup (RTTY)',
  description: 'Rookie-focused RTTY contest for new operators',
  organization: 'ARRL',
  scoringRules: {
    pointsPerQso: 1,
    formula: '1 point per QSO',
  },
  requiredFields: {
    exchange: {
      required: true,
      format: 'Name + Check (Year Licensed) + State/Province',
      description: 'Rookie exchange fields',
    },
  },
  validationRules: {
    bands: ['80', '40', '20', '15', '10'],
    modes: ['RTTY', 'DIGITAL'],
    duplicateRule: 'band',
    exchange: {
      sent: ['name', 'check', 'state'],
      received: ['name', 'check', 'state'],
    },
  },
  schedule: {
    type: 'relative',
    relative: {
      occurrence: 'third',
      dayOfWeek: 'sunday',
      month: 8,
    },
    duration: {
      hours: 18,
      startTime: '13:00 UTC',
      endTime: '06:59 UTC',
    },
    recurrence: 'annual',
    timezone: 'UTC',
  },
  uiConfig: {
    primaryColor: '#6366F1',
    icon: '🖥️',
    helpUrl: 'https://www.arrl.org/rookie-roundup',
  },
  isActive: true,
  isPublic: true,
};
