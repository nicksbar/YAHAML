# Ham Radio Logging Best Practices: Learning from Established Projects

Based on research of leading open-source ham radio logging projects, this document outlines proven patterns and solutions for challenges we're likely to encounter.

## Executive Summary

The community has solved many problems we face: deduplication, multi-source ingest, distributed logging, rig integration, digital mode support, and contest-specific features. By adopting their proven patterns, we can avoid common pitfalls and ship features faster.

---

## Key Projects Analyzed

| Project | Type | Stars | Language | Key Innovation |
|---------|------|-------|----------|-----------------|
| **FDLog_Enhanced** | Field Day (Distributed) | 16 | Python | Distributed database, multi-node networking, seamless sync |
| **Hamledger** | General-purpose | 9 | TypeScript/Electron | Modern UI, WSJT-X/Fldigi integration, Hamlib rig control |
| **dolphinlog** | Minimalist CLI | 8 | Python | Ultralight, ADIF-3 export, SQLite |
| **pycslog** | Contest Logger | 3 | Python | Client-server architecture, dupe detection, contest-aware |
| **logXchecker** | Contest Validation | 14 | Python | Log cross-checking, EDI format, contest validation |

---

## Critical Lessons: Data Model & Schema

### 1. **Core QSO Fields (Canonical)**

All projects converge on these essential fields. YAHAML's LogEntry should ensure it captures:

```
QSO_DATE       (YYYYMMDD) - Contest-critical for deduplication
TIME_ON        (HHMMSS) - UTC time
CALL           (string) - Remote station callsign
MODE           (string) - SSB, CW, FT8, PSK, etc.
BAND           (string) - 160m, 80m, 40m, 20m, etc.
RST_SENT       (string) - Signal report we sent
RST_RCVD       (string) - Signal report we received
FREQ           (float) - Frequency in MHz
OPERATOR       (string) - Call of operator logging
STATION_CALL   (string) - Call of station being used
NOTES          (text) - Optional comment
```

**YAHAML Status**: ✅ LogEntry includes these fields; our `contestId`, `clubId`, `operatorCallsign` add multi-context awareness beyond basic loggers.

### 2. **Deduplication Strategy**

**FDLog_Enhanced** uses:
- Distributed database replicated to all nodes
- Dupe detection by `(call, band, date, time)` tuple
- Separate dupe tracking for GOTA vs. regular station
- Tracks source (which node/station logged it)

**pycslog** uses:
- Server-side dupe list sent to clients
- Client shows "probable dupe" vs. confirmed dupe
- Allows intentional re-contact if rules permit

**Our Approach** ✅:
- `dedupeKey` = `hash(stationCall, callsign, band, mode, qsoDate, qsoTime, contestId, clubId)`
- Unique constraint on dedupeKey prevents duplicates
- `source` field (TCP, UDP, UI, rig) tracks origin
- Raw payload storage for post-contest audit/merge

**Recommended Enhancement**:
Add a `merge_status` field for handling disputed/merged entries:
```typescript
merge_status: 'primary' | 'duplicate_of' | 'merged'
merged_into_id?: bigint  // FK to primary entry
```

---

## Multi-Source Ingest Patterns

### FDLog_Enhanced Architecture

```
┌─────────────────────────────────────────┐
│      FDLog_Enhanced Master Node          │
│ (Database, Dupe Check, Scoring)         │
└──────┬──────────────────────────────────┘
       │ Network Sync (UDP/TCP)
       │
   ┌───┴───┬────────┬────────┐
   │       │        │        │
   ▼       ▼        ▼        ▼
 Node-1  Node-2  GOTA   Mobile
 (Radio) (Radio) (Solo) (Car)
 
 Features:
 - Node restart recovery (remembers own identity)
 - Automatic fill-sync from other nodes
 - SEPARATE dupe tracking for GOTA
 - Network auth (last 2 digits of year)
 - Inactivity timer (auto-logoff bands)
```

**Key Insight**: Each radio/station can be a logging node. They sync bidirectionally. This is ahead of many "cloud-first" loggers.

