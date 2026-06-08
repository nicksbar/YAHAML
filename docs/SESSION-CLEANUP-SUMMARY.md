# Session and User Management Improvements - Summary

## Executive Summary

This document summarizes the improvements made to YAHAML's session management system to address stale session issues and prepare for future hosted authentication with club associations and role-based access control (RBAC).

## Current Issues

### 1. Stale Session Data
- Sessions expire after 20 minutes of inactivity in WebSocket connections
- **No automatic cleanup of expired sessions from the database**
- Underlying station data remains associated with expired sessions
- During testing, accounts get wiped out because sessions are stale and data is orphaned

### 2. Missing Session Logout Mechanism
- No way to explicitly logout and invalidate sessions
- Sessions persist until they timeout or are garbage collected
- No mechanism to force session invalidation

### 3. No Station Cleanup
- When sessions expire, station callsigns remain in the database
- Historical data (band activity, occupancy, messages) persists
- No cascade cleanup for associated data

## Files Created

### 1. `src/session-management.ts`
**Purpose**: Core session management functions

**Functions**:
- `createSession(options)` - Create a new session with token
- `validateSession(token)` - Validate and refresh session
- `logout(token)` - Logout and invalidate session, unset station callsign
- `extendSession(token)` - Extend session expiration
- `getSessionByToken(token)` - Get session by token
- `getActiveSessionsCount()` - Get count of active sessions
- `getSessionStats()` - Get comprehensive session statistics
- `cleanupExpiredSessions()` - Bulk cleanup expired sessions
- `prepareForUserAuth(stationId)` - Prepare station for future authentication

**Key Features**:
- Automatic station callsign unset when session expires
- Session validation with inactivity checks
- Token generation for session security
- Session statistics and monitoring

### 2. `src/session-cleanup.ts`
**Purpose**: Automated cleanup of stale session and station data

**Functions**:
- `cleanupStaleData(options)` - Full cleanup of stale data
- `runCleanupCron(interval, options)` - Run cleanup as cron job
- `cleanupExpiredSessionsForStation(stationId)` - Cleanup sessions for specific station
- `cleanupStation(stationId)` - Cleanup station and all associated data
- `getStationsWithExpiredSessions()` - Find stations with only expired sessions

**Cleanup Includes**:
- Expired sessions (configurable age, default: 20 minutes)
- Station data (callsign set to 'DELETED')
- Band activity records
- Band occupancy records
- Operator messages (archives old ones)
- Context logs (archives old ones)

**Key Features**:
- Configurable cleanup age
- Selective cleanup options
- Cron job runner for automated cleanup
- Detailed cleanup results reporting

### 3. `src/session-api.ts`
**Purpose**: Express API endpoints for session management

**Endpoints**:
- `POST /api/session` - Create new session
- `GET /api/session/validate?token=...` - Validate session
- `GET /api/session/logout?token=...` - Logout
- `GET /api/session/count` - Get active sessions count
- `GET /api/session/stats` - Get session statistics
- `GET /api/session/expired` - Get expired sessions
- `POST /api/session/cleanup` - Bulk cleanup expired sessions

**Key Features**:
- Session middleware for request protection
- Error handling
- JSON responses
- Session statistics

### 4. `src/websocket.ts` (Updated)
**Changes**:
- Import `validateSession` from session-management
- Updated `attachUserFromToken` to use new validation
- Better session validation with clear error messages

### 5. `docs/session-management.md`
**Purpose**: Detailed documentation of session management improvements

**Content**:
- Problems identified
- Solutions implemented
- Future enhancements (hosted service, user auth, RBAC)
- Usage examples
- Configuration guide
- Testing guide
- Migration guide

### 6. `docs/SESSION-MANAGEMENT-README.md`
**Purpose**: Quick start guide for session management

**Content**:
- Quick start with examples
- API endpoint reference
- Functions reference
- Configuration guide
- Integration guide
- Testing guide

### 7. `docs/SESSION-CLEANUP-SUMMARY.md`
**Purpose**: This summary document

