# CW & Digital Modes Architecture

## Overview
Extensible audio decoding/encoding system for CW and digital modes (FT8, FT4, fldigi).

## Design Principles
1. **Pluggable modem interface** — Each mode implements common `DigitalModem` contract
2. **Audio I/O abstraction** — Single source-of-truth for radio audio input
3. **Non-blocking processing** — Worker threads for CPU-intensive decoding
4. **Contest integration** — Decoded callsigns/exchanges flow into logging forms
5. **Extensible** — Easy to add new modes (PSK31, Olivia, etc.)

## Components

### Core Types (`src/audio/types.ts`)
```typescript
interface DigitalModem {
  name: string
  abbreviation: string // 'CW', 'FT8', 'FT4', 'PSK31'
  sampleRate: number
  frequencyRange: [number, number] // Hz
  
  // Decoding
  decode(audioBuffer: Float32Array): DecodedMessage[]
  
  // Encoding
  encode(text: string): AudioBuffer
  
  // Configuration
  getConfig(): ModeConfig
  setConfig(config: Partial<ModeConfig>): void
}

interface DecodedMessage {
  text: string
  confidence: number // 0-1
  timestamp: number
  frequency?: number
  snr?: number
}

interface ModeConfig {
  wpm?: number // CW speed
  tone?: number // CW tone frequency (e.g., 800 Hz)
  // Mode-specific settings
}
```

### CW Decoder (`src/audio/cw-decoder.ts`)
- Real-time tone detection (Goertzel algorithm or FFT)
- Morse decoder (dits/dahs → characters)
- Callsign/exchange parsing
- Output: Live decoded text with confidence

### CW Encoder (`src/audio/cw-encoder.ts`)
- Text → Morse code translation
- Morse → Tone generation (sinusoid at carrier freq)
- WPM timing
- Output: AudioBuffer for audio context playback

### Digital Modem Plugins
#### FT8/FT4 (`src/audio/modems/ft8-modem.ts`)
- Integrate with WSJT-X JSON RPC or libjt9/libjt4
- Accept waterfall audio segments
- Return decoded callsigns + exchanges

#### fldigi Integration (`src/audio/modems/fldigi-modem.ts`)
- Connect to fldigi XML-RPC server
- Decode PSK31, Olivia, DominoEX, MT63, etc.
- Mapped modem list for UI selection

### React Components

#### CW Decoder Panel (`ui/src/components/CWDecoder.tsx`)
- Live decoded text display
- WPM/tone frequency controls
- Confidence indicator
- Auto-fill logging form with callsign matches

#### Digital Modem Selector (`ui/src/components/DigitalModePanel.tsx`)
- Mode dropdown (CW, FT8, FT4, PSK31, etc.)
- Mode-specific controls (WPM, bandwidth, decoder settings)
- Waterfall/spectrum view (fldigi-style)
- Decoded message feed

#### Logging Tab Integration
- Add "Decoder" section to logging page
- Live decoded text → prefill callsign field
- Confidence scoring for assisted logging
- Manual correction workflow

## Implementation Phases

### Phase 1 (MVP): CW
- ✓ CW decoder (tone detection + Morse parsing)
- ✓ CW encoder (text → audio)
- ✓ React decoder panel
- ✓ Logging tab integration
- ✓ WPM/tone frequency configuration

### Phase 2: FT8/FT4
- Integrate WSJT-X or libjt library
- Multi-slot decoder (up to 4 simultaneous decodes)
- Waterfall visualization
- Exchange parsing (ARRL Field Day format)

### Phase 3: fldigi Integration
- XML-RPC client for local fldigi instance
- Mode selector (maps to fldigi decoder list)
- Real-time audio piping to fldigi
- Decoded message forwarding to logging

### Phase 4: Contest Helpers
- Auto-exchange parsing (ARRL Field Day, IARU, etc.)
- QSO deduplication (prevent logging same call twice)
- Frequency tracking for next-band scanning
- Real-time scoring integration

## Audio Flow

```
Radio Audio Input (WebSocket from relay)
    ↓
Audio Context Buffer
    ↓
[CW Decoder | FT8 Decoder | fldigi Client]  ← Selectable mode
    ↓
Decoded Messages (callsign, exchange, confidence)
    ↓
Logging Form Auto-fill
    ↓
User Review & Confirm
    ↓
QSO Log
```

## Dependencies

### For CW
- Web Audio API (built-in browser support)
- Tone.js or custom Goertzel (tone detection)

### For FT8/FT4
- WSJT-X JSON-RPC API (or compile libjt8/libjt4 to WASM)
- Alternative: External Node.js process wrapping jt9/jt4

### For fldigi
- fldigi XML-RPC API (local instance)
- HTTP client for RPC calls

## Configuration

File: `.env` additions
```
FLDIGI_RPC_URL=http://localhost:7362/RPC2   # fldigi XML-RPC endpoint
CW_DEFAULT_WPM=20
CW_DEFAULT_TONE=800
ENABLE_DIGITAL_MODES=true
```

## Testing Strategy
1. Unit tests for Morse encoding/decoding
2. Integration tests with mock audio buffers
3. E2E: Connected radio test with live decode
4. Contest mode: Validate callsign parsing against contest rules

## Future Extensibility
- Add new mode: Implement `DigitalModem` interface
- Plugin directory: `src/audio/modems/[mode]-modem.ts`
- Auto-register in modem list on startup
- No changes required to core decoder pipeline
