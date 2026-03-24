# Changelog

All notable changes to Syag are documented here. **Keep this file updated with every release** so you can see which release had what changes.

---

## [1.10.4] — 2026-03-24

### Fixed
- **Export buttons now work:** Added proper error logging and toast feedback to Word, PDF, and Obsidian export handlers. Previously clicking export items did nothing with no error — now shows clear error messages if export fails.
- **Quick Prompts overlay no longer blocks content:** Added a click-away backdrop behind the slash menu popup. Clicking outside the menu dismisses it. Previously the popup overlapped calendar events.
- **Homepage section order:** Schedule card now appears before Commitments (time-sensitive first). Capped to 3 events for tighter layout.

## [1.10.3] — 2026-03-24

### Fixed
- **GitHub / in-app auto-update:** “Check for updates” (Settings → About) now **awaits** the updater, shows **Downloading…** when an update is available, and shows **real error messages** instead of hanging on “Checking…” or assuming “latest” after a timeout. Main process forwards `update-error` from electron-updater when checks or downloads fail.
- **Updater artifacts:** Documented that **electron-updater** requires **`latest-mac.yml`** plus the **arm64 `.zip`** on each GitHub release (from `electron-builder --mac --publish always` or CI). DMG-only uploads do not enable in-app updates.

### Added
- **`docs/RELEASE.md`:** Maintainer checklist for tagging, CI, and fixing incomplete releases.
- **Recording & summarization motion:** Shimmer **summary skeleton** (`SummarySkeleton`), **transcript panel** slide-in, subtle **recording ring** on AskBar while recording, **`CoachLoadingLine`** for coaching/analysis loading; global **`prefers-reduced-motion`** handling in CSS.
- **Ask Syag polish:** Shared **`ask-syag-styles`** shells for inputs and chat panel; **Sparkles** branding on the meeting/home **AskBar** and full **Ask Syag** page; clearer chat bubbles and loading states; sidebar entry renamed to **Ask Syag**.
- **Slash (`/`) quick prompts:** **Icons** and one-line **descriptions**, grouped (**In the moment** / **Catch up** / **Level up**), **Arrow keys + Enter** navigation, hover sync, scroll-into-view for long lists.

### Changed
- **Settings → AI Models:** **Tabs** for “Models & providers” vs “Transcription”; optional URL deep link `?section=ai-models&aiSub=transcription|models`; **“Use local by default”** toggle layout cleanup.

## [1.10.2] — 2026-03-23

### Added
- **Parakeet TDT 0.6B STT:** NVIDIA's top-ranked ASR model (6% WER, beats Whisper Large V3) now available as a local STT option via ONNX. Requires `pip3 install onnx-asr` for inference. Runs on Apple Silicon.
- **Qwen3 4B local LLM:** New recommended on-device model for meeting summarization and chat. Better structured output than Llama 3.2 3B at similar size.

### Changed
- **Removed MLX Whisper 8-bit:** Simplified STT options — fewer Python dependency issues. Full MLX Whisper + whisper.cpp + Parakeet cover all use cases.
- **Lower VAD threshold for quieter speakers:** "Others" channel energy threshold halved (0.0004→0.0002) to catch quieter remote participants. Downstream filters (hallucination detection, dedup) prevent noise artifacts.

## [1.10.2] — 2026-03-23

### Fixed
- **MLX Whisper install verification:** Import checks for `mlx-whisper` and `mlx-audio-plus` now use the same `PATH` as pip and the MLX workers (Homebrew `/opt/homebrew/bin` and `/usr/local/bin` prepended). Fixes “pip install finished” then “Python import check failed” when GUI Electron resolved a different `python3` than Terminal/Homebrew.

## [1.10.1] — 2026-03-06

### Fixed
- **Sidebar folder navigation:** Opening a folder no longer violates React’s Rules of Hooks (hooks for the Command Center now run on every render). Clicking a folder reliably shows the folder view instead of breaking the page.
- **Hide from screen sharing:** Preference is persisted to the app database so it survives restarts and stays in sync with the Settings toggle.
- **Preferences:** Removed non-functional “Auto-reposition during meetings” toggle.

