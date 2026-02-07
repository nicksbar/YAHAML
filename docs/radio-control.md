# Radio Control & Hamlib Integration

YAHAML includes comprehensive radio control through Hamlib's `rigctld` protocol, enabling remote radio control and automatic frequency/mode tracking for logging.

## Overview

The Hamlib integration allows:
- **Remote radio control** via rigctld servers on your network
- **Automatic frequency/mode tracking** for logging
- **Multi-radio support** with operator assignment
- **Wireless logging stations** following the control operator's radio
- **USB and network connections** supported
- **Real-time band activity** updates

## Architecture

```
┌─────────────┐         ┌──────────────┐         ┌──────────────┐
│   Radio     │ USB/NET │   rigctld    │   TCP   │   YAHAML     │
│  (IC-7300)  │◄───────►│   Server     │◄───────►│   Server     │
└─────────────┘         └──────────────┘  :4532  └──────────────┘
                              │                          │
                              │                          │
                         PC/Raspberry Pi           ┌─────▼──────┐
                         Same network as           │  Logging   │
                         YAHAML server             │  Station   │
                                                   │ (wireless) │
                                                   └────────────┘
```

## Setup

### 1. Install Hamlib

**Ubuntu/Debian:**
```bash
sudo apt-get update
sudo apt-get install hamlib-utils
```

**macOS:**
```bash
brew install hamlib
```

