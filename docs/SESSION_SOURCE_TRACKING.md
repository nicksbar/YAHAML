# Session Source Tracking

## Overview

Session source tracking allows administrators to identify where each active session is coming from. This is particularly useful for debugging multi-client scenarios, like distinguishing between:

- **N3FJP** - Contest logging software relay connections (like your N7UF connection!)
- **Web** - Browser-based UI sessions
- **Mobile** - Mobile app connections
- **API** - Direct API integrations
- **Other** - Custom client sources

## Feature Details

### Database Schema

The `Session` model now includes two new fields:

```prisma
sourceType  String   @default("web")     // web | n3fjp | mobile | api | other
sourceInfo  String?                      // Additional details (version, browser, etc.)
```

### Session Creation

When creating a session via `POST /api/sessions`, clients can now provide source information:

```bash
curl -X POST http://localhost:3000/api/sessions \
  -H "Content-Type: application/json" \
  -d '{
    "callsign": "N7UF",
    "stationId": "abc123",
    "browserId": "browser-session-id",
    "sourceType": "n3fjp",
    "sourceInfo": "N3FJP v4.8.5"
  }'
```

**Parameters:**
- `callsign` (required) - Operator callsign
- `stationId` (required) - Station database ID
- `browserId` - Browser session identifier for rig locking
- `sourceType` (optional, default: "web") - Origin of the session
- `sourceInfo` (optional) - Additional details about the source

**Response:**
```json
{
  "token": "MTY5MTUxMzAyMDE4...",
  "sessionId": "clj7xz9k0000...",
  "expiresAt": "2026-02-05T10:30:15.000Z",
  "reused": false
}
```

### Station Management UI

The Admin → Station Management panel now displays session sources:

1. **Sessions Count** - Shows number of active sessions for each station
2. **Expand Details** - Click ▶️ to expand and see session details
3. **Session Information** - For each session shows:
   - **Source Type** - Color-coded badge (N3FJP=Orange, Mobile=Blue, API=Purple, Web=Green)
   - **Source Info** - Additional details if provided
   - **Created** - When the session was established
   - **Last Activity** - Most recent activity timestamp
   - **Expires** - When the session will expire
   - **Token Preview** - First 12 characters of token

## Use Cases

### Example 1: Identifying Your N3FJP Connection

Looking at the screenshot, your N7UF station shows 0 active sessions. Once you connect N3FJP relay:

1. Navigate to Admin → Station Management
2. Look for the N7UF row
3. Click the ▶️ expand button (appears when sessions exist)
4. You'll see a session with:
   - **Source Type:** N3FJP (orange badge)
   - **Source Info:** N3FJP version and relay details
   - **Last Activity:** Current time

This confirms that N7UF is indeed your N3FJP relay connection.

### Example 2: Multi-Source Debugging

If a station shows multiple sessions:

```
Sessions: 3

▼ N3FJP (N3FJP v4.8.5)
  Created: 2026-02-05 09:15:23
  Last Activity: 2026-02-05 09:45:12

▼ WEB (Chrome on Windows)
  Created: 2026-02-05 09:20:00
  Last Activity: 2026-02-05 09:44:55

▼ MOBILE (iPhone Safari)
  Created: 2026-02-05 09:25:30
  Last Activity: 2026-02-05 09:43:20
```

This helps identify:
- If two people are accidentally using the same station
- If stale sessions exist (old last activity times)
- Which clients are most recently active

## Integration Points

### For N3FJP Relay

When N3FJP connects, it should include source information in the session request:

```typescript
const response = await fetch('/api/sessions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    callsign: 'N7UF',
    stationId: station.id,
    sourceType: 'n3fjp',
    sourceInfo: 'N3FJP-4.8.5-TCP-Relay'
  })
})
```

### For Mobile Apps

```typescript
const response = await fetch('/api/sessions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    callsign: 'W5XYZ',
    stationId: stationId,
    sourceType: 'mobile',
    sourceInfo: `iOS-${iosVersion}-Safari`
  })
})
```

### For Custom Integrations

