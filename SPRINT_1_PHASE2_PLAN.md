# Sprint 1 Planning: Data Quality & Merge Handling (Phase 2)

**Duration**: 2 weeks (Feb 3-14, 2026)  
**Goal**: Add conflict resolution & audit trail for duplicate QSOs  
**Status**: 🚀 Ready to implement

---

## Sprint Overview

### What We're Building
When the same QSO is logged multiple times (manual + TCP relay + WSJT-X), we need to:
1. Detect the duplicate
2. Mark entries as primary/duplicate
3. Preserve raw payloads for audit
4. Provide API to merge/resolve conflicts

### Why It Matters
- **Audit trail**: Post-contest disputes can be resolved with evidence
- **Data integrity**: No lost information, just linked/merged
- **Community standard**: FDLog_Enhanced does this for 40+ years

---

## Sprint Goal

**Primary Objective**: User can resolve QSO conflicts with confidence

**Success Criteria**:
- ✅ Schema supports merge tracking
- ✅ Unique constraint prevents duplicate insertion
- ✅ API endpoint to merge entries
- ✅ Raw payloads preserved for audit
- ✅ Tests pass
- ✅ Documentation updated

---

## Tasks (Kanban)

### Week 1: Schema & Infrastructure

#### Task 1.1: Schema Migration [🔴 NOT STARTED]
**Owner**: Backend  
**Effort**: 2 hours  
**Acceptance Criteria**:
- [ ] Add `merge_status`, `merged_into_id`, `merge_reason`, `merge_timestamp` to LogEntry
- [ ] Add `@@index([merge_status])` and `@@index([merged_into_id])`
- [ ] Run migration: `npx prisma migrate dev --name add-merge-status`
- [ ] Verify schema.prisma is valid
- [ ] Confirm no data loss in test database

**Files to Change**:
- `/prisma/schema.prisma`

**Command**:
```bash
npx prisma migrate dev --name add-merge-status
npx prisma generate
npm run build
```

---

#### Task 1.2: Update Prisma Client Types [🔴 NOT STARTED]
**Owner**: Backend  
**Effort**: 1 hour  
**Acceptance Criteria**:
- [ ] LogEntry type includes new merge fields
- [ ] TypeScript compilation succeeds
- [ ] API calls use new fields correctly

**Files to Change**:
- `src/index.ts` (review LogEntry usage)
- `tests/` (update any test fixtures)

---

#### Task 1.3: Seed Data Update [🔴 NOT STARTED]
**Owner**: Backend  
**Effort**: 1 hour  
**Acceptance Criteria**:
- [ ] `prisma/seed.ts` creates sample LogEntry with merge_status: "primary"
- [ ] Seed runs without errors
- [ ] Sample data shows both primary and merged entries

**Files to Change**:
- `/prisma/seed.ts`

---

### Week 2: API & Testing

#### Task 2.1: Implement Merge Endpoint [🔴 NOT STARTED]
**Owner**: Backend  
**Effort**: 4 hours  
**Acceptance Criteria**:
- [ ] `POST /api/logs/merge` endpoint works
- [ ] Accepts `primary_id`, `duplicate_ids`, `merge_reason`
- [ ] Updates all duplicates atomically
- [ ] Returns success/failure with count
- [ ] Error handling for invalid IDs
- [ ] Validation: primary_id cannot be in duplicate_ids

**Files to Change**:
- `/src/index.ts`

**API Spec**:
```
POST /api/logs/merge
{
  "primary_id": 123,
  "duplicate_ids": [124, 125],
  "merge_reason": "auto-merged with TCP relay entry"
}

Response:
{
  "success": true,
  "primary_id": 123,
  "merged_count": 2,
  "timestamp": "2026-02-10T14:30:00Z"
}
```

---

#### Task 2.2: Query Merged Entries [🔴 NOT STARTED]
**Owner**: Backend  
**Effort**: 2 hours  
**Acceptance Criteria**:
- [ ] `GET /api/logs?includeArchived=true` returns merged entries
- [ ] `GET /api/logs/:id/merged-with` shows merge history
- [ ] Default queries exclude archived (merged) entries
- [ ] Proper index usage for performance

