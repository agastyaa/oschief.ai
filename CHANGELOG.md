# Changelog

All notable changes to OSChief are documented here. **Keep this file updated with every release** so you can see which release had what changes.

---

## [2.6.0] — 2026-04-10

### Added
- **Enterprise Providers UI** — optional providers (like Copart Genie) now show on Settings > AI Models > Cloud tab with connect, test, update key, and disconnect. API keys stored encrypted in macOS Keychain.
- **Settings tabs** — Meeting (General / Templates / Transcription), AI Models (Setup / Local / Cloud), and Connections (Calendar & Tray / Integrations / Developer) each use tabs instead of long scroll.

### Changed
- **Settings simplified** — 10 sections reduced to 7. Transcription merged into Meeting, Agent API into Connections, Knowledge Base + Obsidian Vault into Data.
- **Coaching pithier** — headlines under 10 words, narratives 1-2 sentences, micro-insights 1-2 per meeting. No hedging.
- **Project detail header** — split into nav row + title row so long names don't break layout.
- **Back buttons standardized** — consistent icon-only style across all detail pages.
- **Privacy indicator** — correctly shows "Cloud" for custom/optional providers (was hardcoded to only check built-in prefixes).
- **Default template selector** moved to Templates tab.
- **Removed "Use local by default" toggle** — confusing, overrode cloud model selection.

### Fixed
- **Meeting room diarization** — speaker diarization (pyannote + ECAPA-TDNN) now works in physical meeting rooms. System audio capture always "succeeded" silently, so mic-only mode was never triggered. Now the diarizer initializes on every recording and runs when system audio hasn't produced transcripts in 30 seconds.
- **Teams/Discord/Slack detection** — these apps run background processes permanently. Detection now requires audio/mic activity to distinguish "installed" from "in a call."
- **Meeting detection with mic off** — notification fires when meeting app appears, regardless of mic state. Inverted default meant mic check ran even when disabled.
- **Preload script crash** — was built as ESM (.mjs) but Electron sandbox requires CommonJS. Changed to .cjs. Root cause of: missing version in About, broken updates, no meeting detection, tray settings hidden.
- **Commitments checkbox parsing** — `[x]`/`[X]` state now correctly syncs as completed (was hard-coded `done: false`).
- **Note page layout** — title, metadata, and ask bar pinned. Transcript scrolls independently with pinned header.
- **Transcript flicker** — instant auto-scroll instead of smooth animation.
- **404 on app launch** — auto-redirect to home, fixed HashRouter `<a href>` bug.
- **Logo position** — sits below macOS traffic lights.
- **People/notes spacing** — removed double margin.
- **Sidebar folder inputs** — create/rename inputs match NavItem styling.
- **Transcript avatar bubbles** — removed redundant initial badges.
- **Commitments assignee UX** — UserPlus icon on hover, "Me" in datalist, typing "me" reassigns.

---

## [2.6.1] — 2026-04-10

### Added
- **Enterprise Providers UI** — optional providers (Copart Genie) manageable in Settings > AI Models > Cloud tab
- **Jira create button** — both Jira and Asana create buttons on action items (hover)
- **Color-coded speaker labels** — Me (green), Them (blue), Speaker 3+ get distinct colors in transcript

### Changed
- **Coaching page** — "Executive Coach" with strategic leadership copy
- **Settings** — no layout shift on section/tab switch, 12px nav fonts
- **People chips** — sharper design with company subtitle, "Add person" text label, no empty chips
- **Commitments** — assignee visible inline with avatar, two-row add-todo card
- **Air-gapped mode** — now blocks cloud STT in addition to cloud LLM
- **Transcript** — removed STT model name from header

### Fixed
- **ECAPA-TDNN model** — download URL was 404, switched to Wespeaker ONNX
- **Diarization** — runs in meeting rooms even when system audio stream exists
- **Diarization default** — enabled by default when setting unset
- **Meeting title** — falls back to TL;DR first clause instead of staying "Meeting notes"
- **People input** — "Create new" option when typed name doesn't match existing

---

## [2.5.5] — 2026-04-10

### Fixed
- Settings simplification, decisions layout, API curl example.

---

## [2.5.3] — 2026-04-09

### Added
- **Sidebar folders** — folders now appear below "All Meetings" in the sidebar with a "New Folder" inline creation button. Clicking a folder navigates to its filtered view.
- **Decision approval flow** — decisions extracted from meeting summaries are no longer auto-saved to the Decisions page. Each decision shows a circle/checkmark toggle to explicitly promote it.

