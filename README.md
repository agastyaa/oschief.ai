# OSChief

**Your private, on-device chief of staff for macOS.**

OSChief captures your meetings, structures what happened, tracks what you promised, and tells you what needs attention — all running locally on your Mac.

---

## How it works

**Record any call** — Zoom, Meet, Teams, or anything that makes sound. Mic + system audio, speaker-labeled in real time.

**Get structured notes** — AI summaries with decisions, action items, owners, and due dates. Templates you control.

**Track commitments** — Every promise extracted across meetings. Risk-scored, with nudges when things are about to slip.

**Coach yourself** — Post-meeting coaching tuned to your role, grounded in frameworks from 300+ practitioner interviews.

**Own your data** — Everything on disk. No telemetry. Cloud is opt-in, text-only, bring-your-own-keys.

---

## Features

| | |
|---|---|
| **Transcription** | On-device via MLX Whisper, Parakeet CoreML (110x real-time), whisper.cpp, or macOS Speech. Cloud STT optional. |
| **Speaker ID** | Dual-channel (You vs Others) with system audio. Mic-only mode uses pyannote segmentation + ECAPA-TDNN for multi-speaker identification. |
| **Summaries** | Overview, key points, decisions, action items, open questions. Customizable prompt templates. |
| **Work Coach** | Role-aware coaching (PM, engineer, sales, founder, etc.) backed by a local knowledge base of 303 Lenny's Podcast episodes. |
| **Commitments** | Auto-extracted action items with owners, due dates, risk scoring (green/amber/red), and Asana integration. |
| **Decisions** | Every decision searchable by project, person, or keyword. Full lifecycle tracking. |
| **People** | Relationship graph built from your meetings — who you met, what you decided, what you owe each other. |
| **Projects** | Group meetings, commitments, and decisions. Filter everything by project. |
| **Morning Brief** | Daily command center: what's on your plate, what needs attention, synthesized into a brief. |
| **Calendar** | Google Calendar + Microsoft 365. Auto-detects meetings, suggests recording. |
| **Knowledge Base** | Point at a folder of docs. OSChief live-searches and surfaces relevant context during calls. |
| **All Notes** | Search, folder tabs, filter chips, rich cards with metadata, collapsible date groups, sort options. |
| **Agent API** | Read-only local API for AI agents and automations. Token-authenticated, localhost-only. |

---

## AI Models

Works with whatever you prefer — local or cloud.

**Local (fully offline):** MLX Whisper, Parakeet CoreML, whisper.cpp, macOS Speech, Ollama (Llama, Qwen, Gemma, Phi), Apple Foundation Models

**Cloud (opt-in, text-only):** OpenAI, Anthropic, Google, Deepgram, Groq, AssemblyAI, OpenRouter (100+ models)

**Custom:** Register your own providers. Air-gapped mode blocks all cloud calls with one toggle.

---

## Install

Download the latest `.dmg` from [Releases](https://github.com/agastyaa/oschief.ai/releases). Drag to Applications. Done.

**Requires:** macOS 13+, Apple Silicon (M1/M2/M3/M4).

If macOS blocks the app:
```bash
xattr -cr /Applications/OSChief.app
```

---

## Privacy

- All data under `~/Library/Application Support/OSChief/`
- API keys encrypted via macOS Keychain
- No telemetry, no analytics, no background sync
- Audio never leaves your Mac — cloud providers only see text
- Air-gapped mode for fully offline operation

---

## Development

```bash
git clone https://github.com/agastyaa/oschief.ai.git
cd oschief.ai
npm install
npm run dev
```

See `DESIGN.md` for the design system and `CLAUDE.md` for architecture.

---

## License

MIT — see `LICENSE`.
