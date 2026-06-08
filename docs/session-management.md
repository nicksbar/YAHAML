# Session Management Improvements

## Overview

This document describes the improvements made to session management in YAHAML to address stale session issues and prepare for future hosted authentication with club associations and role-based access control (RBAC).

## Problems Identified

### 1. **Stale Session Data**
- Sessions expire after 20 minutes of inactivity
- No automatic cleanup of expired sessions from the database
- Underlying station data remains associated with expired sessions
- During testing, accounts get wiped out because sessions are stale

### 2. **Missing Session Logout**
- No mechanism to explicitly logout
- Sessions persist until timeout or garbage collection
- No way to force session invalidation

### 3. **No Station Cleanup**
- When sessions expire, station callsigns remain in the database
- Historical data remains associated with deleted stations
- Band activity and occupancy records persist

## Solutions Implemented

### 1. **Session Management Module** (`src/session-management.ts`)

Core session management functions:

```typescript
// Create a new session
const session = await createSession({
  callsign: 'VE7ABC',
  stationId: 'station-123',
  expiresAt: new Date(Date.now() + 20 * 60 * 1000), // 20 minutes
});

// Validate and refresh session
const result = await validateSession(token);
if (result.valid) {
  // Session is active
}

// Logout and invalidate session
await logout(token);
// Station callsign is automatically unset

// Get session statistics
const stats = await getSessionStats();
```

### 2. **Session Cleanup Utility** (`src/session-cleanup.ts`)

Automated cleanup functions:

```typescript
// Cleanup expired sessions and associated data
const result = await cleanupStaleData({
  maxAgeMinutes: 20,
  cleanStations: true,
  cleanBandActivity: true,
  cleanBandOccupancy: true,
  cleanOperatorMessages: true,
  cleanContextLogs: true,
});

// Result: {
//   sessionsCleaned: 5,
//   stationsCleaned: 2,
//   bandActivityCleaned: 150,
//   ...
// }

// Run cleanup as a cron job
const { intervalId, stop } = runCleanupCron(
  60000, // Run every 60 seconds
  { maxAgeMinutes: 20 }
);
```

### 3. **Session API** (`src/session-api.ts`)

Express API endpoints:

```typescript
// POST /api/session - Create new session
{
  callsign: 'VE7ABC',
  stationId: 'station-123'
}
// Returns: {
//   token: '...',
//   callsign: 'VE7ABC',
//   stationId: 'station-123',
//   expiresAt: '2024-01-01T12:00:00Z'
// }

// GET /api/session/validate?token=... - Validate session
// GET /api/session/logout?token=... - Logout
// GET /api/session/stats - Get statistics
```

## Key Improvements

### 1. **Automatic Station Cleanup**
When a session expires:
- Station callsign is set to 'DELETED'
- All associated band activity is cleaned up
- Band occupancy records are removed
- Operator messages are archived
- Context logs are archived (keeping last 100)

### 2. **Session Validation**
Sessions are validated on every connection:
- Check if token exists
- Check if expired
- Check if inactive (>20 minutes)
- Update last activity timestamp

### 3. **Explicit Logout**
Users can explicitly logout:
- Invalidates session token immediately
- Unsets station callsign
- Cleans up associated data

### 4. **Cleanup Cron Job**
Runs automatically every 60 seconds:
- Finds sessions older than configured age
- Deletes expired sessions
- Cleans up associated station data
- Archives historical data

## Future Enhancements (Hosted Service)

### 1. **User Authentication Model**

Add User model to schema:

```prisma
model User {
  id          String   @id @default(cuid())
  email       String   @unique
  password    String   // Hashed password
  callsign    String   @unique
  clubId      String?  // Club association
  
  // Role-based access control
  role        String   @default("operator") // admin, manager, operator
  
  isActive    Boolean  @default(true)
  
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  sessions    Session[]
}
```

### 2. **Club Associations**

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

### 3. **Session to User Linking**

