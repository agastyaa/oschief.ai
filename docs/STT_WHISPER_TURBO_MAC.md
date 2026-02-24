# Improving STT with Whisper Turbo on Mac

**Use this when local models are downloaded and used on device.**

**Your decision**: run local (privacy, zero cost per meeting, offline) or stream to cloud (better quality, easier, cost per minute). This doc assumes you want **local-first with Whisper Turbo on Apple Silicon**.

---

## The Stack

```
┌─────────────────────────────────────────────┐
│  macOS System Audio Capture                 │
│  (Core Audio Taps / ScreenCaptureKit)       │
├─────────────────────────────────────────────┤
│  Audio Preprocessing                        │
│  - Resample to 16kHz mono                   │
│  - VAD (Voice Activity Detection)           │
│  - Noise reduction (optional)               │
├─────────────────────────────────────────────┤
│  Whisper Turbo Inference                    │
│  (whisper.cpp + CoreML / MLX-Whisper)       │
├─────────────────────────────────────────────┤
│  Post-Processing                            │
│  - Hallucination filtering                  │
│  - Punctuation & capitalization             │
│  - Speaker attribution (Me vs Them)         │
│  - Confidence-based correction              │
├─────────────────────────────────────────────┤
│  LLM Enhancement                            │
│  (Syag note summarization prompt)           │
└─────────────────────────────────────────────┘
```

---

## 1. Audio Capture on macOS

### The Problem
macOS doesn't natively expose system audio to apps. You need one of:

### Option A: Core Audio Taps (Recommended — macOS 14.2+)
- Native Apple API, introduced macOS 14.2 Sonoma
- No third-party drivers needed
- Captures system output audio directly
- Used by: AudioTee (open source Swift CLI)
- **Best for**: new apps targeting macOS 14.2+

```swift
// Core Audio Tap approach (Swift)
// See: https://github.com/makeusabrew/audiotee
// Captures system audio and streams to stdout as raw PCM
// Pipe to your transcription engine
```

### Option B: ScreenCaptureKit (macOS 13+)
- Can capture system audio alongside screen
- More permissions prompts (screen recording permission)
- Quirky on macOS 15+ — Core Audio Taps more reliable
- Used by: many screen recorders, some transcription apps

### Option C: Virtual Audio Device (BlackHole)
- Works on all macOS versions
- Requires user to install BlackHole driver
- Creates a virtual loopback device
- **Friction**: extra install step, confuses some users' audio routing

### What Syag Does
- Captures both mic input AND system audio output simultaneously
- Two separate streams → labeled "Me" (mic) and "Them" (system audio)
- This gives you basic speaker attribution for free

### Implementation
```
Mic Input  ──→ [16kHz mono float32] ──→ Whisper (stream 1) → "Me"
System Out ──→ [16kHz mono float32] ──→ Whisper (stream 2) → "Them"
```

**Key**: always resample to 16kHz mono before hitting Whisper. Higher sample rates waste compute with zero benefit for speech.

---

## 2. Choosing Your Whisper Backend

### Benchmark (Apple Silicon, large-v3-turbo, 10min audio)

| Backend | Avg Time | Notes |
|---------|----------|-------|
| FluidAudio CoreML | 0.19s | Fastest. Swift native. Uses Parakeet model. |
| Parakeet MLX | 0.50s | Nvidia's model via MLX. Very fast. |
| MLX-Whisper | 1.02s | Pure MLX. Good accuracy + speed balance. |
| whisper.cpp + CoreML | 1.23s | Battle-tested. C/C++. Quantized models. |
| lightning-whisper-mlx | 1.82s | MLX based. Decent. |
| WhisperKit (Swift) | ~1.5s | Native Swift. Apple's preferred path. |

Source: mac-whisper-speedtest benchmarks on Apple Silicon

### Recommendation for Mac App

**For a native Swift/macOS app**:
- **whisper.cpp with CoreML encoder** — most mature, best documented, 3x speedup with ANE
- Build with: `cmake -B build -DWHISPER_COREML=1 -DWHISPER_METAL=1`
- Use `large-v3-turbo-q5_0` quantized model (fastest turbo variant)

**For an Electron app**:
- **MLX-Whisper** via Python subprocess, or
- **whisper.cpp** as compiled binary called from Node

**If considering non-Whisper**:
- NVIDIA Parakeet TDT 0.6B — faster AND more accurate than Whisper on English
- Available via MLX on Apple Silicon
- Worth evaluating if English-only

---

## 3. VAD (Voice Activity Detection) — The Biggest Win

