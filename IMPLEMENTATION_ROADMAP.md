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
- When new LogEntry created with mode, band, time
- Check dedupeKey immediately
- If dupe found, emit `dupe_detected` event to UI
- Show alert **before operator submits to exchange**

---

## Phase 6: Integration Modules (Sprint 6+) 🔌

**Goal**: Auto-ingest from WSJT-X, Fldigi, Hamlib (like FDLog_Enhanced).

### 6.1 WSJT-X Auto-Logging
```
WSJT-X → UDP broadcast (QSO details)
         → YAHAML UDP listener parses
         → Creates LogEntry with source: 'wsjt-x'
         → Alerts UI: "FT8 QSO logged"
```

Implementation:
- Monitor WSJT-X UDP port (default 2237)
- Parse JSON logbook_new_entry messages
- Map to LogEntry schema
- Handle deduplication (same QSO logged manually + auto)

### 6.2 Fldigi Integration
```
Fldigi → XML-RPC API
         → Query: frequency, mode, remote call
         → On button press: "Log This QSO"
         → Creates LogEntry in YAHAML
         → Updates Fldigi with QSO ID (audit link)
```

### 6.3 Hamlib Auto-Population
```
Hamlib (rigctld) → Query on form open
                 → Populate: FREQ, MODE, VFO
                 → Validate band from frequency
                 → Show band-specific mode restrictions
```

---

## Phase 7: Contest-Specific Features (Sprint 7+) 🏆

**Goal**: Support ARRL, CQ, WPX rules natively.

### 7.1 Contest Template System
```prisma
model ContestTemplate {
  id          String @id
  name        String  // "ARRL Field Day", "CQ WW DX"
  
  // Exchange
  exchange_fields  Json  // { "state": required, "section": optional }
  mode_restriction Json  // { "80m": ["cw", "ssb"], "40m": [...] }
  
  // Scoring
  scoring_rules    Json  // { "cw": { "us": 1, "dxcc": 2 }, ... }
  dupe_rules       String  // "mode-aware", "band-only", "strict"
  
  // Export
  cabrillo_class   String  // "5A", "3A", "M/M", etc.
  export_template  String  // CABRILLO template
}
```

### 7.2 Validation Rules
- Enforce exchange fields (e.g., state + section for Field Day)
- Validate call format (W5ABC, N0ABC, DL1ABC, etc.)
- Check mode-band restrictions (no SSB on 160m CW-only)
- Calculate score per QSO

### 7.3 Auto-Multiplier Tracking
```
model Multiplier {
  contestId    String
  multiplierType String  // "state", "section", "dxcc_country"
  value        String   // "TX", "AR", "UR3RZ"
  first_qso_timestamp DateTime
  
  @@unique([contestId, multiplierType, value])
}
```

---

## Phase 8: Distributed Logging (Future) 🌐

**Goal**: Multi-site contests like FDLog_Enhanced (Node1, Node2, GOTA sync).

### 8.1 Network Sync Protocol
```
All nodes replicate LogEntry locally
Periodic sync: node-to-node dupe check, fill-in missing

Status: Design phase; defer to V2
```

---

## Implementation Priority Matrix

| Phase | Feature | Difficulty | User Impact | Timeline |
|-------|---------|-----------|------------|----------|
| 1 | Core LogEntry schema | Low | Foundational | Now |
| 2 | Merge/Conflict handling | Medium | Audit trail | Week 2 |
| 3 | ADIF-3 + CABRILLO export | Medium | Portability | Week 3 |
| 4 | Aggregation tables | Medium | Performance | Week 4 |
| 5 | Real-time push (SSE) | Medium-High | UX | Week 5 |
| 6 | WSJT-X / Hamlib integration | High | Convenience | Weeks 6-8 |
| 7 | Contest templates | High | Flexibility | Weeks 8-10 |
| 8 | Distributed sync | Very High | Scale | V2.0 |

---

## Quick Implementation Checklist

### Immediate (This Week)
- [ ] Run Prisma migration for LogEntry schema
- [ ] Test TCP relay QSO ingest with dedupeKey
- [ ] Verify API endpoints work with new schema
- [ ] Document dedupeKey algorithm

### Next Week
- [ ] Add `merge_status`, `merged_into_id` fields
- [ ] Implement `/api/logs/merge` endpoint
- [ ] Write conflict resolution tests

### Following Week
- [ ] Design ADIF-3 export schema
- [ ] Implement `GET /api/export/adif` endpoint
- [ ] Create CABRILLO export template for sample contest

### Following Month
- [ ] Add LogAggregate model
- [ ] Implement hourly aggregation trigger
- [ ] Add scoreboard endpoints
- [ ] Wire up SSE stream to React UI

---

## Resources & References

**FDLog_Enhanced** (Distributed, Multi-Node):
- Source: https://github.com/scotthibbs/FDLog_Enhanced
- File: `share_fdlog.py` (network sync protocol)
- Lesson: Distributed database is battle-tested for 40 years

**Hamledger** (Modern Stack):
- Source: https://github.com/valibali/hamledger
- File: `src/integration/` (WSJT-X, Hamlib, Fldigi)
- Lesson: TypeScript/Electron patterns apply to Node.js/React

**dolphinlog** (ADIF Export):
- Source: https://github.com/xaratustrah/dolphinlog
- Code: ADIF-3 field mapping and validation

**ADIF-3 Spec**:
- URL: http://adif.org/
- Covers 200+ fields; we need ~20 for basic export

**Hamlib**:
- Docs: https://hamlib.github.io/
- Protocol: TCP on port 4532 by default

---

## Success Metrics

By end of Phase 5 (8 weeks), YAHAML should:
- ✅ Handle multi-source ingest (TCP, UDP, UI, auto) with dedupe
- ✅ Export portable ADIF-3 format (eQSL/LoTW compatible)
- ✅ Support real-time scoreboard & dupe alerts (no polling)
- ✅ Aggregate stats hourly for performance
- ✅ Handle merge/conflict scenarios gracefully

By end of Phase 7 (12 weeks):
- ✅ Support 3-5 major contests (ARRL Field Day, CQ WW, etc.)
- ✅ Auto-ingest from WSJT-X + Hamlib
- ✅ Production-ready scoring & validation

---

## Notes for Next Planning Meeting

1. **Do we want WSJT-X integration in V1 or V2?**
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
