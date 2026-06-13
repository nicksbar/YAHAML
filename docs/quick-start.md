# Quick Start: N3FJP Protocol Notes

## What We Know
The N3FJP relay path in this codebase uses a **TCP protocol** on port 10000 by default and sends/receives tagged XML-like messages in **UTF-16LE encoding**. The current implementation and documentation cover the message types and relay behavior needed for validation and interoperability work.

## Key Files
- **Relay Implementation**: [src/relay.ts](../../src/relay.ts) - Current relay server and forwarding logic
- **API Orchestration**: [src/index.ts](../../src/index.ts) - Starts the API, relay, and UDP services
- **Integration Tests**: [tests/relay.e2e.test.ts](../../tests/relay.e2e.test.ts) - Relay behavior coverage
- **Protocol Docs**: [docs/protocol-summary.md](protocol-summary.md) - Complete reference with all message formats

- **Log Model**: [docs/canonical-log-model.md](canonical-log-model.md) - QSO (contact) record field mappings

## Running the App
```bash
cd /home/nick/YAHAML
npm run dev:all
```

Then point your client or integration target to `127.0.0.1:10000`.

## Message Type Quick Reference

| Type | Direction | Purpose |
|------|-----------|---------|
| **BAMS** | Client→Server→Others | Band/mode/station update |
| **NTWK OPEN** | Client→Server | Start session (needs ACK) |
| **NTWK CHECK** | Client→Server | Keepalive heartbeat (needs ACK) |
| **NTWK TRANSACTION** | Client→Server | Log entry submit (needs ACK) |
| **WHO** | Client→Server | Request station list |
| **MESG** | Client→Server→Others | Chat message (relay to all) |
| **SCLK** | Client→Server | Sync clock timestamp |

## What's Next
1. **Multi-client testing** - Validate relay behavior with more than one client
2. **Long-duration stability** - Leave connections running 60+ minutes to verify no dropouts
3. **Canonical model** - Keep the QSO mapping aligned with `src/export.ts` and Prisma models
4. **UDP adapters** - Continue interoperability work for external logging tools
5. **Service deployment** - Use Docker or host deployment paths in `docs/deployment-complete.md`

## Captured Sample
From a test session documented in the protocol notes:
```
Client connected: W1AW (Field Day contest)
  Band: 15m, Mode: SSB (PH)
  Chat: "Message test", "Direct DM test"
  Log entry: W1AW @ 18:07:25 on 15m SSB, 1H class, ARRL-FD contest
  QSO Details: DXCC 291 (USA), CQ Zone 05, ITU Zone 08
```

Use the test suites and protocol notes to compare expected versus actual behavior.

## Debugging
Use the relay and API terminal output, then:
```bash
npm test -- tests/relay.e2e.test.ts --runInBand
npm test -- tests/websocket.test.ts --runInBand
```

## Architecture Vision
```
┌─────────────────────────────────────┐
│  N3FJP / N1MM+ / DXLab / WaveLog  │
└────────────┬──────────────────────┘
             │ TCP (N3FJP), UDP (others)
             ▼
      ┌──────────────────┐
      │  UDP Bridge      │ ◄─────── Converts protocols
      │  & Adapter       │
      └────────┬─────────┘
               │
               ▼
        ┌────────────────┐
        │  Canonical Log │◄─────── Single unified model
        │  Model (QSO)   │
        └────────┬───────┘
                 │
      ┌──────────┴──────────┐
      ▼                     ▼
   API Server         Database
   (REST)            (Log store)
```

## Next Command Sequence (Once You Test More)
```
# 1. Start the app
npm run dev:all

# 2. Launch your client or simulate multiple clients
# ... use your logging client to send messages, change bands, log QSOs ...

# 3. Check the terminal output and browser devtools

# 4. If you see new behaviors, update protocol-summary.md and canonical model
# 5. Once stable, continue interoperability adapters
```
