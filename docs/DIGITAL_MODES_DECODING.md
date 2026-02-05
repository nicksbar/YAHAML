# Digital Modes Decoding in YAHAML

## Executive Summary

Integrating digital mode decoding (FT8, FT4, PSK31, RTTY, etc.) into YAHAML is **technically feasible** with the following approach:

- **FT8/FT4 decoding** via **native Node.js addon** (C++ binding to WSJT‑X decoder)
- **Audio stream fork** from WebRTC mix into decoder pipeline
- **Decoded messages** streamed back to UI via WebSocket
- **GPL compliance** via full source distribution and license attribution

**Estimated complexity:** Medium-High. FT8 native decode requires C++ FFI experience but libraries exist.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   YAHAML Architecture                   │
└─────────────────────────────────────────────────────────┘

┌─ AUDIO SOURCES ────────────────────────────────┐
│  N3FJP Relay  │  Direct Input  │  WebRTC Room  │
└────────────────┬──────────────────────────────┘
                 │
        ┌────────▼─────────┐
        │  Audio Mix Node   │ (existing)
        │  (global channel) │
        └────────┬──────────┘
                 │
        ┌────────┴─────────────────┐
        │                          │
   ┌────▼──────────┐      ┌───────▼────────┐
   │ Path A: Mix   │      │ Path B: Decode │
   │  → UI Monitor │      │  → DSP Pipeline│
   └───────────────┘      └───────┬────────┘
                                  │
                          ┌───────▼─────────┐
                          │  Decoder Worker │
                          │  (Node thread)  │
                          │  - FT8 decode   │
                          │  - PSK31 decode │
                          │  - RTTY decode  │
                          │  - ... others   │
                          └───────┬─────────┘
                                  │
                          ┌───────▼──────────┐
                          │  Decode Results  │
                          │  (WebSocket)     │
                          │  - mode, text    │
                          │  - snr, freq     │
                          │  - timestamp     │
                          └──────────────────┘
                                  │
                          ┌───────▼──────────┐
                          │  UI Waterfall    │
                          │  Decoded Log     │
                          │  Frequency Map   │
                          └──────────────────┘
