# Digital Modes Implementation Roadmap

## Current Status
- ✅ Phase 1 (CW): Architecture complete, decoder/encoder implemented
- ⏳ Phase 2 (FT8/FT4): Planning
- ⏳ Phase 3 (fldigi): Planning
- ⏳ Phase 4 (Contest Integration): Planned

## Phase 2: FT8/FT4 Integration

### Context: Real-time Contest Requirements
For contest logging, RPC to external decoders introduces unacceptable latency:
- Network round-trip: 50-100ms
- External decoder processing: 100-500ms  
- Total: 150-600ms delay before callsign appears in logging form
- **Unacceptable:** Operator needs immediate feedback to decide if logging

**Conclusion:** Decoding must happen in-browser with <50ms latency.

### Approach: WASM-based Decoding (Only Viable Option)

**Pros:**
- Zero external dependencies/latency
- Full decode control in browser
- Immediate callsign display in logging form
- Works offline
- Operator controls processing (can skip/retry frames)

**Cons:**
- Complex WASM compilation setup
- Larger bundle size (~3-5MB per decoder)
- CPU-intensive (may benefit from Web Workers)
- Requires maintaining codec versions

### Option 1: Compile libjt8/libjt4 from WSJT-X Source (Official)

**Implementation Path:**
1. Obtain WSJT-X source from https://sourceforge.net/projects/wsjt/files/
2. Extract `lib/jt8.c`, `lib/jt4.c` (core decoders)
3. Build WASM targets using Emscripten:
   ```bash
   emcripten jt8.c -o jt8.js -s WASM=1
   ```
4. Create wrapper in `src/audio/modems/ft8-modem.ts`
5. Load WASM module on decoder init
6. Feed 12kHz audio chunks to decoder

**Resources:**
- WSJT-X repo: https://github.com/wsjtx/wsjtx
- Decoder source: https://github.com/k1jt/libhamlib/tree/wsjtx
- Emscripten docs: https://emscripten.org/docs/

**Timeline:** 2-3 weeks (complex build)

### Option 2: Use Existing WASM Implementation (Faster)

**Check if available:**
- jt8-wasm: https://github.com/... (search npm registry for `jt8-wasm`, `wsjt-wasm`)
- Existing npm packages wrapping Emscripten builds
- Community implementations (may exist from other web projects)

**If found:** 
- Use npm package directly
- Create thin wrapper in modem-manager
- Timeline: 1-2 weeks

### Option 3: Pure JavaScript Implementation (Not Recommended)

FT8 decode involves complex DSP (FFT, soft decoding, Viterbi). Pure JS would be:
- 10-100x slower than WASM
- Possible for educational use
- Not viable for real-time contests

**Skip this option.**

### Recommendation: **Start with Option 2 (search for existing packages)**

1. Search npm: `npm search jt8`, `npm search wsjt`
2. Check GitHub: `jt8-wasm`, `ft8-wasm`, `wsjt-wasm`
3. If found: Use package, integrate in 1 week
4. If not found: Fall back to Option 1, compile WASM (2-3 weeks)

**Either way:** No external RPC/network dependencies. Decoding happens in browser.

---

## Phase 3: fldigi Integration (Optional)

### Context: Extended Modes with Trade-offs

fldigi supports PSK31, OLIVIA, DOMINOEX, MT63, RTTY, etc. — but RPC integration has latency issues.

**Realistic Assessment:**
- For high-speed contest modes (FT8/FT4): WASM approach preferred
- For lower-speed modes (PSK31, RTTY): fldigi RPC may be acceptable
  - Operator not expecting real-time auto-fill
  - Can manually fill form while monitoring decoder
  - Fallback option when WASM decoder unavailable

**Decision:** fldigi is **optional/Phase 3+** — only add if:
1. WASM decoders complete for main modes
2. User explicitly requests PSK31/OLIVIA/etc. support
3. RPC latency acceptable for those modes

### Implementation (If Pursued)

