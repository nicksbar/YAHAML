/**
 * Seed Contest Templates
 * Populates the database with predefined contest templates
 */
import prisma from './db';
import { CONTEST_TEMPLATES } from './contest-templates';

export async function seedContestTemplates() {
  console.log('🌱 Seeding contest templates...');
  
  for (const template of CONTEST_TEMPLATES) {
    try {
      await prisma.contestTemplate.upsert({
        where: { type: template.type },
        update: {
          name: template.name,
          description: template.description,
          organization: template.organization,
          scoringRules: JSON.stringify(template.scoringRules),
          requiredFields: JSON.stringify(template.requiredFields),
          validationRules: JSON.stringify(template.validationRules),
          uiConfig: template.uiConfig ? JSON.stringify(template.uiConfig) : null,
          isActive: template.isActive,
          isPublic: template.isPublic,
        },
        create: {
          type: template.type,
          name: template.name,
          description: template.description,
          organization: template.organization,
          scoringRules: JSON.stringify(template.scoringRules),
          requiredFields: JSON.stringify(template.requiredFields),
          validationRules: JSON.stringify(template.validationRules),
          uiConfig: template.uiConfig ? JSON.stringify(template.uiConfig) : null,
          isActive: template.isActive,
          isPublic: template.isPublic,
        },
      });
      console.log(`  ✓ ${template.name} (${template.type})`);
    } catch (error) {
      console.error(`  ✗ Failed to seed ${template.name}:`, error);
    }
  }
  
  console.log('✓ Contest templates seeded\n');
}

// Run if called directly
if (require.main === module) {
  seedContestTemplates()
    .then(() => {
      console.log('Seed complete');
      process.exit(0);
    })
    .catch((error) => {
      console.error('Seed failed:', error);
      process.exit(1);
    })
    .finally(() => {
      prisma.$disconnect();
    });
}
