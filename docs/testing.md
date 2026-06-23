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

playwright/
├── tests/
│   ├── janus-admin-ui.spec.ts      # Janus room management (full stack)
│   ├── operator-workflows.spec.ts   # Operator UI workflows (full stack)
│   └── ...
└── playwright-report/
```

## Browser E2E Tests (Playwright)

### Overview
Browser tests validate the complete system including Janus audio server, Node.js API, and React UI. Tests run against a full docker-compose stack to ensure all components work together.

### Test Modes

#### 1. **Isolated Mode** (Development, Fast Iteration)
Use your own dev servers without docker-compose.
```bash
npm run test:browser
```
- Starts independent dev server for API (port 3100) and UI (port 4173)
- No Janus server
- ~2-3 minute setup
- Good for quick iteration on UI tests only
- **Best for**: Developing tests, fixing UI logic

#### 2. **Local Compose Mode** (Full System Testing)
Test against local docker-compose stack (requires services already running).
```bash
# Start services first
docker-compose up -d

# Run tests
npm run test:browser:local
```
- Uses services at http://localhost:3000 (API), http://localhost:8080 (UI), http://localhost:8088 (Janus)
- Requires manual service startup
- Tests all three components together
- **Best for**: Manual testing and quick validation

#### 3. **Managed Compose Mode** (CI/CD, Full Validation)
Automatically starts and stops docker-compose services.
```bash
npm run test:browser:compose
```
- Orchestrates complete docker-compose lifecycle
- Waits for all services to be healthy
- Automatically cleans up after tests
- Handles failures gracefully
- **Best for**: PR validation, CI/CD pipelines, complete system validation

### Running Playwright Tests

```bash
# Development mode (fast, isolated)
npm run test:browser

# With browser visible (debug)
npm run test:browser:headed

# Local compose stack (requires manual docker-compose up)
npm run test:browser:local

# Full managed compose (recommended for CI)
npm run test:browser:compose

# Full test suite (unit + integration + E2E with compose)
npm run test:full:compose
```

### CI/CD Integration

The GitHub Actions workflow (`pr-checks.yml`) automatically:
1. ✅ Runs linting, build, unit tests
2. ✅ Starts docker-compose services
3. ✅ Waits for service health checks
4. ✅ Runs full Playwright suite
5. ✅ Uploads test reports
6. ✅ Cleans up services

All PRs must pass: `npm run test:full:compose` to merge.

### Debugging Playwright Tests

```bash
# Run in headed mode (watch browser)
PLAYWRIGHT_USE_EXISTING_SERVER=true npm run test:browser:headed

# Run single test file
PLAYWRIGHT_USE_EXISTING_SERVER=true npx playwright test playwright/tests/janus-admin-ui.spec.ts

# Run with debug mode
PWDEBUG=1 npm run test:browser:local

# View test report after run
npx playwright show-report
```

### Adding New Playwright Tests

```typescript
import { test, expect, Page } from '@playwright/test'

test.describe('Feature Name', () => {
  test('should do something', async ({ page }) => {
    // Page is already pointed at baseURL from config
    await page.goto('/')
    
    // Interact with elements
    await page.click('text=Button')
    
    // Assert outcomes
    await expect(page.locator('text=Success')).toBeVisible()
  })
})
```

When testing against docker-compose:
- Services run at standard ports: API (3000), UI (8080), Janus (8088)
- Admin API available at http://localhost:7088/admin (requires admin_secret)
- All authentication headers available via test fixtures

## CI/CD Integration (Future)
- Lint, unit, integration, and smoke tests
- Services expose health endpoints for integration tests

## Provisioning Flow Validation (Humans + Agents)

Use this when validating remote radio host onboarding.

### Human validation checklist

1. Create or identify a radio in Admin.
2. Run interactive provisioning script:
  - `./scripts/provision-remote-radio.sh`
3. Confirm stream emits `[done] Provisioning complete`.
4. Verify remote services:
  - `yahaml-rigctld` (if rigctl install enabled)
  - `yahaml-audio-publisher` (if audio publisher install enabled)
5. In Admin UI, verify Janus room and participant behavior for the radio.

### Agent/API validation checklist

1. Probe host options first (`POST /api/radios/probe-remote-options` or `POST /api/radios/:id/probe-remote-options`).
2. Start provisioning stream (`POST /api/radios/:id/provision-remote-stream`).
3. Parse NDJSON events incrementally and fail fast on `type=error`.
4. On `type=done`, assert:
  - `success === true`
  - `ssh.privateKeyPath` present
  - warnings captured and surfaced
5. Verify `GET /api/admin/janus/rooms` includes expected radio room state.

See also: `docs/provisioning.md` for complete runbook and security notes.
