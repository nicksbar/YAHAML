# N3FJP Protocol Implementation - Code Fixes & Improvements

## Issues Found & Solutions (Updated from MITM Capture Analysis)

### 1. ✅ UTF-16 LE Encoding (Already Implemented)
**Status**: `src/relay.ts` already has `decodeMessage()` and `_encodeMessage()` functions
**What works**: 
- Message framing with BOR/EOR bytes
- UTF-16LE decoding
- BAMS parsing for station/band/mode

**What needs improvement**:
- `encodeMessage()` marked with `// @ts-ignore` - should activate for responses
- Should send config in handshake response

### 2. ⚠️ Contest Configuration - Not Fully Utilized
**Current State**: Schema supports `bandSelection` and `modeSelection` as JSON strings, but:
- Not parsed or validated in relay/API
- No migration to populate database
- No UI to configure per-contest
- No dynamic filtering in client

**Key Finding from Protocol Analysis**: 
- Protocol is **contest-agnostic** (no contest ID in messages)
- Don't hard-code contest apps - use configuration instead
- Same N3FJP protocol works for Field Day, VHF, HF contests
- Just change bandSelection/modeSelection JSON per contest

### 3. ⚠️ Band Activity Logging - Missing Validation
**Current State**: `src/relay.ts` logs any band/mode without validation

**Fix Needed**:
- Validate band/mode against current contest configuration
- Flag invalid combinations in logs (but still log them)
- Return valid options to client for UI filtering

### 4. ⚠️ Client Handshake - Missing Configuration Exchange
**Current State**: Client connects, server just echoes messages back

**Should Be**: 
- Client sends initial NTWK message
- Server responds with NTWK/CONTEST-CONFIG containing:
  - Contest name
  - Allowed bands (JSON array)
  - Allowed modes (JSON array)
  - Other contest constraints

### 5. ⚠️ Message Type Handling - Incomplete
**Current State**: Only BAMS and basic NTWK messages parsed

**Not Yet Handled**:
- NTWK/TRANSACTION messages (CLEAR, LIST)
- WHO/EOR operator roster messages  
- Large transaction messages (1600+ bytes with QSO data)

---

## Code Review: YAHAML Architecture vs. Industry Patterns

## Overview

This document maps YAHAML's current implementation against proven patterns from FDLog_Enhanced, Hamledger, and other leading ham radio loggers. Specific code recommendations follow.

---

## Current State Assessment ✅

### What We're Doing Well

**1. Unified Data Model (LogEntry)**
```prisma
model LogEntry {
  stationId         String
  callsign          String
  band              String
  mode              String
  qsoDate           DateTime
  qsoTime           String
  
  // Context awareness (ahead of many loggers)
  contestId         String?
  clubId            String?
  operatorCallsign  String?
  
  // Dedup support (FDLog pattern)
  source            String
  dedupeKey         String @unique
  rawPayload        Json?
}
```
✅ This matches FDLog_Enhanced's approach and is ahead of basic loggers.

**2. Multi-Source Ingest**
- TCP relay (N3FJP-compatible) ✅
- UDP broadcast listener ✅
- UI form entry ✅
- Hamlib integration (placeholder) ✅

**3. Deduplication Logic**
```typescript
const resolvedDedupeKey = dedupeKey || buildDedupeKey({
  stationCall: station?.callsign || stationId,
  callsign,
  band,
  mode,
  qsoDate: new Date(qsoDate),
  qsoTime,
  contestId,
  clubId,
});
```
✅ Mode-aware, contest-aware, club-aware dedup.

---

## Gaps vs. Industry Standards

### Gap 1: No Export Formats
**What FDLog_Enhanced does**:
```python
# Export CABRILLO
def export_cabrillo(log_entries, contest_rules):
    # Format for ARRL submission

# Export ADIF
def export_adif(log_entries):
    # Format for eQSL/LoTW
```

**YAHAML**: No export endpoints exist.

**Recommendation**: Implement by Phase 3 (ADIF-3 first, CABRILLO second).

---

### Gap 2: No Conflict/Merge Handling
**What we need**:
```prisma
model LogEntry {
  // Existing fields...
  
  // New: conflict resolution
  merge_status      String? @default("primary")
  merged_into_id    BigInt?
  merge_reason      String?
  merge_timestamp   DateTime?
  
  @@index([merge_status])
  @@index([merged_into_id])
}
```

**Why**: When same QSO entered manually + imported from TCP + WSJT-X, we need audit trail.

---

