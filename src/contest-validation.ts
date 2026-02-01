import type { ContestTemplate, ValidationRules } from './contest-templates/types';

export interface QsoLike {
  band?: string;
  mode?: string;
  exchange?: Record<string, string | undefined>;
  [key: string]: any;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

type TemplateLike = ContestTemplate | { validationRules: ValidationRules | string };

function parseValidationRules(template: TemplateLike): ValidationRules | null {
  if (!template?.validationRules) {
    return null;
  }

  if (typeof template.validationRules === 'string') {
    try {
      return JSON.parse(template.validationRules) as ValidationRules;
    } catch {
      return null;
    }
  }

  return template.validationRules;
}

function normalizeValue(value?: string): string {
  return (value || '').trim().toUpperCase();
}

function getExchangeValue(qso: QsoLike, field: string): string | undefined {
  const exchangeValue = qso.exchange?.[field];
  if (exchangeValue !== undefined) {
    return exchangeValue;
  }

  const directValue = qso[field];
  if (directValue === undefined || directValue === null) {
    return undefined;
  }

  return String(directValue);
}

export function validateQsoAgainstTemplate(qso: QsoLike, template: TemplateLike): ValidationResult {
  const errors: string[] = [];
  const rules = parseValidationRules(template);

  if (!rules) {
    return { valid: true, errors };
  }

  if (!qso.band) {
    errors.push('Missing band');
  } else if (rules.bands && rules.bands.length > 0) {
    const allowedBands = rules.bands.map((band) => normalizeValue(band));
    const bandValue = normalizeValue(qso.band);
    if (!allowedBands.includes(bandValue)) {
      errors.push(`Band not allowed: ${qso.band}`);
    }
  }

  if (!qso.mode) {
    errors.push('Missing mode');
  } else if (rules.modes && rules.modes.length > 0) {
    const allowedModes = rules.modes.map((mode) => normalizeValue(mode));
    const modeValue = normalizeValue(qso.mode);
    if (!allowedModes.includes(modeValue)) {
      errors.push(`Mode not allowed: ${qso.mode}`);
    }
  }

  if (rules.exchange?.received && rules.exchange.received.length > 0) {
    for (const field of rules.exchange.received) {
      const value = getExchangeValue(qso, field);
      if (!value) {
        errors.push(`Missing exchange field: ${field}`);
      }
    }
  }

  if (rules.exchange?.validation) {
    for (const [field, pattern] of Object.entries(rules.exchange.validation)) {
      const value = getExchangeValue(qso, field);
      if (!value) {
        continue;
      }

      try {
        const regex = new RegExp(pattern);
        if (!regex.test(value)) {
          errors.push(`Invalid exchange field ${field}: ${value}`);
        }
      } catch {
        errors.push(`Invalid exchange validation rule for ${field}`);
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