```

### Data Flow

1. **Audio Capture**
   - WebRTC room: MediaStream (PCM 48kHz)
   - N3FJP relay: Existing TCP relay audio
   - Direct input: Microphone/line-in

2. **Stream Fork**
   - Maintain existing mix for monitoring/recording
   - Clone raw PCM to decoder input buffer

3. **Decoder Processing**
   - Buffer frames (e.g., 15s for FT8)
   - Compute FFT, search for signals
   - Extract decoded message, metadata

4. **WebSocket Broadcast**
   - Message type: `decoder:result`
   - Payload: mode, text, SNR, frequency, time
   - Sent to all connected clients

5. **UI Rendering**
   - Real-time waterfall (frequency vs. time)
   - Decoded message log
   - SNR/frequency histogram
   - Mode auto-detect confidence

---

## 2. FT8 Decoding Deep Dive

### Why FT8?
- **Most popular modern mode** (ARRL contests, Field Day, general operating)
- **Robust DSP pipeline** exists in WSJT‑X (open source)
- **Timing well‑defined** (15s frames, UTC sync)
- **Modest bandwidth** (~50 Hz per signal)
- **Decode-only feasible** (no transmit, simplifies licensing)

### Technical Requirements

#### Decode Pipeline
1. **Audio input:** 12 kHz PCM (downsampled from 48 kHz)
2. **Windowed FFT:** 4096‑point to get ~3 Hz resolution
3. **Signal detection:** Peak finding in spectrogram
4. **Synchronization:** Locate 7 sync tones (timing alignment)
5. **Soft decoding:** Low‑Density Parity Check (LDPC) code
6. **Text extraction:** Call/grid/message lookup tables

#### CPU/Memory Profile
- **Per decode cycle (15s):** ~2–5% CPU on modern hardware (8‑core)
- **Memory:** ~50 MB resident (FFT buffers + lookup tables)
- **Latency:** 15s (real‑time once frame syncs)
- **Simultaneous decodes:** Can run 2–4 sub‑bands in parallel

#### Timing Sensitivity
- **±1 second tolerance** for UTC clock (usually met on Linux/Windows)
- Browser/mobile clocks may drift; NTP sync recommended
- Can implement **frequency offset correction** to relax timing slightly

### Candidate Libraries

#### Option A: WSJT‑X Decoder (Recommended)
**Source:** https://sourceforge.net/projects/wsjt/files/  
**License:** GPL v3  
**Language:** Fortran + C++  
**Pros:**
- Official decoder; battle‑tested
- Full source available
- Can extract just decode logic

**Cons:**
- Large codebase (~100K LOC)
- Fortran → C++ FFI is non‑trivial
- Requires compilation per platform

**Integration:** Create **C++ Node.js addon** binding WSJT‑X FFT/LDPC/decode functions.

**Complexity:** Medium. Requires:
- C++ knowledge (V8 API / node-gyp)
- Fortran interop or translation
- Testing on Linux/Mac/Windows

#### Option B: JS8Call (Variant of FT8)
**Source:** https://github.com/j4cbo/js8call  
**License:** GPL v3  
**Pros:**
- More compact than WSJT‑X
- Strong community support
- Designed for message passing (more UX‑friendly than FT8)

**Cons:**
- Still GPL
- Similar complexity to WSJT‑X

#### Option C: WASM Port (Alternative, Lower Performance)
**Feasibility:** Moderate  
**Pros:**
- No native compilation per platform
- Portable JavaScript/WASM blend

**Cons:**
- ~3–5× slower than native
- Browser/Node WASM still requires buffering/timing work
- FFT and LDPC in WASM is not optimized

**Candidate:** Recompile WSJT‑X with Emscripten, or port pieces to Rust/WASM.

---

## 3. Other Modes

### PSK31 (Lower Priority)
**Complexity:** Medium-Low  
**Decoder:** FLDIGI (GPL)  
**Why:** Fewer signals on air now, but still active. Lighter decode than FT8.

### RTTY (Lower Priority)
**Complexity:** Low  
**Decoder:** FLDIGI (GPL)  
**Why:** Simpler DSP (no LDPC), good for learning.

### APRS / AX.25 (Optional)
**Complexity:** Low-Medium  
**Decoder:** Dire Wolf (GPL)  
**Why:** Complementary to digital modes; useful for balloon/weather tracking.

---

## 4. Implementation Strategy

### Phase 1: Prototype (2–3 weeks)
**Goal:** Decode FT8 from static WAV file

1. Create minimal C++ addon wrapping WSJT‑X FFT/LDPC
2. Load PCM from disk, decode, output JSON
3. Test on Linux first (simplest)
4. Verify decode accuracy vs. WSJT‑X

**Deliverable:** `decode-ft8.node` (native addon)

### Phase 2: Live Stream Integration (1–2 weeks)
**Goal:** Decode real audio from WebRTC mix

1. Fork MediaStream → RingBuffer
2. Feed RingBuffer to decoder in Worker thread
3. Emit `decoder:result` WebSocket messages
4. Handle sample rate conversion (48 kHz → 12 kHz)

**Deliverable:** Node decoder service; WebSocket message schema

### Phase 3: UI/UX (1–2 weeks)
**Goal:** Waterfall + decoded log

1. Real‑time spectrogram (frequency waterfall)
2. Decoded message log (call, grid, message, SNR, time)
3. Frequency tuning widget
4. Mode auto‑select dropdown

**Deliverable:** React components in `ui/`

### Phase 4: Multi-Mode (Optional, 2–4 weeks)
**Goal:** Add PSK31, RTTY, etc.

1. Evaluate FLDIGI integration
2. Build adapters for each mode
3. Mode auto‑detect heuristics

---

## 5. Licensing & Compliance

### GPL v3 Obligations (WSJT‑X, FLDIGI, Dire Wolf)

Since YAHAML is **public on GitHub**, you must:

1. **Distribute full source** of the decoder (already true for WSJT‑X)
2. **License your modifications** under GPL v3
3. **Include GPL v3 license text** in repo root and documentation
4. **Clearly document** which libraries are used and their licenses

**Action Items:**
- [ ] Add `COPYING` file with GPL v3 text to repo
- [ ] Add decoder libraries to `DEPENDENCIES.md` with GPL notices
- [ ] Link to upstream source in code comments
- [ ] In Node addon, include GPL header block

### License Compliance Plan

```
File: docs/DEPENDENCIES.md (update)

## Digital Modes Decoders