Create `src/audio/modems/fldigi-modem.ts` implementing `DigitalModem`

Architecture: XML-RPC client to local fldigi instance

```typescript
export class fldigiModem extends BaseModem {
  private rpcClient: XMLRPCClient
  private lastRxText = ''

  constructor(rpcUrl = 'http://localhost:7362/RPC2') {
    super('PSK31', 'PSK31', { ... })
    this.rpcClient = new XMLRPCClient(rpcUrl)
  }

  async decode(audioBuffer: Float32Array, sampleRate: number): Promise<DecodedMessage[]> {
    // fldigi captures audio directly from radio interface
    // We poll for new RX text via RPC
    const text = await this.rpcClient.call('rx.get_text')
    
    if (text !== this.lastRxText) {
      this.lastRxText = text
      // Note: RPC call adds ~50-100ms latency here
      return [{
        text,
        confidence: 0.75, // Lower confidence due to RPC latency
        timestamp: Date.now()
      }]
    }
    return []
  }
}
```

**fldigi RPC API:**
- https://www.w1hkj.com/FldigiHelp-3.23/IPC/index.html
- `rx.get_text()` - Get received text buffer
- `tx.send(text)` - Send text
- `modem.get_name()` - Current modem name
- `modem.set_modem(name)` - Switch modem

**Setup:**
```bash
# User must run fldigi locally with RPC enabled:
fldigi --config-dir ~/.fldigi --xmlrpc-server localhost:7362
```

**Timeline:** 1 week (straightforward RPC wrapper, lower priority)

---

## Phase 4: Contest Integration

### Auto-Exchange Parsing
Parse decoded messages into contest format.

**Example: ARRL Field Day**
```
Decoded: "W5XYZ 559 AR"
Parsed: { callsign: "W5XYZ", exchange: "559 AR" }
Into Form: callsign field auto-fills, exchange field shows "559 AR"
```

**Implementation:**
1. Create `src/contest-parsing.ts` with parsers per contest
2. Hook in logging form: Listen to decoder messages
3. Extract callsign using regex/AI
4. Match to contest exchange format
5. Pre-fill form fields (with user confirmation)

### Duplicate Detection
Prevent logging same callsign twice in same contest.

```typescript
// In logging form submit:
const isDuplicate = await checkDuplicateQSO(
  callsign,
  band,
  contestId
)
if (isDuplicate) {
  warn("You already logged " + callsign + " on " + band)
}
```

### Real-time Scoring
Update contest score as QSOs are logged.

```typescript
const score = calculateContestScore(qsos, contestRules)
// Display in OpsMap or summary panel
```

### Next-Band Suggestion
After completing region on one band, suggest next band.

```typescript
// After logging on 40m:
const remainingBands = contest.bands.filter(
  b => !isBandComplete(b, qsos)
)
suggest("Try " + remainingBands[0] + " next")
```

---

## Integration with Logging Tab

### Layout: Add "Decoder" Sidebar to Logging Form

```
┌─────────────────────────────────────┐
│ Logging Form         │ 📡 Decoder   │
│ ─────────────────    │ ─────────────│
│ Callsign: [______]   │ Mode: [CW▼] │
│ Exchange: [______]   │ WPM:  [20]  │
│ Band:     [______]   │            │
│ Mode:     [______]   │ Decoded:   │
│ Freq:     [______]   │ W5XYZ AR   │
│           [Submit]   │            │
│                      │ Confidence │
│                      │ [████░░░░] │
│                      │            │
│                      │ 📋 Recent: │
│                      │ - W4ZZZ 599│
│                      │ - W6XXX 589│
└─────────────────────────────────────┘
```

### React Implementation

**File:** `ui/src/components/LoggingWithDecoder.tsx`

