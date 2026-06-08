# Session Management System

## Quick Start

### 1. Import the modules

```typescript
import { 
  createSession, 
  validateSession, 
  logout,
  cleanupExpiredSessions,
  getSessionStats,
} from './src/session-management';

import { 
  cleanupStaleData,
  runCleanupCron,
} from './src/session-cleanup';
```

### 2. Create a session

```typescript
const session = await createSession({
  callsign: 'VE7ABC',
  stationId: 'station-123',
  sourceType: 'n3fjp',
  sourceInfo: 'N3FJP-1.0',
});

// Use session.token for WebSocket connection
// Session expires after 20 minutes of inactivity
```

### 3. Validate session on WebSocket connect

```typescript
import { validateSession } from './src/session-management';

const result = await validateSession(token);
if (result.valid) {
  client.userId = result.session?.stationId;
} else {
  console.warn(`Session validation failed: ${result.reason}`);
}
```

### 4. Start cleanup cron

```typescript
import { runCleanupCron } from './src/session-cleanup';

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

// When you want to stop cleanup:
stop();
```

## API Endpoints

### Create Session

```bash
curl -X POST http://localhost:3000/api/session \
  -H "Content-Type: application/json" \
  -d '{"callsign": "VE7ABC", "stationId": "station-123"}'
```

### Validate Session

```bash
curl http://localhost:3000/api/session/validate?token=YOUR_TOKEN
```

### Logout

```bash
curl http://localhost:3000/api/session/logout?token=YOUR_TOKEN
```

### Get Session Stats

```bash
curl http://localhost:3000/api/session/stats
```

### Cleanup Expired Sessions

```bash
curl -X POST http://localhost:3000/api/session/cleanup \
  -d '{"maxAgeMinutes": 20}'
```

## Functions Reference

### session-management.ts

| Function | Description |
|----------|-------------|
| `createSession(options)` | Create a new session |
| `validateSession(token)` | Validate and refresh session |
| `logout(token)` | Logout and invalidate session |
| `extendSession(token)` | Extend session expiration |
| `getSessionByToken(token)` | Get session by token |
| `getActiveSessionsCount()` | Get count of active sessions |
| `getSessionStats()` | Get session statistics |
| `cleanupExpiredSessions()` | Bulk cleanup expired sessions |

### session-cleanup.ts

| Function | Description |
|----------|-------------|
| `cleanupStaleData(options)` | Full cleanup of stale data |
| `runCleanupCron(interval, options)` | Run cleanup as cron job |
| `cleanupExpiredSessionsForStation(stationId)` | Cleanup sessions for specific station |
| `cleanupStation(stationId)` | Cleanup station and associated data |

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

## Integration with Existing Code

### Update WebSocket Manager

```typescript
// In src/websocket.ts
import { validateSession } from './session-management';

// In attachUserFromToken method:
private async attachUserFromToken(ws: WebSocket, token: string): Promise<void> {
  const client = this.clients.get(ws);
  if (!client) return;

  const result = await validateSession(token);
  if (!result.valid) {
    console.warn(`[WebSocket] Session validation failed: ${result.reason}`);
    return;
  }

  client.userId = result.session?.stationId;
}
```

### Add Cleanup to Main Application

```typescript
// In your main application file
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

## Migration from Old Session Management

### Before (Old Way)

```typescript
// Manual session validation in WebSocket
const session = await prisma.session.findUnique({ where: { token } });
if (!session) return;
const now = new Date();
if (now > session.expiresAt) return;
const inactiveMs = now.getTime() - session.lastActivity.getTime();
const inactiveMin = inactiveMs / (1000 * 60);
if (inactiveMin > 20) return;
await prisma.session.update({
  where: { id: session.id },
  data: { lastActivity: now },
});
client.userId = session.stationId;
```

### After (New Way)

```typescript
// Simple validation
import { validateSession } from './src/session-management';

const result = await validateSession(token);
if (!result.valid) return;
client.userId = result.session?.stationId;
```

### Add Cleanup

```typescript
// Add cleanup cron
import { runCleanupCron } from './src/session-cleanup';

const { stop } = runCleanupCron(
  60000,
  { maxAgeMinutes: 20, cleanStations: true }
);
```

## Benefits

1. **Automatic Cleanup**: Expired sessions and associated data are cleaned up automatically
2. **Station Cleanup**: When all sessions expire, station data is cleaned up
3. **Explicit Logout**: Users can explicitly logout and invalidate sessions
4. **Session Statistics**: Monitor session usage and health
5. **Prepares for Authentication**: Modular design ready for user authentication

## Future Roadmap

1. **User Authentication**: Add user login with hashed passwords
2. **Club Associations**: Link stations to clubs with memberships
3. **Role-Based Access Control**: Admin, manager, operator roles
4. **Session Persistence**: Store sessions across restarts
5. **Audit Logging**: Track session creation and cleanup
6. **Rate Limiting**: Prevent session token abuse
7. **Security Headers**: Add security headers to WebSocket connections
8. **Token Refresh**: Implement token refresh mechanism
9. **Multi-Factor Authentication**: Add 2FA for sensitive operations
10. **Session Recovery**: Allow users to recover lost sessions

## Testing

### Unit Tests

```typescript
import { createSession, validateSession, cleanupExpiredSessions } from './src/session-management';

// Test session creation
const session = await createSession({
  callsign: 'TEST-ABC',
  stationId: 'test-station',
});
expect(session.token).toBeDefined();

// Test session validation
const result = await validateSession(session.token);
expect(result.valid).toBe(true);

// Test cleanup
await cleanupExpiredSessions();
```

### Integration Tests

```typescript
// Test full session lifecycle
const session = await createSession({
  callsign: 'TEST-ABC',
  stationId: 'test-station',
});

// Wait for expiration
await sleep(21 * 60 * 1000);

// Check cleanup
const stats = await getSessionStats();
expect(stats.activeSessions).toBe(0);
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

## Support

For issues or questions, please:
1. Check the documentation in `docs/session-management.md`
2. Review the code comments in `src/session-management.ts` and `src/session-cleanup.ts`
3. Create an issue in the repository

## License

Same as project license.