### Gap 3: No Aggregation Tables
**What FDLog_Enhanced does**:
```
Real-time scoreboard:
- Total contacts
- Contacts per operator
- Dupe count
- Contacts per band
- Score estimate

Result: Instant UI updates, no DB scan required.
```

**YAHAML**: LogEntry only; UI must scan entire table for stats.

**Recommendation**: Add LogAggregate model, update on entry create.

---

### Gap 4: No Real-Time Push
**What Hamledger does**:
```javascript
// When QSO logged anywhere, all clients know instantly
socket.emit('qso:logged', { qsoData, timestamp });
```

**YAHAML**: UI polls every 2 seconds.

**Recommendation**: Add WebSocket or Server-Sent Events (SSE).

---

## Code Recommendations

### Priority 1: Add Merge Status Support

**File**: `/prisma/schema.prisma`

```prisma
model LogEntry {
  id                BigInt    @id @default(autoincrement())
  stationId         String
  callsign          String
  band              String
  mode              String
  qsoDate           DateTime
  qsoTime           String
  contestId         String?
  clubId            String?
  operatorCallsign  String?
  source            String    @default("ui-manual")
  dedupeKey         String    @unique
  rawPayload        Json?
  
  // NEW: Merge tracking
  merge_status      String    @default("primary")   // primary | duplicate_of | merged
  merged_into_id    BigInt?   @relation("MergedInto")
  merge_reason      String?   // e.g., "auto-merged with TCP relay entry"
  merge_timestamp   DateTime?
  merge_actor_id    String?   // User who performed merge (future)
  
  // Self-references for merge chains
  merged_from       LogEntry? @relation("MergedInto", fields: [merged_into_id], references: [id])
  merges            LogEntry[] @relation("MergedInto")  // Entries merged into this one
  
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  
  // Indexes
  @@unique([dedupeKey])
  @@index([stationId])
  @@index([contestId])
  @@index([clubId])
  @@index([merge_status])    // NEW
  @@index([merged_into_id])  // NEW
  @@index([qsoDate])
  @@index([source])
}
```

**Migration**: `npx prisma migrate dev --name add-merge-status-tracking`

---

### Priority 2: Add Merge API Endpoint

**File**: `/src/index.ts`

```typescript
// POST /api/logs/merge
// Merge duplicate entries and audit
app.post('/api/logs/merge', async (req, res) => {
  try {
    const {
      primary_id,        // The entry to keep
      duplicate_ids,     // IDs of entries to mark as duplicates
      merge_reason,      // e.g., "manual dedupe", "auto-merge from TCP"
      keep_raw_payloads, // Store originals for audit
    } = req.body;

    if (!primary_id || !duplicate_ids?.length) {
      return res.status(400).json({ error: 'Invalid merge request' });
    }

    // Transaction: update all entries atomically
    const result = await prisma.$transaction(
      duplicate_ids.map(dup_id =>
        prisma.logEntry.update({
          where: { id: dup_id },
          data: {
            merge_status: 'duplicate_of',
            merged_into_id: primary_id,
            merge_reason,
            merge_timestamp: new Date(),
            // Optionally preserve raw payload for audit
            rawPayload: keep_raw_payloads
              ? {
                  ...JSON.parse((await prisma.logEntry.findUnique({
                    where: { id: dup_id },
                  })).rawPayload || '{}'),
                  pre_merge_timestamp: new Date().toISOString(),
                }
              : null,
          },
        })
      )
    );

    return res.json({
      success: true,
      primary_id,
      merged_count: result.length,
    });
  } catch (error) {
    return res.status(500).json({ error: 'Merge failed', details: error.message });
  }
});
```

---

### Priority 3: ADIF-3 Export Endpoint

**File**: `/src/index.ts` or new `/src/export.ts`

