# N3FJP Protocol Analysis Infrastructure - Complete

## Summary

You now have a complete MITM (Man-In-The-Middle) relay infrastructure for debugging N3FJP protocol issues. This solves the "client stays on attempting to connect" problem by letting you capture and analyze all bidirectional communication.

## Files Added

### Core Tools
- `scripts/n3fjp_mitm_relay.ts` - Transparent TCP proxy that logs all traffic
- `scripts/analyze_n3fjp_log.ts` - Parser for captured logs
- `scripts/n3fjp_test_setup.sh` - Test orchestration script (executable)
- `scripts/start_mitm_relay.sh` - Bash helper for relay (already existed)

### Documentation  
- `MITM_RELAY_READY.md` - Executive summary (start here!)
- `N3FJP_TEST_QUICK_REF.md` - Quick reference with copy-paste commands
- `PROTOCOL_ANALYSIS_SETUP.md` - Complete setup guide
- `docs/n3fjp_protocol_debugging.md` - Advanced debugging techniques
- `docs/n3fjp_testing_guide.md` - Full testing workflow

### Configuration
- `package.json` - Added `npm run relay` and `npm run relay:default` scripts

## How to Use (3 Terminal Setup)

### Terminal 1: Start Server
```bash
cd /home/nick/YAHAML
python3 scripts/n3fjp_server_stub.py
```

### Terminal 2: Start Relay (captures all traffic)
```bash
cd /home/nick/YAHAML
npm run relay:default
```

### Terminal 3: Start Client
```bash
cd /home/nick/YAHAML
npm run dev:all
# Configure to connect to localhost:2000 (the relay)
```

## After Testing

```bash
# Analyze captured communication
./scripts/n3fjp_test_setup.sh analyze

# Or monitor logs live
./scripts/n3fjp_test_setup.sh monitor
```

## What Gets Captured

Every message in both directions with:
- **Hex representation** - Exact bytes
- **ASCII representation** - Readable text
- **Timestamps** - Precise timing
- **Connection metadata** - Client/server addresses

Example log entry:
```
[2026-02-01T15:30:45.345Z] [conn-1] client→server (25 bytes)
  HEX: 47 45 54 43 4f 4e 54 45 53 54 4e 55 4d 42 45 52 0d 0a
  ASCII: GETCONTESTNUMBER\r\n

[2026-02-01T15:30:45.456Z] [conn-1] server→client (50 bytes)
  HEX: 43 4f 4e 54 45 53 54 4e 55 4d 42 45 52 2c 31 2c 32 30 32 34 0d 0a
  ASCII: CONTESTNUMBER,1,2024\r\n
```

## Debugging "Attempting to Connect"

The relay reveals exactly what's happening:

1. **Check if client connects**: `grep "Client connected" captures/n3fjp_mitm_*.log`
2. **Check if relay connects to server**: `grep "Connected to server" captures/n3fjp_mitm_*.log`
3. **Check what client sends**: `grep "client→server" captures/n3fjp_mitm_*.log`
4. **Check what server responds**: `grep "server→client" captures/n3fjp_mitm_*.log`

Missing entries pinpoint where communication breaks.

## Verification

Check everything is ready:
```bash
./scripts/n3fjp_test_setup.sh check
```

Expected output shows ports available and ready for testing.

## Key Features

✅ Transparent proxy - Client connects without code changes  
✅ Complete traffic capture - Every byte in both directions  
✅ Hex + ASCII - See exact bytes and readable text  
✅ Precise timestamps - Know exact message timing  
✅ Easy analysis - Single command to parse logs  
✅ Flexible configuration - Works with any port setup  

## Next Phase

1. Run the 3-terminal setup
2. Let the system connect and interact
3. Analyze logs to see actual protocol behavior
4. Compare with expected N3FJP specification
5. Fix any protocol issues found
6. Re-test to verify fixes

The relay captures everything needed to debug protocol issues at the byte level!

---

**Ready to Debug**: Start with [MITM_RELAY_READY.md](MITM_RELAY_READY.md)  
**Quick Commands**: See [N3FJP_TEST_QUICK_REF.md](N3FJP_TEST_QUICK_REF.md)  
**Full Guide**: Read [docs/n3fjp_testing_guide.md](docs/n3fjp_testing_guide.md)