### Fixed
- **Qwen3-ASR Python version detection** — install now detects if system Python is below 3.10 and automatically finds a suitable Homebrew Python (3.10–3.13) to create a venv. Shows a clear error message if no compatible Python is found.

---

## [2.5.2] — 2026-04-09

### Added
- **Qwen3-ASR 0.6B STT engine** — new MLX-based speech-to-text option. Half the memory of Whisper (~1.2 GB vs 3 GB), better accuracy (2.3% WER), and built-in diarization. Auto-installs via `pip3 install mlx-qwen3-asr`. Available in Settings > AI Models > Local Models.

---

## [2.5.1] — 2026-04-09

### Fixed
- **AskBar pinned to bottom** — Ask bar now stays at the viewport bottom on Today and Note Detail pages instead of floating mid-page.
- **Search moved to sidebar bottom** — search bar repositioned next to Calendar/Routines/Settings for consistency with original layout.
- **Removed Digest from sidebar** — Weekly Summary is not a primary nav item; removed from BRIEFING section.
- **Removed inline recent meetings** — sidebar meetings list was noisy; simplified to just "All Meetings" link.

---

## [2.5.0] — 2026-04-09

### Added
- **Slack-style unified layout** — new `AppShell` component wraps all pages with persistent sidebar + content area via React Router Outlet. No more per-page layout duplication (eliminated ~250 lines of boilerplate across 18 pages).
- **Workspace-style sidebar** — sections: Briefing (Today, Digest), Meetings (All Meetings + last 5 recent meetings inline), Workspace (People, Commitments with risk badge, Projects, Decisions), Intelligence (Ask OSChief, Coaching).
- **Sidebar search bar** — visible search trigger with ⌘K shortcut hint + New Note button.
- **Recent meetings in sidebar** — last 5 meetings with relative timestamps and live recording indicator, like Slack DMs.
- **ContentHeader system** — shared top bar with collapse toggle, back navigation, and action slots. Pages declare config via `useContentHeader()` hook.

### Fixed
- **Auto-updater stuck in loop** — "Restart to update" was minimizing the app instead of quitting. macOS close handler now bypasses hide-on-close when `quitAndInstall()` is called.

### Changed
- **App.tsx routing** — flat Routes replaced with nested layout routes. Standalone pages (onboarding, tray) outside shell, all main pages inside AppShell.
- **Sidebar grouping** — nav items reorganized into labeled sections (BRIEFING, MEETINGS, WORKSPACE, INTELLIGENCE) instead of flat list.
- **Commitment risk badge** — moved inline next to Commitments nav item (was in workspace header).

---

## [2.4.0] — 2026-04-08

### Added
- **Chief of Staff voice** — every AI surface now speaks as "your Chief of Staff": Today page greeting, Needs Attention, coaching, routines, summaries, Ask bar. Consistent, opinionated, direct — like a senior colleague who's been paying attention.
- **AI model selection in onboarding** — new step after role selection: choose Local (Ollama, fully private) or Cloud (Claude/GPT/Gemini with API key). No more digging through Settings on first launch.
- **Comparison table in README** — OSChief vs Granola vs Otter.ai vs Fellow vs Notion AI across 13 dimensions.

### Changed
- **Onboarding flow** — 9 steps (was 8). Feature pitch slides rewritten with CoS framing. Role step says "Your CoS tailors coaching..." not "OSChief tailors..."
- **Summary preamble** — "You are the user's Chief of Staff" replaces "You are OSChief AI, a meeting notes assistant"
- **Coaching identity** — system prompt now identifies as "the user's Chief of Staff reviewing their meeting performance"
- **Prep card** — "YOUR COS PREPARED" replaces "NEXT UP"
- **Routine descriptions** — all 4 rewritten in CoS voice
- **Ask bar** — "Ask your Chief of Staff" replaces "Ask OSChief"

---

## [2.3.2] — 2026-04-07

### Fixed
- **White screen on commitment assignee click** — missing `X` icon import in CommitmentsPage.
- **Commitment "Done" creates zombie state** — "Needs Attention" section was passing `'done'` instead of `'completed'` to updateStatus. Commitments disappeared but weren't marked complete.
- **Project assignment silently broken** — `updateCommitment` was missing `projectId` field handler. Project changes from the dropdown were never saved.
- **Missing `ArrowRight` import** — CoachingPage crash when "No insights yet" section rendered.
- **Duplicate owner display** — removed "Owner: Name" line when assignee already shows the same name.