```typescript
// Future: Create session with user authentication
const session = await createSession({
  callsign: user.callsign,
  stationId: station.id,
  userId: user.id, // Link to authenticated user
  expiresAt: new Date(Date.now() + 20 * 60 * 1000),
});
```

### 4. **RBAC in WebSocket**

```typescript
// Future: Check user role before allowing actions
if (user.role === 'admin') {
  // Allow admin actions
} else if (user.role === 'operator') {
  // Allow operator actions
}
```

## Usage Examples

### Local Network (Current)

```typescript
// Create session for operator
const session = await createSession({
  callsign: 'VE7ABC',
  stationId: 'station-123',
  sourceType: 'n3fjp',
  sourceInfo: 'N3FJP-1.0',
});

// Session is valid for 20 minutes
// Station callsign is set when session is created
// Session is validated on WebSocket connection

// When session expires:
// - Station callsign is set to 'DELETED'
// - Band activity and occupancy are cleaned up
// - Operator messages and context logs are archived
```

### Hosted Service (Future)

```typescript
// User login with credentials
const user = await authenticateUser(email, password);

// Create session linked to user
const session = await createSession({
  callsign: user.callsign,
  stationId: station.id,
  userId: user.id,
  expiresAt: new Date(Date.now() + 20 * 60 * 1000),
});

// Session is validated on WebSocket connection
// User role determines permissions
// Club membership determines access to shared resources
```

## Configuration

### Session Timeout

Default: 20 minutes inactivity

Configure in `src/session-management.ts`:

```typescript
const defaultExpiresAt = new Date(now.getTime() + 20 * 60 * 1000);
```

### Cleanup Interval

Default: 60 seconds

Configure in `src/session-cleanup.ts`:

```typescript
runCleanupCron(60000, { maxAgeMinutes: 20 });
```

### Data Retention

- Operator messages: Keep last 1000
- Context logs: Keep last 5000
- Station data: Clean up when all sessions expire

## Monitoring

### Session Statistics

```typescript
const stats = await getSessionStats();
console.log({
  totalSessions: stats.totalSessions,
  activeSessions: stats.activeSessions,
  expiredSessions: stats.expiredSessions,
  sessionsBySource: stats.sessionsBySource,
});
```

### Cleanup Results

```typescript
const result = await cleanupStaleData({ maxAgeMinutes: 20 });
console.log({
  sessionsCleaned: result.sessionsCleaned,
  stationsCleaned: result.stationsCleaned,
  bandActivityCleaned: result.bandActivityCleaned,
  errors: result.errors,
});
```

## Testing

### Test Session Creation and Expiration

```typescript
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
// Start cleanup cron
const { stop } = runCleanupCron(1000, { maxAgeMinutes: 1 });

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
```

## Migration Guide

### From Old Session Management to New

1. **Replace session validation**

```typescript
// Old
const session = await prisma.session.findUnique({ where: { token } });
if (!session || now > session.expiresAt) return;

// New
const result = await validateSession(token);
if (!result.valid) return;
```

2. **Add cleanup cron**

```typescript
import { runCleanupCron } from './session-cleanup';

const { stop } = runCleanupCron(60000, { maxAgeMinutes: 20 });
```

3. **Add explicit logout**

```typescript
// Old - No logout mechanism
// New
await logout(token);
```

## Troubleshooting

### Sessions Not Cleaning Up

1. Check cleanup cron is running
2. Verify `maxAgeMinutes` is configured correctly
3. Check for database errors in logs
4. Verify session timestamps are correct

### Stale Stations

1. Run manual cleanup:

```typescript
await cleanupStaleData({
  maxAgeMinutes: 20,
  cleanStations: true,
});
```

2. Check for orphaned sessions:

```typescript
const expired = await prisma.session.findMany({
  where: {
    expiresAt: { lte: new Date() },
  },
});
console.log(expired);
```

### WebSocket Session Issues

1. Verify token is being passed in URL query parameter
2. Check session validation logs
3. Ensure `attachUserFromToken` is being called
4. Verify session timestamps are UTC

## License

Same as project license.