**Content**:
- Executive summary
- Current issues
- Files created and their purposes
- Quick implementation guide
- Future roadmap

## Implementation Guide

### Step 1: Install the New Modules

The new files are already created in the `src/` directory:
- `src/session-management.ts`
- `src/session-cleanup.ts`
- `src/session-api.ts`

### Step 2: Update WebSocket Manager

The `src/websocket.ts` file has been updated to use the new session validation.

### Step 3: Add Cleanup Cron

Add cleanup cron to your main application:

```typescript
import { runCleanupCron } from './src/session-cleanup';

// Start cleanup cron
const { stop } = runCleanupCron(
  60000, // Run every 60 seconds
  {
    maxAgeMinutes: 20,
    cleanStations: true,
    cleanBandActivity: true,
    cleanBandOccupancy: true,
    cleanOperatorMessages: true,
    cleanContextLogs: true,
  }
);

// Add to process shutdown
process.on('SIGINT', () => {
  stop();
  process.exit(0);
});
```

### Step 4: Test the Cleanup

```typescript
// Test cleanup
import { cleanupStaleData } from './src/session-cleanup';

const result = await cleanupStaleData({
  maxAgeMinutes: 20,
  cleanStations: true,
});

console.log('Cleanup result:', result);
// Expected: { sessionsCleaned: N, stationsCleaned: N, ... }
```

### Step 5: Monitor Sessions

```typescript
import { getSessionStats } from './src/session-management';

const stats = await getSessionStats();
console.log('Session stats:', stats);
// Expected: { totalSessions: N, activeSessions: N, expiredSessions: N, sessionsBySource: {...} }
```

## Quick Fixes

### Fix Stale Sessions

Run immediate cleanup:

```typescript
import { cleanupStaleData } from './src/session-cleanup';

await cleanupStaleData({
  maxAgeMinutes: 20,
  cleanStations: true,
  cleanBandActivity: true,
  cleanBandOccupancy: true,
  cleanOperatorMessages: true,
  cleanContextLogs: true,
});
```

### Fix Orphaned Stations

```typescript
import { getStationsWithExpiredSessions } from './src/session-cleanup';

const stations = await getStationsWithExpiredSessions();
console.log('Stations with expired sessions:', stations);

// Clean up each station
for (const station of stations) {
  await cleanupStation(station.stationId);
}
```

### Set Station Callsign to Null

```typescript
import { unsetStationCallsign } from './src/session-cleanup';

await unsetStationCallsign('station-id-here');
```

## Future Enhancements

### 1. User Authentication Model

Add User model to Prisma schema:

```prisma
model User {
  id          String   @id @default(cuid())
  email       String   @unique
  password    String   // Hashed password
  callsign    String   @unique
  clubId      String?  // Club association
  role        String   @default("operator") // admin, manager, operator
  isActive    Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  sessions    Session[]
}
```

### 2. Club Associations

```prisma
model ClubMembership {
  userId      String
  clubId      String
  role        String   @default("member") // admin, manager, member, operator
  joinedAt    DateTime @default(now())
  isActive    Boolean  @default(true)
  @@unique([userId, clubId])
}
```

### 3. Session to User Linking

```typescript
// Future: Create session with user authentication
const session = await createSession({
  callsign: user.callsign,
  stationId: station.id,
  userId: user.id, // Link to authenticated user
  expiresAt: new Date(Date.now() + 20 * 60 * 1000),
});
```

### 4. RBAC in WebSocket

```typescript
// Future: Check user role before allowing actions
if (user.role === 'admin') {
  // Allow admin actions
} else if (user.role === 'operator') {
  // Allow operator actions
}
```

## Benefits

### Immediate Benefits

1. **No More Stale Sessions**: Automatic cleanup prevents accumulation of stale data
2. **Station Cleanup**: When sessions expire, station data is cleaned up
3. **Explicit Logout**: Users can explicitly logout and invalidate sessions
4. **Session Statistics**: Monitor session usage and health
5. **Better Testing**: Test environments stay clean