### Removed (dead code cleanup)
- 9 unused component files: SectionTabs, CommitmentsDueCard, SetupProgressCard, OllamaUpgradeCard, OSChiefIcon, MemoryBanner, StatsRow, CommandCenterPanel, memory-banner test.
- Unused imports across 6 page files (CoachingCard, CommitmentsWidget, IntelligenceFeed, Tooltip, unused lucide icons).
- Dead folder creation state/functions from Sidebar (replaced by projects).
- Dead entity-extractor commitment import.

---

## [2.3.1] — 2026-04-07

### Fixed
- **Commitment deadline bug** — due date now saves correctly when adding a to-do (missing dependency in useCallback).
- **Assignee UX** — "Assign to me" button + searchable text input with autocomplete. Shows owner name when assigned.
- **Coaching UI simplified** — removed heavy bordered cards. Headline, insights, and evidence quotes are now clean text. Feels like a coach's notes, not a dashboard.
- **Today page** — removed duplicate date headers. Meetings flow directly under the greeting.
- **Sidebar spacing** — added gap between logo and nav items.

---

## [2.3.0] — 2026-04-07

### Added
- **Rich text personal notes** — Tiptap editor with bold, italic, bullet/numbered lists, checklists, headings, blockquotes, code blocks, and tables. Toolbar on focus. Backward compatible with plain text.
- **Sidebar redesign** — flat navigation with icons for every item. Projects shown under All Meetings. Section labels (YOUR WORK, INTELLIGENCE) removed; all items always visible. Calendar, Routines, Settings at bottom.
- **Today page: date in greeting** — shows full date (e.g. "Good evening. Monday, April 7").
- **Today page: This Week commitments** — overdue + due-this-week commitments with quick check-off.
- **Today page: today's meetings only** — home page shows only today's meetings, not all recent.
- **Commitments = action items** — commitments now mirror action items 1:1. Entity extractor no longer creates separate commitments. Edits to action items (assignee, text, done) sync to commitments automatically.
- **Coaching: Manage Meetings** — include/exclude any meeting from coaching analysis. Select All / Deselect All. Shows all meetings with transcripts.
- **Coaching: manual analysis** — coaching no longer auto-runs when viewing a note. "Analyze this meeting" button lets you choose when to spend LLM resources.
- **Mic-only detection** — notes recorded without system audio flagged as `micOnly`. Excluded from coaching (unreliable speaker attribution).

### Changed
- **Coaching prompts rewritten** — Shreyas Doshi–style: only what you missed, KB-grounded, under 30 words per insight. No praise, no scores, no generic advice.
- **All scores removed** — no numeric scores anywhere (CoachingPage, NoteDetailPage, meeting list rows). Coaching is purely qualitative.
- **Action item extraction strengthened** — LLM prompt now captures every commitment including implicit ones ("I'll look into it").
- **Commitments page UI** — redesigned form (proper spacing, prominent Add button, underline tabs). Assignee input is now text with autocomplete. Project name and due date display when set.
- **Calendar Settings simplified** — single "Add Calendar" button with ICS URL input replaces three provider-specific cards. Connected feeds shown as a list.
- **Settings cleanup** — removed unwired toggles (Weekly Digest, Sync Calendar, Show Upcoming, Audio Denoise). Removed dead Delete Account button. Reordered integrations logically. Gmail badge "Active" → "Connected". Apple Calendar button styling normalized.
- **Background warmed** — `228 14% 96%` → `220 12% 97%` for a lighter, less clinical feel.

### Fixed
- **Tray timer on auto-pause** — tray icon and timer now stop when recording auto-pauses after silence.
- **Auto-summary on auto-pause** — notes auto-generated on both manual and silence-detected pause.
- **No auto-resume** — removed latent path that could flip UI back to recording.
- **Hallucinated action items** — replaced few-shot example with fictional content + anti-copy instructions.
- **Meeting title generation** — added fallbacks for markdown headings, standalone bold, short first lines.
- **amber_notified_at crash** — graceful fallback when DB migration 12 hasn't applied yet.
- **Meeting dividers** — divider lines between meetings in the list for better readability.
- **All Notes count readability** — bumped from 14px muted to 18px foreground/50.

---

## [2.2.1] — 2026-04-07

### Added
- **Asana integration in Settings** — connect/disconnect Asana PAT from the Integrations list, matching Jira/Slack/Teams pattern.
- **Gmail integration in Settings** — shows connection status (uses Google Calendar OAuth), cached thread count, and manual "Sync now" button.

