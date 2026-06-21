# YAHAML Documentation Index

## 📚 Project Overview
- [README.md](../README.md) - Project description and goals
- [STATUS.md](../STATUS.md) - Current status and completed work
- [implementation-roadmap.md](./implementation-roadmap.md) - Long-term development plan

## 🔌 Protocol Documentation

### Complete N3FJP Protocol Reference
- **[protocol-summary.md](./protocol-summary.md)** ⭐ START HERE
  - All 7 message types with full examples
  - Client connection sequence
  - Server response requirements
  - Testing checklist

### Detailed Protocol Information
- [n3fjp_captured_protocol.md](./n3fjp_captured_protocol.md) - N3FJP-specific details and captured message formats
- [canonical-log-model.md](./canonical-log-model.md) - QSO (contact) field mapping
- [protocols-udp.md](./protocols-udp.md) - UDP interoperability strategy

## 🚀 Getting Started

### Quick References
- [quick-start.md](./quick-start.md) - 5-minute developer guide
- [capture-and-analysis.md](./capture-and-analysis.md) - Command reference for testing

### Testing & Validation
- [testing-plan.md](./testing-plan.md) - 7-phase test plan with success criteria
- See [STATUS.md](../STATUS.md) for current test status

## 🛠️ Implementation Details

### Architecture
- [architecture.md](./architecture.md) - Current service decomposition
  - Web UI, API server, relay, UDP listener, rig control, database, and real-time services

### Requirements
- [requirements.md](./requirements.md) - MVP scope and acceptance criteria
- [research-summary.md](./research-summary.md) - Research findings and background notes

### Testing Strategy
- [testing.md](./testing.md) - Test levels (unit, integration, contract)

## 📁 Source Code

### Server Implementation
**[src/relay.ts](../src/relay.ts)** - Current N3FJP relay implementation
- Message parsing and forwarding
- Per-client state management
- Response handlers and broadcast relay
- Configurable host and port

**[src/index.ts](../src/index.ts)** - API server and service orchestration
- REST endpoints
- WebSocket startup
- UDP listener startup
- Environment-based configuration

### Utility Scripts
- `npm run relay` - Start the relay process
- `npm test` - Run unit and integration tests
- `npm run test:browser` - Run Playwright browser tests

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
npm run relay

# 2. Monitor in another terminal
# Watch the relay terminal output

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

### Discovery and Validation
- N3FJP protocol research is documented in `protocol-summary.md`
- Current relay and UDP code live in `src/`
- Browser, API, and integration coverage live in `tests/` and `playwright/`

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

**Stage**: Protocol notes and relay validation

**What's working**:
- ✅ N3FJP protocol behavior documented
- ✅ Current relay and API implementations are in `src/`
- ✅ Message handling, exports, contest templates, and WebSocket updates are implemented
- ✅ Current validation paths are covered by tests

**What's next**:
- [ ] Keep protocol notes aligned with the current relay implementation
- [ ] Expand browser and integration coverage as new features land
- [ ] Update historical notes when protocol research changes
See [STATUS.md](../STATUS.md) for current progress updates.

---

**Last Reviewed**: June 7, 2026  
**Protocol Version**: Historical research notes and current implementation references  
**Relay Version**: Current Node/TypeScript implementation in `src/relay.ts`
