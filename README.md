# Syag

Syag is your personal OS for work — a private, on-device chief of staff for macOS.

It sits beside your calls, transcribes in real time, turns meetings into structured plans, links everything back to people and projects, and exposes it all through a local API for agents and automations. All of this runs on your Mac, by default, not in the cloud.

---

## Why Syag?

Most “AI meeting tools” are narrow and leaky:

- They only think in terms of one call at a time.
- They ship your audio to someone else’s servers.
- They lock value inside their UI instead of your workflows.

Syag assumes:

- Your **source of truth should live on your machine**.
- Meetings are just one surface in a bigger personal OS.
- The best AI features are ones you can **wire into your own tools**.

Audio is processed locally. Transcripts and notes are written to disk. Cloud models are opt‑in, text‑only, and bring‑your‑own‑keys.

---

## What Syag does

### Meetings as the top-of-funnel

- **Record & transcribe**  
  Capture mic + system audio with live, speaker‑labeled transcription (“You” vs “Others”). Works with Zoom, Meet, Teams, or any app that makes sound.

- **AI summaries that are actually useful**  
  After each meeting, Syag produces a structured write‑up: overview, key points, decisions, action items (with owners and due dates), and open questions. You control the format via prompt templates.

- **Work Coach**  
  Post‑meeting coaching tuned to your role (PM, Engineer, Sales, Founder, Designer, …). It looks at how you run meetings and gives qualitative feedback based on real frameworks, not vanity talk‑time stats.

- **Hidden from screen share**  
  One toggle to keep Syag invisible on screen shares so it never becomes the topic of the meeting.

- **Floating meeting pill**  
  When minimized, a small always‑on‑top pill shows title + elapsed time. Click to jump back.

### Personal OS layer

- **Command Center**  
  A homepage for your workday: upcoming meetings, recent notes, and quick actions in one place. Think “launchpad for your brain,” all local.

- **Knowledge base search**  
  Point Syag at a folder of notes or reference docs (Obsidian, Notion exports, markdown, PDFs, etc.). During a call, it live‑searches and surfaces relevant talking points so you sound prepared without context‑switching.

- **People & relationships**  
  Syag automatically extracts the people you meet with. You can merge, edit, and see your history with each person across meetings — a lightweight relationship graph that actually stays up to date.

- **Calendar integration**  
  Connect Google Calendar or Microsoft 365. Syag pulls upcoming meetings, auto‑detects when one starts, and suggests recording so nothing slips through.

### For agents & automations

- **Agent API**  
  A read‑only local API that exposes your meetings, notes, and decisions to AI agents and tools. Token‑authenticated, localhost‑only, zero network exposure by default.

Use it to:

- Generate follow‑up emails.
- Sync action items into task systems.
- Run analytics over your conversations.
- Build your own “staff tools” on top of your own data.

---

## Privacy & security

Syag is designed to be boring from a security review standpoint:

- All data stored locally at `~/Library/Application Support/Syag/`
- API keys encrypted via macOS Keychain (`safeStorage`)
- No telemetry, no analytics, no surprise background sync
- Fully local transcription via MLX Whisper / `whisper.cpp`
- Local LLM support (Llama, Phi, Gemma via GGUF, including Ollama routing)
- Cloud providers (OpenAI, Anthropic, Groq, Deepgram, etc.) are opt‑in and text‑only — audio never leaves your Mac

---

## Install

1. Download the latest `.dmg` from the [Releases](https://github.com/iamsagar125/syag-note/releases) page.
2. Open the DMG and drag **Syag** to **Applications**.
3. Launch Syag from Applications.

**Platform:** macOS (Apple Silicon) only.

If macOS blocks the app because it’s not notarized yet:

- Right‑click Syag in Applications → **Open** → confirm; or  
- In Terminal:

```bash
xattr -cr /Applications/Syag.app