### Integrated Data Sources (Best Practice)

**FDLog_Enhanced supports**:
- WSJT-X (FT8/FT4) - Auto-import QSOs
- Fldigi - Two-way integration
- N3FJP - TCP client/server bridge
- Hamlib rigctld - Real-time rig state
- Manual UI entry

**Hamledger supports**:
- WSJT-X auto-import
- Fldigi integration
- Hamlib rig control
- Real-time S-meter display
- DX Cluster integration

### YAHAML's Current Architecture

```
TCP Relay    UDP Server    Web UI    Hamlib (planned)
   │             │            │             │
   │ Contest      │ Multi-     │ Manual      │ Rig
   │ Protocol     │ source     │ Entry       │ State
   │             │ UDP        │             │
   └──────┬───────┴────┬───────┴─────────────┘
          │            │
          ▼            ▼
    LogEntry Model (unified)
          │
          ▼
    SQLite Database
```

**Recommendation**: Adopt FDLog's pattern of `source` metadata:
```typescript
source: 'tcp-relay' | 'udp-broadcast' | 'ui-manual' | 'wsjt-x' | 'fldigi' | 'hamlib-auto'
source_timestamp: DateTime  // When ingest happened
source_raw_payload: JSON   // Original format (UTF-16 from TCP, JSON from UDP)
```

---

## Deduplication Rules & Conflict Resolution

### Contest-Specific Dedup Rules

**FDLog_Enhanced**:
- Mode-aware: SSB vs. CW on same freq/day = different contact
- Band-aware: 20m-SSB vs. 20m-CW = different contact
- Time-aware: Within 3 minutes = likely dupe; beyond 10 min = possible retry
- GOTA-aware: GOTA dupes are separate from main station

**logXchecker**:
- Implements ARRL rules for cross-checking submitted logs
- Validates call format, grid square validity, mode restrictions by band

**YAHAML Best Practice**:

```typescript
// Build dedupeKey with contest-aware granularity
function buildDedupeKey({
  stationCall,
  callsign,
  band,
  mode,          // Include mode (not just band)
  qsoDate,
  qsoTime,
  contestId,     // Different contest = different dupe space
  clubId,        // Different club = different dupe space
}) {
  const key = `${stationCall}|${callsign}|${band}|${mode}|${qsoDate}|${qsoTime}|${contestId}|${clubId}`;
  return hashFunction(key);
}

// Allow exceptions for intentional re-contacts
// (Multi-mode contest: contact same station on SSB and CW)
```

---

## Aggregation & Reporting (Look-Ahead)

### FDLog Features We Should Emulate

1. **Live Statistics**
   - Contacts per operator
   - Contacts per band
   - Dupes (with GOTA separate)
   - CW vs. SSB ratio
   - Score estimate

2. **Progressive Reporting**
   - Entry-by-entry UI updates (no batching delays)
   - Real-time band occupancy map
   - "Who's on 20m right now?"

3. **QSL / Cross-Check Support**
   - Export as CABRILLO (.log format)
   - Export as ADIF-3 (.adi)
   - Reverse-log generation (extract from database)

### YAHAML's Next Steps

**Aggregation Table Pattern** (avoid recalculating):

```prisma
model LogAggregate {
  id        String    @id @default(cuid())
  contestId String
  clubId    String?
  periodStart DateTime  // Hourly: YYYY-MM-DD HH:00:00
  
  totalQsos         Int
  totalDupes        Int
  cwContacts        Int
  ssbContacts       Int
  ftxContacts       Int
  
  bandBreakdown     JSON  // { "20m": 45, "40m": 32, ... }
  modeBreakdown     JSON  // { "CW": 50, "SSB": 45, "FT8": 34 }
  operatorStats     JSON  // { "W5XYZ": 30, "N0ABC": 28, ... }
  
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  
  @@unique([contestId, clubId, periodStart])
}
```

---

## Real-Time Event Propagation

### The Challenge
- 50+ operators logging simultaneously
- UI needs instant dupe alerts, band updates, score changes
- No latency for competitive contests