**This is the single highest-leverage optimization.** VAD detects speech segments and only sends those to Whisper, skipping silence.

### Why it matters
- A 60-min meeting has ~20-30 min of actual speech
- Without VAD: Whisper processes 60 min of audio (including silence, noise)
- With VAD: Whisper processes 20-30 min → **2-3x faster, fewer hallucinations**

### Whisper Hallucination Problem
Whisper hallucinates on silence. If you feed it quiet audio, it will generate phantom text — repeated phrases, random words, or thank-you messages. VAD eliminates this.

### Implementation (whisper.cpp built-in)
```bash
# whisper.cpp has built-in Silero VAD
./whisper-cli \
  -m models/ggml-large-v3-turbo-q5_0.bin \
  -vm models/ggml-silero-v6.2.0.bin \
  --vad \
  --vad-threshold 0.5 \
  --vad-min-speech-duration-ms 250 \
  --vad-min-silence-duration-ms 300 \
  --vad-max-speech-duration-s 30 \
  --vad-speech-pad-ms 200 \
  --vad-samples-overlap 0.1 \
  -f audio.wav
```

### Tuning VAD Parameters
| Parameter | Default | Meeting-Optimized | Why |
|-----------|---------|-------------------|-----|
| `vad-threshold` | 0.5 | 0.45 | Lower = catch quieter speakers. Meetings have soft-spoken people. |
| `vad-min-speech-duration-ms` | 250 | 200 | Short "yes", "no", "agreed" matter in meetings |
| `vad-min-silence-duration-ms` | 300 | 500 | Meeting pauses are longer than conversation. Avoids splitting mid-thought. |
| `vad-speech-pad-ms` | 200 | 250 | Capture word onsets/offsets cleanly |
| `vad-max-speech-duration-s` | 30 | 30 | Keep at 30 — matches Whisper's window |

### Standalone VAD (if not using whisper.cpp built-in)
- **Silero VAD** — lightweight, runs on CPU, <1ms per frame
- **WebRTC VAD** — even lighter, less accurate
- Use Silero. It's the standard.

---

## 4. Real-Time Streaming Architecture

Whisper isn't designed for real-time. It processes 30-second chunks. For a meeting app, you need a streaming wrapper.

### LocalAgreement Policy (Best Practice)
From `whisper_streaming` project:

```
Audio In ──→ [Buffer: rolling 30s window]
              │
              ├── Process chunk N
              ├── Process chunk N+1 (with overlap)
              ├── If chunks N and N+1 agree on prefix → COMMIT that text
              └── Continue with uncommitted tail
```

**Key idea**: only emit text when two consecutive processing passes agree on it. This prevents Whisper from flip-flopping on recent words.

### Chunking Strategy
```
Meeting audio (continuous):
────────────────────────────────────────────→

VAD segments (speech only):
──███──██████──█████──███████──██──█████████──

Whisper chunks (30s windows with overlap):
[========30s========]
         [========30s========]
                  [========30s========]
```

### Parameters for Real-Time
```
- Chunk size: 30 seconds (Whisper's native window)
- Overlap: 5 seconds (prevents word splitting at boundaries)
- Processing trigger: when VAD detects end of speech segment,
  OR when buffer hits 30s, whichever comes first
- Condition on previous text: FALSE (reduces hallucination)
- Temperature: 0 (deterministic, no random sampling)
- Beam size: 5 (default in whisper.cpp, good accuracy)
- Best of: 1 (speed over marginal accuracy gain)
```

---

## 5. Whisper Turbo Model Configuration

### Model Selection
```
large-v3-turbo (809M params)
├── Full precision: ~3.1GB VRAM
├── q5_0 quantized: ~1.1GB ← RECOMMENDED for Mac
├── q8_0 quantized: ~1.6GB
└── Performance: ~5x faster than large-v3, minimal accuracy loss
```

### Optimal whisper.cpp Flags for Meeting Transcription
```bash
whisper-cli \
  -m models/ggml-large-v3-turbo-q5_0.bin \   # Quantized turbo
  -vm models/ggml-silero-v6.2.0.bin \         # VAD model
  --vad \                                      # Enable VAD
  -t 4 \                                      # 4 threads (M-series sweet spot)
  --no-timestamps \                            # Faster single-pass batching
  --language en \                              # Force English (skip detection)
  --no-context \                               # Don't condition on prev (reduces halluc)
  --temperature 0 \                            # Deterministic
  --beam-size 5 \                              # Good accuracy
  --entropy-thold 2.4 \                        # Filter low-confidence segments
  --logprob-thold -1.0 \                       # Filter unlikely tokens
  --suppress-tokens "" \                       # Don't suppress any tokens
  --max-context 224 \                          # Context window size
  -f audio.wav
```

