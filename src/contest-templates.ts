/**
 * Contest Template Definitions
 * 
 * This file defines the rules, scoring, and configuration for different contest types.
 * Each template is inserted into the database and can be used to create contest instances.
 */

export interface ScoringRules {
  pointsPerQso: number;
  pointsByMode?: { [mode: string]: number }; // e.g., { CW: 2, Phone: 1, Digital: 2 }
  pointsByBand?: { [band: string]: number };
  multipliers?: {
    type: 'section' | 'state' | 'grid' | 'dxcc' | 'park' | 'summit' | 'custom';
    perBand?: boolean;
    perMode?: boolean;
    description: string;
  }[];
  bonuses?: {
    name: string;
    points: number;
    description: string;
    condition: string; // How to qualify
  }[];
  formula?: string; // Optional formula description
}

export interface RequiredFields {
  class?: { required: boolean; options?: string[]; description: string };
  section?: { required: boolean; description: string };
  power?: { required: boolean; options?: string[]; description: string };
  location?: { required: boolean; type: 'grid' | 'coordinates' | 'text'; description: string };
  exchange?: { required: boolean; format: string; description: string };
  reference?: { required: boolean; format: string; description: string }; // For POTA/SOTA
  participants?: { min?: number; max?: number; description: string };
  [key: string]: any;
}

export interface ValidationRules {
  bands?: string[]; // Allowed bands
  modes?: string[]; // Allowed modes
  timeWindow?: { start: string; end: string; timezone?: string };
  maxQsosPerStation?: number;
  duplicateRule?: 'none' | 'band' | 'mode' | 'band-mode';
  exchange?: {
    sent: string[]; // Fields to send
    received: string[]; // Fields to receive
    validation?: { [field: string]: string }; // Regex patterns
  };
  [key: string]: any;
}

export interface UIConfig {
  primaryColor?: string;
  icon?: string;
  logForm?: {
    fields: string[];
    layout?: 'compact' | 'standard' | 'detailed';
  };
  dashboard?: {
    widgets: string[];
    stats: string[];
  };
  helpUrl?: string;
  [key: string]: any;
}

export interface ContestTemplate {
  type: string;
  name: string;
  description: string;
  organization: string;
  scoringRules: ScoringRules;
  requiredFields: RequiredFields;
  validationRules: ValidationRules;
  uiConfig?: UIConfig;
  isActive: boolean;
  isPublic: boolean;
}

/**
 * ARRL Field Day Template
 */