### Changed
- **Coaching page redesigned** — hero coach message in a card with inline score badge, "Focus next" and "Blind spot" callouts, micro-insights as individual cards with evidence blockquotes, collapsible score trend and meeting list. Empty state uses Instrument Serif heading.
- **Coaching prompt sharpened** — demands specific transcript references, concrete alternatives, and ruthlessly honest feedback. Increased micro-insights from 2-3 to 3-5 per meeting. Cross-meeting aggregation now returns improvementArc, blindSpot, and bestMoment.
- **Today page further simplified** — removed Daily Brief stat dump fallback ("53 meetings on record...") and Active Projects card. Daily Brief only shows when AI-generated content exists.
- **Models directory renamed** — `~/.syag/models/` → `~/.oschief/models/` to match rebrand. Existing models auto-migrate on first launch.

### Fixed
- **Tray icon transparent background** — was rendering with white square; now black on transparent as macOS template requires.
- **Auto-updater 404** — silently skips update check when no GH_TOKEN is set (private repo).
- **Speaker diarization default** — now enabled by default for mic-only recording (was off, causing all speakers labeled "Me").
- **Diarization 3s timeout** — prevents diarization from blocking the transcription pipeline if model is loading or ONNX stalls.
- **Auto-pause after 45s silence** — recording auto-pauses when no speech is detected for 45 seconds. Prevents recordings from running forever. Stays paused until user manually resumes (no auto-resume on ambient noise).

---

## [2.2.0] — 2026-04-04

### Added
- **"Before You Go In" prep brief notifications** — 10 minutes before each calendar meeting, a macOS notification fires with LLM-generated contextual brief: last meeting with attendees, open commitments, stale decisions, email threads. Falls back to data-only context if LLM times out (15s). The viral artifact — when shared, people ask "what tool made this?"
- **Calendar import onboarding** — on first calendar connection, auto-scans 30 days of events and batch-populates the people graph from attendee lists. Uses in-memory fuzzy matching (Levenshtein ≤ 3) for deduplication. "Found 47 people from your calendar" — useful app in 60 seconds, before first recording.
- **LLM-powered follow-up drafts** — upgraded from string template to contextual LLM drafts via `routeLLM()`. References the specific meeting, commitment text, and person. Falls back to template on timeout (10s), refusal, or error. One-click copy to clipboard.
- **Commitment confidence scoring** — entity extractor now returns confidence level (high/medium/low) per commitment. UI shows green dot (high), no indicator (medium), amber dot + "Review?" (low). Low-confidence commitments get inline confirm/dismiss buttons. DB migration v16 adds `confidence` column.
- **Copy prep brief as text** — new copy button on PrepCard formats the meeting brief as clean markdown (title, attendees, open items, last discussion) and writes to clipboard. "Copied!" feedback with green checkmark. The sharing mechanism for viral growth.
- **OSChiefIcon component** — new React SVG icon with 5 variants (default cardinal dots, connected, orbital, pulse, minimal). Reusable across the app.

### Changed
- **New app icon** — cardinal dots icon (central circle + 4 radiating dots) replaces previous icon. Dark background with subtle ambient glow. Generated as full .icns with all macOS sizes (16–1024px).
- **New tray icon** — matching cardinal dots pattern as 44x44 black template for macOS menu bar.
- **Today page simplified** — removed MemoryBanner (total notes count) and StatsRow (vanity metrics). Removed Top Contacts section. Page now focuses on what matters: PrepCard → Schedule → Needs Attention → Daily Brief → Projects → Recent Meetings.

---

## [2.1.12] — 2026-04-03

### Added
- **Gmail as first-class data source** — local mail thread cache (`mail_threads` table), background sync every 30 minutes, person-to-email matching via `mail_thread_people` junction. Email threads surface in People detail, Weekly Summary, and routine assemblers.
- **Weekly Summary forward-looking mode** — "This Week" tab shows upcoming calendar events and commitments due this week alongside last week's recap. AI-generated narrative summary. Mode auto-selects: retrospective on Mondays, current Tue–Sun.
- **Routines: next run time** — each routine card shows when it will fire next ("in 4 hours", "tomorrow at 8:30 AM").
- **Routines: full scheduling UI** — day-of-week picker for weekly, day-of-month for monthly, minute selector (0/15/30/45), weekdays-only toggle, delivery type selector.
- **Generic routine catch-up** — missed weekly/daily routines fire on app launch within a grace window (not just morning brief and end-of-day).
- **Sleep/wake resilience** — `powerMonitor.on('resume')` reschedules all routines after system sleep.