**Windows:**
Download from [Hamlib website](https://github.com/Hamlib/Hamlib/releases)

### 2. Start rigctld

**USB Connection:**
```bash
# List available rigs
rigctl --list

# Start rigctld for Icom IC-7300 (rig 3073)
rigctld -m 3073 -r /dev/ttyUSB0 -s 115200

# Or for Yaesu FT-991A (rig 1035)
rigctld -m 1035 -r /dev/ttyUSB0 -s 38400
```

**Network/WiFi Radio:**
```bash
# For Icom IC-7300 with network interface
rigctld -m 3073 -r 192.168.1.100:50001
```

**Common rigctld options:**
- `-m MODEL` - Radio model number (see rigctl --list)
- `-r DEVICE` - Serial port or IP:PORT
- `-s SPEED` - Serial baud rate
- `-t PORT` - TCP port to listen on (default: 4532)
- `-T IP` - Bind to specific IP (use 0.0.0.0 for all interfaces)

### 3. Configure in YAHAML

Use the web interface or API to add radio connections.

## Usage Scenarios

### Scenario 1: Single Radio, Single Operator

```bash
# Start rigctld on radio PC
rigctld -m 3073 -r /dev/ttyUSB0 -s 115200 -T 0.0.0.0

# In YAHAML UI:
# 1. Add radio: "IC-7300" at "192.168.1.100:4532"
# 2. Enable radio (connects automatically)
# 3. Assign radio to your station (W1ABC)
# 4. Logging screen automatically follows your frequency/mode
```

### Scenario 2: Multiple Radios, Field Day Setup

```bash
# Station 1 - Raspberry Pi with IC-7300
rigctld -m 3073 -r /dev/ttyUSB0 -s 115200 -t 4532

# Station 2 - Windows PC with FT-991A  
rigctld.exe -m 1035 -r COM3 -s 38400 -t 4533

# Station 3 - Linux laptop with TS-590SG
rigctld -m 2014 -r /dev/ttyUSB0 -s 115200 -t 4534
```

In YAHAML:
1. Add all three radios with their IPs/ports
2. Enable all radios
3. Assign Radio 1 → W1ABC/Station1
4. Assign Radio 2 → K2DEF/Station2  
5. Assign Radio 3 → N3GHI/Station3
6. Each logging station sees their assigned radio's frequency

### Scenario 3: Wireless/Mobile Logging

The control operator uses their phone/tablet to log:
- No rigctld software needed on mobile device
- Logs to YAHAML web interface
- Frequency/mode automatically populated from assigned radio
- Works from anywhere on the network

## API Reference

### Radio Configuration (HTTP REST)

Radio configuration and management endpoints use HTTP REST API.

#### Create Radio Connection
```bash
POST /api/radios
Content-Type: application/json

{
  "name": "IC-7300 Station 1",
  "host": "192.168.1.100",
  "port": 4532,
  "pollInterval": 1000
}
```

**Response:**
```json
{
  "id": "clx123...",
  "name": "IC-7300 Station 1",
  "host": "192.168.1.100",
  "port": 4532,
  "pollInterval": 1000,
  "isEnabled": false,
  "isConnected": false,
  "createdAt": "2026-01-31T12:00:00.000Z"
}
```

#### List Radios
```bash
GET /api/radios
```

#### Get Radio
```bash
GET /api/radios/:id
```

#### Update Radio
```bash
PUT /api/radios/:id
Content-Type: application/json

{
  "name": "Updated Name",
  "isEnabled": true,
  "pollInterval": 500
}
```

#### Delete Radio
```bash
DELETE /api/radios/:id
```

### Radio Control (WebSocket)

**All radio control operations now go through WebSocket for real-time, atomic execution.**

#### Connect to WebSocket
```javascript
const ws = new WebSocket('ws://localhost:3000/ws');
ws.onopen = () => {
  console.log('Connected to radio control');
};
```

#### Send Radio Control Command
```javascript
ws.send(JSON.stringify({
  type: 'radioControl',
  data: {
    radioId: 'clx123...',
    command: 'setFrequency',
    params: { frequencyHz: 14074000 }
  }
}));
```

#### Radio Control Commands

All commands follow the same format: `{ type: 'radioControl', data: { radioId, command, params } }`

##### setFrequency
Set radio frequency in Hz.
```javascript
{
  command: 'setFrequency',
  params: { frequencyHz: 14074000 }  // 14.074 MHz
}
```

##### setMode
Set frequency mode (USB, LSB, CW, FM, AM, PKTUSB, PKTLSB, RTTY, etc.) and optional bandwidth.
```javascript
{
  command: 'setMode',
  params: { 
    mode: 'USB',           // Optional
    bandwidth: 3000        // Optional, in Hz
  }
}
```

##### setPower
Set transmit power (0-100%).
```javascript
{
  command: 'setPower',
  params: { power: 75 }  // 75% power
}
```

##### setPtt
Enable/disable push-to-talk (transmit).
```javascript
{
  command: 'setPtt',
  params: { enabled: true }  // true = TX, false = RX
}
```

##### setVfo
Select VFO (A or B).
```javascript
{
  command: 'setVfo',
  params: { vfo: 'VFO_A' }  // or 'VFO_B'
}
```

##### sendRaw
Send raw hamlib command (advanced).
```javascript
{
  command: 'sendRaw',
  params: { rawCommand: 'f\n' }  // Get frequency
}
```

#### Command Response
Each command receives a response or error:
```javascript
ws.onmessage = (event) => {
  const msg = JSON.parse(event.data);
  
  if (msg.type === 'radioControlResponse') {
    console.log('Command succeeded:', msg.data);
  } else if (msg.type === 'error') {
    console.error('Command failed:', msg.data);
  }
};
```

#### Radio State Updates
After successful commands, the radio's new state is broadcast to all connected clients via WebSocket:
```javascript
{
  type: 'radioStateUpdate',
  channel: 'radio',
  data: {
    radioId: 'clx123...',
    state: {
      frequency: 14074000,
      mode: 'USB',
      bandwidth: 3000,
      power: 75,
      ptt: false,
      vfo: 'VFO_A',
      isConnected: true
    }
  }
}
```

### Radio Assignments (HTTP REST)

#### Assign Radio to Station
```bash
POST /api/radio-assignments
Content-Type: application/json

{
  "radioId": "clx123...",
  "stationId": "clx456..."
}
```

#### Get Active Assignments
```bash
GET /api/radio-assignments/active
```

#### Get All Assignments
```bash
GET /api/radio-assignments
```

#### Unassign Radio
```bash
POST /api/radio-assignments/:id/unassign
```

## Database Schema

### RadioConnection
```prisma
model RadioConnection {
  id            String   // Unique ID
  name          String   // Friendly name
  host          String   // rigctld hostname/IP
  port          Int      // rigctld port (default: 4532)
  manufacturer  String?  // e.g., "Icom"
  model         String?  // e.g., "IC-7300"
  
  // Connection state
  isConnected   Boolean  // Currently connected?
  lastSeen      DateTime?
  lastError     String?
  
  // Current radio state (cached)
  frequency     String?  // Hz
  mode          String?  // USB, LSB, CW, etc.
  bandwidth     Int?     // Hz
  power         Int?     // Watts
  
  pollInterval  Int      // Polling interval (ms)
  isEnabled     Boolean  // Auto-connect on startup?
  
  assignments   RadioAssignment[]
}
```

### RadioAssignment
```prisma
model RadioAssignment {
  id           String    // Unique ID
  radioId      String    // Radio connection
  stationId    String    // Assigned station
  isActive     Boolean   // Currently active?
  assignedAt   DateTime
  unassignedAt DateTime?
  
  radio        RadioConnection
  station      Station
}
```

## How It Works

### WebSocket-Based Control Architecture

YAHAML uses WebSocket for all real-time radio control to provide:
- **Atomic execution**: Commands execute sequentially, no race conditions
- **Instant feedback**: Frequency/mode changes visible immediately
- **State consistency**: Single source of truth via state broadcast
- **No polling overhead**: Only real changes generate updates

#### Control Flow

```
┌─────────────┐
│   Browser   │  1. User clicks "Change Frequency"
│   (React)   │     or adjusts slider
└──────┬──────┘
       │ 2. Sends radioControl WebSocket message
       │    { type: 'radioControl', 
       │      data: { radioId, command, params } }
       ▼
┌─────────────────────────────┐
│  WebSocket Manager          │ 3. Routes to handleRadioControl()
│  (src/websocket.ts)         │
└──────┬──────────────────────┘
       │ 4. Validates command and parameters
       │    (frequency range, mode, power 0-100, etc.)
       ▼
┌─────────────────────────────┐
│  Radio Manager              │ 5. Executes command via hamlib
│  (src/hamlib.ts)            │    - Serializes via commandQueue
│  - commandQueue             │    - Prevents command interleaving
│  - commandInFlight          │    - Fetches fresh state after command
│  - pollInProgress           │
└──────┬──────────────────────┘
       │ 6. Fetches radio state from rigctld
       │ 7. Updates database
       ▼
┌──────────────────────────────┐
│  Broadcast radioStateUpdate  │ 8. Sends to ALL connected clients
│  via WebSocket               │    (atomic state snapshot)
└──────┬───────────────────────┘
       │ 9. Clients receive state update
       ▼
┌──────────────────────────────┐
│  Browser State Update        │ 10. React updates radioLiveState
│  (React component)           │     - Frequency display changes
│  radioLiveState[radioId]     │     - Mode dropdown updates
│                              │     - Power slider moves
└──────────────────────────────┘
```

### Polling System (Automatic State Reading)

Separate from WebSocket control, YAHAML continuously polls radio state:

- **Poll interval**: 1000ms (1 second) per radio, configurable
- **Prevents overlap**: `pollInProgress` flag stops concurrent polls
- **Queue protection**: Max ~5 pending commands regardless of frequency
- **Non-blocking**: Polling doesn't block user commands in WebSocket

#### Polling Flow

```
┌──────────────────────┐
│ Poll Timer (1000ms)  │
└─────────┬────────────┘
          │ Check pollInProgress[radioId]
          │
          ├─ If true: SKIP (previous poll still running)
          │           Queue stays small (~5 items)
          │
          └─ If false: PROCEED
             ▼
       ┌────────────────────┐
       │ Set pollInProgress │
       │ = true             │
       └────────┬───────────┘
                │ Send getState() command
                ▼
             rigctld Server
                ▼
       ┌────────────────────┐
       │ Receive state      │
       │ Update DB          │
       └────────┬───────────┘
                │ Broadcast radioStateUpdate
                │ (to all connected clients)
                ▼
       ┌────────────────────┐
       │ Set pollInProgress │
       │ = false            │
       └────────────────────┘
```

### Automatic Tracking

1. **Connection**: YAHAML connects to rigctld server via TCP
2. **Polling**: Radio state polled every 1000ms (configurable)
3. **Band Activity**: Frequency converted to band (20m, 40m, etc.)
4. **Mode Mapping**: Radio modes normalized to CW/PHONE/DIGITAL
5. **Station Update**: Assigned station's band activity updated
6. **UI Sync**: Logging screen shows current frequency/mode

### Frequency to Band Conversion

```javascript
1.8-2.0 MHz    → 160m
3.5-4.0 MHz    → 80m
7.0-7.3 MHz    → 40m
14.0-14.35 MHz → 20m
21.0-21.45 MHz → 15m
28.0-29.7 MHz  → 10m
50-54 MHz      → 6m
144-148 MHz    → 2m
420-450 MHz    → 70cm
```

### Mode Normalization

```javascript
CW/CWR         → CW
USB/LSB/SSB/FM → PHONE
FT8/FT4/RTTY   → DIGITAL
PSK/MFSK       → DIGITAL
```

## Troubleshooting

### Control commands not working

1. **Check WebSocket is connected:**
   - Open browser DevTools → Network tab → WS
   - Should see `ws://...:3000/ws` connection
   - Status should be "Connected"

2. **Check radio is enabled:**
   - UI should show radio as "Connected" (green indicator)
   - Status must say `isConnected: true`

3. **Check command format:**
   - Ensure correct `radioId` (copy from list)
   - Ensure command name is exact (setFrequency, setMode, setPower, setPtt, setVfo, sendRaw)
   - Ensure params match command requirements (see API Reference above)

4. **Check hamlib command queue:**
   - Look at server logs for hamlib errors
   - If rigctld is unresponsive, queue backs up
   - Max queue size ~5 commands

### Radio won't connect

1. **Check rigctld is running:**
   ```bash
   ps aux | grep rigctld
   ```

2. **Test rigctld manually:**
   ```bash
   telnet 192.168.1.100 4532
   # Type: f (get frequency)
   # Should return frequency in Hz
   ```

3. **Check firewall:**
   ```bash
   sudo ufw allow 4532/tcp
   ```

4. **Verify host/port in YAHAML:**
   - Host must be IP or hostname reachable from YAHAML server
   - Default port is 4532

### Frequency not updating

1. **Check radio is enabled:** Status should be "Connected"
2. **Check assignment:** Radio must be assigned to a station
3. **Check poll interval:** Default 1000ms (1 second)
4. **Check logs:** Look for error messages in server console

### Wrong band/mode detected

1. **Check frequency:** Should be in Hz (e.g., 14250000 for 14.25 MHz)
2. **Mode normalization:** Some exotic modes may default to PHONE
3. **Edit hamlib.ts:** Adjust `frequencyToBand()` or `normalizeMode()`

## Supported Radios

Hamlib supports 200+ radio models. Popular ones:

| Manufacturer | Model | rigctld -m | Baud Rate |
|--------------|-------|-----------|-----------|
| Icom | IC-7300 | 3073 | 115200 |
| Icom | IC-9700 | 3081 | 115200 |
| Yaesu | FT-991A | 1035 | 38400 |
| Yaesu | FT-DX10 | 1042 | 38400 |
| Kenwood | TS-590SG | 2014 | 115200 |
| Elecraft | K3 | 2029 | 38400 |
| FlexRadio | 6000 series | 2032 | N/A (network) |

Full list: `rigctl --list`

## Performance

- **Polling interval:** Default 1000ms (1 second)
- **Network overhead:** ~100 bytes per poll
- **CPU usage:** Minimal (<1% per radio)
- **Scalability:** Tested with 10+ simultaneous radios

## Security

- rigctld has **no authentication** by default
- Use firewall to restrict access
- Consider VPN for remote access
- Don't expose rigctld to the internet

## Advanced Usage

### Multiple Operators per Radio

Not directly supported (one active assignment per radio), but you can:
1. Unassign radio from Operator A
2. Assign radio to Operator B
3. Reassign back as needed

### Custom Polling Intervals

Adjust per radio:
```json
{
  "pollInterval": 500   // 500ms for faster updates
}
```

### Network Radio Direct

Some radios (IC-7300, IC-9700) support network control:
```bash
# No rigctld needed - YAHAML connects directly
# (Future feature - not yet implemented)
```

## Future Enhancements

- [x] **Radio control from UI** (COMPLETED Feb 7, 2026) - WebSocket-based controls available
- [x] **WebSocket radio control** (COMPLETED Feb 7, 2026) - Atomic message-driven architecture
- [ ] Direct network radio support (no rigctld) - For modern radios with built-in network control
- [ ] CAT command logging for debugging
- [ ] Multi-operator radio sharing (time slicing / mode splitting)
- [ ] Historical frequency tracking and statistics
- [ ] Band/mode statistics per radio
- [ ] Integration with contest scoring (bonus points for activation)
- [ ] Automatic power level adjustment based on band/mode
- [ ] Radio state persistence (save/restore presets)

## Testing

Test suite: `tests/websocket-radio-control.test.ts` - 13 tests covering all command types and error handling.

### Manual Testing with WebSocket

**JavaScript/Browser Console:**
```javascript
// Open browser DevTools console on YAHAML page
const ws = new WebSocket('ws://localhost:3000/ws');

ws.onopen = () => console.log('Connected');
ws.onmessage = (e) => console.log('Response:', JSON.parse(e.data));
ws.onerror = (e) => console.error('Error:', e);

// Send a frequency change command
ws.send(JSON.stringify({
  type: 'radioControl',
  data: {
    radioId: 'YOUR_RADIO_ID',
    command: 'setFrequency',
    params: { frequencyHz: 14074000 }
  }
}));
```

### Manual Testing with curl (REST API)

**Create a radio:**
```bash
curl -X POST http://localhost:3000/api/radios \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Radio",
    "host": "localhost",
    "port": 4532,
    "pollInterval": 1000
  }'
```

**List radios:**
```bash
curl http://localhost:3000/api/radios | jq
```

**Update radio:**
```bash
curl -X PUT http://localhost:3000/api/radios/RADIO_ID \
  -H "Content-Type: application/json" \
  -d '{"isEnabled": true}'
```

### Running Automated Tests

```bash
# Run all tests
npm test

# Run only radio control tests
npm test -- websocket-radio-control

# Run with verbose output
npm test -- --verbose
```

## Support

For issues:
1. Check rigctld is running and accessible
2. Verify network connectivity
3. Check YAHAML server logs
4. Test with `telnet` or `rigctl` directly
5. Review Hamlib documentation: https://hamlib.github.io/

## Resources

- **Hamlib Documentation:** https://hamlib.github.io/
- **rigctld Manual:** `man rigctld`
- **Radio Control Codes:** `rigctl --list`
- **Hamlib GitHub:** https://github.com/Hamlib/Hamlib
