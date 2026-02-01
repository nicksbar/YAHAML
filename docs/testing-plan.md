# N3FJP Protocol Testing & Validation Plan

## Phase 1: Basic Connection (COMPLETED ✓)
**Goal**: Verify client can connect and complete initial handshake

### Tests
- [x] Server accepts N3FJP client connection
- [x] Server sends greeting on new connection
- [x] Client sends BAMS with station info
- [x] Client sends NTWK OPEN, server responds with ACK
- [x] Client sends WHO, server responds with station list
- [x] Client sends SCLK with timestamp
- [x] Parsing of UTF-16LE messages works correctly
- [x] Message framing (BOR/EOR/trailer) handled correctly

**Status**: PASSED - Multiple client connections sustained through initial handshake

## Phase 2: Message Type Coverage (COMPLETED ✓)
**Goal**: Discover and validate all message types and their formats

### Tests
- [x] **BAMS** - Band/mode/station updates captured and parsed
- [x] **NTWK OPEN** - Network session open/close handshake
- [x] **NTWK CHECK** - Periodic heartbeat with ACK response
- [x] **WHO** - Station roster query and response
- [x] **MESG** - Chat message format with TO/FROM/MSGTXT fields
- [x] **SCLK** - Clock sync with timestamp fields (captured but not validated)
- [x] **NTWK TRANSACTION** - Complete log entry with 30+ XML fields in XMLDATA

**Status**: PASSED - All 7 message types discovered and documented

## Phase 3: Client Stability (IN PROGRESS)
**Goal**: Fix connection stability and test sustained operation

### Tests
- [ ] Client stays connected for 60+ seconds without disconnect
- [ ] TRANSACTION ACK response prevents client disconnect
- [ ] Multiple rapid BAMS updates handled gracefully
- [ ] NTWK CHECK heartbeat maintenance over time
- [ ] Graceful shutdown when client closes connection
- [ ] Server reconnection after temporary network drop

**Next Step**: Restart stub with TRANSACTION ACK handler (now implemented) and retest

## Phase 4: Multi-Client Scenarios (PENDING)
**Goal**: Validate server-side relay and broadcast functionality

### Tests
- [ ] Run 2 N3FJP instances simultaneously
- [ ] BAMS update from Client A relayed to Client B
- [ ] MESG from Client A broadcast to Client B
- [ ] WHO response includes both active clients
- [ ] Each client gets independent station updates
- [ ] Server tracks separate state per client connection
- [ ] One client disconnect doesn't affect others

**Setup Required**: Launch second N3FJP instance on different port or network

## Phase 5: Log Entry Validation (PARTIAL)
**Goal**: Validate complete QSO record submission and parsing

### Tests
- [x] Client sends complete TRANSACTION with XMLDATA
- [x] Server parses XML fields correctly
- [x] Server sends TRANSACTION ACK response
- [ ] Multiple QSOs submitted in sequence
- [ ] UPDATE and DELETE transaction types work
- [ ] Invalid XML data handled gracefully
- [ ] Duplicate QSO detection (if needed)

**Captured Sample**:
```
TRANSACTION: ADD
Call: W1AW
Band: 15m
Mode: PH (SSB)
Date: 2026/01/31
Time: 18:07:25
Operator: N7UF
Contest: ARRL-FD
```

## Phase 6: Edge Cases & Recovery (PENDING)
**Goal**: Ensure robustness under unusual conditions

### Tests
- [ ] Malformed messages (incomplete tags, missing fields)
- [ ] Out-of-order messages (e.g., MESG before NTWK OPEN)
- [ ] Rapid connection/disconnection cycling
- [ ] Very large XMLDATA payloads
- [ ] Special characters in MESG text
- [ ] Non-ASCII callsigns (if possible)
- [ ] Network packet loss simulation

## Phase 7: Integration Readiness (PENDING)
**Goal**: Prepare for multi-service deployment

### Tests
- [ ] Stub as systemd service (auto-start, logging)
- [ ] Docker containerization
- [ ] Docker Compose with multiple services
- [ ] Environment variable configuration
- [ ] Log rotation (prevents disk fill)
- [ ] Health check endpoint (if adding REST API)

## Test Execution Checklist

### Pre-Test Setup
```bash
# Terminal 1: Start server stub
cd /home/nick/YAHAML
source .venv/bin/activate
python scripts/n3fjp_server_stub.py \
  --host 127.0.0.1 \
  --port 10000 \
  --log captures/test_$(date +%s).log

# Terminal 2: Monitor logs
tail -f captures/test_*.log | grep -E "Client|BAMS|MESG|TRANSACTION|ERROR"

# Terminal 3: Launch N3FJP
# (Use N3FJP UI to connect to 127.0.0.1:10000 and perform actions)
```

### Test Scenarios
1. **Simple Band Change**: Change band 5 times, verify BAMS messages in log
2. **Chat**: Send 3 messages, verify format and content in log
3. **Log Entry**: Create QSO with complete info, verify XMLDATA fields
4. **Disconnect/Reconnect**: Close connection, reconnect, verify fresh handshake
5. **Long Run**: Leave connected 15+ minutes, verify stable heartbeat

### Success Criteria
- [ ] All 7 message types successfully sent and received
- [ ] Client maintains connection for 60+ seconds
- [ ] Server responses appear in correct order (no race conditions)
- [ ] No data corruption in UTF-16LE encoding/decoding
- [ ] TRANSACTION ACK prevents disconnect (key fix)
- [ ] Multi-client scenarios work when tested

## Bug Tracking

### Known Issues
1. **Client Disconnect** (Phase 3)
   - Symptom: Connection closes after ~5-10 message exchanges
   - Root Cause: Missing TRANSACTION ACK response
   - Fix Applied: Added handle_transaction() and send_ack("TRANSACTION")
   - Status: NEEDS TESTING

### Potential Issues (Not Yet Observed)
1. SCLK timestamp not being acknowledged (may cause timeout)
2. Incomplete message buffer handling on rapid sends
3. UTF-16LE encoding artifacts in edge cases
4. Client may expect different WHO response format

## Performance Targets
- Server handles 5+ concurrent clients without slowdown
- Message round-trip latency < 100ms
- No memory leaks after 1 hour sustained operation
- Log file rotation at 100MB

## Testing Timeline
- **Now**: Phase 1-3 (verify Phase 3 fix with updated stub)
- **30 min**: Phase 4-5 (multi-client and edge cases)
- **1 hour**: Phase 6-7 (recovery and integration)

## Success Definition
✓ Single client connects and exchanges all 7 message types without disconnect
✓ Multi-client relay working (MESG/BAMS distributed)
✓ Log entries (TRANSACTION) submitted and acknowledged
✓ Server ready for containerization and multi-service deployment
