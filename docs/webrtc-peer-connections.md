# WebRTC Peer Connections

YAHAML's voice room system uses WebRTC peer connections to enable real-time audio communication between operators (intercom functionality).

## Architecture

```
Operator A                    YAHAML Server                  Operator B
  Browser                                                      Browser
    |                                                            |
    |-- getUserMedia() ----------------------------------------->|
    |                                                            |
    |-- POST /api/voice-rooms/shack/join -------------------->  |
    |<--- { peers: [...] } -----------------------------------  |
    |                                                            |
    |-- createOffer(peer B) ---------------------------------->  |
    |-- POST /api/voice-rooms/shack/signal ------------------>  |
    |                         |                                  |
    |                         |-- WebSocket 'voice' ----------->|
    |                         |    { type: 'offer', ... }       |
    |                         |                                  |
    |                         |<--- createAnswer() -------------|
    |                         |<--- POST .../signal ------------|
    |<--- WebSocket 'voice' --|                                  |
    |    { type: 'answer' }                                      |
    |                                                            |
    |<--- ICE candidates exchange ---------------------------->|
    |                                                            |
    |<=== Direct P2P audio stream ===========================>|
```

## Key Components

### Client-Side (VoiceRoomPanel.tsx)

**State Management:**
- `localStreamRef`: Local MediaStream from getUserMedia()
- `peerConnectionsRef`: Map<peerId, RTCPeerConnection>
- `remoteStreamsRef`: Map<peerId, MediaStream>
- `wsRef`: WebSocket connection for signaling

**WebRTC Flow:**

1. **Join Room:**
   - Request microphone access via `getUserMedia()`
   - POST `/api/voice-rooms/:roomId/join`
   - Setup WebSocket for signaling
   - Create offers for existing peers

2. **Peer Connection Creation:**
   ```typescript
   const pc = new RTCPeerConnection({
     iceServers: [
       { urls: 'stun:stun.l.google.com:19302' },
       { urls: 'stun:stun1.l.google.com:19302' },
     ],
   })
   ```

3. **Track Handling:**
   - Add local tracks to peer connection
   - Handle incoming remote tracks via `ontrack`
   - Create Audio elements for remote streams

4. **ICE Candidate Exchange:**
   - Send candidates via POST `/api/voice-rooms/:roomId/signal`
   - Receive candidates via WebSocket 'voice' channel

5. **Signaling Messages:**
   - `offer`: Initiating peer sends offer
   - `answer`: Receiving peer responds with answer
   - `ice-candidate`: ICE candidate exchange

### Server-Side (src/index.ts)

**Signaling Endpoint:**
```typescript
POST /api/voice-rooms/:roomId/signal
Body: { type: 'offer|answer|ice-candidate', to: peerId, data: ... }
```

- If `to` specified: Direct message to specific peer via `wsManager.sendTo()`
- If no `to`: Broadcast to all room participants

**WebSocket Events:**
- `participantJoined`: New peer joined, create offer
- `participantLeft`: Peer left, cleanup connection
- `signal`: Route offer/answer/ICE between peers

## Audio Mixing

Multiple remote streams are played simultaneously:

```typescript
const playRemoteStream = (stream: MediaStream) => {
  const audio = new Audio()
  audio.srcObject = stream
  audio.autoplay = true
  audio.volume = volume / 100
  audio.setAttribute('data-voice-peer', 'true')
  document.body.appendChild(audio)
}
```

Browser automatically mixes multiple audio sources. Volume control affects all remote streams.

## Mute/Volume Control

**Local Mute:**
```typescript
localStream.getAudioTracks().forEach(track => {
  track.enabled = !isMuted
})
```

**Volume Control:**
- Updates all `audio[data-voice-peer]` elements
- Range: 0-100%
- Applied to remote streams only (local mic controlled by track.enabled)

## Connection States

WebRTC connection states monitored via `onconnectionstatechange`:
- `connecting`: Initial connection attempt
- `connected`: P2P connection established
- `disconnected`: Temporary disconnection
- `failed`: Connection failed, trigger cleanup
- `closed`: Connection closed

## STUN/TURN Servers

**Current (STUN only):**
- Google public STUN servers
- Works for most NAT scenarios
- No relay bandwidth costs

**Future (TURN):**
For symmetric NAT or restrictive firewalls:
```typescript
{
  urls: 'turn:your-turn-server.com:3478',
  username: 'user',
  credential: 'pass'
}
```

## Cleanup

On leave or unmount:
1. Stop local media tracks
2. Close all peer connections
3. Clear remote streams
4. Close WebSocket
5. Reset state

## Debugging

**Browser DevTools:**
```javascript
// View active peer connections
peerConnectionsRef.current.forEach((pc, peerId) => {
  console.log(`Peer ${peerId}:`, pc.connectionState)
})

// Check local stream
console.log('Local stream:', localStreamRef.current?.getTracks())

// Check remote streams
console.log('Remote streams:', remoteStreamsRef.current)
```

**chrome://webrtc-internals** - Detailed WebRTC stats and diagnostics

**Common Issues:**

1. **No audio from peers:**
   - Check remote stream `srcObject` is set
   - Verify `autoplay` attribute
   - Check browser autoplay policy (requires user interaction)

2. **Connection stuck in 'connecting':**
   - STUN server unreachable
   - Firewall blocking UDP
   - Need TURN server

3. **ICE candidates not exchanging:**
   - WebSocket disconnected
   - Signaling endpoint errors
   - Check browser console and network tab

## Browser Compatibility

- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (iOS 11+)
- Opera: Full support

## Security

- All signaling over authenticated endpoints (authMiddleware)
- WebSocket requires session token
- MediaStream access requires user permission
- HTTPS required for getUserMedia() (except localhost)

## Performance

**Typical Metrics:**
- Audio codec: Opus (48kHz, stereo)
- Bitrate: ~32-128 kbps per peer
- Latency: 100-300ms typical
- CPU: ~1-2% per peer connection

**Scaling:**
- P2P mesh: Works well for 2-10 participants
- For larger groups: Consider SFU (Selective Forwarding Unit) like Janus or mediasoup

## Future Enhancements

- [ ] Audio level indicators (visual feedback)
- [ ] Automatic gain control for remote streams
- [ ] Recording/playback functionality
- [ ] Screen sharing support
- [ ] Video support
- [ ] SFU integration for scalability
- [ ] Spatial audio (stereo positioning)
