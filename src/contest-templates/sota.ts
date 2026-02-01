import type { ContestTemplate } from './types';

/**
 * SOTA (Summits on the Air) Template
 */
export const SOTA: ContestTemplate = {
  type: 'SOTA',
  name: 'Summits on the Air',
  description: 'Activate mountain summits, contact summit activators',
  organization: 'SOTA',
  scoringRules: {
    pointsPerQso: 1,
    bonuses: [
      {
        name: 'Summit-to-Summit',
        points: 2,
        description: 'Both stations operating from summits',
        condition: 'S2S QSO',
      },
    ],
    formula: 'Activator: Points based on summit altitude. Chaser: Points per summit worked.',
  },
  requiredFields: {
    reference: {
      required: true,
      format: 'W7W/XX-###',
      description: 'Summit reference (e.g., W7W/LC-001)',
    },
    location: {
      required: false,
      type: 'grid',
      description: 'Operating location grid square',
    },
  },
  validationRules: {
    bands: ['160', '80', '60', '40', '30', '20', '17', '15', '12', '10', '6', '2', '1.25', '70CM', '23CM'],
    modes: ['CW', 'SSB', 'FM', 'DIGITAL', 'FT8', 'FT4'],
    exchange: {
      sent: ['rst', 'summit'],
      received: ['rst', 'summit'],
      validation: {
        summit: '^[A-Z0-9]{2,3}/[A-Z]{2}-[0-9]{3}$', // W7W/LC-001
      },
    },
  },
  schedule: {
    type: 'year-round',
    recurrence: 'none',
  },
  uiConfig: {
    primaryColor: '#E67E22',
    icon: '⛰️',
    logForm: {
      fields: ['callsign', 'band', 'mode', 'rst-sent', 'rst-rcvd', 'their-summit'],
      layout: 'compact',
    },
    dashboard: {
      widgets: ['qso-count', 'summits-worked', 's2s-count', 'altitude'],
      stats: ['totalQsos', 'summitsWorked', 'summitToSummit', 'validActivation'],
    },
    helpUrl: 'https://www.sota.org.uk',
  },
  isActive: true,
  isPublic: true,
};
