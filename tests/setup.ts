/**
 * Test utilities - setup and teardown
 */
import prisma from '../src/db';

export async function setupTestDB() {
  // Create test data
  const station = await prisma.station.create({
    data: {
      callsign: 'TEST-UNIT',
      name: 'Unit Test Station',
    },
  });
  return { station };
}

export async function teardownTestDB() {
  // Clear all data
  await prisma.networkStatus.deleteMany();
  await prisma.contextLog.deleteMany();
  await prisma.logEntry.deleteMany();
  await prisma.bandActivity.deleteMany();
  await prisma.station.deleteMany();
  await prisma.aDIFImport.deleteMany();
}

export async function connectToTestDB() {
  // Ensure connection
  await prisma.$connect();
}

export async function disconnectFromTestDB() {
  await prisma.$disconnect();
}
