# YAHAML Testing Strategy

## Overview

We use a unified testing approach with clear separation between unit tests, API tests, and end-to-end tests. All tests share common helpers for server lifecycle management and database isolation.

## Test Categories

### 1. Unit Tests
**Purpose**: Test pure logic, functions, and utilities without external dependencies.

**Characteristics**:
- No server required
- No database required (or use mocked/in-memory)
- Fast execution
- Isolated

**Examples**: 
- `aggregation.test.ts` - Business logic for log aggregation
- `relay.test.ts` - Protocol parsing and message handling
- `udp.test.ts` - UDP packet parsing

**Pattern**:
```typescript
import { someFunction } from '../src/module';

describe('Module Unit Tests', () => {
  test('should calculate correctly', () => {
    expect(someFunction(input)).toBe(expected);
  });
});
```

### 2. API Tests (Integration)
**Purpose**: Test API endpoints with database but without full server stack.

**Characteristics**:
- Uses `supertest` with app instance (no HTTP server)
- Real database operations
- Fast (no network overhead)
- Isolated test data

**Examples**:
- `club-api.test.ts`
- `contest-instance-api.test.ts`
- `contest-template-api.test.ts`
- `special-callsign-api.test.ts`

**Pattern**:
```typescript
import request from 'supertest';
import app from '../src/index';
import prisma from '../src/db';
import { cleanupTestRecords } from './test-helpers';

describe('API Tests', () => {
  let testIds: string[] = [];

  beforeAll(async () => {
    // Create test fixtures
    const contest = await prisma.contest.create({...});
    testIds.push(contest.id);
  });

  afterAll(async () => {
    // Clean up only our test data
    await cleanupTestRecords({ contestIds: testIds });
  });

  test('should create resource', async () => {
    const response = await request(app)
      .post('/api/resource')
      .send({ data });
    
    expect(response.status).toBe(201);
  });
});
```

### 3. E2E Tests (End-to-End)
**Purpose**: Test full application stack including WebSocket, relay server, and external integrations.

**Characteristics**:
- Starts real HTTP server if not running
- Tests WebSocket connections
- Tests relay protocol
- Tests external radio control (hamlib)
- Slower but comprehensive

**Examples**:
- `relay.e2e.test.ts` - Full relay server testing
- `websocket.test.ts` - WebSocket pub/sub
- `export-*.test.ts` - File download endpoints (need real server)

**Pattern**:
```typescript
import { ensureServerRunning, stopTestServer, cleanupTestRecords } from './test-helpers';
import prisma from '../src/db';

describe('E2E Tests', () => {
  let weStartedServer = false;
  let testIds: string[] = [];

  beforeAll(async () => {
    weStartedServer = await ensureServerRunning(3000);
  });

  afterAll(async () => {
    await cleanupTestRecords({ contestIds: testIds });
    await stopTestServer(weStartedServer);
  });

  test('should handle full workflow', async () => {
    // Test with real server on http://localhost:3000
    const response = await fetch('http://localhost:3000/api/...');
    expect(response.status).toBe(200);
  });
});
```

## Test Helpers

Located in `tests/test-helpers.ts`:

### Server Lifecycle
- `isServerRunning(port)` - Check if server is already running
- `ensureServerRunning(port)` - Start server only if needed, returns true if we started it
- `stopTestServer(weStartedIt)` - Stop server only if we started it

### Database Management
- `cleanDatabase(options)` - Wipe all test data (preserves templates by default)
- `cleanupTestRecords(ids)` - Delete only specific test records by ID
- `waitFor(condition, timeout)` - Poll for async conditions

## Unified Testing Rules

### ✅ DO:
1. **Isolate test data**: Each test suite creates and cleans up its own data
2. **Use IDs for cleanup**: Track test record IDs and delete only those
3. **Preserve seed data**: Contest templates are seed data, don't delete them
4. **Respect FK order**: Delete dependent records before parent records
5. **Check server state**: Start server only if needed, leave it running if it was already running
6. **Use appropriate test type**: Unit tests for logic, API tests for endpoints, E2E for integration
7. **Base helpers**: All tests use shared helpers from `test-helpers.ts`

### ❌ DON'T:
1. **Don't use `deleteMany({})`**: This wipes ALL records, breaking other tests
2. **Don't start server in API tests**: Use supertest with app instance instead
3. **Don't share test data**: Each suite should be independent
4. **Don't rely on execution order**: Tests should pass in any order
5. **Don't test business logic in E2E**: Keep E2E tests focused on integration

## Test Data Requirements
- Use anonymized callsigns and synthetic logs
- Maintain fixture packs per UDP format
- All UDP parsing/broadcast logic must be pure and testable

## Running Tests

```bash
# Run all tests
npm test

# Run specific test file
npm test tests/club-api.test.ts

# Run tests matching pattern
npm test -- --testNamePattern="should create"

# Run with coverage
npm test -- --coverage

# Run in watch mode
npm test -- --watch
```

## Debugging Tests

```bash
# Run with verbose output
npm test -- --verbose

# Run single test in isolation
npm test -- --testNamePattern="specific test name" --runInBand

# Debug in VS Code
# Set breakpoint and use "Jest: Debug" from command palette
```

## Test Structure

```
tests/
├── test-helpers.ts          # Shared test utilities (SERVER & DATABASE HELPERS)
├── setup.ts                 # Legacy - being phased out
├── test-server.ts           # Legacy - being phased out
│
├── aggregation.test.ts      # Unit test
├── relay.test.ts            # Unit test
├── udp.test.ts              # Unit test
│
├── club-api.test.ts         # API test (supertest)
├── contest-*.test.ts        # API tests (supertest)
├── special-callsign-*.test.ts  # API test (supertest)
│
├── relay.e2e.test.ts        # E2E test (real server)
├── websocket.test.ts        # E2E test (real server)
└── export-*.test.ts         # E2E test (real server)
```

## CI/CD Integration (Future)
- Lint, unit, integration, and smoke tests
- Services expose health endpoints for integration tests