### Solutions in the Wild

**FDLog_Enhanced**:
- Uses network broadcasts (UDP multicast)
- All nodes sync in real-time
- No central bottleneck

**Hamledger**:
- Electron (local machine) - minimal network concerns
- Polling sufficient for hobby use

**YAHAML Recommendation**:

| Scenario | Current | Recommended |
|----------|---------|-------------|
| Single machine/LAN contest | Polling OK | Keep polling, optimize interval (1-2s) |
| Multi-venue contest | TCP relay + polling | Add WebSocket for real-time updates |
| Club/Regional event | Multiple stations | Pub/Sub pattern (Node.js emitter or third-party) |

```typescript
// Server-Sent Events (SSE) for live updates
app.get('/api/logs/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  
  // Emit LogEntry on each insert/update
  const handler = (entry) => {
    res.write(`data: ${JSON.stringify(entry)}\n\n`);
  };
  
  eventEmitter.on('logEntry:created', handler);
  
  res.on('close', () => {
    eventEmitter.off('logEntry:created', handler);
  });
});
```

---

## ADIF-3 and Standard Formats

### Why It Matters
- eQSL.cc, LoTW, QRZ require ADIF export
- Allows switching loggers without losing history
- International standard (ADIF 3 spec ~200 fields)

### YAHAML Export Template

Following `dolphinlog` minimalist approach + FDLog completeness:

```typescript
interface AdifRecord {
  // Mandatory (eQSL minimum)
  QSO_DATE: string;        // YYYYMMDD
  TIME_ON: string;         // HHMMSS
  CALL: string;            // Contact call
  MODE: string;            // Mode
  BAND: string;            // Band
  
  // Recommended
  FREQ: number;            // MHz
  RST_SENT: string;        // e.g., "59"
  RST_RCVD: string;        // e.g., "59"
  TX_PWR: number;          // Watts
  RX_PWR: number;          // Watts
  GRIDSQUARE: string;      // Grid square
  NOTES: string;           // Comment
  
  // YAHAML extensions
  CONTEST_ID: string;      // Contest name
  OPERATOR: string;        // Logger's call
  STATION_CALLSIGN: string; // Our station call
  SOURCE: string;          // tcp-relay, ui-manual, etc.
}
```

---

## Rig Integration & Real-Time State

### Hamlib/rigctld Pattern (Battle-Tested)

FDLog_Enhanced, Hamledger, and many others use:

```
┌─────────────────┐
│  Radio Rig      │
│ (IC-7300, etc)  │
└────────┬────────┘
         │ USB/Ethernet
         ▼
┌─────────────────┐
│  rigctld        │ (Hamlib daemon)
│  port 4532      │
└────────┬────────┘
         │ Localhost/Network
         ▼
┌─────────────────┐
│  Logger App     │ (Query freq, mode, VFO)
│  YAHAML         │
└─────────────────┘

Typical queries:
- GET_FREQ  → 14.245 MHz
- GET_MODE  → USB
- SET_FREQ  → 14.123 (tune rig)
- GET_VFO   → A or B
```

### YAHAML's Hamlib Integration (Already Planned)

```typescript
// /src/hamlib.ts exists; ready to enhance
async function queryRigState(hostname = 'localhost', port = 4532) {
  // Get: frequency, mode, VFO, power level
  // Auto-fill in LogEntry form
  // Validate band from frequency
}
```

---

## Project Structure Recommendations

Comparing FDLog_Enhanced, Hamledger, pycslog:

### FDLog_Enhanced (Monolithic Python)
```
FDLog_Enhanced/
├── FDLog_Enhanced.py          (main app, 320KB)
├── n3fjp_integration.py        (protocol handler)
├── fldigi_integration.py       (digital modes)
├── wsjtx_integration.py        (FT8/FT4)
├── rigctld_integration.py      (rig control)
└── test_*.py                   (unit tests)
```
**Lesson**: Modular integrations as separate files, testable independently.

