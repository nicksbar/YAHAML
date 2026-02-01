/**
 * Contest Template Index
 * 
 * Imports all contest templates from individual files and exports them
 * as a single array for database seeding and API access.
 */

// Export types
export * from './types';

// Export scheduler utilities
export * from './scheduler';

// Import all templates
import { ARRL_FIELD_DAY } from './arrl-field-day';
import { WINTER_FIELD_DAY } from './winter-field-day';
import { POTA } from './pota';
import { SOTA } from './sota';
import { ARRL_10_METER } from './arrl-10-meter';
import { ARRL_DX_CW, ARRL_DX_SSB } from './arrl-dx';
import { ARRL_RTTY_ROUNDUP } from './arrl-rtty';
import { ARRL_160_METER } from './arrl-160-meter';
import {
  ARRL_VHF_SWEEPSTAKES,
  ARRL_JANUARY_VHF,
  ARRL_JUNE_VHF,
  ARRL_SEPTEMBER_VHF,
  ARRL_10_GHZ_UP,
} from './arrl-vhf';
import {
  ARRL_ROOKIE_ROUNDUP_CW,
  ARRL_ROOKIE_ROUNDUP_SSB,
  ARRL_ROOKIE_ROUNDUP_RTTY,
} from './arrl-rookie-roundup';
import { ARRL_SCHOOL_CLUB_ROUNDUP } from './arrl-school-club';
import { ARRL_INTERNATIONAL_DIGITAL } from './arrl-international-digital';

// Export individual templates for direct import
export {
  ARRL_FIELD_DAY,
  WINTER_FIELD_DAY,
  POTA,
  SOTA,
  ARRL_10_METER,
  ARRL_DX_CW,
  ARRL_DX_SSB,
  ARRL_RTTY_ROUNDUP,
  ARRL_160_METER,
  ARRL_VHF_SWEEPSTAKES,
  ARRL_JANUARY_VHF,
  ARRL_JUNE_VHF,
  ARRL_SEPTEMBER_VHF,
  ARRL_10_GHZ_UP,
  ARRL_ROOKIE_ROUNDUP_CW,
  ARRL_ROOKIE_ROUNDUP_SSB,
  ARRL_ROOKIE_ROUNDUP_RTTY,
  ARRL_SCHOOL_CLUB_ROUNDUP,
  ARRL_INTERNATIONAL_DIGITAL,
};

// Export complete array for seeding
export const CONTEST_TEMPLATES = [
  ARRL_FIELD_DAY,
  WINTER_FIELD_DAY,
  ARRL_10_METER,
  ARRL_DX_CW,
  ARRL_DX_SSB,
  ARRL_RTTY_ROUNDUP,
  ARRL_160_METER,
  ARRL_VHF_SWEEPSTAKES,
  ARRL_JANUARY_VHF,
  ARRL_JUNE_VHF,
  ARRL_SEPTEMBER_VHF,
  ARRL_10_GHZ_UP,
  ARRL_ROOKIE_ROUNDUP_CW,
  ARRL_ROOKIE_ROUNDUP_SSB,
  ARRL_ROOKIE_ROUNDUP_RTTY,
  ARRL_SCHOOL_CLUB_ROUNDUP,
  ARRL_INTERNATIONAL_DIGITAL,
  POTA,
  SOTA,
];
