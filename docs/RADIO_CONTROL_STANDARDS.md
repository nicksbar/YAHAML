# Radio Control Implementation Standards

This document establishes the standards and guardrails for the WebSocket-based, hamlib-integrated radio control system. **Deviations require ADR review and approval.**

## Core Principles (Non-Negotiable)

### 1. WebSocket-Only for Control
- ✅ **DO:** All radio control (frequency, mode, power, PTT, VFO, raw commands) via WebSocket `radioControl` message type
- ✅ **DO:** HTTP REST API for configuration only (create, list, update, delete radios)
- ❌ **DON'T:** Add new REST endpoints for control (POST /api/radios/:id/frequency, etc.)
- ❌ **DON'T:** Bypass WebSocket handler by executing hamlib commands from REST handlers directly

**Why:** REST endpoints caused race conditions and stale state broadcasts. WebSocket provides atomic execution.

**How to Verify:** Search codebase for new `router.post` or `router.put` with hamlib operations → should find none.

---

### 2. Atomic Command Execution
Control flow MUST always be: validate → execute → fetch state → broadcast
- ✅ **DO:** After every command (frequency, mode, power, etc.), immediately call `getState()` and broadcast
- ✅ **DO:** Use single `radioStateUpdate` broadcast with complete state snapshot
- ❌ **DON'T:** Return command success without confirming state changed (what if command failed at hamlib?)
- ❌ **DON'T:** Broadcast individual field changes (frequency, then mode, then power separately)

**Code Pattern:**
```typescript
// ✅ CORRECT
case 'setFrequency':
  await radioManager.getClient(radioId).sendCommand(`F ${params.frequencyHz}`);
  const state = await radioManager.pollRadio(radioId);  // fresh state
  broadcast({ type: 'radioStateUpdate', data: { radioId, state } });  // atomic
  
// ❌ WRONG
case 'setFrequency':
  await radioManager.getClient(radioId).sendCommand(`F ${params.frequencyHz}`);
  broadcast({ type: 'frequencyChanged', data: { radioId, frequency: params.frequencyHz } });  // assumes success
```

**How to Verify:** Every command handler in `src/websocket.ts` handleRadioControl() must end with `pollRadio()` and `radioStateUpdate` broadcast.

---

### 3. Clean State Architecture
Maintain strict separation of state origins:

#### `radioLiveState[radioId]` (WebSocket Origin)
- frequency, mode, power, ptt, vfo, bandwidth, isConnected
- Updated only by: WebSocket radioStateUpdate broadcasts
- Source of truth in UI for: frequency display, mode dropdown, power slider, PTT button
- Reset on: radio disconnect (isConnected=false)

#### `radios[]` (HTTP REST API Origin)
- id, name, host, port, isEnabled, connectionType, assignments
- Updated only by: GET /api/radios on load + modal form submissions
- Source of truth for: radio list, connection settings, assignments
- **NEVER includes:** frequency, mode, power, ptt, vfo, bandwidth, isConnected

#### `radioPendingInputs[radioId]` (User Form State)
- frequency, mode, bandwidth, power, vfo
- Updated by: onChange handlers on sliders, dropdowns, inputs
- Usage: Read on command submission → sendRadioCommand()
- Reset after: Command sent successfully

**Code Pattern:**
```typescript
// ✅ CORRECT: Use separate state objects
const liveFreq = radioLiveState[radioId]?.frequency;  // display current
const formFreq = radioPendingInputs[radioId]?.frequency;  // user input
const radioConfig = radios.find(r => r.id === radioId);  // connection settings

// ❌ WRONG: Mixing state origins
const freq = radios.find(r => r.id === radioId)?.frequency;  // radios only has config
const displayState = { ...radioLiveState[radioId], ...radios[0] };  // don't merge!
```

**How to Verify:** 
- Search for `radios[*].frequency` → should find ZERO matches
- Search for `radioPendingInputs` outside of form component → should find mostly event handlers
- Search for `radioLiveState` → should find only broadcasts and display code

---

### 4. Per-Radio Command Serialization
Prevent hamlib response interleaving:

