/**
 * Scenario definitions for demo/test data loading
 * Each scenario fully resets the instance and populates example data
 */

export interface ScenarioDefinition {
  id: string;
  name: string;
  description: string;
  category: 'home' | 'pota' | 'field-day' | 'complex';
  data: {
    stations: Array<{
      callsign: string;
      name: string;
      class?: string;
      licenseClass?: string;
      location?: {
        name: string;
        latitude?: string;
        longitude?: string;
        grid?: string;
        section?: string;
      };
    }>;
    clubs?: Array<{
      callsign: string;
      name: string;
      section?: string;
      operatorCallsigns: string[];
      adminCallsigns: string[];
    }>;
    contests?: Array<{
      name: string;
      templateType?: string;
      scoringMode?: string;
      pointsPerQso?: number;
      duration?: number;
    }>;
    qsos?: Array<{
      stationCallsign: string;
      remoteCallsign: string;
      band: string;
      mode: string;
      rstSent?: string;
      rstRcvd?: string;
      grid?: string;
      section?: string;
      daysAgo?: number;
    }>;
  };
}

export const scenarios: Record<string, ScenarioDefinition> = {
  'home-1-station': {
    id: 'home-1-station',
    name: 'Home Use - Single Station',
    description: 'One home station with one callsign. Good for casual operating.',
    category: 'home',
    data: {
      stations: [
        {
          callsign: 'W5XYZ',
          name: 'My Home Station',
          licenseClass: 'A',
          location: {
            name: 'Home QTH',
            grid: 'EM13aa',
            section: 'OK',
            latitude: '35.5',
            longitude: '-97.5',
          },
        },
      ],
      contests: [
        { name: 'CQ WW CW', templateType: 'CQ_WW', scoringMode: 'SIMPLE', pointsPerQso: 1 },
        { name: 'ARRL DX CW', templateType: 'ARRL_DX', scoringMode: 'SIMPLE', pointsPerQso: 1 },
        { name: 'FT8 Sprint', templateType: 'FT8_SPRINT', scoringMode: 'SIMPLE', pointsPerQso: 1 },
      ],
      qsos: [
        { stationCallsign: 'W5XYZ', remoteCallsign: 'G3ZZZ', band: '20', mode: 'CW', rstSent: '599', rstRcvd: '589', daysAgo: 1 },
        { stationCallsign: 'W5XYZ', remoteCallsign: 'F6ABC', band: '20', mode: 'CW', rstSent: '599', rstRcvd: '599', daysAgo: 1 },
        { stationCallsign: 'W5XYZ', remoteCallsign: 'VE3ABC', band: '40', mode: 'CW', rstSent: '599', rstRcvd: '579', daysAgo: 1 },
        { stationCallsign: 'W5XYZ', remoteCallsign: 'ZL3ABC', band: '20', mode: 'CW', rstSent: '599', rstRcvd: '569', daysAgo: 0 },
        { stationCallsign: 'W5XYZ', remoteCallsign: 'JA1ABC', band: '20', mode: 'CW', rstSent: '589', rstRcvd: '579', daysAgo: 0 },
      ],
    },
  },

  'home-2-station': {
    id: 'home-2-station',
    name: 'Home Use - Two Stations',
    description: 'Two home stations in same household, club call support.',
    category: 'home',
    data: {
      stations: [
        {
          callsign: 'W5XYZ',
          name: 'Main Station',
          licenseClass: 'A',
          location: {
            name: 'Home QTH',
            grid: 'EM13aa',
            section: 'OK',
            latitude: '35.5',
            longitude: '-97.5',
          },
        },
        {
          callsign: 'W5ABC',
          name: 'Backup Station',
          licenseClass: 'A',
          location: {
            name: 'Home QTH - Back Room',
            grid: 'EM13aa',
            section: 'OK',
            latitude: '35.5',
            longitude: '-97.5',
          },
        },
      ],
      clubs: [
        {
          callsign: 'W5FOO',
          name: 'My Local Club',
          section: 'OK',
          operatorCallsigns: ['W5XYZ', 'W5ABC'],
          adminCallsigns: ['W5XYZ'],
        },
      ],
      contests: [
        { name: 'ARRL Field Day 2024', templateType: 'ARRL_FD', scoringMode: 'ARRL', pointsPerQso: 1, duration: 24 },
        { name: 'CQ WW SSB', templateType: 'CQ_WW', scoringMode: 'SIMPLE', pointsPerQso: 1 },
        { name: 'VHF/UHF Contest', templateType: 'VHF_UHF', scoringMode: 'SIMPLE', pointsPerQso: 1 },
      ],
      qsos: [
        { stationCallsign: 'W5XYZ', remoteCallsign: 'K0ABC', band: '20', mode: 'SSB', rstSent: '59', rstRcvd: '58', daysAgo: 1 },
        { stationCallsign: 'W5XYZ', remoteCallsign: 'N6XYZ', band: '20', mode: 'SSB', rstSent: '59', rstRcvd: '59', daysAgo: 1 },
        { stationCallsign: 'W5ABC', remoteCallsign: 'W2ABC', band: '40', mode: 'SSB', rstSent: '57', rstRcvd: '56', daysAgo: 0 },
        { stationCallsign: 'W5ABC', remoteCallsign: 'K3LMN', band: '80', mode: 'SSB', rstSent: '58', rstRcvd: '59', daysAgo: 0 },
      ],
    },
  },

  'pota-activation': {
    id: 'pota-activation',
    name: 'POTA - Parks Activation',
    description: 'Single station, multiple portable operators. Parks on the Air activation.',
    category: 'pota',
    data: {
      stations: [
        {
          callsign: 'W5XYZ/P',
          name: 'Portable - Robbers Cave State Park',
          licenseClass: 'A',
          location: {
            name: 'Robbers Cave State Park, OK',
            grid: 'EM15au',
            section: 'OK',
            latitude: '35.35',
            longitude: '-95.23',
          },
        },
      ],
      contests: [
        { name: 'POTA Activation', templateType: 'POTA', scoringMode: 'SIMPLE', pointsPerQso: 1 },
      ],
      qsos: [
        { stationCallsign: 'W5XYZ/P', remoteCallsign: 'K0ABC', band: '20', mode: 'CW', rstSent: '579', rstRcvd: '589', daysAgo: 0 },
        { stationCallsign: 'W5XYZ/P', remoteCallsign: 'VE3XYZ', band: '20', mode: 'CW', rstSent: '589', rstRcvd: '579', daysAgo: 0 },
        { stationCallsign: 'W5XYZ/P', remoteCallsign: 'W4ABC', band: '20', mode: 'CW', rstSent: '599', rstRcvd: '599', daysAgo: 0 },
        { stationCallsign: 'W5XYZ/P', remoteCallsign: 'N5ABC', band: '40', mode: 'CW', rstSent: '579', rstRcvd: '569', daysAgo: 0 },
        { stationCallsign: 'W5XYZ/P', remoteCallsign: 'K5DEF', band: '40', mode: 'CW', rstSent: '589', rstRcvd: '589', daysAgo: 0 },
        { stationCallsign: 'W5XYZ/P', remoteCallsign: 'W5GHI', band: '40', mode: 'CW', rstSent: '569', rstRcvd: '579', daysAgo: 0 },
        { stationCallsign: 'W5XYZ/P', remoteCallsign: 'ZL2JKL', band: '20', mode: 'CW', rstSent: '569', rstRcvd: '559', daysAgo: 0 },
        { stationCallsign: 'W5XYZ/P', remoteCallsign: 'G3MNO', band: '20', mode: 'CW', rstSent: '599', rstRcvd: '589', daysAgo: 0 },
      ],
    },
  },

  'field-day-small': {
    id: 'field-day-small',
    name: 'Field Day - Small (2-4 Stations)',
    description: 'Small Field Day operation. 2 to 4 stations, modest effort.',
    category: 'field-day',
    data: {
      stations: [
        {
          callsign: 'W5ABC',
          name: 'Station 1 - CW',
          class: '2A',
          licenseClass: 'A',
          location: {
            name: 'Field Day Site',
            grid: 'EM13ab',
            section: 'OK',
            latitude: '35.45',
            longitude: '-97.5',
          },
        },
        {
          callsign: 'W5DEF',
          name: 'Station 2 - Phone',
          class: '2A',
          licenseClass: 'A',
          location: {
            name: 'Field Day Site',
            grid: 'EM13ab',
            section: 'OK',
            latitude: '35.45',
            longitude: '-97.5',
          },
        },
        {
          callsign: 'W5GHI',
          name: 'Station 3 - Digital',
          class: '2A',
          licenseClass: 'A',
          location: {
            name: 'Field Day Site',
            grid: 'EM13ab',
            section: 'OK',
            latitude: '35.45',
            longitude: '-97.5',
          },
        },
      ],
      clubs: [
        {
          callsign: 'W5XYZ',
          name: 'Small Town Radio Club FD',
          section: 'OK',
          operatorCallsigns: ['W5ABC', 'W5DEF', 'W5GHI'],
          adminCallsigns: ['W5ABC'],
        },
      ],
      contests: [
        { name: 'ARRL Field Day 2024', templateType: 'ARRL_FD', scoringMode: 'ARRL', pointsPerQso: 1, duration: 24 },
      ],
      qsos: [
        // CW Station - 20 QSOs
        { stationCallsign: 'W5ABC', remoteCallsign: 'K0ABC', band: '20', mode: 'CW', rstSent: '599', rstRcvd: '589', daysAgo: 1 },
        { stationCallsign: 'W5ABC', remoteCallsign: 'N0DEF', band: '20', mode: 'CW', rstSent: '599', rstRcvd: '599', daysAgo: 1 },
        { stationCallsign: 'W5ABC', remoteCallsign: 'W4GHI', band: '20', mode: 'CW', rstSent: '589', rstRcvd: '579', daysAgo: 1 },
        { stationCallsign: 'W5ABC', remoteCallsign: 'VE3ABC', band: '20', mode: 'CW', rstSent: '579', rstRcvd: '589', daysAgo: 1 },
        { stationCallsign: 'W5ABC', remoteCallsign: 'G3XYZ', band: '20', mode: 'CW', rstSent: '569', rstRcvd: '579', daysAgo: 1 },
        { stationCallsign: 'W5ABC', remoteCallsign: 'F6ABC', band: '40', mode: 'CW', rstSent: '579', rstRcvd: '569', daysAgo: 1 },
        { stationCallsign: 'W5ABC', remoteCallsign: 'EA5ABC', band: '40', mode: 'CW', rstSent: '589', rstRcvd: '589', daysAgo: 1 },
        { stationCallsign: 'W5ABC', remoteCallsign: 'HB9XYZ', band: '40', mode: 'CW', rstSent: '599', rstRcvd: '569', daysAgo: 1 },
        { stationCallsign: 'W5ABC', remoteCallsign: 'ZL2ABC', band: '80', mode: 'CW', rstSent: '569', rstRcvd: '569', daysAgo: 1 },
        { stationCallsign: 'W5ABC', remoteCallsign: 'VK2ABC', band: '80', mode: 'CW', rstSent: '559', rstRcvd: '559', daysAgo: 1 },
        // Phone Station - 15 QSOs
        { stationCallsign: 'W5DEF', remoteCallsign: 'K1ABC', band: '20', mode: 'SSB', rstSent: '59', rstRcvd: '59', daysAgo: 1 },
        { stationCallsign: 'W5DEF', remoteCallsign: 'W2XYZ', band: '20', mode: 'SSB', rstSent: '58', rstRcvd: '58', daysAgo: 1 },
        { stationCallsign: 'W5DEF', remoteCallsign: 'N4ABC', band: '20', mode: 'SSB', rstSent: '59', rstRcvd: '57', daysAgo: 1 },
        { stationCallsign: 'W5DEF', remoteCallsign: 'W6DEF', band: '20', mode: 'SSB', rstSent: '57', rstRcvd: '56', daysAgo: 1 },
        { stationCallsign: 'W5DEF', remoteCallsign: 'K7ABC', band: '40', mode: 'SSB', rstSent: '58', rstRcvd: '59', daysAgo: 1 },
        { stationCallsign: 'W5DEF', remoteCallsign: 'W9XYZ', band: '40', mode: 'SSB', rstSent: '59', rstRcvd: '58', daysAgo: 1 },
        { stationCallsign: 'W5DEF', remoteCallsign: 'N5ABC', band: '80', mode: 'SSB', rstSent: '56', rstRcvd: '57', daysAgo: 1 },
        // Digital Station - 8 QSOs
        { stationCallsign: 'W5GHI', remoteCallsign: 'K0XYZ', band: '20', mode: 'DIG', rstSent: '599', rstRcvd: '579', daysAgo: 1 },
        { stationCallsign: 'W5GHI', remoteCallsign: 'N1ABC', band: '20', mode: 'DIG', rstSent: '589', rstRcvd: '589', daysAgo: 1 },
        { stationCallsign: 'W5GHI', remoteCallsign: 'W3XYZ', band: '40', mode: 'DIG', rstSent: '579', rstRcvd: '569', daysAgo: 1 },
      ],
    },
  },

  'field-day-home': {
    id: 'field-day-home',
    name: 'Field Day - From Home',
    description: 'Home-based Field Day operation. Use existing home station(s).',
    category: 'field-day',
    data: {
      stations: [
        {
          callsign: 'W5XYZ',
          name: 'Main Home Station',
          class: '1A',
          licenseClass: 'A',
          location: {
            name: 'Home QTH',
            grid: 'EM13aa',
            section: 'OK',
            latitude: '35.5',
            longitude: '-97.5',
          },
        },
      ],
      clubs: [
        {
          callsign: 'W5CLUB',
          name: 'Solo Operator - Home',
          section: 'OK',
          operatorCallsigns: ['W5XYZ'],
          adminCallsigns: ['W5XYZ'],
        },
      ],
      contests: [
        { name: 'ARRL Field Day 2024', templateType: 'ARRL_FD', scoringMode: 'ARRL', pointsPerQso: 1, duration: 24 },
      ],
      qsos: [
        { stationCallsign: 'W5XYZ', remoteCallsign: 'K0ABC', band: '20', mode: 'CW', rstSent: '599', rstRcvd: '589', daysAgo: 1 },
        { stationCallsign: 'W5XYZ', remoteCallsign: 'W4DEF', band: '20', mode: 'CW', rstSent: '589', rstRcvd: '579', daysAgo: 1 },
        { stationCallsign: 'W5XYZ', remoteCallsign: 'VE3GHI', band: '20', mode: 'CW', rstSent: '579', rstRcvd: '589', daysAgo: 1 },
        { stationCallsign: 'W5XYZ', remoteCallsign: 'N0ABC', band: '40', mode: 'CW', rstSent: '579', rstRcvd: '569', daysAgo: 1 },
        { stationCallsign: 'W5XYZ', remoteCallsign: 'G3XYZ', band: '40', mode: 'CW', rstSent: '569', rstRcvd: '569', daysAgo: 1 },
        { stationCallsign: 'W5XYZ', remoteCallsign: 'F6ABC', band: '80', mode: 'CW', rstSent: '569', rstRcvd: '559', daysAgo: 1 },
        { stationCallsign: 'W5XYZ', remoteCallsign: 'K1DEF', band: '20', mode: 'SSB', rstSent: '59', rstRcvd: '58', daysAgo: 1 },
        { stationCallsign: 'W5XYZ', remoteCallsign: 'W2GHI', band: '20', mode: 'SSB', rstSent: '58', rstRcvd: '58', daysAgo: 1 },
      ],
    },
  },

  'field-day-big': {
    id: 'field-day-big',
    name: 'Field Day - Large Operation (10+ Stations)',
    description: 'Full-scale Field Day with multiple stations, club call, many operators.',
    category: 'field-day',
    data: {
      stations: [
        { callsign: 'W5A', name: 'CW Station 1', class: '2A', licenseClass: 'A', location: { name: 'FD Site', grid: 'EM13ab', section: 'OK', latitude: '35.45', longitude: '-97.5' } },
        { callsign: 'W5B', name: 'CW Station 2', class: '2A', licenseClass: 'A', location: { name: 'FD Site', grid: 'EM13ab', section: 'OK', latitude: '35.45', longitude: '-97.5' } },
        { callsign: 'W5C', name: 'Phone Station 1', class: '2A', licenseClass: 'A', location: { name: 'FD Site', grid: 'EM13ab', section: 'OK', latitude: '35.45', longitude: '-97.5' } },
        { callsign: 'W5D', name: 'Phone Station 2', class: '2A', licenseClass: 'A', location: { name: 'FD Site', grid: 'EM13ab', section: 'OK', latitude: '35.45', longitude: '-97.5' } },
        { callsign: 'W5E', name: 'Digital Station 1', class: '2A', licenseClass: 'A', location: { name: 'FD Site', grid: 'EM13ab', section: 'OK', latitude: '35.45', longitude: '-97.5' } },
        { callsign: 'W5F', name: 'Digital Station 2', class: '2A', licenseClass: 'A', location: { name: 'FD Site', grid: 'EM13ab', section: 'OK', latitude: '35.45', longitude: '-97.5' } },
        { callsign: 'W5G', name: 'VHF/UHF Station', class: '2A', licenseClass: 'A', location: { name: 'FD Site', grid: 'EM13ab', section: 'OK', latitude: '35.45', longitude: '-97.5' } },
        { callsign: 'W5H', name: 'Satellite Station', class: '2A', licenseClass: 'A', location: { name: 'FD Site', grid: 'EM13ab', section: 'OK', latitude: '35.45', longitude: '-97.5' } },
        { callsign: 'W5I', name: 'GOTA Station', class: '2A', licenseClass: 'A', location: { name: 'FD Site', grid: 'EM13ab', section: 'OK', latitude: '35.45', longitude: '-97.5' } },
        { callsign: 'W5J', name: 'Rover Unit', class: '2A', licenseClass: 'A', location: { name: 'FD Mobile', grid: 'EM13ab', section: 'OK', latitude: '35.45', longitude: '-97.5' } },
      ],
      clubs: [
        {
          callsign: 'W5FD',
          name: 'County Radio Club Field Day 2024',
          section: 'OK',
          operatorCallsigns: ['W5A', 'W5B', 'W5C', 'W5D', 'W5E', 'W5F', 'W5G', 'W5H', 'W5I', 'W5J'],
          adminCallsigns: ['W5A', 'W5B'],
        },
      ],
      contests: [
        { name: 'ARRL Field Day 2024', templateType: 'ARRL_FD', scoringMode: 'ARRL', pointsPerQso: 1, duration: 24 },
      ],
      qsos: [
        // CW Stations - heavy activity
        { stationCallsign: 'W5A', remoteCallsign: 'K0ABC', band: '20', mode: 'CW', rstSent: '599', rstRcvd: '589', daysAgo: 1 },
        { stationCallsign: 'W5A', remoteCallsign: 'N0DEF', band: '20', mode: 'CW', rstSent: '599', rstRcvd: '599', daysAgo: 1 },
        { stationCallsign: 'W5A', remoteCallsign: 'W4GHI', band: '20', mode: 'CW', rstSent: '589', rstRcvd: '579', daysAgo: 1 },
        { stationCallsign: 'W5A', remoteCallsign: 'VE3ABC', band: '20', mode: 'CW', rstSent: '579', rstRcvd: '589', daysAgo: 1 },
        { stationCallsign: 'W5A', remoteCallsign: 'G3XYZ', band: '20', mode: 'CW', rstSent: '569', rstRcvd: '579', daysAgo: 1 },
        { stationCallsign: 'W5A', remoteCallsign: 'F6ABC', band: '40', mode: 'CW', rstSent: '579', rstRcvd: '569', daysAgo: 1 },
        { stationCallsign: 'W5A', remoteCallsign: 'EA5ABC', band: '40', mode: 'CW', rstSent: '589', rstRcvd: '589', daysAgo: 1 },
        { stationCallsign: 'W5B', remoteCallsign: 'HB9XYZ', band: '20', mode: 'CW', rstSent: '599', rstRcvd: '569', daysAgo: 1 },
        { stationCallsign: 'W5B', remoteCallsign: 'ZL2ABC', band: '20', mode: 'CW', rstSent: '569', rstRcvd: '569', daysAgo: 1 },
        { stationCallsign: 'W5B', remoteCallsign: 'VK2ABC', band: '20', mode: 'CW', rstSent: '559', rstRcvd: '559', daysAgo: 1 },
        // Phone stations
        { stationCallsign: 'W5C', remoteCallsign: 'K1ABC', band: '20', mode: 'SSB', rstSent: '59', rstRcvd: '59', daysAgo: 1 },
        { stationCallsign: 'W5C', remoteCallsign: 'W2XYZ', band: '20', mode: 'SSB', rstSent: '58', rstRcvd: '58', daysAgo: 1 },
        { stationCallsign: 'W5C', remoteCallsign: 'N4ABC', band: '20', mode: 'SSB', rstSent: '59', rstRcvd: '57', daysAgo: 1 },
        { stationCallsign: 'W5D', remoteCallsign: 'W6DEF', band: '20', mode: 'SSB', rstSent: '57', rstRcvd: '56', daysAgo: 1 },
        { stationCallsign: 'W5D', remoteCallsign: 'K7ABC', band: '40', mode: 'SSB', rstSent: '58', rstRcvd: '59', daysAgo: 1 },
        { stationCallsign: 'W5D', remoteCallsign: 'W9XYZ', band: '40', mode: 'SSB', rstSent: '59', rstRcvd: '58', daysAgo: 1 },
        // Digital stations
        { stationCallsign: 'W5E', remoteCallsign: 'K0XYZ', band: '20', mode: 'DIG', rstSent: '599', rstRcvd: '579', daysAgo: 1 },
        { stationCallsign: 'W5E', remoteCallsign: 'N1ABC', band: '20', mode: 'DIG', rstSent: '589', rstRcvd: '589', daysAgo: 1 },
        { stationCallsign: 'W5F', remoteCallsign: 'W3XYZ', band: '20', mode: 'DIG', rstSent: '579', rstRcvd: '569', daysAgo: 1 },
        { stationCallsign: 'W5F', remoteCallsign: 'VE1ABC', band: '40', mode: 'DIG', rstSent: '569', rstRcvd: '589', daysAgo: 1 },
        // VHF/UHF
        { stationCallsign: 'W5G', remoteCallsign: 'N0GHI', band: '2', mode: 'FM', rstSent: '59', rstRcvd: '59', daysAgo: 1 },
        { stationCallsign: 'W5G', remoteCallsign: 'K5JKL', band: '2', mode: 'FM', rstSent: '57', rstRcvd: '58', daysAgo: 1 },
        // Satellite
        { stationCallsign: 'W5H', remoteCallsign: 'ZL3SAT', band: '6', mode: 'CW', rstSent: '579', rstRcvd: '569', daysAgo: 1 },
        { stationCallsign: 'W5H', remoteCallsign: 'G4SAT', band: '6', mode: 'CW', rstSent: '589', rstRcvd: '589', daysAgo: 1 },
      ],
    },
  },
};

export const scenarioList = Object.values(scenarios).map(s => ({
  id: s.id,
  name: s.name,
  description: s.description,
  category: s.category,
}));
