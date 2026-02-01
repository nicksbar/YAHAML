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
  try {
    await cleanDatabase({ preserveTemplates: false });
  } catch (error) {
    console.error('[Jest Cleanup] Error cleaning database:', error);
  }
  
  try {
    await prisma.$disconnect();
  } catch (error) {
    console.error('[Jest Cleanup] Error disconnecting Prisma:', error);
  }
  
  // Allow time for any pending operations to finish
  await new Promise(resolve => setTimeout(resolve, 100));
});