### Apple Silicon Specific
```bash
# Build with CoreML + Metal for maximum speed
cmake -B build \
  -DWHISPER_COREML=1 \
  -DWHISPER_METAL=1
cmake --build build -j --config Release

# Generate CoreML model (one-time setup)
./models/generate-coreml-model.sh large-v3-turbo
```

### Thread Count by Chip
| Chip | Recommended Threads | Notes |
|------|-------------------|-------|
| M1 | 4 | 4 performance cores |
| M1 Pro/Max | 6 | More P-cores |
| M2 | 4 | Same as M1 |
| M2 Pro/Max | 6-8 | |
| M3 | 4 | |
| M3 Pro/Max | 6-8 | |
| M4 | 4-6 | |
| M4 Pro/Max | 6-10 | |

Don't max threads. Leave headroom for the app UI and audio capture. 4 is safe default.

---

## 6. Post-Processing (Where Quality Actually Lives)

Raw Whisper output is mediocre for meeting notes. Post-processing is where Syag-quality happens.

### A. Hallucination Filtering
Whisper hallucinates specific patterns. Filter these:

```python
HALLUCINATION_PATTERNS = [
    # Repetitive tokens
    r"(.{10,}?)\1{2,}",                    # Same phrase repeated 3+ times
    # Common Whisper hallucinations
    r"^(Thank you\.?\s*){2,}$",
    r"^(Thanks for watching\.?\s*)+$",
    r"^(Please subscribe\.?\s*)+$",
    r"^(Music\.?\s*)+$",
    r"^(Applause\.?\s*)+$",
    r"^\[BLANK_AUDIO\]$",
    # YouTube-style outros
    r"like and subscribe",
    r"see you in the next",
    r"don't forget to",
]

def filter_hallucinations(text: str) -> str:
    for pattern in HALLUCINATION_PATTERNS:
        if re.match(pattern, text.strip(), re.IGNORECASE):
            return ""
    return text
```

### B. Confidence-Based Filtering
Use Whisper's token-level log probabilities:

```python
# Segments with avg_logprob < -1.0 are likely hallucinations
# Segments with no_speech_prob > 0.6 are likely silence misdetected as speech
def should_keep_segment(segment):
    if segment.avg_logprob < -1.0:
        return False
    if segment.no_speech_prob > 0.6:
        return False
    if len(segment.text.strip()) < 2:
        return False
    return True
```

### C. Duplicate/Overlap Removal
The sliding window approach produces overlapping text. Deduplicate:

```python
def merge_overlapping_segments(segments, overlap_threshold=0.8):
    """Remove duplicate text from overlapping windows"""
    merged = []
    for seg in segments:
        if merged and text_similarity(merged[-1].text[-50:], seg.text[:50]) > overlap_threshold:
            # Trim the overlapping prefix from new segment
            seg.text = remove_common_prefix(merged[-1].text, seg.text)
        if seg.text.strip():
            merged.append(seg)
    return merged
```

### D. Speaker Attribution (Me vs Them)
Since you capture mic and system audio separately:

```python
# Process mic audio → "Me" segments with timestamps
# Process system audio → "Them" segments with timestamps
# Interleave by timestamp → full transcript with speaker labels

def interleave_speakers(me_segments, them_segments):
    all_segs = []
    for s in me_segments:
        all_segs.append({"speaker": "Me", "start": s.start, "end": s.end, "text": s.text})
    for s in them_segments:
        all_segs.append({"speaker": "Them", "start": s.start, "end": s.end, "text": s.text})
    return sorted(all_segs, key=lambda x: x["start"])
```

### E. LLM Cleanup Pass (Optional but High Impact)
Cheap/fast model (GPT-4o-mini, Haiku) to clean transcript:

```
Fix any obvious transcription errors in this meeting transcript.
Rules:
- Fix misspelled proper nouns (company names, people, products)
- Fix homophone errors (there/their/they're)
- Don't change meaning, phrasing, or add content
- Preserve speaker labels and timestamps
- If unsure, leave it as-is
```

This is a light pass — not summarization. Just error correction. Run it before your main summarization prompt.

---

## 7. Performance Budget (14" MacBook Pro)

Target: process audio faster than real-time (1 second of audio processed in <1 second)

