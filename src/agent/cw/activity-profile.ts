import type { ContestTemplate } from '../../contest-templates/types';
import type { ActivityProfile } from './types';

function normalizeList(values?: string[]): string[] {
  return (values || []).map((value) => value.trim().toUpperCase()).filter(Boolean);
}

export function createActivityProfile(template?: ContestTemplate | null): ActivityProfile {
  if (!template) {
    return {
      type: 'GENERAL',
      name: 'General CW Activity',
      allowedBands: ['160', '80', '60', '40', '30', '20', '17', '15', '12', '10', '6', '2', '1.25', '70CM'],
      allowedModes: ['CW'],
      exchangeSentFields: ['rst'],
      exchangeReceivedFields: ['rst'],
      duplicateRule: 'band-mode',
    };
  }

  return {
    type: template.type,
    name: template.name,
    organization: template.organization,
    allowedBands: normalizeList(template.validationRules.bands),
    allowedModes: normalizeList(template.validationRules.modes),
    exchangeSentFields: template.validationRules.exchange?.sent || [],
    exchangeReceivedFields: template.validationRules.exchange?.received || [],
    duplicateRule: template.validationRules.duplicateRule,
    template,
  };
}

export function getSentExchangeText(profile: ActivityProfile, exchange: Record<string, string>): string {
  const configuredFields = profile.exchangeSentFields.length > 0 ? profile.exchangeSentFields : Object.keys(exchange);
  return configuredFields
    .map((field) => exchange[field])
    .filter((value): value is string => Boolean(value && value.trim()))
    .join(' ');
}
