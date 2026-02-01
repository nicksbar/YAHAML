# N3FJP Protocol Testing - Quick Reference

## 3-Terminal Setup (Copy & Paste Ready)

### Terminal 1: Start Server
```bash
cd /home/nick/YAHAML
python3 scripts/n3fjp_server_stub.py
```

### Terminal 2: Start MITM Relay  
```bash
cd /home/nick/YAHAML
npm run relay:default
```

### Terminal 3: Start Client
```bash
cd /home/nick/YAHAML
npm run dev:all
```

Then connect client to `localhost:2000` (relay, not server on 1000).

## After Testing

### Check Results
```bash
cd /home/nick/YAHAML
./scripts/n3fjp_test_setup.sh analyze
```

### Monitor Logs Live
```bash
./scripts/n3fjp_test_setup.sh monitor
```

## Port Status
```bash
./scripts/n3fjp_test_setup.sh check
```

## What Gets Recorded

- **`captures/n3fjp_mitm_*.log`** - Human-readable log with timestamps
- **`captures/n3fjp_mitm_*.json`** - Structured data for analysis

## Expected Handshake

```
Client → Server: GETCONTESTNUMBER\r\n
Server → Client: CONTESTNUMBER,<num>,<year>\r\n

Client → Server: GETSERVERVERSION\r\n  
Server → Client: SERVERVERSION,<version>\r\n

Client → Server: GETOPERATORCALL\r\n
Server → Client: OPERATORCALL,<call>\r\n
```

## Troubleshooting

| Issue | Check |
|-------|-------|
| "Client stays attempting to connect" | `grep "client→server" captures/n3fjp_mitm_*.log` |
| Server not responding | `grep "server→client" captures/n3fjp_mitm_*.log` |
| Port in use | `./scripts/n3fjp_test_setup.sh check` |
| No logs created | Check captures/ directory exists |

## Full Debug Guide
See [docs/n3fjp_testing_guide.md](docs/n3fjp_testing_guide.md)