### Fixed
- **End-of-day routine data assembly** — was falling through to generic `assembleCustom()` (14-day data). Now has proper `assembleEndOfDay()` with today's meetings, commitments, decisions, coaching highlights, and tomorrow preview.
- **ProjectDetailPage** — added delete buttons for decisions and action items, always-visible unlink button, and error handling toasts (fixes 6 pre-existing test failures).
- **Weekly digest date boundaries** — switched from rolling 7-day window to proper Monday-based weeks (Mon–Sun).

### Changed
- **Weekly Digest → Weekly Summary** — renamed and redesigned with collapsible sections, compact stats bar, mail activity section, and mode toggle.

---

## [2.1.11] — 2026-04-03

### Changed
- **Diarization upgraded to pyannote segmentation + ECAPA-TDNN** — two-stage pipeline replaces naive centroid-only approach. pyannote/segmentation-3.0 (6MB ONNX) detects speaker boundaries at ~13ms resolution with overlap handling, then ECAPA-TDNN identifies speakers across chunks. Both models auto-download on first use (~22MB total).

---

## [2.1.10] — 2026-04-02

### Added
- **Lenny's Podcast coaching KB** — 303 episode transcripts (10,354 passages) indexed in a local SQLite FTS5 database. Coaching insights are now grounded in real quotes from Shreyas Doshi, Annie Duke, April Dunford, Marty Cagan, Teresa Torres, Claire Hughes Johnson, and 297 other practitioners. Zero runtime cost — searched at coaching time and injected into the LLM prompt.

### Fixed
- **Transcript panel resize handle** — drag handle was scrolling away with content; now stays fixed at the left edge. Also widened from 4px to 6px for easier grabbing.

---

## [2.1.9] — 2026-04-02

### Added
- **Mic-only speaker diarization** — when no system audio is available, uses on-device ECAPA-TDNN speaker embeddings to identify and label different speakers as "Speaker 1", "Speaker 2", etc. Incremental centroid matching with cosine similarity for real-time identification. Toggle in Settings > Recording.
- **All Notes page overhaul** — folder tab bar with inline creation, filter chips (Summarized, Has Actions), rich note cards with left accent borders, duration/action-item/folder metadata pills, human-readable date headers (TODAY, YESTERDAY, WED APR 1), collapsible date groups, sort options (newest, oldest, longest).
- **Action items table** — Due Date column, Asana integration for creating tasks from action items, robust parser for extracting action items from summaries.

### Fixed
- **Me vs Them speaker labeling** — thermal throttling was stalling channel 1 (system audio) processing with 1–3s delays after 10+ minutes, causing all speech to be labeled as "Me". Reduced cooldown delays and raised thermal thresholds.

---

## [2.1.8] — 2026-04-02

### Added
- **Resizable sidebar** — drag the right edge to resize between 160-280px. Width persists across sessions via localStorage.
- **Resizable transcript panel** — drag the left edge on NoteDetailPage and NewNotePage to resize between 240-480px. Width persists.
- **Asana integration** — connect with Personal Access Token in Settings > Connections. Create tasks from commitments with project picker, due dates, and meeting context notes.
- **`useResizablePanel` hook** — reusable drag-to-resize hook with min/max constraints and localStorage persistence.

---

## [2.1.7] — 2026-04-01

### Changed
- **Unified design system across all pages** — 39 files updated to match the Professional Memory aesthetic: `rounded-[10px]` on all card containers, 3px semantic left accent borders, `p-5` padding, standardized UPPERCASE Caption section labels.
- **Overdue items use amber** — overdue commitments now show amber ("hey, don't forget") instead of red ("error") per DESIGN.md, applied across CommitmentsPage and CommitmentsWidget.
- **Empty state icons standardized** — all empty states now use consistent h-10 w-10 icons.
- **Stronger focus rings** — interactive elements (selects, inputs) upgraded from ring-1/30 to ring-2/40 for keyboard accessibility.

### Fixed
- **Accessibility** — `aria-label` added to all icon-only buttons (Delete, Mark done, Snooze, Unlink, Archive, Edit) across every page.
- **Cards consistency** — PrepCard, IntelligenceFeed, CommitmentsWidget, CoachingCard, CalendarAgendaList, all dialogs/modals updated to consistent border radius and padding.

---

## [2.1.6] — 2026-04-01