### FT8/FT4 Decode
- **Library:** WSJT‑X
- **Source:** https://sourceforge.net/projects/wsjt/
- **License:** GPL v3
- **Used as:** Native C++ binding (decode only)
- **Compliance:** Full source included in this repository
- **Attribution:** See COPYING

### PSK31/RTTY Decode (future)
- **Library:** FLDIGI
- **Source:** https://github.com/w1hkj/fldigi
- **License:** GPL v3
- **Used as:** Native C++ binding
- **Compliance:** Full source included
- **Attribution:** See COPYING
```

### Can You Make It Proprietary Later?
**No.** Once GPL code is incorporated, your entire derivative is GPL. You cannot "un-GPL" it. Plan accordingly for your business model.

---

## 6. Architecture Integration with YAHAML

### New Components

#### `src/dsp-worker.ts`
Spawns Worker threads for decode pipeline.

```typescript
interface DecoderJob {
  id: string;
  mode: 'ft8' | 'ft4' | 'psk31' | 'rtty';
  buffer: Float32Array;  // PCM samples
  sampleRate: number;
  freq?: number;  // Center frequency (Hz) for offset correction
}

interface DecoderResult {
  id: string;
  mode: string;
  decoded: string;  // e.g., "W5ABC EM13 +01"
  snr: number;
  frequency: number;  // Actual RX frequency
  timestamp: Date;
  confidence: number;  // 0–1
}
```

#### `src/dsp/ft8-decode.ts` (Node addon binding)
```typescript
import native from 'ft8-decode.node';

export async function decodeFT8(
  pcm: Float32Array,
  sampleRate: number,
  options?: { freq?: number }
): Promise<DecoderResult[]> {
  // Downsample 48 kHz → 12 kHz
  const resampled = downsample(pcm, sampleRate, 12000);
  
  // Call native decoder
  const results = native.decodeFT8(resampled);
  
  return results.map((r: any) => ({
    mode: 'ft8',
    decoded: r.text,
    snr: r.snr,
    frequency: r.freq,
    timestamp: new Date(),
    confidence: r.confidence,
  }));
}
```

#### `src/audio-mix.ts` (extend existing)
```typescript
class AudioMixer {
  // ... existing mix logic ...

  /**
   * Fork raw PCM for decoder pipeline
   */
  attachDecoder(decoder: DSPWorker) {
    this.on('frame', (pcm: Float32Array) => {
      decoder.enqueue({
        id: this.frameId++,
        buffer: pcm.slice(),  // copy
        sampleRate: this.sampleRate,
      });
    });
  }
}
```

#### `src/websocket.ts` (extend existing channels)
```typescript
// New channel: 'dsp:results'
// Clients subscribe to receive decoded messages in real-time

interface DSPResult extends WSMessage {
  type: 'dsp:result';
  channel: 'dsp:results';
  data: {
    mode: 'ft8' | 'ft4' | 'psk31' | ...;
    text: string;
    snr: number;
    frequency: number;
    timestamp: ISO8601;
    confidence: number;
  };
}
```

### UI Integration

#### New Route: `/dsp-monitor`
Real-time waterfall + decoded log (admin/operators only)

```tsx
<DspMonitor>
  <Waterfall 
    freqStart={7070000}
    freqEnd={7075000}
    mode="ft8"
  />
  <DecodedLog 
    mode="ft8"
    maxEntries={100}
  />
  <DecoderControls 
    mode="ft8"
    squelch={-25}
    onModeChange={...}
  />
