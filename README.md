# Syag

A private, on-device meeting companion for macOS. Syag records your meetings, transcribes them in real time, generates structured summaries, and coaches you to communicate better — all without your data leaving your machine.

---

## What Syag does

**Record & transcribe** — Capture mic and system audio simultaneously with live speaker-labeled transcription ("You" vs "Others"). Works with Zoom, Google Meet, Teams, or any audio source.

**AI summaries** — After a meeting, get a structured summary: overview, key points, action items with assignees and due dates, decisions, and open questions. Customize the output with your own prompt templates.

**Knowledge base suggestions** — Point Syag at a folder of your notes. During a live call, it searches your knowledge base and surfaces relevant talking points in real time.

**Role-aware coaching** — Post-meeting coaching tuned to your role (PM, Engineer, Sales, Founder, Designer, etc.) with a communication mix breakdown and LLM-generated insights drawn from frameworks by top thought leaders.

**People & relationships** — Syag automatically extracts the people you meet with. View, edit, merge duplicates, and track your meeting history with each person.

**Calendar integration** — Connect Google Calendar or Microsoft 365 to see upcoming meetings and auto-detect when a call starts.

**Agent API** — A read-only Unix socket API for AI agents and tools to query your notes programmatically. Local-only, token-authenticated, zero network exposure.

**Hidden from screen share** — A single toggle hides Syag from screen sharing so other participants never see it.

---

## Privacy

- All data stored locally in `~/Library/Application Support/Syag/`
- API keys encrypted via macOS Keychain (Electron safeStorage)
- No telemetry, no analytics, no cloud sync
- Supports fully local transcription (MLX Whisper / whisper.cpp) and local LLMs
- Cloud providers (OpenAI, Anthropic, Groq, Deepgram, etc.) are opt-in — bring your own keys

---

## Install

Download the latest DMG from the [Releases](https://github.com/iamsagar125/syag-note/releases) page, open it, and drag Syag to Applications.

macOS (Apple Silicon) only.

**If macOS blocks the app** (e.g. "cannot be opened because it is from an unidentified developer"): the DMG is not notarized. Use either (one-time per install):

- **Right-click** Syag in Applications → **Open** → confirm **Open** in the dialog; or  
- In Terminal: `xattr -cr /Applications/Syag.app` then open Syag as usual.

**To avoid the prompt entirely** (for your own builds): use an Apple Developer ID and notarize. In `electron-builder.yml` set `mac.identity` to your Developer ID Application certificate name (remove `identity: null`). For notarization, set env vars `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, and `APPLE_TEAM_ID`, then run the same package command; electron-builder will notarize when credentials are present.

---

## Resources

https://drive.google.com/drive/folders/1BdYUTPUSLokM7wYnkgE2Wqn46IX9TsyS?usp=sharing

---

## License

MIT
