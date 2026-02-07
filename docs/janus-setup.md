# Janus Gateway Setup for YAHAML Voice Rooms

Janus Gateway is a lightweight WebRTC media server that can capture audio from an RPi and expose it to YAHAML browser voice rooms.

**Recommended topology:** run Janus on the RPi as a standalone server, and have YAHAML connect to it as a client. This keeps radio audio capture close to the hardware and avoids coupling Janus to the YAHAML backend.

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
  libnice-dev \
  libsrtp2-dev \
  libconfig-dev \
  libsofia-sip-ua-dev \
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

### 2. Install Janus (source build)

For RPi, build from the release tarball:

```bash
wget https://github.com/meetecho/janus-gateway/releases/download/v1.4.0/janus-gateway-1.4.0.tar.gz
tar xzf janus-gateway-1.4.0.tar.gz
cd janus-gateway-1.4.0
```

If you cloned a git tag/branch (e.g., 1.4.0), run autogen first to create `configure`:

```bash
./autogen.sh
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
sudo make configs

If you see missing `.jcfg` errors at startup, ensure the sample configs are installed:

```bash
ls -1 /opt/janus/etc/janus/*.jcfg
```

If the folder only contains `*.jcfg.sample` files, copy them into place:

```bash
cd /opt/janus/etc/janus
sudo cp -n *.jcfg.sample *.jcfg
```
```

### 4. Configure Janus

Janus 1.4 uses `.jcfg` files by default. After `make configs`, edit the installed samples in `/opt/janus/etc/janus/`.

Edit `/opt/janus/etc/janus/janus.plugin.audiobridge.jcfg` (room settings):

```cfg
general: {
  # Sample rate (48000 Hz for web compatibility)
  #sampling_rate = 48000
}

room-1: {
  description = "Shack Voice Room"
  record = false
}
```

Edit `/opt/janus/etc/janus/janus.jcfg` (core settings):

```cfg
general: {
  debug_level = 3
  admin_secret = "changeme"
}

certificates: {
  cert_pem = "/opt/janus/etc/janus/janus.pem"
  cert_key = "/opt/janus/etc/janus/janus.key"
}

nat: {
  # For LAN-only use, this can be omitted.
  # If you want Internet access, keep a STUN server configured.
  stun_server = "stun.l.google.com"
  stun_port = 19302
}

plugins: {
  # Disable unused plugins to avoid startup errors (recordplay needs a recordings path).
  disable = "libjanus_recordplay.so,libjanus_streaming.so,libjanus_videocall.so,libjanus_nosip.so"
}

transports: {
  # Disable Unix socket transport if you don't need it.
  disable = "libjanus_pfunix.so"
}
```

Edit `/opt/janus/etc/janus/janus.transport.http.jcfg` (HTTP + Admin API):

```cfg
general: {
  http = true
  port = 8088
  https = false
}

admin: {
  admin_http = true
  admin_port = 7088
  admin_secret = "changeme"
}
```

### 5. Audio Device Configuration (ALSA)

List available ALSA devices:

```bash
arecord -l
```

Example output (IC-7300 USB audio):
```
**** List of CAPTURE Hardware Devices ****
card 2: CODEC [USB Audio CODEC], device 0: USB Audio [USB Audio]
  Subdevices: 1/1
  Subdevice #0: subdevice #0
```

Create `/etc/asound.conf` for the radio input (IC-7300 in this case):

```conf
pcm.radio {
  type hw
  card 2
  device 0
}

ctl.radio {
  type hw
  card 2
}
```

If you plan to add a separate headphones interface later, keep it as a separate ALSA device (e.g., `pcm.headphones`) and leave `pcm.radio` bound to the IC-7300 USB Audio CODEC.

### 6. Run Janus

Generate a DTLS certificate and key (required):

```bash
sudo openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
  -keyout /opt/janus/etc/janus/janus.key \
  -out /opt/janus/etc/janus/janus.pem \
  -subj "/CN=janus"
sudo chown janus:janus /opt/janus/etc/janus/janus.key /opt/janus/etc/janus/janus.pem

> Janus CLI flags: `-C` is the config file, `-F` is the config folder.
> The `-c`/`-k` flags are for DTLS cert/key only (use them only if you don't set `certificates` in `janus.jcfg`).
```

```bash
sudo /opt/janus/bin/janus \
  -C /opt/janus/etc/janus/janus.jcfg \
  -F /opt/janus/etc/janus \
  -L /var/log/janus.log
```

Janus will run on:
- WebRTC: `wss://rpi-ip:8889`
- HTTP API: `http://rpi-ip:8088`
- Admin API: `http://rpi-ip:7088`

### 6b. Run Janus as a Service (recommended)

Create a systemd unit at `/etc/systemd/system/janus.service`:

```ini
[Unit]
Description=Janus WebRTC Gateway
After=network.target

[Service]
Type=simple
User=janus
Group=janus
ExecStart=/opt/janus/bin/janus -C /opt/janus/etc/janus/janus.jcfg -F /opt/janus/etc/janus -L /var/log/janus.log
Restart=on-failure
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
```

Create a `janus` user, set ownership, and enable the service:

```bash
sudo useradd -r -s /usr/sbin/nologin janus
sudo chown -R janus:janus /opt/janus
sudo touch /var/log/janus.log
sudo chown janus:janus /var/log/janus.log
sudo systemctl daemon-reload
sudo systemctl enable --now janus
```

### 6c. Validate the Server

Confirm Janus is up:

```bash
systemctl status janus
curl http://rpi-ip:8088/janus/info
```

If you see a JSON response, Janus is running.

### 6d. YAHAML Connection Notes

YAHAML is expected to connect to Janus as a client (AudioBridge room). Configure the radio audio source in the YAHAML UI to `Janus Gateway` and set the room ID to match the AudioBridge room you created.

> Note: Janus client wiring in YAHAML is still marked as a TODO in the UI code. The server setup here is ready, but the client connection may need additional implementation before audio flows end-to-end.

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

**FATAL: DTLS certificate and key must be specified**
- Generate the cert/key and set `cert_pem`/`cert_key` in `janus.cfg` (see Step 6).

**WARN: Couldn't access logger plugins folder**
- Ensure `/opt/janus/lib/janus/loggers` exists and is readable by the `janus` user.

**Missing .jcfg files / recordplay fatal**
- Ensure `make configs` was run and `*.jcfg` files exist in `/opt/janus/etc/janus`.
- If you don't need Record&Play/Streaming/Videocall, disable them in `janus.jcfg` as shown above.

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
