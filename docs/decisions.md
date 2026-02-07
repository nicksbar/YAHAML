# Architectural Decisions (ADR)

## ADR-001: WebSocket-Only Radio Control (Feb 7, 2026)

**Date:** Feb 7, 2026  
**Decision:** All radio control operations (frequency, mode, power, PTT, VFO, raw commands) via WebSocket only. REST control endpoints removed entirely.

**Context:**
- Initial REST endpoints for each control caused race conditions
- Multiple endpoints could race to fetch state → inconsistent broadcasts
- Frontend buttons showed stale/undefined values

**Options Considered:**
1. Keep REST endpoints, add locks
2. Migrate all control to WebSocket (chosen)
3. Hybrid: REST + WS

**Outcome:**
- Single WebSocket handler routes all control messages
- Atomic: validate → execute → fetch state → broadcast
- All 244 tests passing, 13 dedicated WebSocket tests

**Consequences:**
- ✅ Eliminates race conditions
- ✅ Single audit trail
- ⚠️ WebSocket required for control
- ⚠️ Backend validates all params

---

## ADR-002: Hamlib Command Serialization with Per-Radio Queue Protection (Feb 7, 2026)

**Date:** Feb 7, 2026  
**Decision:** Each rigctld connection uses commandQueue + commandInFlight. Per-radio pollInProgress prevents concurrent getState() calls.

**Context:**
- Hamlib rigctld doesn't support concurrent commands
- Promise.all() on socket caused response interleaving
- Command queue grew to 9+ items during polling overlaps

**Options Considered:**
1. Separate connection per command (port exhaustion)
2. Global lock (bottleneck)
3. Per-client queue + per-radio poll protection (chosen)

**Outcome:**
- commandQueue holds pending commands per RadioClient
- commandInFlight ensures max 1 command executing
- pollInProgress prevents overlapping polls per radio
- Queue stays ~5 items max under load

**Consequences:**
- ✅ No command interleaving
- ✅ Predictable queue depth
- ✅ Polling doesn't cascade
- ⚠️ Commands wait 200-500ms typical
- ⚠️ Must handle slow rigctld

---

## ADR-003: Clean State Architecture Separation (Feb 7, 2026)

**Date:** Feb 7, 2026  
**Decision:** Three separate state objects: radioLiveState (WebSocket), radios (HTTP config), radioPendingInputs (user form).

**Context:**
- Previous design mixed config and live state
- API returned frequency/mode/power → stale values in UI
- Unclear which state source was authoritative

**Options Considered:**
1. Single unified object (ambiguous)
2. Separate objects with clear data flow (chosen)
3. All state in database (slow)

**Outcome:**
- radioLiveState[radioId]: WebSocket-origin, display current
- radios[i]: HTTP REST-origin, configuration
- radioPendingInputs[radioId]: User form state

**Consequences:**
- ✅ No stale state confusion
- ✅ Clear data flow
- ✅ No cascade effects
- ⚠️ More state objects
- ⚠️ API stripper required

---

## ADR-004: Atomic State Broadcast Instead of Individual Updates (Feb 1, 2026)

**Date:** Feb 1, 2026  
**Decision:** WebSocket broadcasts complete radio state snapshot, not individual fields.

**Context:**
- Multiple small updates could arrive out of order
- Hard to keep UI consistent

**Options Considered:**
1. Individual field broadcasts
2. Complete state snapshot (chosen)
3. Deltas with timestamps

**Outcome:**
- { type: 'radioStateUpdate', data: { radioId, state: {...all fields...} } }
- No partial states, no ordering issues

**Consequences:**
- ✅ Atomic updates
- ✅ Easy to merge
- ✅ Simpler client code
- ⚠️ Bandwidth (small: ~200 bytes)

---

## ADR-005: Separate Control and Polling Channels (Feb 7, 2026)

**Date:** Feb 7, 2026  
**Decision:** User commands execute through command queue. Automatic polling on separate 1000ms interval.

**Context:**
- If polling blocked commands, UI felt unresponsive
- Needed fast UI feedback independent of polling

**Options Considered:**
1. Unified queue (polling + commands mixed)
2. Separate execution + per-radio protection (chosen)
3. Commands always interrupt polling

**Outcome:**
- Command path: User action → WebSocket → queue → execute → broadcast (fast)
- Polling path: Timer → pollInProgress check → getState() → broadcast (background)

**Consequences:**
- ✅ Commands feel responsive
- ✅ Continuous state updates
- ✅ Graceful degradation
- ⚠️ Brief race window possible

---

## Resources

See **[RADIO_CONTROL_STANDARDS.md](RADIO_CONTROL_STANDARDS.md)** for implementation guardrails and best practices.
