# Sprint 5: Phase 5 - Logging Foundation & Upstream Stabilization

**Goal**: Validate all upstream sources (WSJT-X, Fldigi, Hamlib, N3FJP) and establish contest rules before building dependent features.

**Duration**: 3-4 weeks (Feb 1 - Feb 28, 2026)

**Status**: 🎯 IN PROGRESS

**Rationale**: Build critical path first. If WSJT-X format changes or Hamlib is unavailable, we want to know NOW, not after building 10 UI screens that depend on it.

---

## Architecture

### Phase 5 Subsystems

```
Contest Templates
├── Define rules (band/mode restrictions)
├── Exchange fields (validation)
└── Score calculation

Multi-Source Ingest
├── WSJT-X (UDP 2237 listener)
├── Fldigi (XML-RPC client)
├── Hamlib (rigctld TCP queries)
└── N3FJP (TCP relay, finish protocol discovery)

Merge & Conflict Resolution
├── POST /api/logs/merge endpoint
├── Audit trail storage
└── Conflict detection logic

Basic UI for Logging
├── Log entry form with real-time validation
├── WebSocket updates (aggregates, dupes)
└── Source-aware labeling
```

---

## Task Breakdown

### 1. Contest Templates System (3-4 days)

**File**: `src/contest-templates.ts`, database schema

- [ ] 1.1 Define ContestTemplate model
  ```prisma
  model ContestTemplate {
    id                String   @id @default(cuid())
    name              String   @unique
    organization      String       // ARRL, CQ, POTA, SOTA
    description       String?
    website           String?
    
    // Rules
    exchange_fields   Json         // { "state": required, "section": optional }
    mode_restrictions Json?        // { "160m": ["cw"], "40m": ["cw", "ssb"] }
    band_restrictions Json?        // { "digital": ["20m", "40m", "80m"] }
    
    // Scoring
    default_points    Int? @default(1)
    multiplier_field  String?      // e.g., "state" for ARRL FD
    
    createdAt         DateTime  @default(now())
    updatedAt         DateTime  @updatedAt
  }
  ```

- [ ] 1.2 Seed 5 real templates:
  - ARRL Field Day (exchange: section/class)
  - CQ WW DX (exchange: zone)
  - POTA (exchange: park code)
  - SOTA (exchange: summit code)
  - RAG Chewing (no exchange required)

- [ ] 1.3 Contest validation function
  ```typescript
  function validateQSOAgainstTemplate(
    qso: LogEntry,
    template: ContestTemplate
  ): { valid: boolean; errors: string[] }
  ```
  - Check band/mode restrictions
  - Validate exchange fields
  - Return detailed error list

- [ ] 1.4 API endpoints
  - `GET /api/contests/templates` - list all
  - `GET /api/contests/templates/:id` - fetch one
  - `POST /api/contests/templates` - create (admin)

**Acceptance**: Seed templates present, validation catches 10 test QSOs correctly

---

### 2. Multi-Source Ingest Validation (1-2 weeks)

#### 2.1 WSJT-X Integration

**File**: `src/wsjt-x.ts`, `tests/wsjt-x.test.ts`

- [ ] 2.1.1 UDP listener on port 2237
  ```typescript
  const dgram = require('dgram');
  const server = dgram.createSocket('udp4');
  
  server.on('message', (msg) => {
    const data = JSON.parse(msg.toString());
    // logbook_new_entry: { ts, dx_call, freq, mode, rst_sent, rst_rcvd }
  });
  ```

- [ ] 2.1.2 Message parser
  - Parse logbook_new_entry JSON format
  - Extract: call, frequency, mode, time
  - Map to LogEntry schema
  - Handle edge cases (invalid freq, missing mode)

- [ ] 2.1.3 Deduplication
  - Create dedupeKey: `wsjt-x:${dx_call}:${freq}:${mode}:${ts}`
  - Check if entry already exists (manual log + auto-log)
  - Return duplicate alert if found

- [ ] 2.1.4 Unit tests (5-6 tests)
  - Parse valid WSJT-X message
  - Reject invalid frequency/mode
  - Detect duplicates correctly
  - Handle malformed JSON

- [ ] 2.1.5 E2E test with mock WSJT-X
  - Send simulated UDP messages
  - Verify LogEntry created
  - Verify WebSocket broadcast
  - Verify dupe detection works

**Acceptance**: WSJT-X listener working, E2E test passes, 6/6 unit tests green

---

#### 2.2 Fldigi Integration

