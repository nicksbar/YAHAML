# YAHAML Implementation Roadmap: Community Best Practices

Based on research of FDLog_Enhanced, Hamledger, dolphinlog, pycslog, and logXchecker, this document outlines a prioritized roadmap to align YAHAML with proven patterns.

## Phase 1: Foundation (Current Sprint) ✅

**Goal**: Ensure core LogEntry model captures everything we'll need.

### Tasks
- [x] LogEntry schema with dedupeKey, source, contestId, clubId, operatorCallsign
- [x] Unique constraint on dedupeKey prevents duplicates
- [x] Raw payload storage (rawPayload JSON column)
- [x] UDP ingest with dedupe logic
- [x] API endpoints for LogEntry CRUD
- [ ] **Migrate to new schema** (`npx prisma migrate dev --name log-entry-refactor`)
- [ ] **Validate TCP relay ingest** (N3FJP format → LogEntry)

---

## Phase 2: Data Quality & Audit (Next Sprint) 🎯

**Goal**: Handle duplicate/conflicting entries like FDLog_Enhanced does.

### 2.1 Merge Status Tracking
```prisma
model LogEntry {
  // ... existing fields ...
  merge_status      String @default("primary")  // primary | duplicate_of | merged
  merged_into_id    BigInt?                      // FK to primary entry
  merge_reason      String?                      // Why merged
  merge_timestamp   DateTime?
}
```

### 2.2 Conflict Resolution API
```
POST /api/logs/merge
{
  primary_id: BigInt,
  duplicate_ids: [BigInt, BigInt, ...]
  keep_raw_payloads: true  // Audit trail
}
```

### 2.3 Audit Trail
- Store all merge operations
- Queryable conflict history
- Exportable conflict report

---

## Phase 3: Standard Export Formats (Sprint 3) 📤

**Goal**: Users can switch loggers or submit to eQSL/LoTW without losing data.

### 3.1 ADIF-3 Export
```
GET /api/export/adif?contestId=xxx&format=3
Returns: *.adi file with all LogEntry records
```

Required fields:
- QSO_DATE, TIME_ON, CALL, MODE, BAND (minimum)
- FREQ, RST_SENT, RST_RCVD, OPERATOR, STATION_CALLSIGN
- CONTEST_ID, TX_PWR, RX_PWR, NOTES

### 3.2 CABRILLO Export (Contest Submission)
```
GET /api/export/cabrillo?contestId=xxx
Returns: *.log file (CABRILLO format)
```

Contest-specific rules:
- Validate mode/band combinations
- Enforce score calculation
- Inject contest metadata

### 3.3 Reverse-Log (FDLog's Pattern)
```
GET /api/export/reverse-log?contestId=xxx&remote_call=W5ABC
Returns: CABRILLO log of all QSOs WITH that station
```
Useful for QSL coordination and dispute resolution.

---

## Phase 4: Real-Time Aggregation (Sprint 4) 📊

**Goal**: Live scoreboard, band occupancy, operator stats without UI polling.

### 4.1 Aggregation Tables
```prisma
model LogAggregate {
  id              String   @id @default(cuid())
  contestId       String
  clubId          String?
  periodStart     DateTime  // Hourly: YYYY-MM-DD HH:00:00
  
  // Counters
  totalQsos       Int       @default(0)
  totalDupes      Int       @default(0)
  cwContacts      Int       @default(0)
  ssbContacts     Int       @default(0)
  ftxContacts     Int       @default(0)
  
  // Breakdowns
  bandBreakdown   Json      // { "20m": 45, "40m": 32, ... }
  modeBreakdown   Json      // { "CW": 50, "SSB": 45, "FT8": 34 }
  operatorStats   Json      // { "W5XYZ": 30, "N0ABC": 28, ... }
  
  // Metadata
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  
  @@unique([contestId, clubId, periodStart])
  @@index([contestId])
  @@index([periodStart])
}
```

### 4.2 Trigger-Based Updates
```typescript
// On LogEntry.create, trigger aggregate update
prisma.$executeRaw`
  UPDATE LogAggregate
  SET totalQsos = totalQsos + 1
  WHERE contestId = ${entry.contestId}
    AND periodStart = date_trunc('hour', NOW())
`;
```

### 4.3 Aggregate Query Endpoints
```
GET /api/stats/aggregates?contestId=xxx&start=2026-01-31
GET /api/stats/scoreboard?contestId=xxx
GET /api/stats/band-occupancy?contestId=xxx
GET /api/stats/operator-activity?contestId=xxx
```

---

## Phase 5: Real-Time Push (Sprint 5) ⚡

**Goal**: Live updates for scoreboard and dupe alerts; no polling.

