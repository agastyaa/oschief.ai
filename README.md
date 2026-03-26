# OSChief

OSChief is your personal OS for work — a private, on‑device chief of staff for macOS.

It sits beside your calls, transcribes in real time, turns meetings into structured plans, links everything back to people and projects, and exposes it all through a local API for agents and automations. By default, everything runs locally on your Mac — not in the cloud.

---

## Why OSChief?

Most “AI meeting tools” are narrow and leaky:

- They only think in terms of one call at a time.
- They ship your audio to someone else’s servers.
- They lock value inside their UI instead of your workflows.

OSChief assumes:

- Your **source of truth should live on your machine**.
- Meetings are just one surface in a bigger personal OS.
- The best AI features are ones you can **wire into your own tools**.

Audio is processed locally. Transcripts and notes are written to disk. Cloud models are opt‑in, text‑only, and bring‑your‑own‑keys.

---

## What OSChief does

### 1. Meetings as the top of funnel

**Record & transcribe**

Capture mic + system audio with live, speaker‑labeled transcription (“You” vs “Others”). Works with Zoom, Meet, Teams, or any app that makes sound. Transcription runs fully on‑device.

**Structured AI summaries**

After each meeting, OSChief produces a structured summary: overview, key points, decisions, action items (with owners and due dates), and open questions. You control the format via prompt templates so outputs match your workflow, not the other way around.

**Work Coach**

Post‑meeting coaching tuned to your role (PM, engineer, sales, founder, designer, etc.). Work Coach looks at how you run meetings and gives qualitative feedback based on real frameworks instead of vanity talk‑time stats.

**Meeting‑safe UI**

OSChief can be hidden from screen share with a single toggle so it never becomes the topic of the meeting. When minimized, a floating pill stays always‑on‑top with title + elapsed time; click to jump back into the full app.

### 2. Personal OS layer

**Command Center**

A homepage for your workday: upcoming meetings, recent notes, and quick actions in one place. Think of it as a launchpad for your brain, fully local.

**Knowledge base search**

Point OSChief at a folder of notes or reference docs (Obsidian vault, Notion exports, markdown, PDFs, etc.). During a call, it live‑searches and surfaces relevant talking points so you stay in flow instead of context‑switching.

**People & relationships**

OSChief automatically extracts the people you meet with and builds a lightweight relationship graph. Merge and edit profiles, then see your history with each person across meetings — what you decided, what you owe them, and what they owe you.

**Calendar‑aware**

Connect Google Calendar or Microsoft 365. OSChief pulls upcoming meetings, auto‑detects when one starts, and suggests recording so important calls don’t slip through.

### 3. For agents & automations

**Local Agent API**

OSChief exposes a read‑only local API that surfaces meetings, notes, decisions, and action items to AI agents and tools. It is token‑authenticated, localhost‑only, and has zero network exposure by default.

Use it to:

- Generate follow‑up emails.
- Sync action items into your task system.
- Run analytics on conversations and decisions.
- Build your own “staff tools” on top of your own data.

---

## Privacy & security

OSChief is designed to be boring from a security review standpoint.

- All data stored locally under `~/Library/Application Support/OSChief/`
- API keys encrypted via macOS Keychain (safe storage)
- No telemetry, no analytics, no background sync
- Fully local transcription via MLX Whisper / whisper.cpp
- Local LLM support (Llama, Phi, Gemma via GGUF, including Ollama routing)
- Cloud providers (OpenAI, Anthropic, Groq, Deepgram, etc.) are opt‑in and text‑only — audio never leaves your Mac

You own your data. OSChief’s job is to make it usable.

## Release

https://github.com/iamsagar125/syag-note/releases

## Install

1. Download the latest `.dmg` from the Releases page.
2. Open the DMG and drag **OSChief** to **Applications**.
3. Launch OSChief from Applications.

**Platform:** macOS, Apple Silicon only.

If macOS blocks the app because it’s not notarized yet:

- Right‑click OSChief in Applications → **Open** → confirm; or
- In Terminal:

```bash
xattr -cr /Applications/OSChief.app
```

---

## Roadmap / status

OSChief 2.0.0 (“Executive Utilitarian”) focuses on:

- Differentiation beyond generic meeting bots: Command Center, Work Coach, relationship graph.
- Stronger privacy and data‑ownership guarantees.
- A clear surface for agents and automations via the local API.

Breaking changes and detailed release notes are tracked in `CHANGELOG.md`.

---

## Contributing

This is an evolving project. Bug reports, feature ideas, and small focused PRs are welcome.

1. Fork the repository.
2. Clone and install dependencies.
3. Run the app in development mode (Electron + Vite).
4. Open a pull request with a clear description and screenshots where relevant.

See `DESIGN.md` and `CLAUDE.md` for architecture, conventions, and assistant prompts.

---

## License

OSChief is open source under the MIT License. See `LICENSE` for details.
