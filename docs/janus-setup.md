# Janus Gateway Setup for YAHAML Voice Rooms

Janus Gateway is a lightweight WebRTC media server that can capture audio from an RPi and expose it to YAHAML browser voice rooms.

## Architecture

```
RPi (Janus + Audio Capture)
  └─ ALSA input (radio, microphone, line-in)
      └─ Janus AudioBridge plugin
          └─ WebRTC (to browser)
          
YAHAML (Browser)
  └─ WebRTC peer connection
      └─ Audio mix (Janus output + local mic)
```

## Installation (Raspberry Pi)

### Prerequisites
- Raspberry Pi 3B+ or newer (4GB+ RAM recommended)
- Raspberry Pi OS (Bullseye or later)
- Audio interface configured (ALSA)

### 1. Install Dependencies

```bash
sudo apt-get update
sudo apt-get install -y \
  libmicrohttpd-dev \
  libjansson-dev \
  libssl-dev \
  libsofia-sip-dev \
  libglib2.0-dev \
  libopus-dev \
  libogg-dev \
  libcurl4-openssl-dev \
  liblua5.3-dev \
  pkg-config \
  gengetopt \
  libtool \
  autoconf \
  automake \
  build-essential
```

### 2. Install LibWebRTC (or use pre-built)

For RPi, use pre-built libwebrtc:

```bash
wget https://github.com/meetecho/janus-gateway/releases/download/v1.0.8/janus-gateway-1.0.8.tar.gz
tar xzf janus-gateway-1.0.8.tar.gz
cd janus-gateway-1.0.8
```

### 3. Compile Janus

```bash
./configure \
  --prefix=/opt/janus \
  --enable-plugin-audiobridge \
  --enable-plugin-echotest \
  --disable-plugin-videoroom \
  --disable-plugin-voicemail \
  --disable-plugin-sip \
  --disable-docs

make -j4
sudo make install
```

### 4. Configure Janus

Create `/opt/janus/etc/janus/janus.cfg.d/audiobridge.cfg`:

```cfg
# AudioBridge configuration
general: {
  # Audio codec (opus recommended)
  codec = "opus"
  
  # Sample rate (48000 Hz for web compatibility)
  sample_rate = 48000
  
  # Channels (stereo)
  channels = 2
  
  # Bitrate (128 kbps per participant)
  bitrate = 128000
}

# Rooms configuration
rooms: (
  {
    room_id = 1
    description = "Shack Voice Room"
    record = false
    permanent = true
  }
)
```

Create `/opt/janus/etc/janus/janus.cfg`:

```cfg
# General configuration
general: {
  json = "indented"
  debug_level = 3
  interface = "0.0.0.0"
  secure_port = 8889
  admin_secret = "changeme"
}

# WebRTC configuration
nat: {
  stun_server = "stun.l.google.com"
  stun_port = 19302
}

# Admin HTTP API
admin: {
  admin = true
  admin_port = 7088
}

# HTTP configuration
http: {
  http = true
  http_port = 8088
  https = false
}

plugins: {
  plugin_folder = "/opt/janus/lib/janus/plugins"
  audiobridge = "libjanus_audiobridge.so"
}
```

### 5. Audio Device Configuration (ALSA)

List available ALSA devices:

```bash
arecord -l
```

Example output:
```
**** List of CAPTURE Hardware Devices ****
card 0: ALSA           [ ALSA Default Audio Device ], device 0: USB Audio [USB Audio]
  Subdevices: 1/1
  Subdevice #0: subdevice #0
```

Create `/etc/asound.conf` for radio input:

```conf
pcm.radio {
  type hw
  card 0
  device 0
}

ctl.radio {
  type hw
  card 0
}
```

### 6. Run Janus

```bash
sudo /opt/janus/bin/janus \
  -c /opt/janus/etc/janus/janus.cfg \
  -C /opt/janus/etc/janus/janus.cfg.d/ \
  -L
```

Janus will run on:
- WebRTC: `wss://rpi-ip:8889`
- HTTP API: `http://rpi-ip:7088`

### 7. Docker Alternative

If running Janus in Docker on the RPi:

```yaml
# docker-compose.yml addition
janus:
  image: canyan/janus:latest
  ports:
    - "8088:8088"    # HTTP
    - "8889:8889"    # Secure WebRTC
    - "7088:7088"    # Admin
  volumes:
    - ./docker/janus.jcfg:/etc/janus/janus.jcfg
  devices:
    - /dev/snd:/dev/snd  # ALSA access
  environment:
    - JANUS_ADMIN_SECRET=changeme
    - JANUS_LOG_LEVEL=3
```

## YAHAML Integration

### Environment Variables

Add to `.env`:

```env
# Janus Gateway
JANUS_URL=https://rpi-ip:8889
JANUS_ADMIN_URL=http://rpi-ip:7088
JANUS_ADMIN_SECRET=changeme
JANUS_ROOM_ID=1
```

### Backend Handler

The voice room system will detect Janus availability and:
1. Register an audio source (Janus room feed)
2. Allow operators to listen and speak
3. Mix with local microphone input

### Listen-Only Sources

YAHAML supports multiple audio source types:

1. **Janus (full WebRTC)** - bidirectional, low latency
2. **HTTP Streaming** - unidirectional, simple
3. **System Audio** - operator's speaker output (for demos)

## Testing

From the browser (in YAHAML):

1. Open Voice Rooms panel
2. Join "Shack" room
3. Grant microphone permission
4. Hear Janus output (if configured)
5. Speak into mic (peers hear via Janus)

From command line:

```bash
curl -X POST http://rpi-ip:7088/admin \
  -H "Content-Type: application/json" \
  -d '{
    "janus": "info",
    "admin_secret": "changeme"
  }'
```

## Troubleshooting

**No audio from Janus:**
- Check ALSA device: `amixer -c 0`
- Test recording: `arecord -D radio -f S16_LE -r 48000 test.wav`
- Check Janus logs: `tail -f /var/log/janus.log`

**WebRTC connection fails:**
- Verify firewall: ports 8088, 8889 open
- Check STUN: `curl http://rpi-ip:7088/admin`
- Enable Janus debug: set `debug_level = 7` in config

**Latency issues:**
- Reduce bitrate in audiobridge.cfg
- Use UDP for faster transport
- Check network: `ping rpi-ip`

## Resources

- Janus GitHub: https://github.com/meetecho/janus-gateway
- AudioBridge Plugin: https://janus.conf.meetecho.com/docs/AudioBridge
- WebRTC Best Practices: https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API