```typescript
import { LogEntry } from '@prisma/client';

interface AdifField {
  field: string;
  value: string | number;
}

function buildAdifRecord(log: LogEntry): AdifField[] {
  const fields: AdifField[] = [
    // Mandatory (eQSL minimum)
    { field: 'QSO_DATE', value: log.qsoDate.toISOString().slice(0, 10).replace(/-/g, '') },
    { field: 'TIME_ON', value: log.qsoTime.padEnd(6, '0') },
    { field: 'CALL', value: log.callsign },
    { field: 'MODE', value: log.mode },
    { field: 'BAND', value: log.band },
    
    // Recommended
    { field: 'OPERATOR', value: log.operatorCallsign || 'UNKNOWN' },
    { field: 'STATION_CALLSIGN', value: log.stationId },
    
    // YAHAML extensions
    { field: 'CONTEST_ID', value: log.contestId || '' },
    { field: 'SOURCE', value: log.source },
  ];
  
  // Filter out empty values
  return fields.filter(f => f.value !== '' && f.value !== null);
}

function formatAdif(fields: AdifField[]): string {
  return fields.map(f => {
    const fieldStr = f.field;
    const valueStr = String(f.value);
    const len = valueStr.length;
    return `<${fieldStr}:${len}>${valueStr}`;
  }).join('');
}

// Endpoint: GET /api/export/adif?contestId=xxx&format=3
app.get('/api/export/adif', async (req, res) => {
  try {
    const { contestId } = req.query;

    if (!contestId) {
      return res.status(400).json({ error: 'contestId required' });
    }

    // Fetch all primary (non-merged) entries
    const entries = await prisma.logEntry.findMany({
      where: {
        contestId: String(contestId),
        merge_status: 'primary', // Only export primary entries
      },
      orderBy: { qsoDate: 'asc' },
    });

    // Generate ADIF
    const adifRecords = entries.map(buildAdifRecord);
    const adifBody = adifRecords.map(fields => formatAdif(fields) + '\n').join('');
    
    // Add header
    const header = '<ADIF_VER:5>3.1.0<PROGRAMID:6>YAHAML<EOH>\n';
    const adifContent = header + adifBody + '<EOR>\n';

    // Return as file download
    res.setHeader('Content-Type', 'application/x-adi');
    res.setHeader('Content-Disposition', `attachment; filename="yahaml-${contestId}-${Date.now()}.adi"`);
    res.send(adifContent);
  } catch (error) {
    return res.status(500).json({ error: 'Export failed', details: error.message });
  }
});
```

---

### Priority 4: Aggregation Table

**File**: `/prisma/schema.prisma`

```prisma
model LogAggregate {
  id              String   @id @default(cuid())
  contestId       String   @db.VarChar(255)
  clubId          String?  @db.VarChar(255)
  periodStart     DateTime // Hourly bucket: YYYY-MM-DD HH:00:00
  
  // Counters
  totalQsos       Int      @default(0)
  totalDupes      Int      @default(0)
  cwContacts      Int      @default(0)
  ssbContacts     Int      @default(0)
  ftxContacts     Int      @default(0)  // FT8, FT4, JS8Call, etc.
  
  // Breakdowns (JSON for flexibility)
  bandBreakdown   Json? // { "160m": 5, "80m": 12, "40m": 45, ... }
  modeBreakdown   Json? // { "CW": 30, "SSB": 45, "FT8": 22, ... }
  operatorStats   Json? // { "W5XYZ": 30, "N0ABC": 28, ... }
  
  // Metadata
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  
  // Constraints
  @@unique([contestId, clubId, periodStart])
  @@index([contestId, periodStart])
  @@index([createdAt])
}
```

**Trigger Logic** (in Node.js, not SQL):

```typescript
// Function: call on every LogEntry.create
async function updateLogAggregate(entry: LogEntry) {
  const periodStart = new Date(entry.qsoDate);
  periodStart.setMinutes(0, 0, 0); // Round to hour
  
  const aggregate = await prisma.logAggregate.upsert({
    where: {
      contestId_clubId_periodStart: {
        contestId: entry.contestId || 'default',
        clubId: entry.clubId || null,
        periodStart,
      },
    },
    update: {
      totalQsos: { increment: entry.merge_status === 'primary' ? 1 : 0 },
      totalDupes: { increment: entry.dedupeKey && await checkIsDupe(entry) ? 1 : 0 },
      cwContacts: { increment: entry.mode === 'CW' ? 1 : 0 },
      ssbContacts: { increment: entry.mode === 'SSB' ? 1 : 0 },
      ftxContacts: { increment: ['FT8', 'FT4', 'JS8'].includes(entry.mode) ? 1 : 0 },
    },
    create: {
      contestId: entry.contestId || 'default',
      clubId: entry.clubId,
      periodStart,
      totalQsos: 1,
      totalDupes: 0,
      cwContacts: entry.mode === 'CW' ? 1 : 0,
      ssbContacts: entry.mode === 'SSB' ? 1 : 0,
      ftxContacts: ['FT8', 'FT4', 'JS8'].includes(entry.mode) ? 1 : 0,
    },
  });
  
  return aggregate;
}

// Call after LogEntry.create in API:
app.post('/api/qso-logs', async (req, res) => {
  // ... existing creation logic ...
  
  const created = await prisma.logEntry.create({ data: { /* ... */ } });
  
  // NEW: Update aggregates
  await updateLogAggregate(created);
  
  return res.json(created);
});
```