### 5.1 Server-Sent Events (SSE)
```typescript
// /api/logs/stream?contestId=xxx
app.get('/api/logs/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  
  const { contestId } = req.query;
  
  const handler = (entry) => {
    if (entry.contestId === contestId) {
      res.write(`data: ${JSON.stringify(entry)}\n\n`);
    }
  };
  
  eventEmitter.on('logEntry:created', handler);
  
  res.on('close', () => {
    eventEmitter.off('logEntry:created', handler);
  });
});
```

### 5.2 UI Integration
```typescript
// React hook
useEffect(() => {
  const eventSource = new EventSource('/api/logs/stream?contestId=...');
  
  eventSource.onmessage = (event) => {
    const newEntry = JSON.parse(event.data);
    // Update scoreboard, dupe list, band map
    dispatch(updateLog(newEntry));
  };
  
  return () => eventSource.close();
}, [contestId]);
```

### 5.3 Dupe Alert on Entry
- Show alert **before operator submits to exchange**

---
### 6.1 WSJT-X Auto-Logging
```
```

- Handle deduplication (same QSO logged manually + auto)

         → On button press: "Log This QSO"
         → Creates LogEntry in YAHAML
```
Hamlib (rigctld) → Query on form open
---

## Phase 7: Contest-Specific Features (Sprint 7+) 🏆


### 7.1 Contest Template System

```prisma
model ContestTemplate {
  id               String   @id @default(cuid())
  name             String   @unique // "ARRL Field Day", "CQ WW DX", "Parks on the Air"
  organization     String             // "ARRL", "CQ Magazine", "POTA"
  description      String?
  website          String?
  
  // Exchange requirements
  exchange_fields  Json             // { "state": required, "section": optional }
  exchange_example String?          // e.g., "TX" or "AR/TX" for Field Day
  
  // Restrictions by band/mode
  mode_restrictions Json?           // { "160m": ["cw"], "40m": ["cw", "ssb"] }
  band_restrictions Json?           // { "digital": ["20m", "40m", "80m"] }
  
  // Scoring configuration
  scoring_rules    Json             // { "cw": { "us": 1, "dxcc": 2 }, "ssb": { ... } }
  qso_points       Int              // Points per QSO
  multiplier_type  String[]         // ["state", "section", "dxcc"]
  bonuses          Json?            // { "power": 5, "location": 10 }
  
Exchange: State + Section (e.g., "TX" for Texas)
  ```typescript
  // /api/logs/stream?contestId=xxx
  app.get('/api/logs/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
  
    const { contestId } = req.query;
  
    const handler = (entry) => {
      if (entry.contestId === contestId) {
        res.write(`data: ${JSON.stringify(entry)}\n\n`);
      }
    };
  
    eventEmitter.on('logEntry:created', handler);
  
    res.on('close', () => {
      eventEmitter.off('logEntry:created', handler);
    });
  });
  ```

  ### 6.2 Advanced Frontend WebSocket Hooks
  - useWebSocket: real-time vs polling modes
  - useContestUpdates: aggregates, band occupancy, operator stats
  - Scoreboard with live updates per source
  - Multi-band visualization (colored occupancy chart)
  - Operator performance dashboard with trends

  ### 6.3 Dupe Resolution UI
  - One-click merge for detected duplicates
  - Show dupe candidates with confidence scores
  - Audit trail of all merges
  calculateScore(template, entries) {
    // Count QSOs per rule
    // Track multipliers (states, sections, countries, grids)
    // Apply bonuses
    // Return total score
  }
}
```

## Phase 7: Advanced Features (Sprint 7+) 🏆

**Goal**: RAG chewing, DXpeditions, QSL integration.
model Multiplier {
  contestId       String
### 7.1 RAG Chewing Mode
- Non-contest, casual logging
- Simple log entry form
- Basic stats (contacts per band, mode)

### 7.2 DXpedition Support
- Remote multi-op coordination
- Shared log with role-based access
- Home-operator alert system
## Phase 8: Distributed Logging (Future) 🌐
   - V1: Focus on TCP relay + UDP + UI form entry
   - V2: Add WSJT-X, Fldigi, Hamlib auto-logging

2. **Distributed logging: LAN-only or cloud?**
   - FDLog_Enhanced uses UDP multicast (LAN)
   - We could support both: local network + cloud sync
   - Decision point: Phase 8

3. **Which contests to template first?**
   - ARRL Field Day (most common in YAHAML demo)
   - CQ WW DX (standard dupe rules)
   - CQ VHF (unique multiplier tracking)

4. **Export priority: ADIF-3 or CABRILLO first?**
   - ADIF-3 first (simpler, more widely compatible)
   - CABRILLO second (contest submission)

---

**Document Version**: 1.0 | Last Updated: 2026-01-31
