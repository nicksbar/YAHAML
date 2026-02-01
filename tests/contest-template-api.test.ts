/**
 * Contest Template API integration tests
 */
import request from 'supertest';
import prisma from '../src/db';

const API_BASE = 'http://localhost:3000';

describe('Contest Template API', () => {
  beforeAll(async () => {
    // Templates should already be seeded, but verify they exist
    const templates = await prisma.contestTemplate.findMany();
    if (templates.length === 0) {
      throw new Error('Contest templates not seeded. Run: npx ts-node src/seed-templates.ts');
    }
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /api/contest-templates', () => {
    test('returns all public active templates', async () => {
      const response = await request(API_BASE).get('/api/contest-templates');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(4);

      // Verify all templates are public and active
      response.body.forEach((template: any) => {
        expect(template.isPublic).toBe(true);
        expect(template.isActive).toBe(true);
      });
    });

    test('includes all required template fields', async () => {
      const response = await request(API_BASE).get('/api/contest-templates');

      const template = response.body[0];
      expect(template).toHaveProperty('id');
      expect(template).toHaveProperty('type');
      expect(template).toHaveProperty('name');
      expect(template).toHaveProperty('description');
      expect(template).toHaveProperty('organization');
      expect(template).toHaveProperty('scoringRules');
      expect(template).toHaveProperty('requiredFields');
      expect(template).toHaveProperty('validationRules');
    });

    test('includes ARRL Field Day template', async () => {
      const response = await request(API_BASE).get('/api/contest-templates');

      const arrlFD = response.body.find((t: any) => t.type === 'ARRL_FD');
      expect(arrlFD).toBeDefined();
      expect(arrlFD.name).toBe('ARRL Field Day');
      expect(arrlFD.organization).toBe('ARRL');

      const scoring = JSON.parse(arrlFD.scoringRules);
      expect(scoring.pointsByMode).toHaveProperty('CW');
      expect(scoring.pointsByMode.CW).toBe(2);
      expect(scoring.bonuses).toBeInstanceOf(Array);
      expect(scoring.bonuses.length).toBeGreaterThan(0);
    });

    test('includes Winter Field Day template', async () => {
      const response = await request(API_BASE).get('/api/contest-templates');

      const winterFD = response.body.find((t: any) => t.type === 'WINTER_FD');
      expect(winterFD).toBeDefined();
      expect(winterFD.name).toBe('Winter Field Day');
    });

    test('includes POTA template', async () => {
      const response = await request(API_BASE).get('/api/contest-templates');

      const pota = response.body.find((t: any) => t.type === 'POTA');
      expect(pota).toBeDefined();
      expect(pota.name).toBe('Parks on the Air');
      expect(pota.organization).toBe('POTA');

      const required = JSON.parse(pota.requiredFields);
      expect(required.reference).toBeDefined();
      expect(required.reference.format).toBe('K-####');
    });

    test('includes SOTA template', async () => {
      const response = await request(API_BASE).get('/api/contest-templates');

      const sota = response.body.find((t: any) => t.type === 'SOTA');
      expect(sota).toBeDefined();
      expect(sota.name).toBe('Summits on the Air');
      expect(sota.organization).toBe('SOTA');

      const required = JSON.parse(sota.requiredFields);
      expect(required.reference).toBeDefined();
      expect(required.reference.format).toContain('W7W');
    });
  });

  describe('GET /api/contest-templates/:id', () => {
    test('returns template by ID', async () => {
      // First get all templates
      const listResponse = await request(API_BASE).get('/api/contest-templates');
      const templateId = listResponse.body[0].id;

      // Then get by ID
      const response = await request(API_BASE).get(`/api/contest-templates/${templateId}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(templateId);
    });

    test('returns 404 for non-existent template', async () => {
      const response = await request(API_BASE).get('/api/contest-templates/non-existent-id');

      expect(response.status).toBe(404);
    });
  });

  describe('GET /api/contest-templates/by-type/:type', () => {
    test('returns ARRL Field Day template by type', async () => {
      const response = await request(API_BASE).get('/api/contest-templates/by-type/ARRL_FD');

      expect(response.status).toBe(200);
      expect(response.body.type).toBe('ARRL_FD');
      expect(response.body.name).toBe('ARRL Field Day');
    });

    test('returns Winter Field Day template by type', async () => {
      const response = await request(API_BASE).get('/api/contest-templates/by-type/WINTER_FD');

      expect(response.status).toBe(200);
      expect(response.body.type).toBe('WINTER_FD');
    });

    test('returns POTA template by type', async () => {
      const response = await request(API_BASE).get('/api/contest-templates/by-type/POTA');

      expect(response.status).toBe(200);
      expect(response.body.type).toBe('POTA');
    });

    test('returns SOTA template by type', async () => {
      const response = await request(API_BASE).get('/api/contest-templates/by-type/SOTA');

      expect(response.status).toBe(200);
      expect(response.body.type).toBe('SOTA');
    });

    test('returns 404 for non-existent type', async () => {
      const response = await request(API_BASE).get('/api/contest-templates/by-type/NON_EXISTENT');

      expect(response.status).toBe(404);
    });
  });

  describe('Template Validation', () => {
    test('ARRL FD has valid scoring rules', async () => {
      const response = await request(API_BASE).get('/api/contest-templates/by-type/ARRL_FD');
      const scoring = JSON.parse(response.body.scoringRules);

      expect(scoring.pointsPerQso).toBe(1);
      expect(scoring.pointsByMode.CW).toBe(2);
      expect(scoring.pointsByMode.PHONE).toBe(1);
      expect(scoring.pointsByMode.DIGITAL).toBe(2);
      expect(scoring.multipliers).toBeInstanceOf(Array);
      expect(scoring.bonuses).toBeInstanceOf(Array);
      expect(scoring.bonuses.length).toBeGreaterThan(10);
    });

    test('ARRL FD has valid required fields', async () => {
      const response = await request(API_BASE).get('/api/contest-templates/by-type/ARRL_FD');
      const required = JSON.parse(response.body.requiredFields);

      expect(required.class.required).toBe(true);
      expect(required.class.options).toBeInstanceOf(Array);
      expect(required.class.options).toContain('3A');
      expect(required.section.required).toBe(true);
      expect(required.power.required).toBe(true);
      expect(required.power.options).toEqual(['HIGH', 'LOW', 'QRP']);
    });

    test('ARRL FD has valid validation rules', async () => {
      const response = await request(API_BASE).get('/api/contest-templates/by-type/ARRL_FD');
      const validation = JSON.parse(response.body.validationRules);

      expect(validation.bands).toBeInstanceOf(Array);
      expect(validation.bands).toContain('20');
      expect(validation.modes).toBeInstanceOf(Array);
      expect(validation.modes).toContain('CW');
      expect(validation.duplicateRule).toBe('band-mode');
      expect(validation.exchange.sent).toEqual(['class', 'section']);
      expect(validation.exchange.received).toEqual(['class', 'section']);
    });

    test('POTA has park reference validation', async () => {
      const response = await request(API_BASE).get('/api/contest-templates/by-type/POTA');
      const validation = JSON.parse(response.body.validationRules);

      expect(validation.exchange.validation.park).toBeDefined();
      expect(validation.exchange.validation.park).toMatch(/\^.*\$$/); // Regex pattern
    });

    test('SOTA has summit reference validation', async () => {
      const response = await request(API_BASE).get('/api/contest-templates/by-type/SOTA');
      const validation = JSON.parse(response.body.validationRules);

      expect(validation.exchange.validation.summit).toBeDefined();
      expect(validation.exchange.validation.summit).toMatch(/\^.*\$$/); // Regex pattern
    });
  });

  describe('UI Configuration', () => {
    test('templates have UI config', async () => {
      const response = await request(API_BASE).get('/api/contest-templates');

      response.body.forEach((template: any) => {
        if (template.uiConfig) {
          const ui = JSON.parse(template.uiConfig);
          expect(ui).toHaveProperty('icon');
          expect(ui).toHaveProperty('primaryColor');
          expect(ui).toHaveProperty('logForm');
          expect(ui).toHaveProperty('dashboard');
        }
      });
    });

    test('ARRL FD has field day icon', async () => {
      const response = await request(API_BASE).get('/api/contest-templates/by-type/ARRL_FD');
      const ui = JSON.parse(response.body.uiConfig);

      expect(ui.icon).toBe('🎯');
      expect(ui.helpUrl).toContain('arrl.org');
    });

    test('Winter FD has winter icon', async () => {
      const response = await request(API_BASE).get('/api/contest-templates/by-type/WINTER_FD');
      const ui = JSON.parse(response.body.uiConfig);

      expect(ui.icon).toBe('❄️');
    });

    test('POTA has park icon', async () => {
      const response = await request(API_BASE).get('/api/contest-templates/by-type/POTA');
      const ui = JSON.parse(response.body.uiConfig);

      expect(ui.icon).toBe('🏞️');
    });

    test('SOTA has mountain icon', async () => {
      const response = await request(API_BASE).get('/api/contest-templates/by-type/SOTA');
      const ui = JSON.parse(response.body.uiConfig);

      expect(ui.icon).toBe('⛰️');
    });
  });
});
