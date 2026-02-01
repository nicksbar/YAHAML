/**
 * Contest template validation unit tests
 */
import { ARRL_FIELD_DAY, POTA } from '../src/contest-templates';
import { validateQsoAgainstTemplate } from '../src/contest-validation';

describe('Contest template validation', () => {
  test('accepts valid ARRL Field Day QSO', () => {
    const result = validateQsoAgainstTemplate(
      {
        band: '20',
        mode: 'CW',
        exchange: {
          class: '2A',
          section: 'TX',
        },
      },
      ARRL_FIELD_DAY,
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('rejects invalid band', () => {
    const result = validateQsoAgainstTemplate(
      {
        band: '5',
        mode: 'CW',
        exchange: {
          class: '2A',
          section: 'TX',
        },
      },
      ARRL_FIELD_DAY,
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Band not allowed: 5');
  });

  test('rejects invalid mode', () => {
    const result = validateQsoAgainstTemplate(
      {
        band: '20',
        mode: 'AM',
        exchange: {
          class: '2A',
          section: 'TX',
        },
      },
      ARRL_FIELD_DAY,
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Mode not allowed: AM');
  });

  test('accepts valid POTA park exchange', () => {
    const result = validateQsoAgainstTemplate(
      {
        band: '20',
        mode: 'SSB',
        exchange: {
          rst: '59',
          park: 'K-1234',
        },
      },
      POTA,
    );

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  test('rejects invalid POTA park exchange', () => {
    const result = validateQsoAgainstTemplate(
      {
        band: '20',
        mode: 'SSB',
        exchange: {
          rst: '59',
          park: 'INVALID',
        },
      },
      POTA,
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Invalid exchange field park: INVALID');
  });

  test('rejects missing required exchange field', () => {
    const result = validateQsoAgainstTemplate(
      {
        band: '20',
        mode: 'SSB',
        exchange: {
          park: 'K-1234',
        },
      },
      POTA,
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Missing exchange field: rst');
  });
});