## [1.10.0] — 2026-03-23

Command Center homepage + visual identity upgrade + QA fixes.

### Added
- **Command Center homepage:** Morning briefing replaces the old meeting-notes list as the first thing you see. Shows next-meeting prep card, open commitments, compact schedule, and collapsible recent meetings.
- **"All Notes" sidebar link:** Quick access to the full notes list (was hidden behind collapsible section).
- **PrepCard component:** Shows next meeting with time countdown, attendees, and "Connect calendar" CTA when no calendar is linked.
- **CommitmentsDueCard component:** Surfaces overdue and due-today commitments on the homepage.
- **IntelligenceFeed component:** Coaching insights, today's people, and relationship decay signals (renders when data is available).
- **DESIGN.md:** Full design system documentation — color tokens, typography scale, spacing, card patterns, icon sizes, dark mode strategy.
- **Commitment inline editing:** Click any commitment text to edit it inline (Enter to save, Escape to cancel).

### Changed
- **Visual identity upgrade:** Deeper, more premium color palette. Background shifted from 97% to 95% lightness (light) and 8% to 7% (dark). Primary accent saturated from 65% to 70%. Card shadows added. Border-radius increased to 0.5rem.
- **Homepage information architecture:** Homepage now leads with intelligence (prep, commitments, schedule) instead of a calendar events list. Recent meetings are collapsible, not the hero content.
- **Removed redundant "Connect calendar" CTA:** Single entry point via PrepCard instead of two overlapping CTAs.

## [1.9.3] — 2026-03-23

Local model quality parity — all LLM flows now work with Ollama.

### Added
- **Ollama routing for all LLM flows:** Entity extraction, conversation coaching, live suggestions, and any future LLM call now route through Ollama when an `ollama:*` model is selected. Previously only summarization and chat supported Ollama — coaching, entity extraction, and live suggestions silently failed or fell back to cloud.
- **Smart transcript truncation for Ollama:** Long meeting transcripts are now intelligently truncated to fit the model's context window. Keeps first 40% + last 40% of the transcript (preserving meeting open and close), drops the middle. Logged when truncation occurs.
- **Output repair for local models:** Lightweight post-processing fixes common structural issues in local model output: missing overview, missing key points, missing action items, missing decisions. Extracts these from the raw markdown when the parser misses them. Only runs for `local:` and `ollama:` models.

### Changed
- **`routeLLM()` handles Ollama natively:** The central LLM router now recognizes the `ollama:` prefix and routes directly to `chatOllama()` — no API key needed. This means every caller of `routeLLM()` automatically gets Ollama support without code changes.

## [1.9.2] — 2026-03-22

AI Models page cleanup and reliability.

### Fixed
- **MLX Whisper install on macOS:** pip install now handles PEP 668 (externally-managed Python). Tries `--user` flag first, then `--break-system-packages` as fallback. No more manual Terminal workarounds needed on stock macOS.
- **MLX Whisper 8-bit install:** Same PEP 668 fix applied to mlx-audio-plus package.
- **Repair function:** Force-reinstall now uses the same PEP 668-safe install path.

### Removed
- **Syag Llama 3B:** Removed — HuggingFace repo doesn't exist yet (placeholder URL returned 401).
- **Phi-3 Mini:** Removed from model list — consolidating to one local LLM option.
- **Gemma 2 2B:** Removed from model list — consolidating to one local LLM option.

### Changed
- **Local LLM options simplified:** Only Llama 3.2 3B remains as the local LLM. Use Ollama for more model choices.
- **Model descriptions updated:** Clearer descriptions for all remaining models.

## [1.9.1] — 2026-03-22

### Fixed
- **Auto-updater crash on launch:** Fixed `SyntaxError: Named export 'autoUpdater' not found` — electron-updater is CommonJS and needs a default import.
- **iCloud sync toggle not working:** "Enable Sync" button in Settings did nothing because the code required `~/Library/Mobile Documents/iCloud~com~syag~notes/` to already exist. Without iCloud entitlements, macOS never creates it. Now the app creates the directory itself — iCloud Drive syncs any subdirectory under `Mobile Documents`.

## [1.9.0] — 2026-03-22