**Files to Change**:
- `/src/index.ts`

**API Spec**:
```
GET /api/logs/123/merged-with
Response:
{
  "primary_id": 123,
  "merged_from": [
    { "id": 124, "merge_reason": "tcp relay dup", "timestamp": "2026-02-10T14:30:00Z" },
    { "id": 125, "merge_reason": "wsjt-x auto", "timestamp": "2026-02-10T14:30:01Z" }
  ]
}
```

---

#### Task 2.3: Unit Tests [🔴 NOT STARTED]
**Owner**: Backend  
**Effort**: 3 hours  
**Acceptance Criteria**:
- [ ] Test successful merge (2+ duplicates)
- [ ] Test merge with invalid primary_id (should fail)
- [ ] Test atomic transaction (all or nothing)
- [ ] Test query merged entries
- [ ] Test merge reason is preserved
- [ ] Test raw payload is not lost
- [ ] >80% code coverage for merge logic

**Files to Create/Change**:
- `/tests/logs-merge.test.ts` (new)
- Run: `npm run test`

**Test Cases**:
```
1. Merge 2 duplicates into primary
   - Verify primary has merge_status: "primary"
   - Verify duplicates have merge_status: "duplicate_of"
   - Verify merged_into_id points to primary
   
2. Merge fails with invalid IDs
   - primary_id doesn't exist → 400 error
   - duplicate_id doesn't exist → 400 error
   - primary_id in duplicate_ids → 400 error
   
3. Query merged entries
   - GET /logs/primary_id/merged-with returns correct count
   - Merge history has correct timestamps
   
4. Transaction integrity
   - If one update fails, entire operation rolled back
   - Database doesn't end in partially-merged state
```

---

#### Task 2.4: UI Component (Optional for Sprint) [⚠️ BACKLOG]
**Owner**: Frontend  
**Effort**: 4 hours  
**Acceptance Criteria**:
- [ ] UI shows "Merge Conflict" alert when duplicate detected
- [ ] User can click to view conflicting entries
- [ ] User can select "keep primary" or "merge"
- [ ] Merge reason auto-filled (e.g., "TCP relay duplicate")
- [ ] Confirmation before merge

**Files to Change**:
- `ui/src/components/LogConflictDialog.tsx` (new)

**Status**: Can defer to Sprint 2 if needed.

---

#### Task 2.5: Documentation [🔴 NOT STARTED]
**Owner**: Backend/Docs  
**Effort**: 2 hours  
**Acceptance Criteria**:
- [ ] API documentation updated (README or docs/)
- [ ] Merge workflow documented (decision tree)
- [ ] Example merge request/response
- [ ] When to merge vs. keep separate (guidelines)

**Files to Change**:
- `docs/MERGE_HANDLING.md` (new)

---

## Definition of Done (Phase 2)

### Code Review Checklist
- [ ] All tests passing (`npm run test`)
- [ ] TypeScript compiles without errors (`npm run build`)
- [ ] No console errors/warnings in dev server
- [ ] PR has >2 reviewers approved
- [ ] Code coverage >80% for merge logic
- [ ] Commit messages follow convention (docs: feat: fix:)

### QA Checklist
- [ ] Merge endpoint tested with curl/Postman
- [ ] Invalid merge attempts handled gracefully
- [ ] Raw payloads preserved (verify in DB)
- [ ] Merge history queryable and accurate
- [ ] No data loss after migration

### Documentation Checklist
- [ ] API spec documented
- [ ] Merge workflow diagram (ASCII art OK)
- [ ] Example merge scenario with JSON
- [ ] FAQ: When to merge? When to keep separate?

### Deployment Checklist
- [ ] Database backup taken
- [ ] Migration tested on dev/staging
- [ ] Rollback plan documented (revert migration)
- [ ] Team notified of schema changes

---

## Estimated Effort & Timeline