### Added
- **Professional Memory home** — MemoryBanner shows accumulated meeting count, people, projects, decisions, and commitments with "All on your device" privacy reinforcement. Hidden for new users (< 5 notes).
- **Stats Row** — four operational cards on home: open commitments (overdue in amber), active projects, meetings this week, decisions this month.
- **Top contacts** — top 3 people by meeting frequency displayed as avatar chips on the home page.
- **Provenance links** — "Source note" links on at-risk commitments, stale decisions, and project detail pages trace every item back to its originating meeting.
- **Default meeting template** — new dropdown in Settings > Meeting to choose which template is used by default when starting a note. Templates also selectable via URL parameter (`/new-note?template=brainstorm`).
- **Aggregate stats IPC** — `memory:stats` handler returns all counts in a single call for the Professional Memory home.
- **Shared `MemoryStats` type** — DRY type definition in `electron-api.ts` used across preload, renderer, and home page.

### Changed
- **Disabled toggle visibility** — `SettingRow` component accepts `disabled` prop, applying `opacity-40 cursor-not-allowed pointer-events-none` for clearer visual state.
- **MemoryBanner design** — subtle card with primary left accent (not dark navy) so PrepCard remains the dominant actionable element.
- **StatsRow overdue color** — overdue commitment count uses amber token per DESIGN.md instead of muted gray.

---

## [2.0.6] — 2026-03-27

### Fixed
- **Whisper v3 turbo stops after first transcription** — replaced per-request `on`/`removeListener` pattern with a single permanent stdout listener + resolver queue (standard LSP/tsserver pattern). Second and subsequent transcription requests now work reliably. Full-precision and 8-bit MLX variants both fixed.
- **Test suite sync** — updated 3 test files to reflect intentional threshold changes (`PAUSE_THRESHOLD_SEC` 5→45s, `MAX_SENTENCES_PER_GROUP` 5→20) and transcript exclusion from default markdown export.
- **Summary blocks new note creation** — summary now runs as a background IPC task. Note is saved immediately and the user is free to navigate away; the summary arrives via event and updates the note in-place. NoteDetailPage shows a shimmer while the background job runs.
- **Transcript cross-chunk repetition** — Whisper's 2-second audio overlap (prepended for WER continuity) was re-transcribing the same words at each chunk boundary. Added an overlap-tail trimmer (word-normalized sliding window, min 4 words) and extended fuzzy dedup to same-channel matches (threshold 0.85 vs 0.65 cross-channel).
- **Folder view header layout** — nav chrome (sidebar collapse + Back to home) shifted the folder name right. Nav chrome now sits at the far left; folder name + note count are absolutely centred in the header row regardless of sidebar state.

---

## [2.0.2] — 2026-03-26

### Fixed
- **Release pipeline** — assets (DMG, ZIP, `latest-mac.yml`) were silently skipped due to draft/release type mismatch in electron-builder; added `releaseType: release` so CI uploads to existing releases
- **OTA auto-updates** — `latest-mac.yml` now publishes correctly, unblocking electron-updater discovery
- **DMG build size** — removed duplicate 34 MB `syag-mlx-llm` binary from the bundle (directory copy excluded, standalone binary retained)

---

## [2.0.1] — 2026-03-26

**Stability & polish release.** Fixes critical post-launch bugs, improves performance, and cleans up the repo.

### Fixed
- **Critical data migration bug** — v2.0 upgrade could lose existing meeting data; migration now runs safely
- **Quick Prompts** — click handling fixed; prompts now fire reliably
- **Parakeet ONNX model loading** — STT engine no longer fails on first launch
- **Tray icon** — proper black template image for macOS menu bar (respects light/dark mode)
- **In-app icons** — regenerated from 1024px source so orbital pattern is visible at all sizes
- **Production build** — removed stray brace in `stt-engine.ts` that broke the build
- **DMG naming** — productName corrected from "Syag" to "OSChief"
- **STT startup** — faster speech-to-text initialization with safer meeting reminder scheduling

### Performance
- **UI freezes eliminated** — recording and startup no longer block the main thread
- **Event-driven meeting reminders** — replaced polling with event listeners (lower CPU, instant response)

### Testing
- **50+ new tests** added from QA audit covering v2 features

### Removed
- Stale `bun.lock` / `bun.lockb` files (project uses npm)
- Unused SVG/PNG assets from `public/`: old icon previews, source PNGs, placeholder SVG, sample calendar ICS, and superseded icon variants
- `public/icon-previews/` directory and its planning docs
- Lighter app bundle and faster repo clone