Code signing, notarization, Ollama integration, and auto-update support.

### Added
- **Apple Developer code signing + notarization:** App is signed with Developer ID Application certificate and notarized by Apple. macOS Gatekeeper no longer blocks the app with "can't be opened" errors — it just works for any user who downloads the DMG.
- **Ollama integration:** Connect to a local Ollama server for LLM inference. Supports model discovery, health checks, and routing through the existing LLM pipeline. Configure in Settings > AI Models.
- **Auto-updater:** In-app update notifications via electron-updater. Checks for new GitHub releases and prompts the user to install.
- **GitHub publish pipeline:** electron-builder now publishes releases directly to GitHub via `--publish always`, replacing the two-job workflow.
- **Notarization script:** `scripts/notarize.js` for manual notarization workflows outside electron-builder.
- **Model evaluation script:** `scripts/eval-model.ts` for benchmarking local model quality against cloud baselines.
- **Fine-tuning script:** `scripts/fine-tune.py` for fine-tuning local Llama models on meeting note data.

### Changed
- **iCloud entitlements removed:** Removed iCloud container entitlements from the plist. File-based iCloud Drive sync (`~/Library/Mobile Documents/`) works without them — entitlements are only needed for CloudKit, which Syag doesn't use.
- **electron-builder config:** Added `identity`, `hardenedRuntime`, `notarize.teamId`, and `publish` settings for signed + notarized distribution.
- **Release workflow simplified:** Single `build-and-release` job replaces the previous two-job `build-mac` + `release` workflow.

## [1.8.0] — 2026-03-20

Stability release — fixes recording pause/resume, tightens the indicator, and removes the floating overlay.

### Fixed
- **Pause/resume recording:** Pausing and resuming no longer wipes the session. Timer continues from where it was, transcript stays intact, title persists, and the tray indicator remains active. Root cause: `generateNotes()` was calling `clearSession()` while paused, destroying all state before the user could resume.
- **STT continuity after resume:** Speech-to-text context is now preserved across pause/resume cycles. Stale cross-channel dedup window is cleared on resume, preventing false duplicate filtering of new speech.
- **Auto-summary race on resume:** Clicking resume within the 3-second auto-summary window now cancels the pending timer instead of racing with it.
- **Recording indicator respects settings:** In-app recording pill now updates instantly when "Live recording indicator" is toggled in Settings, via a new preferences event bus.

### Changed
- **Recording indicator:** External always-on-top floating overlay removed — in-app pill only. Simpler, less intrusive, no entitlements needed.
- **LiveMeetingIndicator refactor:** Extracted shared `MeetingIndicatorPill` component used by both the sidebar indicator and the new-note page.

### Internal (not user-facing)
- iCloud sync infrastructure added behind opt-in toggle (Settings > Sync, disabled by default). Not promoted in this release — pending Apple Developer signing.
- Preferences event bus (`preferences-events.ts`) for instant cross-component reactivity on settings changes.
- Database migration v7 adds sync columns (no-op when sync is disabled).

## [1.7.0]

- **Fix false "You were mentioned" alerts:** Mention detection now only triggers on speech from others (system audio), not your own mic. Fuzzy Levenshtein matching removed — only exact name matches trigger alerts.
- **Faster "What should I say?" and slash prompts:** Slash-menu prompts (TL;DR, What should I say, Coach me, etc.) now use only the last 25 transcript lines and a lean system prompt, dramatically reducing response time for long meetings.
- **Clean chat UI:** Slash prompts show a friendly label ("What should I say?") in the chat bubble instead of the raw system instruction.
- **Content protection wired up:** "Hide from screen share" toggle in Settings now actually works — calls Electron's setContentProtection API.
- **NoteDetailPage pause fix:** Pause button in the AskBar on saved notes now correctly pauses recording instead of crashing.
- **Dead code cleanup:** Removed 8 unused components (MeetingPage, MeetingDetail, HomeShelf, MeetingCard, ActionItemsThisWeek, CompactCommitmentsCard, CoachingPulseCard, LiveCoachOverlay) and dead data/meetings.ts.
- **Unified folder state:** Removed duplicate note-to-folder tracking from FolderContext; NotesContext is now the single source of truth for folder assignments.
- **DRY helpers:** Consolidated duplicate `parseTimeToSeconds` (3 copies) and `countWords` (2 copies) into shared exports in `transcript-utils.ts`.
- **Shared constants:** SettingsPage now imports `ACCOUNT_LS_KEY` from `account-context.ts` instead of redefining it.
- **Tests updated:** Account-context tests updated to match strict matching behavior; all 112 tests pass.

