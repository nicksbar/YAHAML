import { describe, it, expect } from '@jest/globals';
import { validateCallsign } from '../src/hamdb';

describe('HamDB Utility', () => {
  describe('validateCallsign - Format Validation', () => {
    it('should validate standard US callsigns', async () => {
      const validCalls = [
        'N3LLL',
        'W5ABC',
        'K1A',
        'AA0A',
        'AB1CD',
        'K0',
        'N5',
      ];

      for (const call of validCalls) {
        const result = await validateCallsign(call, false);
        expect(result.valid).toBe(true);
      }
    });

    it('should handle case-insensitivity', async () => {
      const upper = await validateCallsign('N3LLL', false);
      const lower = await validateCallsign('n3lll', false);
      expect(upper.valid).toBe(true);
      expect(lower.valid).toBe(true);
    });

    it('should reject callsigns without digits', async () => {
      const result = await validateCallsign('ABC', false);
      expect(result.valid).toBe(false);
    });

    it('should reject empty callsigns', async () => {
      const result = await validateCallsign('', false);
      expect(result.valid).toBe(false);
    });

    it('should reject too-short callsigns', async () => {
      const result = await validateCallsign('1', false);
      expect(result.valid).toBe(false);
    });

    it('should reject too-long callsigns', async () => {
      const result = await validateCallsign('ABCDEFGHIJK', false);
      expect(result.valid).toBe(false);
    });

    it('should handle portable indicators', async () => {
      // Format allows / in callsigns (for portable indicators)
      // Main call validation ignores the /M, /QRP, etc.
      const result = await validateCallsign('N3LLL/M', false);
      expect(result.valid).toBe(true); // /M part is ignored in main call validation
    });

    it('should reject invalid characters', async () => {
      const result = await validateCallsign('N3-LLL', false);
      expect(result.valid).toBe(false);
    });

    it('should validate without info when checkHamDB is false', async () => {
      const result = await validateCallsign('N3LLL', false);
      expect(result.valid).toBe(true);
      expect(result.info).toBeUndefined();
    });
  });
});