| Task | Effort | Owner | Week 1 | Week 2 |
|------|--------|-------|--------|--------|
| 1.1 - Schema | 2h | Backend | ✅ |  |
| 1.2 - TypeScript | 1h | Backend | ✅ |  |
| 1.3 - Seed Data | 1h | Backend | ✅ |  |
| 2.1 - Merge API | 4h | Backend |  | ✅ |
| 2.2 - Query API | 2h | Backend |  | ✅ |
| 2.3 - Unit Tests | 3h | Backend |  | ✅ |
| 2.4 - UI (Optional) | 4h | Frontend |  | ⚠️ |
| 2.5 - Docs | 2h | Docs |  | ✅ |
| **Total** | **19h** | | **4h** | **15h** |

---

## Resources & References

### Code Examples
- FDLog_Enhanced: Distributed merge/dupe handling
- Hamledger: Real-time conflict detection
- YAHAML existing: LogEntry model already has `source` + `rawPayload`

### Documentation
- [CODE_RECOMMENDATIONS.md](../CODE_RECOMMENDATIONS.md) - Priority 1 & 2 code
- [IMPLEMENTATION_ROADMAP.md](../IMPLEMENTATION_ROADMAP.md) - Phase 2 overview
- [LOGGING_BEST_PRACTICES.md](../docs/LOGGING_BEST_PRACTICES.md) - Conflict resolution patterns

---

## Sprint Standup Format

**Daily** (Async in Slack or sync brief):
```
✅ What I did
🚧 What I'm doing now
🚫 Blockers/Help needed
```

**Weekly** (Thursday):
- Task status review
- Blockers discussion
- Adjust timeline if needed

---

## Rollback Plan

If something breaks during migration:

```bash
# Revert migration (careful: deletes added columns)
npx prisma migrate resolve --rolled-back "add-merge-status"

# Or, if already in production, keep data but skip merge logic
# (app works with merge fields unused)
```

---

## Phase 3 Preview (Not This Sprint)

**Phase 3: Standard Exports** (Following 2 weeks)
- ADIF-3 export endpoint
- CABRILLO export endpoint
- Use merge_status: "primary" in exports (exclude duplicates)

---

## Sign-Off

**Sprint Lead**: [Your Name]  
**Backend Owner**: [Your Name]  
**Frontend Owner**: [TBD]  
**QA**: [TBD]  

**Approval**:
- [ ] Lead approves sprint plan
- [ ] Estimates realistic
- [ ] Team capacity confirmed

---

**Sprint Start**: Monday, Feb 3, 2026  
**Sprint End**: Friday, Feb 14, 2026  
**Daily Standup**: 9:00 AM EST (async if remote)

---

## Appendix: Task Details

### Task 1.1 Code Change

**File**: `/prisma/schema.prisma`

Add to LogEntry model:
```prisma
model LogEntry {
  // ... existing fields ...
  
  // NEW: Merge tracking
  merge_status      String    @default("primary")
  merged_into_id    BigInt?   @relation("MergedInto")
  merge_reason      String?
  merge_timestamp   DateTime?
  
  // Self-references for merge chains
  merged_from       LogEntry? @relation("MergedInto", fields: [merged_into_id], references: [id])
  merges            LogEntry[] @relation("MergedInto")
  
  // ... rest of model ...
  
  @@index([merge_status])
  @@index([merged_into_id])
}
```

---

### Task 2.1 Code Example

**File**: `/src/index.ts`

```typescript
app.post('/api/logs/merge', async (req, res) => {
  try {
    const { primary_id, duplicate_ids, merge_reason } = req.body;
    
    if (!primary_id || !duplicate_ids?.length) {
      return res.status(400).json({ error: 'Invalid merge request' });
    }
    
    if (duplicate_ids.includes(primary_id)) {
      return res.status(400).json({ error: 'Primary ID cannot be in duplicate list' });
    }
    
    const result = await prisma.$transaction(
      duplicate_ids.map(dup_id =>
        prisma.logEntry.update({
          where: { id: BigInt(dup_id) },
          data: {
            merge_status: 'duplicate_of',
            merged_into_id: BigInt(primary_id),
            merge_reason: merge_reason || 'merged',
            merge_timestamp: new Date(),
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
    return res.status(500).json({ error: error.message });
  }
});
```

---

**Document Version**: 1.0 | Created: 2026-01-31
