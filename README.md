# Syag

A private, on-device meeting companion for macOS. Syag records your meetings, transcribes them in real time, generates structured summaries, and coaches you to communicate better — all without your data leaving your machine.

---

## Why Syag?

Most meeting tools send your audio to the cloud, slap a watermark on your transcript, and charge per seat. Syag runs entirely on your Mac. Your recordings, transcripts, and notes never leave your machine unless you explicitly choose a cloud AI provider — and even then, only the text goes out, not the audio.

---

## What it does

- **Record & transcribe** — Capture mic and system audio simultaneously with live speaker-labeled transcription ("You" vs "Others"). Works with Zoom, Google Meet, Teams, or any audio source.

- **AI summaries** — Get a structured summary after each meeting: overview, key points, action items with assignees and due dates, decisions, and open questions. Customize the output with your own prompt templates.

- **Knowledge base** — Point Syag at a folder of your notes or reference docs. During a live call it searches your knowledge base and surfaces relevant talking points in real time.

- **Work Coach** — Post-meeting behavioral coaching tuned to your role (PM, Engineer, Sales, Founder, Designer …). Qualitative insights drawn from best-practice frameworks by top thought leaders, not just talk-time percentages.

- **People & relationships** — Automatically extracts the people you meet with. View, edit, merge duplicates, and track your meeting history with each person.

- **Calendar integration** — Connect Google Calendar or Microsoft 365 to see upcoming meetings and auto-detect when a call starts.

- **Floating meeting pill** — A small always-on-top indicator appears when Syag is minimized during an active meeting, showing the meeting title and elapsed time. Click it to jump back.

- **Agent API** — A read-only local API for AI agents and tools to query your notes programmatically. Token-authenticated, zero network exposure.

- **Hidden from screen share** — One toggle hides Syag from screen sharing so other participants never see it.

---

## Privacy

- All data stored locally in `~/Library/Application Support/Syag/`
- API keys encrypted via macOS Keychain (Electron safeStorage)
- No telemetry, no analytics, no cloud sync
- Supports fully local transcription (MLX Whisper / whisper.cpp) and local LLMs (Llama, Phi, Gemma via GGUF)
- Cloud providers (OpenAI, Anthropic, Groq, Deepgram, etc.) are opt-in — bring your own keys

---

## Install

Download the latest DMG from the [Releases](https://github.com/iamsagar125/syag-note/releases) page, open it, and drag Syag to Applications.

macOS (Apple Silicon) only.

**If macOS blocks the app:** The DMG is not notarized. Either:

- **Right-click** Syag in Applications → **Open** → confirm; or
- In Terminal: `xattr -cr /Applications/Syag.app`

---

## Development

```bash
# Install dependencies
npm ci

# Run in dev mode (Electron + Vite hot reload)
npm run dev:electron

# Run tests
npm test

# Lint
npm run lint
```

---

## Build & release

```bash
npm run build      # Build main + renderer
npm run package    # Package DMG (macOS, config in package.json)
```

Output: `dist/` — DMG and zip. Version comes from `package.json`.

Installing a new build over an existing one preserves your notes, API keys, and settings — user data lives in `~/Library/Application Support/Syag/`, not inside the app bundle.

---

## License

MIT
