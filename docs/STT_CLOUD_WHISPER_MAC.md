# Cloud Whisper on Mac — On-Device Responsibilities

**Follow this when you are NOT using on-device models for STT** (i.e. when streaming to a cloud Whisper/STT service).

With cloud Whisper, the Mac app stays thin but still does seven things on-device. These keep cost down, quality up, and give you "Me" vs "Them" labels without server-side diarization.

---

## The seven on-device responsibilities

### 1. Dual audio capture
- **Mic** via AVAudioEngine
- **System audio** via Core Audio Taps (macOS 14.2+)
- Keep them as **separate streams**. Do not mix.
- This gives you **"Me" vs "Them" speaker labels for free** — no diarization needed. Exactly what Syag does.

### 2. On-device VAD (Silero, ~2MB)
- **Non-negotiable even with cloud Whisper.**
- Cuts streamed audio by **50–60%**, reduces cloud cost, and eliminates hallucinations before they happen.
- No reason to send silence to the server. Only send speech segments when VAD detects them.

### 3. Resample + encode
- **16 kHz mono** input for Whisper.
- **Opus** compress before sending over the wire.
- Brings bandwidth from ~115 MB/hour down to **~11 MB/hour**.

### 4. WebSocket streaming
- **Persistent connection** to your cloud STT service.
- Send **speech chunks as VAD detects them** (not one big file).
- Receive transcript segments back.
- Support **partial results** for live text-as-you-speak.

### 5. Post-processing (on-device)
- **Hallucination filtering** — strip common Whisper hallucinations (thank you, thanks for watching, etc.).
- **Confidence filtering** — drop low-confidence segments if the API returns them.
- **Overlap dedup** — merge overlapping text from sliding windows.
- All lightweight, all on-device.

### 6. Live transcript panel
- **Me/Them interleaved by timestamp** from the two streams.
- Show partial results while streaming, then finalize as segments complete.

### 7. Initial prompt with your vocabulary
- Send **attendee names, product terms, and meeting title** to your cloud Whisper as the initial prompt / vocabulary hint.
- This is the **single biggest accuracy win** for domain-specific content: e.g. "Syag" instead of "ciag", "JIRA" instead of "gear".

---

## Summary

| Layer            | On-device (Mac)                          | Cloud                    |
|-----------------|------------------------------------------|--------------------------|
| Capture         | Dual streams (mic + system), separate    | —                        |
| VAD             | Silero, speech-only segments             | —                        |
| Encode          | 16 kHz mono, Opus                        | —                        |
| Transport       | WebSocket, chunked by VAD                | Receive segments         |
| Post-process    | Hallucination, confidence, dedup        | —                        |
| UI              | Me/Them transcript, partial results     | —                        |
| Accuracy hint   | Initial prompt / vocabulary to API      | Whisper uses it          |
| Transcription   | —                                        | Whisper (or equivalent)  |

When using **on-device** models instead, see **`docs/STT_WHISPER_TURBO_MAC.md`**.
