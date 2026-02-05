# Radio Audio Source Management

YAHAML allows you to configure audio sources for each radio, enabling operators to hear the radio audio through their web browser while logging QSOs.

## Overview

Each radio connection can have an optional audio source configured. When an operator is assigned to a radio with an audio source, they automatically hear the radio audio in their browser with individual mute and volume controls.

## Audio Source Types

### 1. **No Audio** (Default)
- Radio operates normally but no audio is streamed
- Use for radios where operators use physical speakers/headphones

### 2. **Janus Gateway** (Recommended)
- Uses Janus WebRTC Gateway for low-latency audio streaming
- Best for real-time operation
- Requires Janus Gateway running on Raspberry Pi or server
- Configuration fields:
  - **Janus Room ID**: Audiobridge room number (e.g., `1234`)
  - **Janus Stream ID**: Participant/stream identifier (e.g., `radio1`)

### 3. **HTTP Stream**
- Simple HTTP audio stream (MP3, OGG, etc.)
- Higher latency than Janus
- Works with any HTTP audio server (Icecast, ffmpeg, etc.)
- Configuration field:
  - **HTTP Stream URL**: Full URL to audio stream (e.g., `http://192.168.1.100:8080/radio.mp3`)

### 4. **Loopback (Test/Demo)**
- Perfect for testing and demonstrations without real hardware
- Generates realistic radio static (white noise)
- Plays CW Morse code of station callsign periodically (every 15-30 seconds)
- Echoes operator's microphone input (parrot mode)
- No configuration required - works out of the box
- Uses Web Audio API for audio synthesis

## Configuration

### In Radio Control UI

1. Navigate to **Radio Control** page
2. Find your radio in the list
3. Expand the **🔊 Audio Source** section
4. Select audio source type from dropdown
5. Fill in required fields based on type selected
6. Changes save automatically

### Example Configurations

**Janus Gateway for IC-7300:**
```
Source Type: Janus Gateway
Janus Room ID: 1234
Janus Stream ID: ic7300
```

**HTTP Stream from Raspberry Pi:**
```
Source Type: HTTP Stream
HTTP Stream URL: http://192.168.1.50:8000/radio1.mp3
```

**Loopback for Testing:**
```
Source Type: Loopback (Test/Demo)
(No additional configuration needed)
```

## Loopback Audio Details

The loopback audio source is perfect for testing YAHAML without real radio hardware. It generates:

### White Noise (Radio Static)
- Continuous background static at ~15% volume
- Simulates ambient radio noise
- Generated using Web Audio API buffer with random values

### CW Morse Code
- Automatically plays station callsign in CW (Morse code)
- Plays immediately on connection, then every 15-30 seconds
- 700 Hz tone (standard CW pitch)
- Proper dit/dah timing (1:3 ratio)
- Example: `N7UF` → `-.  --...  ..-  ..-.`

### Microphone Echo (Parrot Mode)
- Echoes operator's microphone input at 50% volume
- Requires microphone permission
- Perfect for testing PTT and audio controls
- Can be muted independently via audio controls

### Technical Implementation
```typescript
// Morse code generation
const morseCode = {
  'N': '-.',    // dah dit
  '7': '--...',  // dah dah dit dit dit
  'U': '..-',    // dit dit dah
  'F': '..-.',   // dit dit dah dit
}

// 80ms dit duration, 700 Hz tone
// White noise generated from random buffer
// All mixed via Web Audio API gainNode
```

## Audio Playback in LoggingPage

When an operator is assigned to a radio with an audio source:

1. **Automatic Connection**: Audio stream starts automatically when logging page loads
2. **Audio Controls**: Mute button (🔊/🔇) and volume slider (0-100%) appear in assigned radio panel
3. **Real-time Control**: Changes to mute/volume apply immediately to local playback
4. **Cleanup**: Audio stream stops when leaving page or radio assignment changes

### Audio Control UI

Located in the **📻 Assigned Radio** panel on the LoggingPage sidebar:

```
🔊 Audio
[🔊]  [━━━━━━━━━━] 100%
```

- **Mute button**: Click to toggle mute
- **Volume slider**: Drag to adjust volume (0-100%)
- **Volume disabled when muted**: Slider grays out

