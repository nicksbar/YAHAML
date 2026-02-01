import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Clear existing data
  await prisma.networkStatus.deleteMany();
  await prisma.contextLog.deleteMany();
  await prisma.logEntry.deleteMany();
  await prisma.bandActivity.deleteMany();
  await prisma.station.deleteMany();

  // Create test stations
  const station1 = await prisma.station.create({
    data: {
      callsign: 'W1AW',
      name: 'ARRL Headquarters Station',
      class: '1A',
      section: 'CT',
      grid: 'FN31pr',
    },
  });

  const station2 = await prisma.station.create({
    data: {
      callsign: 'K1LI',
      name: 'Test Station',
      class: '2A',
      section: 'MA',
      grid: 'FN42xx',
    },
  });

  // Create initial band activities
  await prisma.bandActivity.create({
    data: {
      stationId: station1.id,
      band: '20',
      mode: 'CW',
      power: 100,
      active: true,
    },
  });

  await prisma.bandActivity.create({
    data: {
      stationId: station2.id,
      band: '40',
      mode: 'PH',
      power: 150,
      active: true,
    },
  });

  // Create sample QSO logs
  await prisma.logEntry.create({
    data: {
      stationId: station1.id,
      source: 'seed',
      dedupeKey: `${station1.callsign}|K1LI|20|CW|seed`,
      callsign: 'K1LI',
      band: '20',
      mode: 'CW',
      frequency: '14025',
      rstSent: '599',
      rstRcvd: '599',
      power: 100,
      qsoDate: new Date(),
      qsoTime: '14:30',
      points: 1,
      name: 'Test Operator',
      state: 'MA',
    },
  });

  // Create network status
  await prisma.networkStatus.create({
    data: {
      stationId: station1.id,
      isConnected: true,
      ip: '127.0.0.1',
      port: 10000,
      relayHost: 'localhost',
      relayPort: 10000,
      relayVersion: '1.0.0',
    },
  });

  // Create sample context log
  await prisma.contextLog.create({
    data: {
      stationId: station1.id,
      level: 'SUCCESS',
      category: 'QSO_LOGGED',
      message: 'QSO with K1LI logged on 20m CW',
      details: JSON.stringify({ callsign: 'K1LI', points: 1 }),
    },
  });

  // Get an ARRL template to create a sample contest
  const arrlTemplate = await prisma.contestTemplate.findFirst({
    where: { organization: 'ARRL' },
  });

  if (arrlTemplate) {
    // Create a sample contest from the template
    await prisma.contest.create({
      data: {
        name: 'Field Day 2026',
        templateId: arrlTemplate.id,
        mode: arrlTemplate.type,
        isActive: false,
        totalQsos: 0,
        totalPoints: 0,
        scoringMode: 'ARRL',
        pointsPerQso: 1,
      },
    });
  }

  console.log('✓ Database seeded with sample data');
  console.log('  - Created 2 stations (W1AW, K1LI)');
  console.log('  - Created band activities');
  console.log('  - Created sample QSO log');
  console.log('  - Created network status and context logs');
  if (arrlTemplate) {
    console.log('  - Created sample contest (Field Day 2026)');
  }
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
