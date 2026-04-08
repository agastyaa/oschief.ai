# OSChief

**Your private, on-device chief of staff for macOS.**

OSChief captures your meetings, structures what happened, tracks what you promised, and tells you what needs attention — all running locally on your Mac.

![OSChief v2.3](https://img.shields.io/badge/version-2.3.2-blue) ![macOS](https://img.shields.io/badge/macOS-13%2B-black) ![Apple Silicon](https://img.shields.io/badge/Apple%20Silicon-M1%2FM2%2FM3%2FM4-orange)

---

## How it works

**Record any call** — Zoom, Meet, Teams, or anything that makes sound. Mic + system audio, speaker-labeled in real time.

**Get structured notes** — AI summaries with decisions, action items, owners, and due dates. Rich text personal notes with bold, lists, tables, and checklists.

**Track commitments** — Action items sync 1:1 as commitments. Assignable, due-dated, project-linked, with overdue tracking.

**Coach yourself** — Post-meeting coaching that tells you what you missed — grounded in your transcript and role playbook, not generic tips.

**Own your data** — Everything on disk. No telemetry. Cloud is opt-in, text-only, bring-your-own-keys.

---

## Features

| | |
|---|---|
| **Transcription** | On-device via MLX Whisper, Parakeet CoreML (110x real-time), whisper.cpp, or macOS Speech. Cloud STT optional. |
| **Speaker ID** | Dual-channel (You vs Others) with system audio. Mic-only mode uses pyannote segmentation + ECAPA-TDNN for multi-speaker identification. |
| **Summaries** | Overview, key points, decisions, action items, open questions. Customizable prompt templates. Auto-generates on pause. |
| **Rich Text Notes** | Tiptap editor — bold, italic, bullet/numbered lists, checklists, headings, blockquotes, code blocks, tables. |
| **Work Coach** | Qualitative coaching — what you missed, KB-grounded, Shreyas Doshi–style. No scores, no charts. Manual "Analyze" per meeting. |
| **Commitments** | 1:1 mirror of action items. Assignable with searchable picker. Due dates, projects, "Assign to me". Syncs when you edit action items. |
| **Decisions** | Every decision searchable by project, person, or keyword. Full lifecycle tracking. |
| **People** | Relationship graph built from your meetings — who you met, what you decided, what you owe each other. |
| **Projects** | Group meetings, commitments, and decisions. Shown in sidebar under All Meetings. |
| **Routines** | Scheduled prompts — Morning Briefing, Weekly Recap, Overdue Commitments. Built-in + custom. |
| **Calendar** | Google Calendar, Microsoft 365, Apple Calendar, or any ICS feed. Auto-detects meetings, suggests recording. |
| **Knowledge Base** | Point at a folder of docs. OSChief live-searches and surfaces relevant context during calls. |
| **Auto-pause** | Recording pauses after 45s of silence. Tray timer stops. Summary auto-generates. No auto-resume. |
| **Agent API** | Read-only local API for AI agents and automations. Token-authenticated, localhost-only. |

---

## AI Models

Works with whatever you prefer — local or cloud.

**Local (fully offline):** MLX Whisper, Parakeet CoreML, whisper.cpp, macOS Speech, Ollama (Llama, Qwen, Gemma, Phi), Apple Foundation Models

**Cloud (opt-in, text-only):** OpenAI, Anthropic, Google, Deepgram, Groq, AssemblyAI, OpenRouter (100+ models)

**Custom:** Register your own providers. Air-gapped mode blocks all cloud calls with one toggle.

The privacy indicator in the sidebar shows "Local" (green) or "Cloud" (amber) based on your current model selection.

---

## Install

Download the latest `.dmg` from [Releases](https://github.com/agastyaa/oschief.ai/releases). Drag to Applications. Done.

**Requires:** macOS 13+, Apple Silicon (M1/M2/M3/M4).

Auto-updater checks for new versions on launch and every 4 hours. You can also check manually from the tray icon → "Check for Updates".

If macOS blocks the app:
```bash
xattr -cr /Applications/OSChief.app
```

---

## What's new in v2.3

- **Sidebar redesign** — flat nav with icons, projects under All Meetings, no horizontal tab bars
- **Commitments = action items** — 1:1 sync, edits flow both ways
- **Coaching overhaul** — qualitative only, Shreyas Doshi–style, KB-grounded, manual analysis
- **Rich text notes** — Tiptap editor replaces plain textarea
- **Today page** — date in greeting, only today's meetings, This Week commitments
- **Settings cleanup** — single "Add Calendar", removed unwired toggles, simplified integrations

See [CHANGELOG.md](CHANGELOG.md) for full release history.

---

## Privacy

- All data under `~/Library/Application Support/OSChief/`
- API keys encrypted via macOS Keychain
- No telemetry, no analytics, no background sync
- Audio never leaves your Mac — cloud providers only see text
- Mic-only meetings auto-detected and excluded from coaching
- Air-gapped mode for fully offline operation

---

## Development

```bash
git clone https://github.com/agastyaa/oschief.ai.git
cd oschief.ai
npm install
npm run dev
```

**Stack:** Electron + React + TypeScript + Tailwind + SQLite + Tiptap

See `DESIGN.md` for the design system and `CLAUDE.md` for architecture.

---

## License

MIT — see `LICENSE`.