```typescript
const response = await fetch('/api/sessions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    callsign: 'K0ABC',
    stationId: stationId,
    sourceType: 'api',
    sourceInfo: 'CustomSDKv2-logging-api'
  })
})
```

## Administrator Workflow

### Viewing Session Details

1. Click **Admin** tab
2. Click **🔄 Refresh Stations** button
3. Find the station you want to inspect
4. If it shows **Sessions > 0**, click ▶️ to expand
5. Review the session sources, activity times, and expiry

### Clearing Old Sessions

- Click **Clear Sessions** to remove all sessions for a station
- This is useful for:
  - Logging out stuck clients
  - Resetting after testing
  - Clearing duplicate sessions from old connections

### Identifying N3FJP Connections

1. Look for sessions with sourceType = **N3FJP**
2. Check the sourceInfo field for:
   - N3FJP version (e.g., "N3FJP-4.8.5")
   - Relay type (e.g., "TCP-Relay")
   - Connection parameters
3. Monitor "Last Activity" to see if relay is actively connected

## Database Migration

To enable this feature, run:

```bash
npx prisma migrate deploy
```

This applies the `20260205040720_add_session_source_tracking` migration.

## API Responses

### GET /api/admin/stations (Returns all stations with sessions)

```json
[
  {
    "id": "station-123",
    "callsign": "N7UF",
    "name": "Relay Station",
    "sessions": [
      {
        "id": "session-456",
        "callsign": "N7UF",
        "createdAt": "2026-02-05T09:15:00Z",
        "lastActivity": "2026-02-05T09:45:12Z",
        "expiresAt": "2026-02-05T10:15:00Z",
        "sourceType": "n3fjp",
        "sourceInfo": "N3FJP-v4.8.5-relay"
      }
    ]
  }
]
```

### POST /api/sessions (Create session with source)

**Request:**
```json
{
  "callsign": "N7UF",
  "stationId": "station-123",
  "sourceType": "n3fjp",
  "sourceInfo": "N3FJP-v4.8.5"
}
```

**Response:**
```json
{
  "token": "MTY5MTUxMzAyMDE4LTAuMDAw...",
  "sessionId": "clj7xz9k0000a...",
  "expiresAt": "2026-02-05T10:15:00.000Z"
}
```

## Future Enhancements

Potential improvements:

1. **Session Filtering** - Filter by sourceType in admin panel
2. **Connection Analytics** - Track which source types are most active
3. **Concurrent Session Limits** - Restrict max concurrent N3FJP or mobile sessions
4. **Session Audit Log** - Track who connected from where and when
5. **Auto-Cleanup** - Automatically clear expired sessions older than X days

## Troubleshooting

### Sessions Not Showing Source Info

**Cause:** Old sessions created before migration, or source info not provided

**Fix:** Clear sessions and create new ones with source information:
```typescript
await fetch(`/api/admin/stations/${stationId}/clear-sessions`, {
  method: 'POST'
})
```

### N3FJP Session Not Appearing

**Possible Causes:**
1. N3FJP not sending sourceType in session creation request
2. Session expired (20-minute inactivity timeout)
3. Wrong stationId provided

**Debug:**
- Check browser console for API errors
- Verify stationId matches the target station
- Monitor relay logs for connection attempts

### Session Expires Unexpectedly

Sessions expire after **20 minutes of inactivity**. To keep a session alive:
- Ensure client makes API calls regularly (every ~15 minutes)
- Check network connectivity between relay and server
- Verify server is running

## Code References

- **Schema:** [prisma/schema.prisma](../prisma/schema.prisma) (Session model)
- **API:** [src/index.ts](../src/index.ts) (POST /api/sessions, GET /api/admin/stations)
- **UI:** [ui/src/App.tsx](../ui/src/App.tsx) (renderAdminView function, expandedStationId state)
- **Tests:** [tests/test-helpers.ts](../tests/test-helpers.ts) (createTestSession helper)

---

**Last Updated:** February 5, 2026  
**Feature Status:** ✅ Production Ready
