/**
 * Contest Instance API integration tests
 */
import request from 'supertest';
import prisma from '../src/db';

const API_BASE = 'http://localhost:3000';

describe('Contest Instance API', () => {
  let arrlTemplateId: string;
  let potaTemplateId: string;

  beforeAll(async () => {
    // Get template IDs
    const arrlTemplate = await prisma.contestTemplate.findUnique({
      where: { type: 'ARRL_FD' },
    });
    const potaTemplate = await prisma.contestTemplate.findUnique({
      where: { type: 'POTA' },
    });

    if (!arrlTemplate || !potaTemplate) {
      throw new Error('Templates not found. Run: npx ts-node src/seed-templates.ts');
    }

    arrlTemplateId = arrlTemplate.id;
    potaTemplateId = potaTemplate.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  afterEach(async () => {
    // Clean up contests after each test
    await prisma.contest.deleteMany({});
  });

  describe('POST /api/contests/from-template', () => {
    test('creates contest from ARRL FD template', async () => {
      const response = await request(API_BASE)
        .post('/api/contests/from-template')
        .send({
          templateId: arrlTemplateId,
          name: 'Field Day 2026',
        });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('Field Day 2026');
      expect(response.body.templateId).toBe(arrlTemplateId);
      expect(response.body.isActive).toBe(true);
      expect(response.body.mode).toBe('ARRL_FD');
      expect(response.body.template).toBeDefined();
      expect(response.body.template.type).toBe('ARRL_FD');
    });

    test('creates contest with start and end times', async () => {
      const startTime = new Date('2026-06-27T18:00:00Z');
      const endTime = new Date('2026-06-28T20:59:00Z');

      const response = await request(API_BASE)
        .post('/api/contests/from-template')
        .send({
          templateId: arrlTemplateId,
          name: 'Field Day 2026',
          startTime: startTime.toISOString(),
          endTime: endTime.toISOString(),
        });

      expect(response.status).toBe(201);
      expect(new Date(response.body.startTime)).toEqual(startTime);
      expect(new Date(response.body.endTime)).toEqual(endTime);
    });

    test('creates contest with custom config', async () => {
      const config = {
        class: '3A',
        section: 'ORG',
        power: 'LOW',
      };

      const response = await request(API_BASE)
        .post('/api/contests/from-template')
        .send({
          templateId: arrlTemplateId,
          name: 'Field Day 2026',
          config,
        });

      expect(response.status).toBe(201);
      expect(response.body.config).toBeDefined();
      
      const parsedConfig = JSON.parse(response.body.config);
      expect(parsedConfig.class).toBe('3A');
      expect(parsedConfig.section).toBe('ORG');
      expect(parsedConfig.power).toBe('LOW');
    });

    test('creates POTA contest', async () => {
      const response = await request(API_BASE)
        .post('/api/contests/from-template')
        .send({
          templateId: potaTemplateId,
          name: 'POTA Activation 2026',
          config: {
            park: 'K-4566',
            grid: 'FN44',
          },
        });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('POTA Activation 2026');
      expect(response.body.template.type).toBe('POTA');
    });

    test('deactivates existing active contests', async () => {
      // Create first contest
      await request(API_BASE)
        .post('/api/contests/from-template')
        .send({
          templateId: arrlTemplateId,
          name: 'First Contest',
        });

      // Verify it's active
      let contests = await prisma.contest.findMany({
        where: { isActive: true },
      });
      expect(contests.length).toBe(1);
      expect(contests[0].name).toBe('First Contest');

      // Create second contest
      await request(API_BASE)
        .post('/api/contests/from-template')
        .send({
          templateId: potaTemplateId,
          name: 'Second Contest',
        });

      // Verify only second is active
      contests = await prisma.contest.findMany({
        where: { isActive: true },
      });
      expect(contests.length).toBe(1);
      expect(contests[0].name).toBe('Second Contest');

      // Verify first is now inactive
      const firstContest = await prisma.contest.findFirst({
        where: { name: 'First Contest' },
      });
      expect(firstContest?.isActive).toBe(false);
    });

    test('returns 404 for non-existent template', async () => {
      const response = await request(API_BASE)
        .post('/api/contests/from-template')
        .send({
          templateId: 'non-existent-id',
          name: 'Invalid Contest',
        });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('not found');
    });

    test('requires templateId', async () => {
      const response = await request(API_BASE)
        .post('/api/contests/from-template')
        .send({
          name: 'No Template Contest',
        });

      expect(response.status).toBe(400);
    });

    test('uses template name if no name provided', async () => {
      const response = await request(API_BASE)
        .post('/api/contests/from-template')
        .send({
          templateId: arrlTemplateId,
        });

      expect(response.status).toBe(201);
      expect(response.body.name).toBe('ARRL Field Day');
    });
  });

  describe('GET /api/contests/active/current', () => {
    test('returns active contest with template', async () => {
      // Create a contest
      await request(API_BASE)
        .post('/api/contests/from-template')
        .send({
          templateId: arrlTemplateId,
          name: 'Active Contest',
        });

      // Get active contest
      const response = await request(API_BASE).get('/api/contests/active/current');

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Active Contest');
      expect(response.body.isActive).toBe(true);
      expect(response.body.template).toBeDefined();
      expect(response.body.template.type).toBe('ARRL_FD');
      expect(response.body.clubs).toBeInstanceOf(Array);
    });

    test('creates default contest if none exists', async () => {
      // Ensure no active contests
      await prisma.contest.deleteMany({});

      const response = await request(API_BASE).get('/api/contests/active/current');

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Field Day');
      expect(response.body.mode).toBe('FIELD_DAY');
    });

    test('returns most recently activated contest', async () => {
      // Create first contest
      await request(API_BASE)
        .post('/api/contests/from-template')
        .send({
          templateId: arrlTemplateId,
          name: 'First',
        });

      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 100));

      // Create second contest (should deactivate first)
      await request(API_BASE)
        .post('/api/contests/from-template')
        .send({
          templateId: potaTemplateId,
          name: 'Second',
        });

      const response = await request(API_BASE).get('/api/contests/active/current');

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Second');
    });
  });

  describe('Contest State Management', () => {
    test('new contest has zero QSOs and points', async () => {
      const response = await request(API_BASE)
        .post('/api/contests/from-template')
        .send({
          templateId: arrlTemplateId,
          name: 'New Contest',
        });

      expect(response.body.totalQsos).toBe(0);
      expect(response.body.totalPoints).toBe(0);
    });

    test('contest includes all template configuration', async () => {
      const response = await request(API_BASE)
        .post('/api/contests/from-template')
        .send({
          templateId: arrlTemplateId,
          name: 'Full Config Contest',
        });

      expect(response.body.template.scoringRules).toBeDefined();
      expect(response.body.template.requiredFields).toBeDefined();
      expect(response.body.template.validationRules).toBeDefined();
      expect(response.body.template.uiConfig).toBeDefined();

      // Verify we can parse the JSON
      const scoring = JSON.parse(response.body.template.scoringRules);
      expect(scoring.pointsByMode).toBeDefined();
      expect(scoring.bonuses).toBeInstanceOf(Array);
    });
  });

  describe('Multiple Contest Types', () => {
    test('can create contests from different templates', async () => {
      // Create ARRL FD
      const arrl = await request(API_BASE)
        .post('/api/contests/from-template')
        .send({
          templateId: arrlTemplateId,
          name: 'Field Day',
        });

      expect(arrl.body.template.type).toBe('ARRL_FD');

      // Create POTA (deactivates ARRL FD)
      const pota = await request(API_BASE)
        .post('/api/contests/from-template')
        .send({
          templateId: potaTemplateId,
          name: 'Park Activation',
        });

      expect(pota.body.template.type).toBe('POTA');

      // Verify both exist in database
      const contests = await prisma.contest.findMany({});
      expect(contests.length).toBe(2);
    });

    test('template type is reflected in contest mode', async () => {
      const templates = await prisma.contestTemplate.findMany({
        where: { isActive: true },
      });

      for (const template of templates) {
        const response = await request(API_BASE)
          .post('/api/contests/from-template')
          .send({
            templateId: template.id,
            name: `${template.name} Test`,
          });

        expect(response.body.mode).toBe(template.type);
        
        // Clean up for next iteration
        await prisma.contest.delete({ where: { id: response.body.id } });
      }
    });
  });
});