## Technical Implementation

### HTTP Stream
- Creates HTML5 `<Audio>` element
- Sets `src` to HTTP stream URL
- Applies volume and mute state
- Automatically plays when assigned

### Loopback
- Creates Web Audio API context
- Generates white noise buffer (2 seconds, looped)
- Requests microphone access for echo
- Synthesizes CW tones on interval
- All sources mixed through master gain node

### Janus Gateway
- Connects to Janus WebRTC audiobridge
- Subscribes to specified room and stream
- Receives low-latency Opus audio
- **Note**: Full Janus client implementation pending (placeholder in code)

## Audio Source Setup Examples

### Setting up Janus Gateway

See [janus-setup.md](./janus-setup.md) for complete Janus installation guide.

**Quick ALSA → Janus configuration:**
1. Install Janus on Raspberry Pi
2. Configure audiobridge plugin with room
3. Use `gst-launch` or `ffmpeg` to stream ALSA audio to Janus room
4. Configure radio with Janus room ID and stream ID

### Setting up HTTP Stream with ffmpeg

Stream radio audio from ALSA device to HTTP:

```bash
ffmpeg -f alsa -i hw:1,0 \
  -acodec libmp3lame -ab 128k -ac 1 -ar 44100 \
  -f mp3 \
  http://localhost:8000/radio1.mp3
```

Or use Icecast for multiple streams:

```bash
ffmpeg -f alsa -i hw:1,0 \
  -acodec libmp3lame -ab 128k -ac 1 -ar 44100 \
  -f mp3 \
  icecast://source:hackme@localhost:8000/radio1.mp3
```

## Database Schema

Audio source fields added to `RadioConnection` model:

```prisma
model RadioConnection {
  // ... existing fields ...
  
  audioSourceType  String?  // "janus" | "http-stream" | "loopback" | null
  janusRoomId      String?  // Janus audiobridge room ID
  janusStreamId    String?  // Janus stream/participant ID
  httpStreamUrl    String?  // HTTP audio stream URL
}
```

## API Endpoints

### Update Radio Audio Source

**PUT** `/api/radios/:id`

```json
{
  "audioSourceType": "janus",
  "janusRoomId": "1234",
  "janusStreamId": "radio1"
}
```

or

```json
{
  "audioSourceType": "http-stream",
  "httpStreamUrl": "http://192.168.1.50:8000/radio1.mp3"
}
```

or

```json
{
  "audioSourceType": "loopback"
}
```

or

```json
{
  "audioSourceType": null
}
```

## Integration with Voice Rooms

Radio audio is **separate** from voice room intercom:

- **Voice Rooms**: Operator-to-operator communication (PTT, mute, volume)
- **Radio Audio**: One-way radio reception (listen to radio, mute, volume)

Both can operate simultaneously:
- Operator hears: **Janus radio audio** + **peer operator voices** (mixed by browser)
- Operator transmits: **Microphone → other operators** via WebRTC

## Troubleshooting

### No audio playing

1. **Check browser console** for errors
2. **Verify audio source configured** in Radio Control
3. **Test HTTP stream URL** in browser directly
4. **Check Janus Gateway** is running (if using Janus)
5. **Browser autoplay policy**: Some browsers require user interaction before playing audio

### Audio clicking "Failed to play"

- Browser autoplay blocked - click anywhere on page to enable audio
- HTTP stream URL unreachable - verify URL in browser
- CORS issue - ensure audio server allows cross-origin requests

### Janus not connecting

- Janus Gateway not running - check Janus service status
- Room ID mismatch - verify room exists in Janus
- WebRTC connection failed - check firewall/NAT settings

### Volume/Mute not working

- Audio element not created - check browser console
- State not persisting - ensure radio assignment is active

## Future Enhancements

- [ ] Full Janus client integration (currently placeholder)
- [ ] Audio level meter visualization
- [ ] Automatic reconnection on stream failure
- [ ] Multiple audio sources per radio (e.g., radio + recorder)
- [ ] Audio mixing configuration (balance radio vs. peers)
- [ ] Recording capability for radio audio
- [ ] Audio quality settings (bitrate, codec selection)