```typescript
export const LoggingWithDecoder: React.FC<Props> = () => {
  const {
    detectedCallsign,
    detectedExchange,
    decoderConfidence,
    clearDetections
  } = useDecoderAssistant()

  const handleCallsignClick = () => {
    if (detectedCallsign) {
      setFormField('callsign', detectedCallsign)
      clearDetections()
    }
  }

  return (
    <div className="logging-with-decoder">
      <div className="logging-form">
        {/* Existing form code */}
      </div>
      
      <CWDecoder
        onCallsignDetected={setDetectedCallsign}
        onExchangeDetected={setDetectedExchange}
      />
      
      {detectedCallsign && (
        <div className="decoder-suggestion">
          <button onClick={handleCallsignClick}>
            Auto-fill {detectedCallsign}?
          </button>
        </div>
      )}
    </div>
  )
}
```

### CSS Layout: Responsive Grid

```css
.logging-with-decoder {
  display: grid;
  grid-template-columns: 1fr 350px;
  gap: 1rem;
}

@media (max-width: 1200px) {
  .logging-with-decoder {
    grid-template-columns: 1fr;
  }
}
```

---

## Testing Strategy

### Unit Tests
- CW Morse encoding/decoding
- Exchange parsing (ARRL, IARU, etc.)
- Callsign validation
- Duplicate detection

### Integration Tests
- Decoder → Logging form auto-fill
- Mode switching (CW ↔ FT8 ↔ fldigi)
- Audio preprocessing pipeline
- Contest-specific exchange formats

### E2E Tests
- Connect live radio, decode real CW/digital
- Log multiple QSOs in contest scenario
- Validate scoring calculations
- Verify RPC connectivity (FT8/fldigi)

### Performance Tests
- Decode latency < 100ms
- CPU usage < 20% (background decoder)
- Audio buffer memory usage
- UI responsiveness during decoding

---

## Dependencies Summary

**Phase 1 (CW):** None (Web Audio API only)
**Phase 2A (FT8/FT4 via WSJT-X):** `xmlrpc`
**Phase 2B (FT8/FT4 WASM):** Custom WASM build (5MB+)
**Phase 3 (fldigi):** `xmlrpc`
**Phase 4 (Contest):** No new dependencies

---

## Known Challenges

1. **WSJT-X RPC:** Port 2237 may vary by installation
   - Solution: Auto-discover via network scan
   
2. **Audio Buffer Alignment:** Ensuring proper sample rate conversion
   - Solution: Resample to decoder's expected rate
   
3. **Real-time Performance:** Decoding shouldn't block UI
   - Solution: Use Web Workers for CPU-intensive ops
   
4. **Contest Format Variability:** Different contests use different exchanges
   - Solution: Template-based exchange parsing per contest
   
5. **Offline Mode:** What if external services unavailable?
   - Solution: Graceful degradation (CW always available, FT8 optional)

---

## Next Steps

### Immediate (Current Sprint):
- ✅ CW decoder/encoder implementation
- ✅ React UI components
- ✅ Modem registry system
- 🔲 Unit tests for CW
- 🔲 **RESEARCH:** Search npm/GitHub for existing WASM FT8/FT4 packages
  - `npm search jt8`, `npm search wsjt`, `npm search ft8-wasm`
  - GitHub: search `jt8-wasm`, `ft8-wasm`, `wsjt-wasm`
  - Document findings in research doc

### Next Sprint:
- 🔲 Integrate CW decoder with Logging form
- 🔲 Auto-fill callsign from CW decoder
- 🔲 Exchange parsing for ARRL Field Day (CW mode)
- 🔲 **Decision:** Choose WASM implementation path for FT8/FT4
  - Option 2A: Use existing npm package (if found)
  - Option 2B: Compile libjt8/jt4 from WSJT-X source (if needed)

### Future Sprints:
- 🔲 Implement FT8/FT4 WASM decoder
- 🔲 Integrate FT8/FT4 into logging form
- 🔲 Contest scoring integration
- 🔲 Real-time band suggestion
- 🔲 (Optional Phase 3+) fldigi integration for extended modes (PSK31, etc.)