---

## [2.0.0] — 2026-03-24

**The "chief of staff" release.** OSChief stops being a meeting recorder and becomes your on-device work OS. New brand, new identity, new data model.

### Brand
- **Renamed from Syag to OSChief** (oschief.ai) — every user-visible string, system prompt, vault tag, and document updated

### Added
- **Obsidian Vault Writer** — "Export to Vault" writes structured markdown with YAML frontmatter, `[[wikilinks]]` to people and projects, conflict detection, and `obsidian://` deep links
- **People & Project Markdown** — Auto-generates `people/{Name}.md` and `projects/{Name}.md` in your vault with meeting backlinks (preserves user edits)
- **Projects & Decisions** — New data model tracks work streams and decisions across meetings. Auto-detected from calendar titles and LLM extraction
- **Projects Page** — Browse active/suggested/archived projects with meeting counts, inline editing, create/confirm/merge/dismiss
- **Project Detail Page** — Timeline of meetings, decisions, people involved, and action items per project
- **Decisions Page** — All decisions across meetings, filterable by project and person
- **Meeting Series Page** — Group recurring meetings by title, see trends across weekly 1:1s and standups
- **Command Center Panel** — During recording, collapsible sidebar shows previous meetings with attendees, open commitments, related notes, and project context
- **Meeting Prep Briefs** — Contextual briefing assembled from people graph, commitments, and Gmail threads
- **Smart Notifications** — macOS notification 5 minutes before meetings with prep brief context (attendee history, overdue commitments, project info)
- **Context-Aware Work Coach** — Coaching page redesigned to lead with substance ("you committed to X without checking with engineering") instead of talk-time metrics
- **Per-Meeting Coaching** — Coaching tab on each note shows conversation analysis, habit tags, micro-insights, and coaching narrative
- **Privacy & Data Controls** — Anonymize attendee names in cloud LLM prompts, per-person "Forget" cascade delete, data retention settings
- **Contacts Import** — Bootstrap your people graph from VCF (vCard) files
- **Gmail Integration** — Read-only email access for meeting prep context (OAuth, bring-your-own-key)
- **Routines Engine** — Scheduled prompts against the meeting graph (daily brief, weekly digest, monthly retrospective)
- **Expanded Chat** — "Ask OSChief" queries the full professional graph: people, projects, decisions, commitments
- **Calendar Event-Note Linking** — Recordings linked to calendar events for series tracking
- **Homepage Revamp** — Command center layout with prep cards, active projects, coaching summary, commitments due
- **Keyboard Shortcuts** — Cmd+N (quick note), Cmd+Shift+P (projects), Cmd+Shift+D (decisions), Cmd+, (settings)
- **Sidebar Reorganization** — Grouped by mental model: MEETINGS / YOUR WORK / INTELLIGENCE