export const ARRL_FIELD_DAY: ContestTemplate = {
  type: 'ARRL_FD',
  name: 'ARRL Field Day',
  description: 'Annual emergency preparedness exercise held on the 4th full weekend of June',
  organization: 'ARRL',
  scoringRules: {
    pointsPerQso: 1,
    pointsByMode: {
      CW: 2,
      PHONE: 1,
      DIGITAL: 2,
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
        name: 'Media Publicity',
        points: 100,
        description: 'Official news media visit',
        condition: 'Documented media coverage',
      },
      {
        name: 'Set up in Public Place',
        points: 100,
        description: 'Operate from publicly accessible location',
        condition: 'Public space with signage',
      },
      {
        name: 'Information Booth',
        points: 100,
        description: 'Booth with info for public',
        condition: 'Staffed information table',
      },
      {
        name: 'NTS Message to SM/SEC',
        points: 10,
        description: 'NTS message to Section Manager',
        condition: 'Formal NTS traffic message',
      },
      {
        name: 'W1AW Field Day Message',
        points: 100,
        description: 'Copy official W1AW FD message',
        condition: 'Complete W1AW bulletin copy',
      },
      {
        name: 'Satellite QSO',
        points: 100,
        description: 'At least one satellite contact',
        condition: 'Confirmed sat QSO',
      },
      {
        name: 'Site Visited by Elected Official',
        points: 100,
        description: 'Visit by elected government official',
        condition: 'Documented official visit',
      },
      {
        name: 'Site Visited by ARRL Official',
        points: 100,
        description: 'Visit by ARRL Section/Division official',
        condition: 'Documented ARRL official visit',
      },
      {
        name: 'GOTA Bonus',
        points: 20,
        description: 'Get On The Air station bonus (per QSO, max 400)',
        condition: 'GOTA station QSOs',
      },
      {
        name: 'Youth Participation',
        points: 20,
        description: 'Youth participant bonus (per youth, max 400)',
        condition: 'Licensed youth under 18',
      },
      {
        name: 'Home Station',
        points: 100,
        description: 'Operate from home using emergency power',
        condition: 'Class D or E using backup power',
      },
    ],
    formula: '(QSO Points × Power Multiplier) + Bonuses',
  },
  requiredFields: {
    class: {
      required: true,
      options: ['1A', '2A', '3A', '4A', '5A', '6A', '1B', '1C', '1D', '1E', '2E', '3E', '1F', '2F', '3F'],
      description: 'Number of transmitters and class (A=Field, B=Home Battery, C=Mobile, D=Home, E=Home Emergency, F=EOC)',
    },
    section: {
      required: true,
      description: 'ARRL Section (e.g., ORG, ENY, NFL)',
    },
    power: {
      required: true,
      options: ['HIGH', 'LOW', 'QRP'],
      description: 'Power level multiplier: HIGH=1x, LOW=2x (≤150W), QRP=5x (≤5W)',
    },
    participants: {
      min: 1,
      description: 'Number of participants in the group',
    },
  },
  validationRules: {
    bands: ['160', '80', '40', '20', '15', '10', '6', '2', '1.25', '70CM', 'SAT'],
    modes: ['CW', 'PHONE', 'DIGITAL', 'SSB', 'FM', 'FT8', 'FT4', 'PSK', 'RTTY'],
    timeWindow: {
      start: 'June 4th weekend, 1800 UTC Saturday',
      end: 'June 4th weekend, 2059 UTC Sunday',
    },
    duplicateRule: 'band-mode',
    exchange: {
      sent: ['class', 'section'],
      received: ['class', 'section'],
    },
  },
  uiConfig: {
    primaryColor: '#FF6B35',
    icon: '🎯',
    logForm: {
      fields: ['callsign', 'band', 'mode', 'exchange', 'section'],
      layout: 'standard',
    },
    dashboard: {
      widgets: ['qso-count', 'multipliers', 'bonuses', 'power-multiplier'],
      stats: ['totalQsos', 'totalPoints', 'sectionsWorked', 'estimatedScore'],
    },
    helpUrl: 'http://www.arrl.org/field-day',
  },
  isActive: true,
  isPublic: true,
};

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
        points: 50,
        description: 'Operate outdoors in winter',
        condition: 'Equipment and operators outside',
      },
      {
        name: 'Information Booth',
        points: 100,
        description: 'Public information about amateur radio',
        condition: 'Educational display or booth',
      },
      {
        name: 'Youth Participation',
        points: 20,
        description: 'Youth participant (max 400)',
        condition: 'Licensed youth participant',
      },
      {
        name: 'Social Media',
        points: 100,
        description: 'Active social media presence',
        condition: 'Posted updates on social media',
      },
    ],
    formula: '(QSO Points × Power Multiplier) + Bonuses',
  },
  requiredFields: {
    class: {
      required: true,
      options: ['1O', '2O', '3O', '1I', '2I', '3I', '1H'],
      description: 'Number of transmitters: O=Outdoor, I=Indoor, H=Home',
    },
    section: {
      required: false,
      description: 'ARRL Section (optional)',
    },
    power: {
      required: true,
      options: ['HIGH', 'LOW', 'QRP'],
      description: 'Power level: HIGH=1x, LOW=2x (≤150W), QRP=5x (≤5W)',
    },
    location: {
      required: true,
      type: 'grid',
      description: 'Maidenhead grid square',
    },
  },
  validationRules: {
    bands: ['160', '80', '40', '20', '15', '10', '6', '2', '1.25', '70CM'],
    modes: ['CW', 'PHONE', 'DIGITAL', 'SSB', 'FM', 'FT8', 'FT4', 'PSK', 'RTTY'],
    timeWindow: {
      start: 'Last full weekend of January, 1900 UTC Saturday',
      end: 'Last full weekend of January, 1859 UTC Sunday',
    },
    duplicateRule: 'band-mode',
    exchange: {
      sent: ['class', 'section'],
      received: ['class', 'section'],
    },
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

/**
 * All contest templates
 */
export const CONTEST_TEMPLATES: ContestTemplate[] = [
  ARRL_FIELD_DAY,
  WINTER_FIELD_DAY,
  POTA,
  SOTA,
];