**File**: `src/fldigi.ts`, `tests/fldigi.test.ts`

- [ ] 2.2.1 XML-RPC client
  ```typescript
  const xmlrpc = require('xmlrpc');
  const client = xmlrpc.createClient({
    host: 'localhost',
    port: 7362,  // Fldigi default
  });
  
  client.methodCall('modem.get_freq', [], callback);
  ```

- [ ] 2.2.2 Query methods
  - Get frequency (modem.get_freq)
  - Get mode (modem.get_mode)
  - Query remote call (if available via RPC)

- [ ] 2.2.3 Test with real Fldigi (if available) or mock
  - Can we connect?
  - Can we query frequency?
  - Does Fldigi support the RPC methods we need?

- [ ] 2.2.4 Integration path
  - When user clicks "Get Rig Settings", query Fldigi
  - Populate frequency, mode in form
  - Show in UI: "From Fldigi"

- [ ] 2.2.5 Tests (4-5)
  - Mock Fldigi responses
  - Parse frequency/mode correctly
  - Handle connection failures
  - Map mode codes to standard modes (CW, SSB, FT8)

**Acceptance**: Fldigi integration tested, connection path documented, blockers identified

---

#### 2.3 Hamlib Integration

**File**: `src/hamlib.ts` (existing, expand), `tests/hamlib.test.ts` (expand)

- [ ] 2.3.1 Rigctld queries
  - Frequency query: `f\n` → "14074500\n"
  - Mode query: `m\n` → "AM\n" or "CW\n"
  - VFO query: `v\n` → "VFOA\n"

- [ ] 2.3.2 Frequency → Band mapping
  ```typescript
  function freqToBand(freq: number): string {
    // 7000-7300 → 40m
    // 14000-14350 → 20m
    // etc.
  }
  ```

- [ ] 2.3.3 Mode standardization
  - Hamlib modes: USB, LSB, CW, AM, FM, FT8
  - Map to standard: SSB (USB/LSB), CW, FT8, etc.

- [ ] 2.3.4 Contest mode validation
  - Given band + template, get allowed modes
  - Warn if current mode violates rules
  - Show in UI: "Band: 40m, Mode: CW ✓" or "Mode: SSB ✗ (not allowed)"

- [ ] 2.3.5 Tests (6-7)
  - Frequency to band mapping (10 scenarios)
  - Mode standardization
  - Band/mode restrictions check
  - Handle rigctld connection failures

**Acceptance**: Hamlib queries work, band/mode validation accurate, E2E test with mock rig

---

#### 2.4 N3FJP Relay (Finish Protocol Discovery)

**File**: `src/n3fjp-relay.ts` (existing, expand), `tests/n3fjp-relay.e2e.test.ts` (existing)

- [ ] 2.4.1 Complete protocol analysis
  - Confirm message format (UTF-16LE, length prefix)
  - Test all message types: BAMS, NTWK, WHO, SCLK, MESG
  - Verify server-mode behavior (listen only vs bidirectional)

- [ ] 2.4.2 TRANSACTION ACK implementation (existing, verify)
  - Confirm server responds to NTWK TRANSACTION
  - Test QSO submission via N3FJP
  - Verify timeout behavior

- [ ] 2.4.3 Mapping N3FJP QSO fields to LogEntry
  - Extract callsign, frequency, mode, time, exchange
  - Create dedupeKey for N3FJP source
  - Handle XML XMLDATA parsing

- [ ] 2.4.4 Tests (3-4)
  - Connect to real N3FJP server (if available)
  - Submit QSO and verify ACK
  - Parse response correctly
  - Document any protocol quirks

**Acceptance**: N3FJP relay stable, protocol quirks documented, E2E test passes

---

### 3. Merge & Conflict Resolution (2-3 days)

**File**: `src/index.ts` (POST /api/logs/merge), `tests/logs-merge.test.ts` (existing, expand)

- [ ] 3.1 Merge endpoint
  ```typescript
  POST /api/logs/merge
  {
    primary_id: "cuid1",
    duplicate_ids: ["cuid2", "cuid3"],
    reason: "auto_detected" | "manual_review"
  }
  ```

- [ ] 3.2 Merge operation
  - Update all duplicates: merge_status = "duplicate_of"
  - Set merged_into_id = primary_id
  - Record merge_timestamp and merge_reason
  - Keep raw payloads (audit trail)

- [ ] 3.3 Conflict detection logic
  - On new LogEntry: check for same callsign + band + mode + time (within ±5min)
  - Auto-detect duplicates from different sources (WSJT-X + manual)
  - Broadcast conflict alert to UI