### Changed
- Primary color: saturated indigo (#3B5EDB) → slate navy (#2E3F8F) — calmer, more executive
- Entity extraction now detects projects and decisions automatically (extended LLM prompt + retry path)
- Export markdown refactored with shared `buildMarkdownBody()` function
- Coaching uses same AI model as summaries (was hardcoded to "local")

### Fixed
- **Copy text button** now uses Electron's native clipboard (reliable in dropdown context)
- Vault export button works (was silently failing due to missing IPC wiring)
- Coaching model properly reads from settings instead of defaulting to "local"

### Infrastructure
- Migration v8: projects, note_projects, decisions, decision_people tables
- Migration v9: calendar_event_id, calendar_event_title on notes
- Migration v10: routines, routine_runs tables
- 158 tests passing (15 test files)
- Shared fuzzy-match utility extracted from people-store (DRY fix)
- OSChiefLogo component replaces SyagLogo

---

## [1.12.0] — 2026-03-24

Recording reliability, live vs batch transcription, and STT polish.

### Fixed
- **Live transcription toggle (Settings):** The switch did not actually change `transcribe-when-stopped` — the handler always wrote the previous value, so many users were stuck in batch (“transcribe when stopped”) mode with no way to turn real-time transcription on from the UI.
- **Pause / resume timer:** The meeting timer no longer jumps by the length of a pause when you resume. The renderer re-anchors session `startTime` to active elapsed time; the main process tracks paused intervals, uses **active** duration on stop, uses **active** seconds for transcript chunk times, skips STT while paused, and flushes an in-progress pause before clearing state on stop.
- **Resume UI race:** While `resumeAudioCapture` was async, local state could snap back to “paused” because `isRecording` was still false. A short **resuming** guard prevents that; resume errors return the UI to paused.
- **PrepCard “Start note”:** Uses the canonical `nextEvent` from the calendar list so event id/title match note linking (`calendarEventId` / `findNoteForEvent`).

### Added
- **Live capture sensitivity (Settings → Transcription, macOS):** **Balanced** (default) vs **More sensitive** — relaxes buffer energy gates and cross-channel dedup slightly when you need more mic/system lines (applies on next start or resume). Persisted as `stt-capture-sensitivity`.
- **Post-resume STT hardening:** For the first few STT passes per channel after resume, slightly stricter energy/VAD thresholds reduce generic “meeting filler” hallucinations from noisy reconnect buffers.
- **Tray clock:** `updateTrayMeetingInfo` runs when `startTime` changes (e.g. after resume re-anchor).

### Changed
- **Settings load:** `real-time-transcription` is reconciled with `transcribe-when-stopped` (the value capture reads). Mismatched legacy DB rows are corrected and written back.
- **Live transcription copy:** Clarifies that live mode is **recommended** and that batch mode can look delayed or one-sided for long meetings.
- **New note page:** Reads `transcribe-when-stopped` first (then `real-time-transcription`) for transcript-related UI prefs.

### Improved
- **Deepgram (Nova):** When word-level tokens exist, build text from words and drop adjacent duplicate tokens (cleaner than some `transcript` string duplicates).
- **MLX Whisper install check:** Import probe uses the same PATH as the worker; failures surface a Python traceback and executable hint for Terminal fixes.

### Docs
- **`docs/transcript-me-them.md`:** Pause/resume behavior, post-resume junk lines, debug log patterns, settings checklist.
- **`docs/local-stt-setup.md`:** Import failures, wrong-Python vs GUI, Apple Silicon notes.

## [1.11.0] — 2026-03-24

Zero-config AI setup — Syag now downloads and configures the best STT + LLM models automatically on first launch. No settings navigation required.

### Added
- **Auto-setup on first launch:** Syag detects your Mac's hardware and automatically downloads the best models:
  - **With Ollama (16GB+):** MLX Whisper (best STT) + Qwen3 8B via Ollama (~95% cloud quality)
  - **Without Ollama:** Whisper Large V3 Turbo (whisper.cpp) + Llama 3.2 3B (~80% cloud quality)
  - STT: tries MLX Whisper first (Apple Silicon native), falls back to whisper.cpp if pip fails
- **Setup progress card on homepage:** Shows download progress during first-run setup with step indicators (Speech recognition → AI summarization → Configuration)
- **Ollama upgrade prompt:** After bundled setup, shows a dismissible card suggesting Ollama for better quality — "Want better AI quality? Install Ollama for 95% cloud quality"
- **IPC handlers for setup:** `setup:is-complete`, `setup:retry`, `setup:progress` events

### Changed
- Homepage empty state now shows setup progress during first run instead of immediately showing "Record your first meeting"
- Auto-setup replaces the previous Ollama-only auto-pull (which only worked if Ollama was already installed)

## [1.10.4] — 2026-03-24

Stability and UI polish release. Focus: homepage layout, Quick Prompts overlay, export reliability, dark mode.

### Fixed
- **Quick Prompts overlay properly blocks content:** Now uses `createPortal` to render a full-page backdrop (z-999) at `document.body` level with 80% background opacity + backdrop blur. Previously the overlay rendered inside the AskBar's CSS stacking context and leaked through to calendar events.
- **Export buttons show clear errors:** Word, PDF, and Obsidian export handlers now have try/catch with descriptive toast messages. Previously clicking export items did nothing with no visible error.
- **PrepCard time overflow:** Events 24h+ away now show "Tomorrow" or "in N days" instead of "in 459h 59m".
- **PrepCard dark mode badge:** "HAPPENING NOW" amber badge now readable in dark mode (`dark:text-amber-400 dark:bg-amber-500/20`).
- **Chat response spacing:** Tightened prose margins for markdown content (headings, paragraphs, lists, code blocks, horizontal rules) so AI responses feel denser and more scannable.
- **AskBar placeholder consistency:** Active state placeholder now reads "Ask Syag anything… type / for prompts" (was "Ask anything…").
- **PrepCard icon size:** ChevronRight reduced from h-4 to h-3.5 to match other icons in the card.

### Changed
- **Homepage section order:** Schedule card now appears before Commitments (time-sensitive before persistent). Schedule capped to 3 events for tighter layout.

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
