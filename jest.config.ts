import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/*.test.ts', '**/*.spec.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  setupFilesAfterEnv: ['<rootDir>/jest-setup.ts'],
  globalTeardown: '<rootDir>/jest-teardown.ts',
  // Run tests serially to avoid database contention
  maxWorkers: 1,
  testTimeout: 30000,
  // forceExit: true will make Jest exit after test completion
  // This is necessary due to lingering async handles in WebSocket/Express connections
  // All cleanup is properly done in test afterAll hooks before this happens
  forceExit: true,
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts', // Skip main entry for coverage
  ],
  coveragePathIgnorePatterns: ['/node_modules/'],
};

export default config;
