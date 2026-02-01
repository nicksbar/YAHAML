// Test the upcoming contests API logic directly
const { PrismaClient } = require('@prisma/client');
const { calculateNextOccurrence } = require('./dist/contest-templates/scheduler');

const prisma = new PrismaClient();

async function test() {
  try {
    // Fetch templates from database
    const dbTemplates = await prisma.contestTemplate.findMany({
      where: { isPublic: true, isActive: true },
    });

    console.log(`✓ Loaded ${dbTemplates.length} templates from DB`);

    // Convert DB templates to ContestTemplate format with parsed JSON
    const templates = dbTemplates.map(t => ({
      type: t.type,
      name: t.name,
      description: t.description || '',
      organization: t.organization || '',
      scoringRules: JSON.parse(t.scoringRules),
      requiredFields: JSON.parse(t.requiredFields),
      validationRules: JSON.parse(t.validationRules),
      schedule: t.schedule ? JSON.parse(t.schedule) : undefined,
      uiConfig: t.uiConfig ? JSON.parse(t.uiConfig) : undefined,
      isActive: t.isActive,
      isPublic: t.isPublic,
    }));

    console.log(`✓ Converted ${templates.length} templates`);
    console.log(`✓ ${templates.filter(t => t.schedule).length} have schedules\n`);

    // Calculate upcoming contests
    const now = new Date();
    const showRecentDays = 10;
    const recentCutoff = new Date(now.getTime() - showRecentDays * 24 * 60 * 60 * 1000);
    
    const upcoming = [];
    
    for (const template of templates) {
      try {
        const next = calculateNextOccurrence(template, now);
        if (next) {
          console.log(`  ${template.name}: ${next.status} (${next.daysUntil} days)`);
          
          // Include if upcoming OR recently ended (within showRecentDays)
          if (next.status === 'upcoming' || next.status === 'active' || 
              (next.status === 'past' && next.endDate >= recentCutoff)) {
            // Recalculate status considering recent window
            const adjustedStatus = next.endDate >= now ? 
              (next.startDate <= now ? 'active' : 'upcoming') : 
              'recent';
            
            upcoming.push({
              ...next,
              status: adjustedStatus,
            });
          }
          
          // Don't include year-round unless requested
          if (template.schedule?.type === 'year-round') {
            const index = upcoming.findIndex(u => u.template.type === template.type);
            if (index >= 0) upcoming.splice(index, 1);
          }
        } else {
          console.log(`  ${template.name}: null (no schedule?)`);
        }
      } catch (err) {
        console.error(`  ERROR calculating ${template.name}:`, err.message);
      }
    }

    console.log(`\n✓ Found ${upcoming.length} upcoming/recent contests`);
    
    // Sort by start date
    upcoming.sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (b.status === 'active' && a.status !== 'active') return 1;
      return a.startDate.getTime() - b.startDate.getTime();
    });

    if (upcoming.length > 0) {
      console.log(`\nNext contest: ${upcoming[0].template.name} - ${upcoming[0].status}`);
      console.log(`Starts: ${upcoming[0].startDate.toISOString()}`);
    }

    console.log('\n✓ Test complete');
  } catch (error) {
    console.error('ERROR:', error);
  } finally {
    await prisma.$disconnect();
  }
}

test();
