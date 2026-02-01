# Sprint 3 Planning: Standard Export Formats (Phase 3)

**Duration**: 2 weeks (Feb 17-Mar 2, 2026)  
**Goal**: Enable data portability via ADIF-3, CABRILLO, and reverse-log exports  
**Status**: 🚀 Ready to implement

---

## Sprint Overview

### What We're Building
Contest loggers need three standard export formats:
1. **ADIF-3**: Universal QSO format (eQSL, LoTW compatible)
2. **CABRILLO**: Contest submission format (ARRL/CQ standard)
3. **Reverse-Log**: QSOs with specific station (FDLog pattern)

### Why It Matters
- **Portability**: Users can switch loggers without losing data
- **Interoperability**: Exchange logs with other operators (reverse-log)
- **Compliance**: Contest submission requires CABRILLO format
- **Community standard**: Every serious ham logger implements this

---

## Sprint Goal

**Primary Objective**: Users can export contest logs in standard formats

**Success Criteria**:
- ✅ ADIF-3 export includes all required fields (QSO_DATE, TIME_ON, CALL, MODE, BAND, etc.)
- ✅ CABRILLO export validates mode/band combinations per contest rules
- ✅ Reverse-log export provides audit trail for QSL coordination
- ✅ All exports only include primary entries (not merged duplicates)
- ✅ Export endpoints return proper MIME types and filenames
- ✅ Unit tests cover all export scenarios
- ✅ Documentation includes example export files

---

## Tasks (Kanban)

### Week 1: ADIF-3 & Infrastructure

#### Task 1.1: Export Module & ADIF-3 Endpoint [🔴 NOT STARTED]
**Owner**: Backend  
**Effort**: 4 hours  
**Acceptance Criteria**:
- [ ] Create `/src/export.ts` module with export utilities
- [ ] Implement `GET /api/export/adif?contestId=xxx`
- [ ] Return `*.adi` file with proper MIME type (`application/x-adi`)
- [ ] Include header: `<ADIF_VER:5>3.1.0<PROGRAMID:6>YAHAML<EOH>`
- [ ] Support both ADIF 2.2 and 3.1 via `?format=2` or `?format=3`
- [ ] Filter only primary entries (merge_status IS NULL or 'primary')
- [ ] Map fields:
  - **Mandatory**: QSO_DATE, TIME_ON, CALL, MODE, BAND
  - **Recommended**: FREQ, RST_SENT, RST_RCVD, OPERATOR, STATION_CALLSIGN
  - **YAHAML**: CONTEST_ID, SOURCE, MERGE_STATUS (if not primary)

**Key Implementation Details**:
```typescript
// ADIF record format: <FIELDNAME:LENGTH>VALUE
// Example: <QSO_DATE:8>20260131<TIME_ON:6>150000<CALL:5>W5ABC

// Field mapping from LogEntry:
- qsoDate → QSO_DATE (YYYYMMDD format)
- qsoTime → TIME_ON (HHMMSS format, pad with 0)
- callsign → CALL
- mode → MODE (SSB, CW, FT8, etc.)
- band → BAND (40, 20m, etc. - normalize)
- frequency → FREQ (MHz, optional)
- rstSent → RST_SENT (599, 599, etc.)
- rstRcvd → RST_RCVD
- operatorCallsign → OPERATOR
- stationId → STATION_CALLSIGN
- contestId → CONTEST_ID
- source → SOURCE (tcp-relay, wsjt-x, ui-manual, etc.)
```

---

#### Task 1.2: ADIF Export Tests [🔴 NOT STARTED]
**Owner**: Backend  
**Effort**: 2.5 hours  
**Acceptance Criteria**:
- [ ] Create `/tests/export-adif.test.ts`
- [ ] Test successful export with multiple entries
- [ ] Test ADIF 2.2 vs 3.1 format differences
- [ ] Test empty contest (no QSOs)
- [ ] Test missing contestId parameter (400 error)
- [ ] Test non-existent contestId (404 error)
- [ ] Test proper file download headers
- [ ] Verify merged entries are excluded from export
- [ ] Test all required fields present in output
- [ ] Verify ADIF syntax correctness (angle brackets, lengths)

**Test Scenarios**:
```typescript
// Scenario 1: Multiple QSOs from different sources
// Expected: All merged into primary, only primary exported

// Scenario 2: Invalid contest ID
// Expected: 404 error

// Scenario 3: Format parameter variations
// Expected: ADIF 2.2 vs 3.1 field differences respected

// Scenario 4: File download
// Expected: Correct Content-Type and Content-Disposition headers
```

---

### Week 2: CABRILLO & Reverse-Log

#### Task 2.1: CABRILLO Export Endpoint [🔴 NOT STARTED]
**Owner**: Backend  
**Effort**: 4 hours  
**Acceptance Criteria**:
- [ ] Implement `GET /api/export/cabrillo?contestId=xxx`
- [ ] Return `*.log` file with MIME type `text/plain`
- [ ] Include CABRILLO header (START-OF-LOG: 3A, contest name, callsign, etc.)
- [ ] Validate mode/band combinations per contest rules
- [ ] Enforce score calculation per contest rules
- [ ] Only include primary entries
- [ ] Support contest-specific exchange formats
- [ ] Calculate scores on export

**CABRILLO Header Format**:
```
START-OF-LOG: 3A
CALLSIGN: W5ABC
CONTEST: CQ-WW-DX
CATEGORY-ASSISTED: NON-ASSISTED
CATEGORY-BAND: 40M
CATEGORY-MODE: SSB
CATEGORY-OPERATOR: SINGLE-OP
CATEGORY-POWER: LOW
CATEGORY-STATION: FIXED
LOCATION: TEXAS
[... other metadata ...]
SOAPBOX: Built with YAHAML
END-OF-LOG:
```

