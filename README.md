# OSChief

OSChief is your personal OS for work — a private, on‑device chief of staff for macOS.

It sits beside your calls, transcribes in real time, turns meetings into structured plans, tracks every commitment and decision across your work, and tells you every morning what moved, what you promised, and what's about to fall through. By default, everything runs locally on your Mac — not in the cloud.

---

## Why OSChief?

Most "AI meeting tools" are narrow and leaky:

- They only think in terms of one call at a time.
- They ship your audio to someone else's servers.
- They lock value inside their UI instead of your workflows.

OSChief assumes:

- Your **source of truth should live on your machine**.
- Meetings are just one surface in a bigger personal OS.
- A chief of staff doesn't just record — they close the loop.

Audio is processed locally. Transcripts and notes are written to disk. Cloud models are opt‑in, text‑only, and bring‑your‑own‑keys.

---

## What OSChief does

### 1. Meetings as the top of funnel

**Record & transcribe**

Capture mic + system audio with live, speaker‑labeled transcription ("You" vs "Others"). Works with Zoom, Meet, Teams, or any app that makes sound. Transcription runs fully on‑device.

**Structured AI summaries**

After each meeting, OSChief produces a structured summary: overview, key points, decisions, action items (with owners and due dates), and open questions. You control the format via prompt templates so outputs match your workflow, not the other way around.

**Work Coach**

Post‑meeting coaching tuned to your role (PM, engineer, sales, founder, designer, etc.). Work Coach looks at how you run meetings and gives qualitative feedback based on real frameworks instead of vanity talk‑time stats.

**Meeting‑safe UI**

OSChief can be hidden from screen share with a single toggle. When minimized, a floating pill stays always‑on‑top with title + elapsed time; click to jump back.

### 2. Proactive intelligence (v2.0.4)

**Morning Brief**

Your home page is a daily command center. Every morning you see what's on your plate: meetings on record, open commitments, and a "Needs Attention" section that surfaces anything requiring action today. When Ollama is running locally, it synthesizes this into a 3–5 sentence brief.

**Commitment risk scoring**

Commitments with due dates are scored automatically:
- 🟢 GREEN — more than 72 hours away
- 🟡 AMBER — due within 48 hours
- 🔴 RED — overdue

AMBER and RED commitments appear in "Needs Attention" with nudge actions: mark done, snooze 24h, or draft a follow-up message to your clipboard.

**At-risk indicator**

A **"N at risk"** pill in the sidebar shows how many commitments need attention. Hidden when all is clear. Clicking it opens the Commitments page.

**Stale decisions**

Decisions unchanged for 14+ days surface automatically so nothing falls through the cracks.

**Morning brief + end-of-day routines**

Automated daily routines (weekdays only) fire on a schedule, catch up on launch if missed, and produce a structured brief from your actual data — no cloud required.

### 3. Personal OS layer

**Command Center**

A homepage for your workday: upcoming meetings, recent notes, open commitments, and at-risk items in one place.

**People & relationships**

OSChief automatically extracts the people you meet with and builds a lightweight relationship graph. See your history with each person across meetings — what you decided, what you owe them, what they owe you.

**Projects**

Group meetings, commitments, and decisions under projects. Filter your commitments and decisions by project.

**Commitments**

Every action item extracted from your meetings lands here with owner, assignee, and due date. Add personal to-dos manually. Set deadlines inline. Mark done with one click.

**Decisions**

Every decision made in your meetings — searchable by project, person, or keyword. Full status lifecycle: Made → Assigned → In Progress → Done → Abandoned → Revisited.

**Calendar‑aware**

Connect Google Calendar or Microsoft 365. OSChief pulls upcoming meetings, auto‑detects when one starts, and suggests recording.

**Knowledge base search**

Point OSChief at a folder of notes or reference docs. During a call, it live‑searches and surfaces relevant context.

### 4. For agents & automations

**Local Agent API**

OSChief exposes a read‑only local API that surfaces meetings, notes, decisions, and action items to AI agents and tools. Token‑authenticated, localhost‑only, zero network exposure by default.

---

## Privacy & security

- All data stored locally under `~/Library/Application Support/OSChief/`
- API keys encrypted via macOS Keychain
- No telemetry, no analytics, no background sync
- Fully local transcription via MLX Whisper / whisper.cpp
- Local LLM support via Ollama (Llama, Phi, Gemma, etc.)
- Cloud providers (OpenAI, Anthropic, Groq, Deepgram) are opt‑in and text‑only — audio never leaves your Mac

You own your data. OSChief's job is to make it usable.

---

## Install

1. Download the latest `.dmg` from the [Releases page](https://github.com/iamsagar125/oschief.ai/releases).
2. Open the DMG and drag **OSChief** to **Applications**.
3. Launch OSChief from Applications.

**Platform:** macOS, Apple Silicon only (M1/M2/M3/M4), macOS 13+.

If macOS blocks the app because it's not notarized yet:

```bash
xattr -cr /Applications/OSChief.app
```

Or: right‑click OSChief in Applications → **Open** → confirm.

---

## What's new in v2.0.4

- Morning brief home page with Needs Attention section
- Commitment risk scoring (GREEN / AMBER / RED)
- Inline deadline setting on commitments
- "N at risk" pill indicator in sidebar (replaces dot)
- Decision status lifecycle + stale detection
- End-of-day routine (weekdays only)
- DB migration v12 (automatic on first launch)

Full notes: [github.com/iamsagar125/syag-note/releases/tag/v2.0.4](https://github.com/iamsagar125/syag-note/releases/tag/v2.0.4)

---

## Roadmap / status

OSChief 2.0 focuses on:

- The three primitives: **meetings**, **decisions**, **commitments**
- Proactive intelligence: morning brief, risk scoring, loop-closing nudges
- Full on-device operation — no cloud required for core features

Breaking changes and detailed release notes are tracked in `CHANGELOG.md`.

---

## Contributing

Bug reports, feature ideas, and focused PRs are welcome.

1. Fork the repository.
2. Clone and install dependencies (`npm install`).
3. Run in development mode: `npm run dev`
4. Open a pull request with a clear description and screenshots.

See `DESIGN.md` and `CLAUDE.md` for architecture, conventions, and design system.

---

## License

OSChief is open source under the MIT License. See `LICENSE` for details.
