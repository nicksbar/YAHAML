/**
 * Contest Template Type Definitions
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

export interface ScheduleRule {
  type: 'fixed' | 'relative' | 'flexible' | 'year-round';
  // Fixed date: "2026-06-27T18:00:00Z"
  fixedDate?: string;
  // Relative: "4th weekend of June", "3rd Sunday in March"
  relative?: {
    occurrence: 'first' | 'second' | 'third' | 'fourth' | 'last';
    dayOfWeek?: 'saturday' | 'sunday' | 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'weekend';
    month?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  };
  // Duration
  duration?: {
    hours?: number;
    days?: number;
    startTime?: string; // "18:00 UTC"
    endTime?: string;   // "20:59 UTC"
  };
  // Recurrence
  recurrence?: 'annual' | 'monthly' | 'quarterly' | 'none';
  // Timezone
  timezone?: string; // "UTC", "America/New_York"
}

export interface ContestTemplate {
  type: string;
  name: string;
  description: string;
  organization: string;
  scoringRules: ScoringRules;
  requiredFields: RequiredFields;
  validationRules: ValidationRules;
  schedule?: ScheduleRule;
  uiConfig?: UIConfig;
  isActive: boolean;
  isPublic: boolean;
}