</DspMonitor>
```

---

## 7. Performance & Feasibility Assessment

### Hardware Requirements

| Component | Min (Raspberry Pi 4) | Recommended (Modern Server) |
|-----------|----------------------|-----------------------------|
| CPU cores | 2 | 4+ |
| Clock | 1.5 GHz | 2.5+ GHz |
| RAM | 2 GB | 4 GB+ |
| Latency | 30 ms per frame | <10 ms |

### Decode Throughput

| Mode | CPU% (8-core) | Latency | Simultaneous |
|------|---------------|---------|--------------|
| FT8 | 2–5% | 15s frame | 2–4 sub-bands |
| FT4 | 3–7% | 7.5s frame | 2–4 sub-bands |
| PSK31 | 1–3% | 1–2s rolling | 4–8 signals |
| RTTY | 0.5–2% | 1s rolling | 8–16 signals |

### Scalability

- **Single operator on Raspberry Pi 4:** Works fine (FT8 only, 1 band).
- **Multi-band Field Day:** Needs 4-core server, 2–3 bands.
- **HF Net monitoring (8 bands):** Needs 8-core server + careful threading.

---

## 8. Licensing Compliance Checklist

- [ ] **Add `COPYING`** file with GPL v3 text
- [ ] **Update README** with decoder license disclaimer
- [ ] **Document dependencies** in `docs/DEPENDENCIES.md`
- [ ] **C++ code headers** include GPL v3 notice
- [ ] **Node addon sources** committed to repo (full source)
- [ ] **Build instructions** documented
- [ ] **No proprietary modifications** to GPL code (or full source released)

---

## 9. Risk Assessment

### Technical Risks
- **C++ FFI complexity:** Medium. Mitigate with existing node-gyp examples.
- **Timing sensitivity:** Low. NTP + buffer tuning handles most cases.
- **CPU overload:** Low. Monitor and scale threads as needed.

### Legal Risks
- **GPL viral clause:** High impact if you ever want proprietary derivative.
  - Mitigate: Accept GPL from the start, or use WASM/microservice (separate binary).

### Maintenance Risks
- **WSJT‑X updates:** You must track upstream for bug fixes.
- **OS compatibility:** Windows/Mac builds require CI/CD.

---

## 10. Timeline Estimate

| Phase | Effort | Complexity | Risk |
|-------|--------|-----------|------|
| Phase 1 (Prototype) | 2–3 weeks | Medium | Medium (FFI learning) |
| Phase 2 (Live stream) | 1–2 weeks | Medium | Low |
| Phase 3 (UI) | 1–2 weeks | Low | Low |
| Phase 4 (Multi-mode) | 2–4 weeks | Medium | Low |
| **Total** | **6–11 weeks** | **Medium** | **Medium** |

---

## 11. Recommended Next Steps

1. **Decide on GPL compliance:** Can YAHAML be GPL or AGPL? If not, WASM microservice is alternative.
2. **Research C++ node-gyp:** Evaluate team's comfort with native addons.
3. **Prototype Phase 1:** Decode static FT8 WAV file with minimal addon.
4. **Test on Linux first:** Simplest platform; Mac/Windows later.
5. **Document build process:** Critical for GPL compliance + reproducibility.

---

## References

- **WSJT‑X Decoder:** https://sourceforge.net/projects/wsjt/
- **JS8Call:** https://github.com/j4cbo/js8call
- **FLDIGI (PSK31/RTTY):** https://github.com/w1hkj/fldigi
- **Dire Wolf (APRS/AX.25):** https://github.com/wb2osz/direwolf
- **Node-gyp:** https://github.com/nodejs/node-gyp
- **GPL v3 License:** https://www.gnu.org/licenses/gpl-3.0.html
- **FFT/DSP Papers:** See `docs/RESEARCH_SUMMARY.md` for links

---

## Appendix: Example FT8 Decode Flow

```
Time 14:00:00 UTC
├─ 14:00:00 → Start FT8 frame
├─ 14:00:05 → Buffer fills (5s of PCM)
├─ 14:00:10 → Buffer fills (10s of PCM)
├─ 14:00:15 → Frame complete (15s)
│   ├─ Downsample 48 kHz → 12 kHz
│   ├─ Compute 4096-point FFT (~3 Hz bins)
│   ├─ Find 7 sync tones (alignment)
│   ├─ Extract soft LDPC bits
│   ├─ Decode message: "W5ABC EM13 +01"
│   ├─ Extract SNR: –22 dB
│   ├─ Extract freq: 7074234 Hz
│   └─ → WebSocket: { mode: 'ft8', text: 'W5ABC EM13 +01', snr: -22, freq: 7074234 }
├─ 14:00:15 → UI updates waterfall + log
├─ 14:00:15 → Start next FT8 frame
```

---

## Conclusion

**FT8 decoding in YAHAML is feasible and recommended as the primary digital mode.**

- **Native C++ addon** approach balances performance and complexity.
- **GPL compliance** is straightforward if YAHAML can accept GPL.
- **Architecture** integrates cleanly with existing WebRTC + WebSocket infrastructure.
- **Timeline:** 6–11 weeks for full multi-mode support.

**Next decision:** GPL adoption + team C++ capacity.
