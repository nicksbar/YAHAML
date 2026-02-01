# N3FJP Protocol Analysis - Ready to Debug

## ✅ Setup Complete

### Scripts & Tools (Ready)
- ✅ `scripts/n3fjp_mitm_relay.ts` - MITM relay (210 lines, transpiled)
- ✅ `scripts/analyze_n3fjp_log.ts` - Log analyzer (96 lines, ready to run)
- ✅ `scripts/n3fjp_test_setup.sh` - Test orchestrator (executable)
- ✅ `scripts/n3fjp_server_stub.py` - Test server (existing)
- ✅ Built with `npm run build` - TypeScript compiled

### Documentation (Complete)
- ✅ `N3FJP_TEST_QUICK_REF.md` - Copy-paste commands
- ✅ `PROTOCOL_ANALYSIS_SETUP.md` - Complete setup guide (this file explains everything)
- ✅ `docs/n3fjp_testing_guide.md` - Full testing workflow
- ✅ `docs/n3fjp_protocol_debugging.md` - Advanced debugging

### NPM Scripts (Configured)
- ✅ `npm run relay` - Launch relay with custom args
- ✅ `npm run relay:default` - Launch relay on ports 2000→1000
- ✅ `npm run dev:all` - Start API + UI
- ✅ `npm run dev:api` - Start just API

### Verified Working
- ✅ lsof installed (for port checking)
- ✅ Ports 2000, 1000 available
- ✅ TypeScript build successful
- ✅ Test setup script executable
- ✅ Test setup script check command working

## 🚀 Ready to Test

### Start in 3 Terminals

**Terminal 1 - Server:**
```bash
python3 scripts/n3fjp_server_stub.py
```

**Terminal 2 - Relay:**
```bash
npm run relay:default
```

**Terminal 3 - Client:**
```bash
npm run dev:all
```

Connect client to `localhost:2000`.

### Analyze Results
```bash
./scripts/n3fjp_test_setup.sh analyze
```

## 📊 What You'll Get

After running the test:

1. **Human-readable log** in `captures/n3fjp_mitm_TIMESTAMP.log`
   ```
   [2026-02-01T...] [conn-1] Client connected from 127.0.0.1:54321
   [2026-02-01T...] [conn-1] Connected to server at localhost:1000
   [2026-02-01T...] [conn-1] client→server (25 bytes): GETCONTESTNUMBER\r\n
   [2026-02-01T...] [conn-1] server→client (50 bytes): CONTESTNUMBER,1,2024\r\n
   ```

2. **Structured JSON** in `captures/n3fjp_mitm_TIMESTAMP.json`
   - Exact hex representation of each message
   - ASCII interpretation
   - Precise timestamps
   - Connection metadata

3. **Analysis output** from `./scripts/n3fjp_test_setup.sh analyze`
   - Parsed command/response sequence
   - Timing information
   - Any errors or anomalies

## 🔍 Debugging "Attempting to Connect"

When you run the test, check:

1. **Did client connect to relay?**
   ```bash
   grep "Client connected from" captures/n3fjp_mitm_*.log
   ```
   If YES → Continue to #2
   If NO → Client connecting to wrong port or relay crashed

2. **Did relay connect to server?**
   ```bash
   grep "Connected to server" captures/n3fjp_mitm_*.log
   ```
   If YES → Continue to #3
   If NO → Server not running on port 1000 or network issue

3. **Did client send commands?**
   ```bash
   grep "client→server" captures/n3fjp_mitm_*.log
   ```
   If YES → Continue to #4
   If NO → Client hanging before sending anything

4. **Did server respond?**
   ```bash
   grep "server→client" captures/n3fjp_mitm_*.log
   ```
   If YES → Protocol working, compare to spec
   If NO → Server not responding to client commands

## 📚 Documentation Map

| Document | Purpose | Read When |
|----------|---------|-----------|
| `N3FJP_TEST_QUICK_REF.md` | Quick commands | Starting test |
| `PROTOCOL_ANALYSIS_SETUP.md` | Full setup explanation | Understanding overview |
| `docs/n3fjp_testing_guide.md` | Complete workflow | Detailed reference |
| `docs/n3fjp_protocol_debugging.md` | Advanced usage | Deep diving into issues |

## ⚙️ Configuration

### Default Configuration
- Client port: `2000` (where relay listens)
- Server host: `localhost`
- Server port: `1000` (where relay forwards)

### Custom Configuration
```bash
# Use different ports
npm run relay -- 3000 192.168.1.50 1000
# Client connects to 3000, relay forwards to 192.168.1.50:1000

# Or with shell script
./scripts/n3fjp_test_setup.sh relay --client-port 3000 --server-host 192.168.1.50 --server-port 1000
```

## 🛠️ Troubleshooting

| Problem | Solution |
|---------|----------|
| Port already in use | `./scripts/n3fjp_test_setup.sh check` shows usage |
| No log files created | Check `captures/` directory exists and is writable |
| TypeScript errors | Run `npm run build` to recompile |
| "command not found: lsof" | Install: `apt-get install lsof` or `brew install lsof` |
| Relay won't start | Check server is running on port 1000 first |

## 📝 Next Steps

1. **Run the test** following the 3-terminal setup above
2. **Let it connect** and do a few interactions
3. **Analyze the logs** with `./scripts/n3fjp_test_setup.sh analyze`
4. **Compare** actual protocol vs expected N3FJP spec
5. **Fix** any issues found in client or server code
6. **Re-test** to verify fixes work

The relay will show you exactly what's being sent and received between client and server!

---

**Status**: ✅ Ready to debug. Start in 3 terminals as shown above.
