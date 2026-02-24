# Manual test checklist

Use this checklist for pre-release and regression verification of the core end-to-end flows. See [CORE_FLOWS.md](CORE_FLOWS.md) for flow details and key files.

---

## Quick Note

- [ ] **From home (no notes):** Click "Quick Note" in empty state → new session, URL `/new-note?session=<uuid>`, timer at 0:00, no previous content.
- [ ] **From home (with notes):** With existing notes, click "Quick Note" in HomeShelf or main CTA → new session, new UUID in URL, clean state and timer.
- [ ] **From AllNotes:** Click "New note" → new session, new URL, timer starts from 0.
- [ ] **From tray:** Tray menu → "New Note" → app focuses, navigates to new note with startFresh behavior (new session, clean state).

---

## Tray

- [ ] **Start from tray:** Tray → "New Note" → app opens/focuses, new note page with fresh session.
- [ ] **Open meeting from tray:** While recording, tray click or "Open Meeting" → navigates to current meeting note (`/new-note?session=<current-id>`), same session and timer.
- [ ] **Pause from tray:** While recording, tray → "Pause Recording" → recording pauses, UI shows paused state.
- [ ] **Meeting ended:** With a meeting app running then closed (or documented way to simulate), confirm "meeting ended" triggers pause + auto-summarize; note is saved with summary. (How to trigger: close meeting app, e.g. quit Zoom/Teams, while Syag is running.)

---

## Summary

- [ ] **Pause with content:** With some transcript and/or personal notes, click Pause → summary generates and appears (overview, topics, action items); note is saved.
- [ ] **Reopen note:** After saving a summarized note, open it from home or All Notes → full template structure visible (discussion topics, decisions, action items).
- [ ] **Template change + rerun:** On a note with summary, change template from dropdown beside sparkle, click rerun → new summary with selected template structure.

---

## Recording

- [ ] **STT configured:** In Settings, set a working STT model (e.g. Deepgram with key). Start a new note → recording starts, transcript chunks appear in UI as you speak.
- [ ] **Pause / resume:** Start recording → see chunks → Pause → no new chunks → Resume → new chunks appear again.
- [ ] **Save and reopen:** Record a few chunks, pause, let summary run (or trigger manually). Save. Reopen note from home → transcript and summary both present.
- [ ] **STT error path (optional):** With invalid or missing API key for chosen STT, start note → error surfaces (toast or inline) and no silent failure.