- ✅ **DO:** Each RadioClient maintains `commandQueue` array + `commandInFlight` boolean
- ✅ **DO:** Only execute next command when previous completes (even if response is error)
- ✅ **DO:** Queue stays at ~5 items max under spike load
- ❌ **DON'T:** Use Promise.all() on socket writes (causes interleaving)
- ❌ **DON'T:** Execute multiple commands while one is in flight

**Code Pattern:**
```typescript
// ✅ CORRECT: Serial execution
if (this.commandInFlight) return;  // skip if busy
if (this.commandQueue.length === 0) return;

const queued = this.commandQueue[0];
this.commandInFlight = true;
// ... send command, wait for response
this.commandInFlight = false;
this.commandQueue.shift();

// ❌ WRONG: Concurrent execution
const results = await Promise.all([
  sendCommand('f\n'),   // these collide!
  sendCommand('m\n'),
]);
```

**How to Verify:** 
- Check `src/hamlib.ts` RadioClient class has `commandInFlight` boolean
- Verify `sendNextCommand()` checks `if (this.commandInFlight) return;`
- Test: send setFrequency + setMode rapidly → queue should max out at ~5 items, not grow unbounded

---

### 5. Per-Radio Polling Protection
Prevent concurrent getState() calls:

- ✅ **DO:** Maintain `pollInProgress: Map<string, boolean>` to track per-radio polling state
- ✅ **DO:** Skip poll tick if `pollInProgress[radioId]` is true (previous poll still running)
- ✅ **DO:** Set flag true before poll, false after (even on error)
- ❌ **DON'T:** Queue polling (it's fire-and-forget, not blocking)
- ❌ **DON'T:** Let polling block user commands in queue

**Code Pattern:**
```typescript
// ✅ CORRECT: Skip overlapping polls
if (this.pollInProgress.get(radioId)) return;  // already polling this radio

this.pollInProgress.set(radioId, true);
try {
  const state = await this.pollRadio(radioId);
} finally {
  this.pollInProgress.set(radioId, false);  // always clear
}

// ❌ WRONG: Allow polling overlap
const state = await this.pollRadio(radioId);  // concurrent polls possible
```

**How to Verify:**
- Check `src/hamlib.ts` RadioManager has `pollInProgress` Map
- Verify `startPolling()` checks flag before calling `pollRadio()`
- Test: monitor logs while adjusting frequency rapidly → should see "skipped poll" messages

---

## Implementation Guidelines

### When Adding a New Radio Control Command

1. **Define command in WebSocket handler** (`src/websocket.ts` handleRadioControl):
   ```typescript
   case 'myNewCommand':
     // 1. Validate params
     if (!params.requiredField) throw new Error('Missing requiredField');
     
     // 2. Execute via RadioManager
     const result = await radioManager.getClient(radioId).sendCommand(...);
     
     // 3. Fetch fresh state
     const state = await radioManager.pollRadio(radioId);
     
     // 4. Broadcast atomic update
     this.broadcast({
       type: 'radioStateUpdate',
       data: { radioId, state }
     });
     break;
   ```

2. **Add test case** (`tests/websocket-radio-control.test.ts`):
   ```typescript
   it('should route myNewCommand via WebSocket', async () => {
     ws.send(JSON.stringify({
       type: 'radioControl',
       data: {
         radioId,
         command: 'myNewCommand',
         params: { requiredField: 'value' }
       }
     }));
     
     const response = await waitForMessage(ws);
     expect(response.type).toMatch(/radioControlResponse|error/);
   });
   ```

3. **Update frontend helper** (`ui/src/App.tsx`):
   ```typescript
   // sendRadioCommand() already supports any command name
   // Just use it:
   sendRadioCommand(radioId, 'myNewCommand', { requiredField: 'value' });
   ```

4. **Document in API reference** (`docs/radio-control.md`):
   - Add to "Radio Control Commands" section
   - Include example WebSocket message
   - Document expected params and response

### When Adding a New Radio State Field

1. **Update type definitions** (ensure TypeScript knows about field)
2. **Include in pollRadio()** function to fetch from rigctld
3. **Include in radioStateUpdate broadcast** (atomic snapshot)
4. **Update UI to display** (read from radioLiveState)
5. **Add test** for the new field in integration test

### When Debugging Radio Control Issues

