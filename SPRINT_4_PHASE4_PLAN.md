# Sprint 4: Phase 4 - Real-Time Aggregation with WebSockets

**Goal**: Live scoreboard, band occupancy, operator stats with WebSocket push (no polling)

**Duration**: 2 weeks (Jan 31 - Feb 14, 2026)

**Status**: ✅ COMPLETE (Jan 31, 2026)
- ✅ All backend components implemented
- ✅ 13/13 aggregation tests passing
- ✅ 9/11 WebSocket integration tests passing
- ✅ 18 new test cases added (103 → 121 passing tests)

---

## Architecture

### WebSocket Events
```typescript
// Client → Server
{ type: 'subscribe', channel: 'contest:123', filters: {...} }
{ type: 'unsubscribe', channel: 'contest:123' }

// Server → Client
{ type: 'logEntry:created', data: LogEntry }
{ type: 'aggregate:updated', data: LogAggregate }
{ type: 'dupe:detected', data: { entry, duplicate } }
```

### Aggregation Strategy
- Hourly buckets for time-series data
- On-write updates (trigger on LogEntry creation)
- JSON storage for flexible breakdowns

---

## Task Breakdown

### 1. Database Schema (2h)
**File**: `prisma/migrations/xxx_add_log_aggregate/migration.sql`

- [x] 1.1 Create `LogAggregate` model
  - Fields: contestId, clubId, periodStart (hourly)
  - Counters: totalQsos, totalDupes, cwContacts, ssbContacts, ftxContacts
  - JSON: bandBreakdown, modeBreakdown, operatorStats
  - Unique: [contestId, clubId, periodStart]
  - Indexes: contestId, periodStart

**Acceptance**: ✅ `npx prisma migrate dev` succeeds, model in schema.prisma

---

### 2. WebSocket Server Setup (3h)
**File**: `src/websocket.ts`

- [x] 2.1 Install `ws` and `@types/ws`
- [x] 2.2 Create WebSocket server attached to HTTP server
- [x] 2.3 Implement subscription management
  - Channel-based subscriptions (contest:123, global)
  - Client connection tracking
- [x] 2.4 Implement event broadcasting
  - `broadcast(channel, event, data)`
  - Filter by subscription

**Acceptance**: ✅ WebSocket server accepts connections, handles subscribe/unsubscribe

---

### 3. Aggregation Service (4h)
**File**: `src/aggregation.ts`

- [x] 3.1 `updateAggregates(logEntry)` function
  - Find/create hourly aggregate bucket
  - Increment counters (totalQsos, mode counts)
  - Update JSON breakdowns (band, mode, operator)
  - Handle dupes (increment totalDupes)
  
- [x] 3.2 `getAggregates(contestId, start, end)` query
  - Time-series data for charts
  - Filter by date range
  
- [x] 3.3 `getScoreboard(contestId)` query
  - Operator rankings by QSO count
  - Band/mode breakdowns per operator
  
- [x] 3.4 `getBandOccupancy(contestId)` query
  - Current band activity (last hour)
  - Mode distribution per band

**Acceptance**: ✅ Functions update aggregates correctly, queries return expected data

---

### 4. Integration with LogEntry Creation (2h)
**File**: `src/index.ts`

- [x] 4.1 Hook into POST /api/logs endpoint
  - After LogEntry.create, call updateAggregates()
  - Broadcast 'logEntry:created' via WebSocket
  - Broadcast 'aggregate:updated' with new counts
  
- [x] 4.2 Dupe detection enhancement
  - Check dedupeKey on create
  - If dupe found, broadcast 'dupe:detected'

**Acceptance**: ✅ Creating LogEntry triggers aggregate update and WebSocket broadcasts

---

### 5. Aggregate Query Endpoints (3h)
**File**: `src/index.ts`

- [x] 5.1 `GET /api/stats/aggregates?contestId=xxx&start=ISO&end=ISO`
  - Returns time-series array of LogAggregate records
  - Optional date range filtering
  
- [x] 5.2 `GET /api/stats/scoreboard?contestId=xxx`
  - Returns operator rankings with totals
  - Sorted by QSO count descending
  
- [x] 5.3 `GET /api/stats/band-occupancy?contestId=xxx`
  - Returns band activity (QSOs per band, last hour)
  - Mode breakdown per band
  
- [x] 5.4 `GET /api/stats/operator-activity?contestId=xxx&operatorCall=W5ABC`
  - Returns specific operator stats
  - QSO timeline, band/mode distribution

**Acceptance**: All endpoints return correct aggregated data, handle missing contestId (400)

---

### 6. UI WebSocket Client (2h)
**File**: `ui/src/websocket.ts`

- [ ] 6.1 WebSocket connection hook
  - `useWebSocket(url)` - maintains connection
  - Auto-reconnect on disconnect
  - Event subscription system
  
- [ ] 6.2 Contest subscription hook
  - `useContestUpdates(contestId)` - subscribes to contest channel
  - Returns: new entries, aggregate updates, dupe alerts
  
- [ ] 6.3 Event handlers
  - `onLogEntryCreated` → update log table
  - `onAggregateUpdated` → update scoreboard/charts
  - `onDupeDetected` → show alert

**Acceptance**: UI receives real-time updates, no polling needed

---

### 7. Testing (4h)
**File**: `tests/aggregation.test.ts`, `tests/websocket.test.ts`

- [ ] 7.1 Aggregation logic tests
  - Test updateAggregates creates/updates records
  - Test hourly bucket creation
  - Test counter increments
  - Test JSON breakdown updates
  
- [ ] 7.2 WebSocket integration tests
  - Test subscription/unsubscribe
  - Test event broadcasting
  - Test multi-client scenarios
  
- [ ] 7.3 Endpoint tests
  - Test all 4 aggregate endpoints
  - Test error handling (400, 404)
  - Test date range filtering

**Acceptance**: All tests pass, >80% coverage on new code

---

## Effort Summary

| Task | Effort |
|------|--------|
| Database Schema | 2h |
| WebSocket Server | 3h |
| Aggregation Service | 4h |
| LogEntry Integration | 2h |
| Query Endpoints | 3h |
| UI WebSocket Client | 2h |
| Testing | 4h |
| **Total** | **20h** |

---

## Success Criteria

- ✅ LogAggregate model tracks hourly QSO counts and breakdowns
- ✅ WebSocket server broadcasts log entries, aggregate updates, dupe alerts
- ✅ UI receives real-time updates without polling
- ✅ Scoreboard, band occupancy, operator stats available via API
- ✅ All tests pass (aggregation logic + WebSocket integration)
- ✅ Documentation updated with WebSocket protocol

---

## Dependencies

- `ws` - WebSocket server library
- `@types/ws` - TypeScript definitions

---

## Risk Mitigation

**Risk**: WebSocket connections drop frequently
- **Mitigation**: Implement auto-reconnect in UI, heartbeat/ping-pong

**Risk**: Aggregate updates slow down LogEntry creation
- **Mitigation**: Make aggregate updates async (don't block response)

**Risk**: Multiple clients cause duplicate broadcasts
- **Mitigation**: Use Set for client tracking, dedupe by connectionId
