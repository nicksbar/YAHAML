# Capture & Analysis Commands Reference

## Starting the Server Stub

```bash
cd /home/nick/YAHAML
source .venv/bin/activate

# Run with logging to file
python scripts/n3fjp_server_stub.py \
  --host 127.0.0.1 \
  --port 10000 \
  --log captures/session_$(date +%Y%m%d_%H%M%S).log
```

The stub will:
1. Listen on port 10000
2. Send greeting to each new client
3. Parse all message types
4. Respond with appropriate ACKs
5. Log all activity to the file

## Monitoring in Real-Time

In a second terminal:
```bash
# Watch the log file as it grows
tail -f /home/nick/YAHAML/captures/session_*.log

# Or filter for specific message types
tail -f /home/nick/YAHAML/captures/session_*.log | grep -E "BAMS|MESG|TRANSACTION|Client"

# Show only errors
tail -f /home/nick/YAHAML/captures/session_*.log | grep -i "error"
```

## After Testing - Parsing Captured Data

```bash
# Show raw captured messages
tail -100 /home/nick/YAHAML/captures/session_*.log

# Count message types
grep "Handling message" /home/nick/YAHAML/captures/session_*.log | \
  sed "s/.*tags: //" | sort | uniq -c | sort -rn

# Show only transactions (log entries)
grep "TRANSACTION" /home/nick/YAHAML/captures/session_*.log

# Extract specific QSO details from transaction
grep "TRANSACTION" /home/nick/YAHAML/captures/session_*.log | \
  sed "s/.*: //" | tail -1
```

## Using the Parse Scripts

If you have captured raw hex data, use the utility scripts:

```bash
# Parse hex log file into readable messages
python scripts/parse_n3fjp_log.py < captures/n3fjp_tcp_10000.log

# Decode individual hex payloads
python scripts/decode_raw_log.py < captures/n3fjp_tcp_10000.log
```

## Message Type Quick Filter

```bash
# Find all BAMS messages
grep -o "<BAMS>.*</BAMS>" captures/session_*.log

# Find all MESG (chat) messages
grep -o "<MESG>.*</MESG>" captures/session_*.log | head -5

# Find all TRANSACTION messages
grep -o "<NTWK>.*TRANSACTION.*</NTWK>" captures/session_*.log
```

## Expected Log Format (with timestamps)

```
Client connected: ('127.0.0.1', 54321)
Handling message with tags: ['BAMS', 'STATION', 'BAND', 'MODE']
Handling message with tags: ['NTWK', 'OPEN']
Handling message with tags: ['WHO']
Handling message with tags: ['SCLK', 'YEAR', 'MONTH', 'DAY', 'HOUR', 'MINUTE', 'SECOND', 'MILLISECOND']
Handling message with tags: ['MESG', 'TO', 'FROM', 'MSGTXT']
Handling message with tags: ['NTWK', 'FROM', 'TRANSACTION', 'XMLDATA']
Log entry ADD: from LAPTOP-ABC, call W1AW, band 15m, mode PH
Sent to ('127.0.0.1', 54321): <BOR><NTWK><TRANSACTION>...[ACK]
```

## Troubleshooting

**Client won't connect:**
- Check port 10000 is available: `lsof -i :10000`
- Ensure firewall allows 127.0.0.1:10000
- Verify N3FJP is configured to connect to 127.0.0.1:10000

**Messages not appearing in log:**
- Check stub started with `--log` parameter
- Verify file permissions: `ls -l captures/session_*.log`
- Ensure N3FJP is actually connected (look for "Client connected" message)

**"Client disconnects after X messages":**
- This was due to missing TRANSACTION ACK (now fixed)
- Updated stub should keep connections longer
- Run updated stub: `.venv/bin/python scripts/n3fjp_server_stub.py ...`

**Strange characters in log:**
- UTF-16LE decoding artifacts - this is normal
- Use parse scripts to clean up output
- Stub automatically strips control bytes

## Analysis Workflow

1. **Start stub** - Open Terminal 1:
   ```bash
   cd /home/nick/YAHAML
   source .venv/bin/activate
   python scripts/n3fjp_server_stub.py --host 127.0.0.1 --port 10000 \
     --log captures/test_$(date +%s).log
   ```

2. **Monitor logs** - Open Terminal 2:
   ```bash
   tail -f /home/nick/YAHAML/captures/test_*.log
   ```

3. **Run N3FJP** - Open Terminal 3 or use N3FJP directly:
   - Configure connection to 127.0.0.1:10000
   - Perform test actions (change bands, send messages, log QSO)
   - Let it run for 30-60 seconds

4. **Check captured data** - In Terminal 2:
   ```bash
   # Count message types
   grep "Handling message" captures/test_*.log | wc -l
   # Show transactions
   grep "TRANSACTION" captures/test_*.log
   ```

5. **Document findings** - Update protocol docs if new message types appear

## File Locations

- **Captured logs**: `/home/nick/YAHAML/captures/`
- **Server stub**: `/home/nick/YAHAML/scripts/n3fjp_server_stub.py`
- **Protocol docs**: `/home/nick/YAHAML/docs/`
- **Parse utilities**: `/home/nick/YAHAML/scripts/parse_*.py`

## Key Files to Reference

| File | Purpose |
|------|---------|
| [protocol-summary.md](./docs/protocol-summary.md) | Complete protocol reference |
| [quick-start.md](./docs/quick-start.md) | Fast lookup and commands |
| [testing-plan.md](./docs/testing-plan.md) | Test scenarios and validation |
| [canonical-log-model.md](./docs/canonical-log-model.md) | QSO field mapping |
| [n3fjp_server_stub.py](./scripts/n3fjp_server_stub.py) | Server implementation |
