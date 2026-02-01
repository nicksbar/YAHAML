# Quick Start: N3FJP Protocol Integration

## What We Know
The N3FJP Field Day logging application uses a **TCP protocol** on port 10000 that sends/receives tagged XML-like messages in **UTF-16LE encoding**. We've reverse-engineered 7 complete message types covering station updates, network control, chat, and log entry submission.

## Key Files
- **Server Stub**: [scripts/n3fjp_server_stub.py](../../scripts/n3fjp_server_stub.py) - Working TCP server that can:
  - Accept N3FJP clients and maintain connections
  - Parse all 7 message types
  - Send appropriate responses (ACKs, station lists, greetings)
  - Log entries to file for analysis

- **Protocol Docs**: [docs/protocol-summary.md](protocol-summary.md) - Complete reference with all message formats
- **Log Model**: [docs/canonical-log-model.md](canonical-log-model.md) - QSO (contact) record field mappings

## Running the Stub
```bash
cd /home/nick/YAHAML
source .venv/bin/activate
python scripts/n3fjp_server_stub.py --host 127.0.0.1 --port 10000 --log captures/messages.log
```

Then point N3FJP Field Day to connect to `127.0.0.1:10000`.

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
1. **Multi-client testing** - Run stub with multiple N3FJP instances to verify relay behavior
2. **Long-duration stability** - Leave connections running 60+ minutes to verify no dropouts
3. **Canonical model** - Build Python dataclass for QSO record from XML fields
4. **UDP adapters** - Create converters for N1MM+/DXLab/WaveLog log formats
5. **Service deployment** - Move from stub to microservices (API, UDP bridge, rig control)

## Captured Sample
From a test session on 2026-01-31:
```
Client connected: W1AW (Field Day contest)
  Band: 15m, Mode: SSB (PH)
  Chat: "Message test", "Direct DM test"
  Log entry: W1AW @ 18:07:25 on 15m SSB, 1H class, ARRL-FD contest
  QSO Details: DXCC 291 (USA), CQ Zone 05, ITU Zone 08
```

Log files saved in [captures/](../../captures/) directory.

## Debugging
Enable logging with `--log` flag, then:
```bash
tail -100 captures/messages.log
# or for just transactions:
grep "TRANSACTION" captures/messages.log
# or check parsed format:
python scripts/parse_n3fjp_log.py < captures/messages.log
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
# 1. Run stub in background
python scripts/n3fjp_server_stub.py --port 10000 --log captures/new_test.log &

# 2. Launch N3FJP multiple times (or simulate multiple clients)
# ... use N3FJP UI to send messages, change bands, log QSOs ...

# 3. Check what was captured
tail -50 captures/new_test.log

# 4. If you see new message types, update protocol-summary.md and canonical model
# 5. Once stable, build the UDP bridge adapters
```