---

### Priority 5: Real-Time Scoreboard Endpoint

**File**: `/src/index.ts`

```typescript
// GET /api/stats/scoreboard?contestId=xxx
app.get('/api/stats/scoreboard', async (req, res) => {
  try {
    const { contestId } = req.query;

    if (!contestId) {
      return res.status(400).json({ error: 'contestId required' });
    }

    const aggregates = await prisma.logAggregate.findMany({
      where: {
        contestId: String(contestId),
      },
      orderBy: { periodStart: 'desc' },
      take: 1, // Latest period only
    });

    if (!aggregates.length) {
      return res.json({
        contest: contestId,
        totalQsos: 0,
        totalDupes: 0,
        breakdown: {},
      });
    }

    const latest = aggregates[0];

    return res.json({
      contest: contestId,
      period: latest.periodStart,
      totalQsos: latest.totalQsos,
      totalDupes: latest.totalDupes,
      breakdown: {
        byMode: latest.modeBreakdown || {},
        byBand: latest.bandBreakdown || {},
        byOperator: latest.operatorStats || {},
      },
      details: {
        cw: latest.cwContacts,
        ssb: latest.ssbContacts,
        digital: latest.ftxContacts,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: 'Failed to fetch scoreboard' });
  }
});
```

---

### Priority 6: Real-Time Event Stream (SSE)

**File**: `/src/index.ts`

```typescript
import { EventEmitter } from 'events';

const logEventEmitter = new EventEmitter();

// Endpoint: GET /api/logs/stream?contestId=xxx
app.get('/api/logs/stream', (req, res) => {
  const { contestId } = req.query;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.write(':\n\n'); // Send initial comment to open stream

  const handler = (entry) => {
    if (!contestId || entry.contestId === contestId) {
      res.write(`data: ${JSON.stringify(entry)}\n\n`);
    }
  };

  logEventEmitter.on('logEntry:created', handler);

  res.on('close', () => {
    logEventEmitter.removeListener('logEntry:created', handler);
  });
});

// Emit on every LogEntry.create:
app.post('/api/qso-logs', async (req, res) => {
  // ... creation logic ...
  
  const created = await prisma.logEntry.create({ data: { /* ... */ } });
  
  // NEW: Emit event
  logEventEmitter.emit('logEntry:created', created);
  
  // NEW: Update aggregates
  await updateLogAggregate(created);
  
  return res.json(created);
});
```

**React Hook** (`ui/src/hooks/useLogStream.ts`):

```typescript
import { useEffect, useCallback } from 'react';

export function useLogStream(contestId, onEntry) {
  useEffect(() => {
    if (!contestId) return;

    const eventSource = new EventSource(`/api/logs/stream?contestId=${contestId}`);

    eventSource.onmessage = (event) => {
      try {
        const entry = JSON.parse(event.data);
        onEntry(entry);
      } catch (e) {
        console.error('Failed to parse log entry', e);
      }
    };

    eventSource.onerror = () => {
      console.error('SSE stream error');
      eventSource.close();
    };

    return () => eventSource.close();
  }, [contestId, onEntry]);
}

// Usage in component:
const [logs, setLogs] = useState([]);

useLogStream(contestId, (newEntry) => {
  setLogs(prev => [newEntry, ...prev]);
  // Update scoreboard, dupe alert, etc.
});
```

---

## Summary Table: Code Additions Needed

| Feature | File | LOC | Priority | Owner |
|---------|------|-----|----------|-------|
| Merge status tracking | schema.prisma | 10 | P1 | Backend |
| Merge API | src/index.ts | 40 | P1 | Backend |
| ADIF export | src/export.ts | 80 | P2 | Backend |
| LogAggregate table | schema.prisma | 20 | P2 | Backend |
| Aggregate updates | src/index.ts | 50 | P2 | Backend |
| Scoreboard API | src/index.ts | 30 | P2 | Backend |
| SSE stream | src/index.ts | 30 | P3 | Backend |
| useLogStream hook | ui/src/hooks/ | 40 | P3 | Frontend |

**Total estimated effort**: ~3-4 weeks for full implementation.

---

## Quick Start: Immediate Actions

