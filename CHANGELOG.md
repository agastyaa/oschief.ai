# Changelog

All notable changes to Syag are documented here. **Keep this file updated with every release** so you can see which release had what changes.

---

## [1.3.0]

- **Screenshot / recording privacy:** Content protection replaced with window hide/show; Syag can be hidden from screen share during recording.
- **Local Llama:** Summarization and chat when using a local model now use fixed context (8192) and 4 threads to avoid overwhelming the machine.
- **Optional providers:** Copart removed from the main repo; optional providers (e.g. Copart) can be loaded from `userData/optional-providers/`. See docs for installing optional providers.

## [1.1.2]

- **Audio reliability & zombie process fix:** Safer cleanup of STT workers and processes.
- **Safe JSON parse:** More robust parsing for stored transcript/summary data.
- **UI/data:** Built-in template list and tests added (`src/data/templates.ts`, `src/data/__tests__/templates.test.ts`).
- **Optional providers:** Generic optional-provider loader; Copart removed from repo (available as optional provider).

## [1.1.1]

- **Same codebase as 1.1.0**, with **Copart built-in** (no optional-provider setup required).
- Tag `v1.1.1` points to the same commit as `v1.1.0` for testing the pre–optional-provider setup.

## [1.1.0]

- **Read-only Agent API** via Unix domain socket for AI agents and tools to query notes locally.
- **Copart Genie** built-in for chat and STT when configured in Settings.
- Core meeting notes, summaries, calendar, and coaching features.

---

## Maintaining this log

- **On every release:** Add a new `## [X.Y.Z]` section at the top (below this note) with bullet points for what changed in that release.
- **When tagging:** Run your usual release flow; keep the tag and the CHANGELOG section in sync so `git show vX.Y.Z` and the log match.
- **Optional:** Copy the release notes into the GitHub Release body when creating the release.
