/**
 * Test utilities - setup and teardown
 */
import prisma from '../src/db';

export async function setupTestDB(options?: { skipTestData?: boolean }) {
  const { skipTestData = false } = options || {};

  if (skipTestData) {
    return { 
      station: undefined as any, 
      club: undefined as any, 
      location: undefined as any 
    };
  }

  // Always create test data (station, club, location)
  const station = await prisma.station.create({
    data: {
      callsign: 'TEST-UNIT',
      name: 'Unit Test Station',
    },
  });

  const club = await prisma.club.create({
    data: {
      name: 'Test Club',
      callsign: 'TEST-CLUB',
      section: 'CA',
    },
  });

  const location = await prisma.location.create({
    data: {
      name: 'Test Location',
      latitude: '40.7128',
      longitude: '-74.0060',
      grid: 'FN30',
    },
  });

  return { station, club, location };
}

export async function teardownTestDB() {
  // Clear all data in correct dependency order (respecting foreign keys)
  try {
    // Clear dependent tables first
    await prisma.logAggregate.deleteMany();
    await prisma.logEntry.deleteMany();
    await prisma.radioAssignment.deleteMany();
    await prisma.radioConnection.deleteMany();
    await prisma.specialCallsign.deleteMany();
    await prisma.bandActivity.deleteMany();
    await prisma.contextLog.deleteMany();
    await prisma.networkStatus.deleteMany();
    
    // Then independent tables
    await prisma.station.deleteMany(); // Delete stations before locations (FK dependency)
    await prisma.location.deleteMany();
    await prisma.club.deleteMany();
    await prisma.contest.deleteMany();
    await prisma.contestTemplate.deleteMany();
    await prisma.aDIFImport.deleteMany();
  } catch (error) {
    // Silently fail if some tables don't exist or have constraints
    console.log('Teardown warning:', error instanceof Error ? error.message : error);
  }
}

export async function connectToTestDB() {
  // Ensure connection
  await prisma.$connect();
}

export async function disconnectFromTestDB() {
  await prisma.$disconnect();
}