### This Week
1. ✅ **Run Prisma migration** to test new schema in dev
   ```bash
   npx prisma migrate dev --name add-merge-status
   ```

2. ✅ **Review dedupeKey algorithm** in UDP ingest
   - Ensure mode is included (not just band)
   - Ensure contest/club scoping is correct

3. ✅ **Document** export format requirements (ADIF-3 spec)

### Next Week
1. Implement `/api/logs/merge` endpoint
2. Add ADIF-3 export endpoint
3. Write tests for merge + export

### Week 3
1. Add LogAggregate table + triggers
2. Add scoreboard API
3. Wire up UI scoreboard component

---

## Reference: Community Code Examples

**FDLog_Enhanced**: https://github.com/scotthibbs/FDLog_Enhanced
- `share_fdlog.py`: Distributed sync logic
- `n3fjp_integration.py`: TCP ingest pattern

**Hamledger**: https://github.com/valibali/hamledger
- `src/integration/`: WSJT-X, Hamlib, Fldigi handlers

**dolphinlog**: https://github.com/xaratustrah/dolphinlog
- ADIF export format + field mapping

---

**Document Version**: 1.0 | Last Updated: 2026-01-31

---

## N3FJP Protocol Implementation - Critical Fixes

Based on MITM relay capture and protocol analysis, implement these changes:

### Priority 1: Contest Configuration Support

**Create `src/contest-config.ts`**:
```typescript
import prisma from './db';

export async function getContestConfig(contestId?: string) {
  if (!contestId) {
    return {
      bands: ['160', '80', '40', '20', '15', '10', '6', '2', '70cm'],
      modes: ['CW', 'DIG', 'PH'],
    };
  }
  
  const contest = await prisma.contest.findUnique({
    where: { id: contestId },
  });
  
  return {
    bands: contest?.bandSelection ? JSON.parse(contest.bandSelection) : [],
    modes: contest?.modeSelection ? JSON.parse(contest.modeSelection) : [],
  };
}

export function validateBandMode(band: string, mode: string, config: any): boolean {
  return config.bands.includes(band) && config.modes.includes(mode);
}
```

**Update `src/relay.ts`** - Enable encoding and add validation:
- Uncomment `encodeMessage()` (remove @ts-ignore)
- Call when sending config responses
- Add `validateBandMode()` in BAMS handler
- Log warnings for invalid combinations

**Update `src/index.ts`** - Add endpoints:
```typescript
app.get('/api/contests/:contestId/config', async (req, res) => {
  const config = await getContestConfig(req.params.contestId);
  res.json(config);
});

app.get('/api/stations/band-config', async (req, res) => {
  const contest = await prisma.contest.findFirst({
    where: { isActive: true },
  });
  const config = await getContestConfig(contest?.id);
  res.json(config);
});
```

**Update `ui/src/App.tsx`** - Dynamic bands/modes:
```typescript
const [validBands, setValidBands] = useState<string[]>([]);
const [validModes, setValidModes] = useState<string[]>([]);

useEffect(() => {
  fetch('/api/stations/band-config')
    .then(r => r.json())
    .then(data => {
      setValidBands(data.bands);
      setValidModes(data.modes);
    });
}, []);

// Use validBands/validModes in dropdowns instead of hardcoded arrays
```

### Priority 2: Database Seeding

**Update `prisma/seed.ts`**:
```typescript
await prisma.contest.upsert({
  where: { name: 'Field Day 2026' },
  update: {},
  create: {
    name: 'Field Day 2026',
    bandSelection: JSON.stringify(['160', '80', '40', '20', '15', '10', '6', '2', '70cm']),
    modeSelection: JSON.stringify(['CW', 'DIG', 'PH']),
  },
});
```

### Implementation Summary

| File | Changes | LOC | Time |
|------|---------|-----|------|
| `src/contest-config.ts` | CREATE | 40 | 30m |
| `src/relay.ts` | Enable encoding, validate | 25 | 30m |
| `src/index.ts` | Add endpoints | 35 | 20m |
| `ui/src/App.tsx` | Dynamic config | 15 | 20m |
| `prisma/seed.ts` | Add config | 15 | 10m |
| **Total** | | **130** | **2-3h** |

### Key Benefits

✅ Contest-agnostic protocol - same N3FJP code for all contests  
✅ No app detection needed - just use database configuration  
✅ Dynamic UI - band/mode dropdowns update per contest  
✅ Easy contest switching - no code changes needed  
✅ Invalid entries flagged - but still logged for diagnostics  

