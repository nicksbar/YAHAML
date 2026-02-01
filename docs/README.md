# YAHAML Documentation Index

## 📚 Project Overview
- [README.md](../README.md) - Project description and goals
- [ROADMAP.md](../ROADMAP.md) - 4-phase development plan
- [PROGRESS.md](../PROGRESS.md) - Current status and completed work

## 🔌 Protocol Documentation

### Complete N3FJP Protocol Reference
- **[protocol-summary.md](./protocol-summary.md)** ⭐ START HERE
  - All 7 message types with full examples
  - Client connection sequence
  - Server response requirements
  - Testing checklist

### Detailed Protocol Information
- [protocols-n3fjp.md](./protocols-n3fjp.md) - N3FJP-specific details
- [canonical-log-model.md](./canonical-log-model.md) - QSO (contact) field mapping
- [protocols-udp.md](./protocols-udp.md) - UDP interoperability strategy

## 🚀 Getting Started

### Quick References
- [quick-start.md](./quick-start.md) - 5-minute developer guide
- [capture-and-analysis.md](./capture-and-analysis.md) - Command reference for testing

### Testing & Validation
- [testing-plan.md](./testing-plan.md) - 7-phase test plan with success criteria
- See PROGRESS.md for current test status

## 🛠️ Implementation Details

### Architecture
- [architecture.md](./architecture.md) - 5-service decomposition
  - Web UI, API server, UDP bridge, Rig control, Database

### Requirements
- [requirements.md](./requirements.md) - MVP scope and acceptance criteria
- [research-n3fjp.md](./research-n3fjp.md) - N3FJP software inventory

### Testing Strategy
- [testing.md](./testing.md) - Test levels (unit, integration, contract)

## 📁 Source Code

### Server Implementation
**[scripts/n3fjp_server_stub.py](../scripts/n3fjp_server_stub.py)** - Working TCP server (280 lines)
- Message parsing (UTF-16LE, BOR/EOR framing)
- Per-client state management
- Response handlers (ACK, WHO, greeting, transaction)
- Broadcast relay (BAMS, MESG)
- Full command line configuration

### Utility Scripts
- `parse_n3fjp_log.py` - Parse captured hex log files
- `decode_raw_log.py` - Convert hex to UTF-16LE text
- `tcp_listener.py` - Raw network capture (for debugging)

## 📊 Message Types (Quick Reference)

| Type | Direction | Purpose | Status |
|------|-----------|---------|--------|
| BAMS | Client→Server→Others | Band/mode update | ✅ Complete |
| NTWK OPEN | Client→Server | Session start | ✅ Complete |
| NTWK CHECK | Client→Server | Heartbeat | ✅ Complete |
| NTWK TRANSACTION | Client→Server | Log entry submit | ✅ Complete |
| WHO | Client→Server | Station query | ✅ Complete |
| MESG | Client→Server→Others | Chat message | ✅ Complete |
| SCLK | Client→Server | Clock sync | ✅ Complete |

For detailed field information, see [protocol-summary.md](./protocol-summary.md#message-types-discovered-7-total).

## 🔄 Workflow Examples

### Testing the Protocol
```bash
# 1. Start server
cd /home/nick/YAHAML
source .venv/bin/activate
python scripts/n3fjp_server_stub.py --port 10000 --log captures/test.log

# 2. Monitor in another terminal
tail -f captures/test.log

# 3. Run N3FJP and connect to 127.0.0.1:10000
# 4. Check results in log
```

See [capture-and-analysis.md](./capture-and-analysis.md) for detailed commands.

### Building Adapters
Once protocol is stable, create UDP bridges:
1. Parse each logging app's format (N1MM+, DXLab, WaveLog)
2. Convert to canonical QSO model
3. Relay via UDP to N3FJP server
4. Handle bidirectional updates

See [protocols-udp.md](./protocols-udp.md) for UDP strategy.

## ✅ Completion Status

### Phase 1: Discovery (COMPLETE)
- [x] Reverse-engineer N3FJP protocol
- [x] Capture all message types
- [x] Document field mappings
- [x] Build working server stub

### Phase 2: Stabilization (IN PROGRESS)
- [x] Add TRANSACTION ACK handler
- [ ] Test sustained connections (60+ seconds)
- [ ] Multi-client relay validation
- [ ] Edge case handling

### Phase 3: Integration (PENDING)
- [ ] Build canonical QSO dataclass
- [ ] Create UDP adapter framework
- [ ] Implement per-app parsers (N1MM+, DXLab, etc.)
- [ ] Container deployment

### Phase 4: Enhancement (PENDING)
- [ ] HAMLib rig control integration
- [ ] Web UI for log management
- [ ] Multi-network relay support
- [ ] ADIF export

## 📋 Document Structure

Each documentation file contains:
- **Purpose** - What it documents
- **Audience** - Who should read it
- **Key Sections** - Main content areas
- **Examples** - Sample code/output
- **References** - Links to related docs

## 🔍 Finding Information

**Looking for...?**
- Complete protocol definition → [protocol-summary.md](./protocol-summary.md)
- How to run the server → [quick-start.md](./quick-start.md)
- Test scenarios → [testing-plan.md](./testing-plan.md)
- Command examples → [capture-and-analysis.md](./capture-and-analysis.md)
- Service architecture → [architecture.md](./architecture.md)
- QSO field definitions → [canonical-log-model.md](./canonical-log-model.md)
- UDP interop plans → [protocols-udp.md](./protocols-udp.md)

## 🤝 Contributing

See [CONTRIBUTING.md](../CONTRIBUTING.md) for:
- Code style guide
- Testing requirements
- Pull request process
- Issue templates

## 📖 Reading Order (New Developer)

1. Start: [README.md](../README.md) - Understand the project
2. Quick: [quick-start.md](./quick-start.md) - Get running fast
3. Deep: [protocol-summary.md](./protocol-summary.md) - Learn the protocol
4. Implementation: [architecture.md](./architecture.md) - Understand the design
5. Testing: [testing-plan.md](./testing-plan.md) - How to validate changes

## 🎯 Current Focus

**Stage**: Protocol discovery and server stub validation

**What's working**:
- ✅ N3FJP TCP protocol fully documented
- ✅ Server stub accepts clients and responds correctly
- ✅ All 7 message types captured and validated
- ✅ Transaction (log entry) handling implemented

**What's next**:
- [ ] Verify transaction ACK fixes client disconnect
- [ ] Multi-client relay testing
- [ ] Build canonical log model
- [ ] Create UDP adapter framework

See [PROGRESS.md](../PROGRESS.md) for real-time updates.

---

**Last Updated**: 2026-01-31  
**Protocol Version**: 1.0 (Stable)  
**Server Stub Version**: 1.2 (with transaction handler)