- [ ] 3.4 API for conflict history
  - `GET /api/logs/conflicts?contestId=xxx` - list all merges
  - Queryable audit trail

- [ ] 3.5 Tests (3-4)
  - Merge two entries correctly
  - Keep both raw payloads
  - Prevent merging primary entries
  - Conflict detection finds similar entries

**Acceptance**: Merge endpoint working, conflict detection accurate, 4/4 tests pass

---

### 4. Basic UI for Logging (3-4 days)

**File**: `ui/src/pages/LoggingPage.tsx` (new), `ui/src/components/LogEntryForm.tsx` (new)

- [ ] 4.1 Log entry form
  - Callsign, frequency, mode, time, exchange
  - Get current values from Hamlib (if available)
  - Show band/mode restrictions from template
  - Real-time validation against contest rules

- [ ] 4.2 WebSocket integration
  - Listen to `logEntry:created` events
  - Show feedback: "QSO logged ✓"
  - Listen to `dupe:detected` alerts
  - Show warning: "Duplicate of W5XYZ on 40m CW at 1234Z"

- [ ] 4.3 Source indicator
  - If from WSJT-X: "From WSJT-X (auto)"
  - If from Fldigi: "From Fldigi (auto)"
  - If manual: "Manual entry"
  - Link to raw payload for audit

- [ ] 4.4 Real-time feedback
  - Show aggregates updating: "+1 QSO, 15 total"
  - Live band occupancy (mini chart)
  - Operator stats (scoreboard update)

- [ ] 4.5 Simple styling (no fancy design)
  - Just functional, readable
  - Dark mode support
  - Mobile responsive

**Acceptance**: Form works end-to-end, logs QSO, shows real-time updates, 3-4 E2E tests pass

---

## Effort Summary

| Task | Effort |
|------|--------|
| Contest Templates | 3-4 days |
| WSJT-X Integration | 2-3 days |
| Fldigi Integration | 2-3 days |
| Hamlib Integration | 2-3 days |
| N3FJP Relay (finish) | 1-2 days |
| Merge & Conflict Resolution | 2-3 days |
| Basic UI for Logging | 3-4 days |
| Testing & Integration | 3-4 days |
| **Total** | **~3-4 weeks** |

---

## Success Criteria

- ✅ Contest templates system fully working with 5 real templates
- ✅ WSJT-X listener validates against real-world messages
- ✅ Fldigi integration tested (or blockers documented)
- ✅ Hamlib band/mode validation accurate
- ✅ N3FJP relay protocol complete (server-mode behavior documented)
- ✅ Merge endpoint working with conflict detection
- ✅ Basic UI logs QSO end-to-end with real-time updates
- ✅ All new code tested (unit + E2E)
- ✅ Zero upstream surprises—all integrations validated before Phase 6

---

## Risks & Mitigations

**Risk**: WSJT-X UDP format changes between versions
- **Mitigation**: Test with v2.5.0+, document message format, add version check

**Risk**: Fldigi XML-RPC not available or unreliable
- **Mitigation**: Test early, provide fallback (manual entry), document setup

**Risk**: Hamlib unavailable or rig not supported
- **Mitigation**: Test with IC-7300 first, provide manual frequency entry fallback

**Risk**: N3FJP protocol quirks not fully understood
- **Mitigation**: Complete protocol discovery before depending on relay

**Risk**: Contest rules too complex to model
- **Mitigation**: Start with 5 templates, iterate—don't try to support all contests at once

---

## Dependencies

- Existing: LogEntry, LogAggregate, WebSocket infrastructure
- New: Contest templates schema, multi-source parsers, merge logic
- External: WSJT-X, Fldigi, Hamlib rigctld, N3FJP server (optional)

---

## What Success Looks Like at the End of Phase 5

1. User logs into YAHAML
2. Selects ARRL Field Day contest
3. WSJT-X auto-logs FT8 QSO → appears in YAHAML (with "From WSJT-X" label)
4. User manually enters SSB QSO → form validates band/mode per contest rules
5. User opens Fldigi, clicks "Get Rig Settings" → form auto-fills frequency/mode
6. System detects duplicate (same call, band, mode, time) → shows alert
7. Real-time aggregates update: "+1 QSO, 42 total" with band breakdown
8. Export to CABRILLO → submits to ARRL

**Everything validated. Zero unknowns about upstream sources. Ready for Phase 6 (UI enhancements).**