### Hamledger (Modern TypeScript/Electron)
```
hamledger/
├── src/
│   ├── components/             (Vue components)
│   ├── store/                  (Pinia state)
│   ├── electron/               (IPC handlers)
│   └── integration/            (WSJT-X, Fldigi, Hamlib)
└── tests/
```
**Lesson**: Separate integration logic into dedicated modules.

### YAHAML Current Structure ✅
```
YAHAML/
├── src/
│   ├── index.ts                (API endpoints)
│   ├── hamlib.ts               (rig control)
│   ├── relay.ts                (TCP protocol)
│   ├── udp.ts                  (UDP ingest)
│   └── db.ts                   (Prisma client)
├── ui/                         (React)
├── prisma/schema.prisma        (data model)
└── tests/
```
**Status**: Well-structured; ready for expansion.

---

## Common Pitfalls & How to Avoid Them

| Pitfall | Problem | Solution |
|---------|---------|----------|
| **No dedupe handling** | Duplicate QSOs skew scoring | Implement `dedupeKey` unique constraint early |
| **Single data source** | Misses QSOs from integrated sources | Design ingest abstraction from day 1 |
| **Centralized database** | Lost data if server crashes | Distributed or robust backup strategy |
| **No raw payload storage** | Can't audit/merge conflicting entries | Store `rawPayload` JSON in LogEntry |
| **Monolithic schema** | Can't support contest-specific fields | Use flexible JSON columns or polymorphic design |
| **No time synchronization** | QSOs logged at wrong times | Require NTP, validate against server time |
| **Blocking UI on dupe check** | Slow logging experience | Async dupe check, show "pending dupe check" |
| **No export format** | Locked into app, can't switch later | Implement ADIF export from day 1 |

---

## Standards & Formats Worth Adopting

### 1. **ADIF-3** (Amateur Data Interchange Format)
- Spec: http://adif.org/
- Essential for QSL services, LoTW, eQSL
- YAHAML Action: Implement export endpoint

### 2. **CABRILLO** (.log format)
- Contest submission format
- YAHAML should support export for contests

### 3. **ACLOG Format** (N3FJP Interchange)
- Used by N3FJP and many contest loggers
- YAHAML's TCP relay reads this; ensure round-trip export works

### 4. **Maidenhead Grid Squares**
- 2, 4, 6, or 8 character locator
- Used for QSLing and propagation analysis
- Store in LogEntry if available

---

## Quick Wins for YAHAML (Next Sprint)

1. **Add `merge_status` field** to handle disputed duplicates
2. **Implement ADIF-3 export** endpoint
3. **Add `source_raw_payload` JSON column** for troubleshooting
4. **Validate band from frequency** (integration with Hamlib)
5. **Real-time dupe alerts** (WebSocket or SSE)
6. **Contest/Club-scoped aggregation tables** (hourly stats)
7. **Support CABRILLO export** for contest submission

---

## References

- **FDLog_Enhanced**: https://github.com/scotthibbs/FDLog_Enhanced
  - Distributed contest logging, multi-node sync
  
- **Hamledger**: https://github.com/valibali/hamledger
  - Modern TypeScript/Electron, real-time integrations
  
- **dolphinlog**: https://github.com/xaratustrah/dolphinlog
  - Minimalist ADIF-3 export, SQLite foundation
  
- **pycslog**: https://github.com/neilmb/pycslog
  - Client-server architecture, contest-aware dupe detection
  
- **logXchecker**: https://github.com/ciorceri/logXchecker
  - Contest log validation, ARRL rule enforcement
  
- **ADIF-3 Specification**: http://adif.org/
- **Hamlib Documentation**: https://hamlib.github.io/
- **CABRILLO Format**: http://www.arrl.org/cabrillo

---

## Conclusion

The ham radio logging community has mature, battle-tested solutions for nearly every challenge. By adopting proven patterns—especially around deduplication, multi-source ingest, and data format standards—YAHAML can avoid costly rewrites and deliver a robust, future-proof logger aligned with community expectations.

Our LogEntry model is well-positioned; the next phase should focus on **aggregation**, **real-time updates**, and **standard export formats** to complete a production-grade system.