## [1.6.0]

- **Conversation analysis fix:** AI model resolver now reads from both legacy and new settings storage, fixing "conversation analysis didn't complete" errors.
- **My To-dos:** Commitments page gains a "My" filter showing action items assigned to you, plus a personal to-do input for quick adds.
- **Editable assignees:** "Me" and "Unassigned" action item assignees are now click-to-edit inline.
- **Ask Syag improvements:** Recipe chips (TL;DR, Action items, Weekly recap) now send focused prompts; context size bounded to prevent generic responses.
- **Diarization toggle:** Disabled with "Coming soon" label until backend wiring is complete.
- **Cleanup:** Removed enterprise provider code from main repo; optional providers can still be loaded from `userData/optional-providers/`.

## [1.3.2]

- **Action items:** Summaries default to **unassigned** owners; no auto-**Me**/**You** from the model. Optional `accountDisplayName` on summarize for assignee normalization.
- **Jira:** Icon-only control in the action-items table (no visible “Jira” label).
- **Coaching:** Meeting-effectiveness prompt and UI (transcript + role first); metrics-only coaching as fallback when transcript analysis fails; supporting signals labeled as secondary.

## [1.3.1]

- **Conversation coaching (Work Coach–style):** Transcript-grounded analysis with headline, narrative, evidence-linked micro-insights, habit tags, and key moments (jump-to in transcript). Role KB excerpt + deterministic heuristics (questions, monologue, sales cues). Cross-meeting synthesis on Coaching page; optional audio clips documented as future opt-in (`docs/coaching-audio-opt-in.md`).
- **Tray agenda:** Tray window / agenda sync flow (`tray-agenda-window`, `TrayAgendaPage`, `TrayAgendaSync`).
- **Capture & STT:** Per-channel Whisper context continuity; mic debug logging merged with buffer drain fixes; calendar sync labels (`getSyncLabel`).
- **Docs:** `docs/local-stt-setup.md`, `docs/optional-provider-install.md`, `docs/transcript-me-them.md`, README architecture reference.
- **Repo hygiene:** `.cursor/` in `.gitignore`.

## [1.3.0]

- **Screenshot / recording privacy:** Content protection replaced with window hide/show; Syag can be hidden from screen share during recording.
- **Local Llama:** Summarization and chat when using a local model now use fixed context (8192) and 4 threads to avoid overwhelming the machine.
- **Optional providers:** Optional providers can be loaded from `userData/optional-providers/`. See docs for installing optional providers.

## [1.1.2]

- **Audio reliability & zombie process fix:** Safer cleanup of STT workers and processes.
- **Safe JSON parse:** More robust parsing for stored transcript/summary data.
- **UI/data:** Built-in template list and tests added (`src/data/templates.ts`, `src/data/__tests__/templates.test.ts`).
- **Optional providers:** Generic optional-provider loader for add-on integrations.

## [1.1.1]

- **Same codebase as 1.1.0**, with an additional built-in provider (no optional-provider setup required).
- Tag `v1.1.1` points to the same commit as `v1.1.0` for testing the pre–optional-provider setup.

## [1.1.0]

- **Read-only Agent API** via Unix domain socket for AI agents and tools to query notes locally.
- **Enterprise provider** built-in for chat and STT when configured in Settings.
- Core meeting notes, summaries, calendar, and coaching features.

---

## Maintaining this log

- **On every release:** Add a new `## [X.Y.Z]` section at the top (below this note) with bullet points for what changed in that release.
- **When tagging:** Run your usual release flow; keep the tag and the CHANGELOG section in sync so `git show vX.Y.Z` and the log match.
- **Optional:** Copy the release notes into the GitHub Release body when creating the release.