**Checklist:**
- [ ] WebSocket is connected? (DevTools → Network → WS)
- [ ] Radio is enabled and connected? (UI shows "Connected")
- [ ] Check backend logs: `[Hamlib] Queueing command...` messages
- [ ] Check queue depth: should stay ~5, not grow to 20+
- [ ] Check polling skips: `pollInProgress` should prevent overlap
- [ ] Check state broadcast: `radioStateUpdate` messages in DevTools WebSocket frame log
- [ ] Verify no REST endpoint calls: Network tab should have ZERO `POST /api/radios/:id/frequency` etc.

---

## Code Review Checklist

When reviewing radio control changes, verify:

- [ ] No new REST control endpoints added
- [ ] All commands go through WebSocket handler
- [ ] Command → fetch state → broadcast pattern followed
- [ ] Uses `getState()` or `pollRadio()` after command, not cached state
- [ ] State architecture maintained (no mixing origins)
- [ ] Tests added for new commands
- [ ] Documentation updated (API reference + troubleshooting if applicable)
- [ ] No `Promise.all()` on hamlib socket operations
- [ ] `pollInProgress` checked on polling code paths
- [ ] `commandInFlight` prevents concurrent execution
- [ ] Errors logged with context (radioId, command name, error message)
- [ ] No stale `radioPendingInputs` in displays (only radioLiveState)

---

## Common Pitfalls

### Pitfall 1: Returning Success Without Confirmation
```typescript
// ❌ WRONG
ws.send(JSON.stringify({ frequency: params.frequencyHz }));  // assumes success

// ✅ RIGHT
const state = await radioManager.pollRadio(radioId);  // fresh state
ws.send(JSON.stringify({
  type: 'radioStateUpdate',
  data: { radioId, state }  // actual current state
}));
```

### Pitfall 2: Mixing State Origins
```typescript
// ❌ WRONG
const radio = radios.find(r => r.id === radioId);
display(`Frequency: ${radio.frequency}`);  // radios only has config!

// ✅ RIGHT
const state = radioLiveState[radioId];
display(`Frequency: ${state.frequency}`);  // from WebSocket
```

### Pitfall 3: Broadcasting Individual Fields
```typescript
// ❌ WRONG
broadcast({ type: 'frequencyChanged', data: { frequency } });
broadcast({ type: 'modeChanged', data: { mode } });  // 2 broadcasts, one might not arrive

// ✅ RIGHT
broadcast({
  type: 'radioStateUpdate',
  data: {
    radioId,
    state: { frequency, mode, power, ptt, vfo, bandwidth, isConnected }  // atomic
  }
});
```

### Pitfall 4: REST Endpoint for Control
```typescript
// ❌ WRONG
router.post('/api/radios/:id/frequency', async (req, res) => {
  // executing hamlib command from REST handler
});

// ✅ RIGHT
// All control goes through WebSocket, REST is config-only
router.get('/api/radios', ...);      // list config
router.post('/api/radios', ...);     // create config
router.put('/api/radios/:id', ...);  // update config
router.delete('/api/radios/:id', ...);  // delete config
```

### Pitfall 5: Removing Polling Protection
```typescript
// ❌ WRONG
async startPolling() {
  setInterval(() => this.pollRadio(radioId), 1000);  // can overlap!
}

// ✅ RIGHT
async startPolling() {
  setInterval(() => {
    if (this.pollInProgress.get(radioId)) return;  // skip if busy
    this.pollRadio(radioId);
  }, 1000);
}
```

---

## Future Safeguards

- [ ] Add lint rule: error if new `router.post`/`put` found touching hamlib without review
- [ ] Add test assertion: verify no REST control endpoints exist
- [ ] Add monitoring: alert if command queue grows beyond 10 items
- [ ] Add monitoring: alert if polling interval drops below 500ms (too aggressive)
- [ ] CI check: ensure all new tests have WebSocket control tests

---

## Questions?

See related documentation:
- **Architecture Flow:** [docs/architecture.md](architecture.md) → "Radio Control Flow" section
- **API Reference:** [docs/radio-control.md](radio-control.md) → "Radio Control (WebSocket)" section
- **Test Patterns:** [tests/websocket-radio-control.test.ts](../tests/websocket-radio-control.test.ts)
- **Implementation:** [src/websocket.ts](../src/websocket.ts) handleRadioControl() method
- **Hamlib Integration:** [src/hamlib.ts](../src/hamlib.ts) RadioClient class
