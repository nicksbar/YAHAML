/**
 * Jest setup - global test environment initialization
 * Runs once before all test suites
 */
import { cleanDatabase } from './tests/test-helpers';
import { seedContestTemplates } from './src/seed-templates';
import prisma from './src/db';

// Setup runs once before all tests
beforeAll(async () => {
  await cleanDatabase({ preserveTemplates: false });
  await seedContestTemplates();
  console.log('[Jest Setup] ✓ Database cleaned and seeded');
}, 30000);

// Clean up after all tests are done
afterAll(async () => {
  await cleanDatabase({ preserveTemplates: false });
  await prisma.$disconnect();
});
