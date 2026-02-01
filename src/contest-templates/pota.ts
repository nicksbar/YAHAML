import type { ContestTemplate } from './types';

/**
 * POTA (Parks on the Air) Template
 */
export const POTA: ContestTemplate = {
  type: 'POTA',
  name: 'Parks on the Air',
  description: 'Activate parks and wildlife areas, contact park activators',
  organization: 'POTA',
  scoringRules: {
    pointsPerQso: 1,
    bonuses: [
      {
        name: 'Park-to-Park',
        points: 1,
        description: 'Both stations operating from parks',
        condition: 'QSO between two park activators',
      },
    ],
    formula: 'Activator: 10 QSOs minimum per activation. Hunter: Points per park worked.',
  },
  requiredFields: {
    reference: {
      required: true,
      format: 'K-####',
      description: 'Park reference (e.g., K-4566 for Acadia NP)',
    },
    location: {
      required: true,
      type: 'grid',
      description: 'Operating location grid square',
    },
  },
  validationRules: {
    bands: ['160', '80', '60', '40', '30', '20', '17', '15', '12', '10', '6', '2', '1.25', '70CM'],
    modes: ['CW', 'SSB', 'FM', 'DIGITAL', 'FT8', 'FT4', 'PSK31', 'RTTY'],
    exchange: {
      sent: ['rst', 'park'],
      received: ['rst', 'park'],
      validation: {
        park: '^[A-Z]{1,2}-[0-9]{4}$', // K-4566, VE-0001, etc.
      },
    },
  },
  schedule: {
    type: 'year-round',
    recurrence: 'none',
  },
  uiConfig: {
    primaryColor: '#2ECC71',
    icon: '🏞️',
    logForm: {
      fields: ['callsign', 'band', 'mode', 'rst-sent', 'rst-rcvd', 'their-park'],
      layout: 'compact',
    },
    dashboard: {
      widgets: ['qso-count', 'parks-worked', 'p2p-count'],
      stats: ['totalQsos', 'parksWorked', 'parkToParks', 'validActivation'],
    },
    helpUrl: 'https://parksontheair.com',
  },
  isActive: true,
  isPublic: true,
};
