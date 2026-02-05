# Session Source Tracking - Quick Reference

## What This Does

**You can now see where each session is coming from!** In the Admin panel, click the expand arrow (▶️) next to a station's session count to see details about each active session, including:

- **Source Type** - What client connected (N3FJP relay, web browser, mobile app, API, etc.)
- **Source Info** - Additional details like N3FJP version or browser info  
- **Connection Time** - When the session was created
- **Last Activity** - Most recent action from this session
- **Expiry Time** - When the session will automatically expire

## Color Codes

In the Admin panel session details:

| Color | Source Type | Example |
|-------|-------------|---------|
| 🟠 Orange | N3FJP | N3FJP Contest Logging Software relay |
| 🟦 Blue | Mobile | iPhone or Android app |
| 🟪 Purple | API | Direct API or custom integration |
| 🟩 Green | Web | Browser-based UI |

## Finding Your N3FJP Connection

1. Go to **Admin** tab
2. Click **🔄 Refresh Stations**
3. Find your N7UF station row
4. When it has active sessions, click **▶️** to expand
5. Look for the **N3FJP** badge - that's your relay connection!
6. Check **Source Info** for the relay version and type

## Creating Sessions with Source Info

When programmatically creating a session, include source information:

```typescript
const response = await fetch('/api/sessions', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    callsign: 'N7UF',
    stationId: 'your-station-id',
    sourceType: 'n3fjp',        // ← NEW
    sourceInfo: 'N3FJP-v4.8.5'  // ← NEW (optional)
  })
})
```

**Source Types:**
- `'web'` (default) - Browser UI
- `'n3fjp'` - N3FJP relay
- `'mobile'` - Mobile app
- `'api'` - API/SDK integration
- `'other'` - Custom clients

## Admin Workflow

### View Session Details
1. Admin tab → Refresh Stations
2. Find station with Sessions > 0
3. Click ▶️ to expand and see all active sessions

### Clear Old Sessions
- Button appears as "Clear Sessions" when sessions exist
- Use to log out stuck clients or reset after testing

### Monitor Activity
- **Last Activity** timestamp shows if relay is still connected
- Compare across multiple sessions to see which clients are active
- Old timestamps (older than 20 mins) indicate expired/stale sessions

## Migration Info

This feature requires a database migration that creates two new fields:

```bash
npx prisma migrate deploy
```

Done automatically on server startup if using `npm run dev:all`.

## Database Schema

```prisma
model Session {
  // ... existing fields ...
  
  // NEW FIELDS:
  sourceType  String   @default("web")  // Type of client
  sourceInfo  String?                   // Additional details
}
```

## Troubleshooting

**Q: I don't see source info for old sessions**  
A: Older sessions created before this update won't have sourceType data. Clear them to create new ones with source info.

**Q: N3FJP sessions keep expiring**  
A: Sessions expire after 20 minutes of inactivity. N3FJP relay must make API calls regularly to keep session alive.

**Q: How do I identify duplicate sessions?**  
A: Look for multiple sessions with different sourceTypes for the same station, or sessions with old "Last Activity" timestamps.

## Documentation

Full details: [SESSION_SOURCE_TRACKING.md](./SESSION_SOURCE_TRACKING.md)

---

✅ **Ready to use** - No additional setup required beyond the database migration