### Long-term Benefits

1. **Scalability**: Ready for hosted service with user authentication
2. **Security**: Session tokens with automatic expiration
3. **Club Support**: Foundation for club associations and memberships
4. **Role-Based Access**: Prepared for RBAC implementation
5. **Audit Trail**: Session creation and cleanup can be logged

## Configuration

### Environment Variables

```bash
# Session timeout in minutes (default: 20)
SESSION_TIMEOUT_MINUTES=20

# Cleanup interval in milliseconds (default: 60000)
CLEANUP_INTERVAL_MS=60000

# Enable/disable cleanup cron (default: true)
ENABLE_CLEANUP=true
```

### Cleanup Options

```typescript
{
  maxAgeMinutes: 20,           // Sessions older than this are cleaned
  cleanStations: true,         // Clean up station data
  cleanBandActivity: true,     // Clean up band activity
  cleanBandOccupancy: true,    // Clean up band occupancy
  cleanOperatorMessages: true, // Clean up operator messages
  cleanContextLogs: true,      // Clean up context logs
}
```

## Testing

### Test Session Creation and Cleanup

```typescript
import { createSession, cleanupStaleData } from './src/session-management';

// Create session
const session = await createSession({
  callsign: 'TEST-ABC',
  stationId: 'test-station',
});

// Wait for expiration
await sleep(21 * 60 * 1000);

// Check cleanup
const stats = await getSessionStats();
console.log('Active sessions:', stats.activeSessions); // Should be 0
```

### Test Cleanup Cron

```typescript
import { runCleanupCron } from './src/session-cleanup';

// Start cleanup cron
const { stop } = runCleanupCron(
  1000, // Run every 1 second for testing
  { maxAgeMinutes: 1 }
);

// Create expired session
const session = await createSession({
  callsign: 'TEST-ABC',
  stationId: 'test-station',
  expiresAt: new Date(Date.now() - 1 * 60 * 1000), // Already expired
});

// Wait for cleanup
await sleep(1100);

// Check cleanup
const stats = await getSessionStats();
console.log('Active sessions:', stats.activeSessions); // Should be 0

// Stop cleanup
stop();
```

## Troubleshooting

### Sessions Not Cleaning Up

1. Check if cleanup cron is running
2. Verify `maxAgeMinutes` configuration
3. Check database logs for errors
4. Verify session timestamps are UTC

### WebSocket Session Validation Fails

1. Ensure token is passed in URL query parameter
2. Check session exists in database
3. Verify session hasn't expired
4. Check last activity timestamp

### Cleanup Fails

1. Check database connection
2. Verify Prisma schema is up to date
3. Check for orphaned references
4. Review cleanup logs for errors

## Roadmap

### Phase 1: Immediate (Done)
- [x] Create session-management module
- [x] Create session-cleanup module
- [x] Create session-api endpoints
- [x] Update WebSocket manager
- [x] Add cleanup cron
- [x] Documentation

### Phase 2: Short-term (Next Sprint)
- [ ] Add user authentication with hashed passwords
- [ ] Add session to user linking
- [ ] Add audit logging for session operations
- [ ] Add rate limiting for session operations
- [ ] Add session recovery mechanism

### Phase 3: Medium-term (Next Quarter)
- [ ] Add club associations
- [ ] Add club memberships with roles
- [ ] Add RBAC for session operations
- [ ] Add multi-factor authentication
- [ ] Add session persistence across restarts

### Phase 4: Long-term (Future)
- [ ] Add hosted service authentication
- [ ] Add email verification
- [ ] Add password reset
- [ ] Add session analytics dashboard
- [ ] Add security headers
- [ ] Add token refresh mechanism

## Support

For issues or questions:
1. Check `docs/session-management.md` for detailed documentation
2. Review code comments in `src/session-management.ts` and `src/session-cleanup.ts`
3. Create an issue in the repository

## License

Same as project license.

---

**Date Created**: 2026-06-07
**Version**: 1.0.0
**Author**: YAHAML Development Team