### M3 Pro Baseline
| Stage | Time per 30s chunk | Notes |
|-------|-------------------|-------|
| Audio capture + resample | ~0ms | Streaming, no batch cost |
| VAD (Silero) | ~10ms | Negligible |
| Whisper Turbo (CoreML, q5_0) | ~1.2s | For 30s of speech |
| Post-processing | ~50ms | Regex + dedup |
| **Total** | **~1.3s per 30s** | **23x real-time** |

This means you can process the meeting in real-time with plenty of headroom. The 30s chunks process in ~1.3s, giving you ~28.7s of idle time before the next chunk arrives.

### Memory Budget
```
whisper.cpp (turbo q5_0 + CoreML): ~1.5GB RAM
Silero VAD: ~50MB
Audio buffers: ~100MB
App + UI: ~200MB
─────────────────────
Total: ~1.9GB
```

Fits comfortably in 8GB unified memory. 16GB has plenty of headroom.

---

## 8. Practical Tips That Actually Matter

### Audio Quality (Biggest Impact on Accuracy)
1. **Use headphones/earbuds with mic** — eliminates echo of remote speakers from your mic
2. **Headset > laptop mic** — shorter distance, less room reverb
3. **Close the door** — Whisper handles some noise, but quiet room = dramatically better
4. **Avoid fan noise** — if MacBook fans spin up, audio quality drops

### Whisper-Specific
5. **Force language detection** — if you know it's English, set `--language en`. Saves time and prevents language detection errors
6. **Disable previous text conditioning** — `--no-context` or `condition_on_prev_text=False`. In meetings, topics jump. Conditioning on previous text causes Whisper to "continue" the wrong thread
7. **Use .en models for English-only** — slightly better accuracy. But turbo doesn't have a .en variant, so this only applies if you use smaller models
8. **Initial prompt** — feed Whisper domain-specific vocabulary:

```python
initial_prompt = "Syag AI, JIRA, sprint planning, Kubernetes, React, TypeScript, deployment pipeline, standup, retrospective"
```

This biases Whisper toward correctly transcribing your team's jargon. **Huge quality win for technical meetings.**

### Architecture
9. **Process mic and system audio as separate streams** — gives you speaker labels for free
10. **Buffer aggressively** — don't send tiny chunks to Whisper. Wait for VAD to detect end of speech, then send the full utterance (up to 30s)
11. **Overlap windows by 5s** — prevents word splitting at chunk boundaries
12. **Run inference on a background thread** — never block the UI or audio capture

### What Syag Does
13. **No audio storage** — transcribe in real-time, discard audio immediately. Users trust this.
14. **"Me" vs "Them" labels** — mic input = Me, system audio = Them. Simple, effective.
15. **Transcript is internal** — users see enhanced notes, not raw transcript. The transcript is a tool, not the product.

---

## 9. Quick Decision: Local vs Cloud

| Factor | Local (Whisper) | Cloud (Deepgram/Assembly) |
|--------|----------------|---------------------------|
| Privacy | Full — audio never leaves device | Audio streamed to provider |
| Cost | $0 per meeting | $0.01-0.05/min |
| Accuracy (clean audio) | 95-97% | 97-99% |
| Accuracy (noisy/accents) | 90-93% | 94-97% |
| Speaker diarization | Mic/System split only | Multi-speaker labels |
| Latency | ~1.3s per 30s chunk | Sub-second streaming |
| Offline support | Yes | No |
| Setup complexity | Higher | Lower |

### Hybrid Approach (Best of Both)
- Default: local Whisper Turbo for privacy
- Optional: cloud upgrade for users who want better accuracy
- Fallback: if local processing lags, buffer and catch up (audio is cheap to buffer)

---

## 10. Recommended Implementation Path

### Phase 1: Get it working
1. Core Audio Taps for system audio capture (macOS 14.2+)
2. AVAudioEngine for mic capture
3. whisper.cpp with CoreML, large-v3-turbo-q5_0
4. Basic VAD with Silero
5. "Me" / "Them" speaker labels from dual streams
6. Hallucination filtering
7. Pipe transcript to Syag LLM summarization prompt

### Phase 2: Make it good
8. Initial prompt with domain vocabulary
9. LLM cleanup pass before summarization
10. Overlap window deduplication
11. Confidence-based segment filtering
12. Custom vocabulary / hot-word boosting

### Phase 3: Make it great
13. Real-time streaming with LocalAgreement policy
14. Adaptive VAD thresholds (auto-tune per meeting)
15. Speaker change detection within system audio (for multi-participant)
16. Transcript caching for mid-meeting "catch me up" queries
17. Optional cloud fallback for premium tier