**QSO Line Format** (contest-specific, example ARRL Field Day):
```
QSO: 7025 PH 20260131 1500 W5ABC         599 #1      W0XYZ         599 K
     FREQ MODE DATE    TIME SENT-CALL RST SEND-EXC RCVD-CALL RST RCVD-EXC
```

**Implementation Strategy**:
- Look up contest rules from `contestTemplate`
- Extract `cabrillloExchange` field to determine line format
- Apply exchange validation rules
- Calculate points based on multiplier rules
- Filter only primary entries

---

#### Task 2.2: CABRILLO Export Tests [🔴 NOT STARTED]
**Owner**: Backend  
**Effort**: 2.5 hours  
**Acceptance Criteria**:
- [ ] Create `/tests/export-cabrillo.test.ts`
- [ ] Test successful CABRILLO export
- [ ] Test CABRILLO header validation
- [ ] Test QSO line format per contest type
- [ ] Test exchange field ordering
- [ ] Test score calculation correctness
- [ ] Test validation errors (invalid mode/band combos)
- [ ] Test missing contestId (400 error)
- [ ] Test non-existent contestId (404 error)
- [ ] Verify merged entries excluded
- [ ] Verify file download headers

**Test Scenarios**:
```typescript
// Scenario 1: ARRL Field Day export
// Expected: Mode='SSB' or 'CW', Band must be 80M-10M, proper exchange

// Scenario 2: CQ WW DX export
// Expected: Score calculations with multiplier rules, RST validation

// Scenario 3: Invalid contest type
// Expected: 400 error with validation message

// Scenario 4: Mixed entry sources (TCP, WSJT-X, manual)
// Expected: Only primary entries, score reflects source accuracy
```

---

#### Task 2.3: Reverse-Log Endpoint [🔴 NOT STARTED]
**Owner**: Backend  
**Effort**: 2.5 hours  
**Acceptance Criteria**:
- [ ] Implement `GET /api/export/reverse-log?contestId=xxx&remote_call=W5ABC`
- [ ] Return CABRILLO format of all QSOs with specified station
- [ ] Useful for QSL coordination, dispute resolution
- [ ] Include merge history in comments (audit trail)
- [ ] Order by date/time for easy correlation
- [ ] Filter only primary entries where callsign=remote_call

**Use Case**: Operator W5ABC wants to verify QSOs with W0XYZ:
```
GET /api/export/reverse-log?contestId=arrl-field-day-2026&remote_call=W5ABC
Returns: All QSOs in the log where callsign='W5ABC', in CABRILLO format
```

**Implementation Strategy**:
- Query LogEntry where `callsign='remote_call'` AND `contestId=xxx`
- Format as CABRILLO
- Include source information (tcp-relay vs manual vs WSJT-X)
- Add comment lines for audit trail if entry was merged

---

#### Task 2.4: Integration & Documentation [🔴 NOT STARTED]
**Owner**: Backend  
**Effort**: 1.5 hours  
**Acceptance Criteria**:
- [ ] Update API documentation with export endpoints
- [ ] Add example ADIF-3 and CABRILLO files to `/docs`
- [ ] Create export troubleshooting guide
- [ ] Add export endpoints to README.md API reference
- [ ] Test all three endpoints work together
- [ ] Verify error handling is consistent across all exports

---

## Effort Summary

| Task | Effort | Priority |
|------|--------|----------|
| 1.1 - ADIF-3 Endpoint | 4h | High |
| 1.2 - ADIF Tests | 2.5h | High |
| 2.1 - CABRILLO Endpoint | 4h | High |
| 2.2 - CABRILLO Tests | 2.5h | High |
| 2.3 - Reverse-Log | 2.5h | Medium |
| 2.4 - Documentation | 1.5h | Medium |
| **Total** | **17h** | |

**Estimated Sprint Duration**: 2 weeks (1 week implementation + 0.5 week testing + 0.5 week documentation & polish)

---

## Implementation Order

**Priority Sequence**:
1. **ADIF-3 first** (most universal format, used by eQSL/LoTW)
2. **CABRILLO next** (required for contest submission)
3. **Reverse-log** (nice-to-have but valuable for community)

**Parallel Work**:
- Implement endpoint + write tests simultaneously
- Document as you go (easier than retroactive docs)

---

## Rollback Checkpoints

- ✅ After ADIF endpoint + tests pass
- ✅ After CABRILLO endpoint + tests pass
- ✅ After reverse-log endpoint + tests pass
- ✅ After all integration tests pass

---

## Success Metrics

**By end of sprint**:
- [ ] ADIF export generates valid files (ADIF-3 spec compliant)
- [ ] CABRILLO export validated by contest rule checker
- [ ] Reverse-log provides complete audit trail
- [ ] All 3 export types tested (>15 test cases total)
- [ ] Zero test failures on main branch
- [ ] Users can download contest logs as portable files

---

## Notes

- **ADIF Spec**: http://adif.org/ (reference for field validation)
- **CABRILLO Spec**: http://www.cqww.com/cabrillo.txt (format reference)
- **FDLog Pattern**: Reverse-log was pioneered by FDLog_Enhanced for dispute resolution
- **Merge Integration**: Only export primary entries to avoid duplicate scoring

---

## Next Phase (Phase 4)

After this sprint completes:
- **Real-time aggregation tables** (hourly QSO counts, band occupancy)
- **Live scoreboard** (without UI polling)
- **Operator statistics** (productivity, accuracy by source)

Phase 4 will use aggregation tables to power dashboards without expensive queries.

