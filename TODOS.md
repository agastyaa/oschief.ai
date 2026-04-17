# Syag Note — TODOS

## Vision: AI Chief of Staff
Transform Syag from a meeting recorder into an AI executive assistant that remembers every relationship, preps you before meetings, coaches you live, and tracks your commitments over time.

---

## P1 — High Priority (Next Sprint)

### ~~Role-Aware Coaching Knowledge Base~~ ✅
**Status:** Shipped
**What was built:** 10 role-specific coaching knowledge bases (PM, EM, Engineer, Founder/CEO, Designer, Sales, Marketing, Ops, Data, People/HR) with curated frameworks from Shreyas Doshi, Paul Graham, Sam Altman, Chris Voss, Marty Cagan, and others. Settings role field upgraded from free text to dropdown selector. Each role gets deep, tailored coaching with meeting-specific advice and metrics focus.
**Files:** `electron/main/models/coaching-kb.ts` (new), `llm-engine.ts` (enhanced), `SettingsPage.tsx` (role dropdown)

### Fix Corrupted icon.icns
**What:** The macOS app icon (.icns) was regenerated but may still cause issues in packaged builds. Verify with `npm run package` that the app opens correctly.
**Why:** App won't open after packaging — critical blocker for distribution.
**Effort:** S
**Status:** Regenerated in this session — needs verification

---

## P2 — Medium Priority (Next 2 Sprints)

### Meeting Prep Briefs
**What:** 5 minutes before a calendar meeting, generate a contextual brief: who you're meeting, what you discussed last time, your open commitments to them, and suggested talking points. Deliver as macOS notification + in-app card.
**Why:** This is the "killer feature" that makes the memory layer tangible. The "Before you go in..." notification is the wow moment that makes someone tell a friend.
**Where to start:** `electron/main/memory/prep-brief.ts` — query people table + note_people + commitments for calendar attendees, then LLM call to generate 3-5 line brief. Trigger from CalendarContext when upcoming meeting detected.
**Effort:** M
**Depends on:** Memory Layer (shipped), Calendar integration (shipped), accumulated meeting data (needs ~5+ meetings)

### Weekly Intelligence Digest
**What:** Auto-generated weekly summary: meeting load, key themes, commitments kept/broken, coaching score trends, relationship highlights. Delivered as in-app page + optional notification.
**Why:** Makes Syag valuable even between meetings. Shows the pattern of your professional life over time.
**Where to start:** `electron/main/memory/weekly-digest.ts` + `src/pages/WeeklyDigestPage.tsx`. Aggregate from notes, commitments, coaching_metrics, topics tables. Schedule via `setInterval` or calendar-based trigger.
**Effort:** L
**Depends on:** Memory Layer (shipped), 1+ weeks of accumulated data

### "Before you go in..." Smart Notification
**What:** Enhancement to prep briefs — the notification itself is contextual: "Meeting with Sarah Chen in 5 min — last discussed Q3 budget, you owe her the revised forecast." Tapping opens prep brief in-app.
**Why:** This is the "tell a friend" moment. Generic "meeting in 5 min" notifications are boring. Context-aware ones are magical.
**Effort:** S (once prep briefs are built)
**Depends on:** Meeting Prep Briefs

---

## P3 — Lower Priority (Backlog)

### Microsoft Teams Call Integration
**What:** Integrate with Teams calls — detect active calls, capture audio from Teams meetings specifically.
**Why:** User requested. Meeting detector already handles Zoom/Google Meet. Teams webhook integration exists but not call detection.
**Effort:** M
**Depends on:** Meeting detector infrastructure (shipped)

### TypeScript Type Definitions for IPC API
**What:** Create shared types for Note, Person, Commitment, Summary, Topic, TranscriptLine. Replace `any` with concrete types in `electron-api.ts` (30+ function signatures) and all IPC handlers.
**Why:** No compile-time safety on the most critical data paths. TypeScript can't catch type mismatches, making refactoring risky.
**Effort:** M (~2 hours with CC)
**Depends on:** Nothing. Can be done independently.
**Context:** Identified in eng review 2026-03-18. Deferred from reliability fix PR to keep scope focused.

### SettingsPage Decomposition
**What:** Break the 1,692-line `SettingsPage.tsx` god component into `src/components/settings/` directory with separate section components.
**Why:** Code quality — the file is the largest in the codebase and hard to maintain.
**Effort:** M (refactor only, no new features)

### Vector Embeddings / Semantic Search
**What:** Add embedding-based search across meetings. "What did we decide about pricing?" → semantic match across notes, not just keyword search.
**Why:** Makes the memory layer 10x more powerful. Currently limited to exact text matches.
**Effort:** L (needs embedding pipeline, vector storage, search UI)
**Depends on:** Memory Layer (shipped)

### Team Features
**What:** Multi-user support — shared meeting memory, delegation tracking, team meeting culture analytics.
**Why:** Transforms Syag from personal tool to team platform.
**Effort:** XL (auth, sharing, permissions, sync)
**Depends on:** Everything above

### Preload/renderer bundle audit for Zod (v3.1 prep)
**What:** Audit electron-vite config, preload tsconfig, and renderer bundle to confirm Zod can be imported from `src/types/ipc.ts` across main/preload/renderer without bloating the renderer bundle or breaking Electron's context isolation.
**Why:** v3.1 will add Zod schemas shared across all three processes. If the bundler tree-shakes wrong or duplicates Zod, the renderer bundle grows and context isolation may break subtly. Outside voice specifically flagged this as the kind of issue that kills refactor plans mid-sprint.
**Effort:** S (~2 hours)
**Context:** `electron/preload/index.ts` is 669 lines. Current imports use `@/` alias. Zod is already in `dependencies` (`^3.25.76`) but only used in renderer today. Investigate whether shared types should live in `electron/shared/` or similar and how each tsconfig includes them.
**Depends on:** Nothing (can do anytime before v3.1 starts)
**Source:** /plan-eng-review outside voice, 2026-04-16

### Flip IPC_VALIDATION_MODE to enforce (v3.1.x)
**What:** After v3.1 ships with Zod IPC validation in `log` mode, wait 2 weeks of production telemetry. If validation-violation log rate is near zero, flip the default in `electron/main/ipc/util.ts` from `log` to `enforce`.
**Why:** Log mode means the types lie — `parseOrFail` returns `input as T` on failure. Enforce mode is the actual payoff of the Zod work. Without an explicit forcing TODO, this step tends to get forgotten and the type safety stays aspirational forever.
**Effort:** XS (one-line default change + changelog note)
**Gate:** ≥2 weeks in production with <1% validation-violation log rate across any channel.
**Depends on:** v3.1 ships with Zod IPC validation
**Source:** /plan-eng-review outside voice, 2026-04-16

### Dependency audit (70 runtime deps)
**What:** Audit the 70 runtime deps in `package.json`. Remove unused, flag heavy ones (recharts, docx, all radix-* packages) for lazy-load or code-split. Report: usage map + size delta.
**Why:** DMG is ~150MB+ signed. Cold start and download time both suffer. Security surface area matters for on-device app.
**Effort:** M (1-2 days)
**Context:** Several radix packages may be unused. docx + recharts are heavy and only used in specific flows. electron-updater, onnxruntime-node, better-sqlite3 are legitimately large but essential.
**Depends on:** Nothing
**Source:** /plan-ceo-review deferred from v3.0, re-filed 2026-04-16

---

## Completed ✓

- [x] Phase 1: Export & Documentation (Markdown, Word, PDF, Obsidian)
- [x] Phase 2: Speech Coaching Analytics (WPM, talk ratio, fillers, scoring, trends)
- [x] Phase 3: Jira Integration (token auth, create/bulk create tickets, status badges)
- [x] Phase 4a: Slack Integration (webhook posting)
- [x] Phase 4b: Teams Integration (webhook posting)
- [x] Phase 4c: Google Calendar OAuth
- [x] Phase 4d: Microsoft Calendar OAuth
- [x] Phase 5a: Memory Layer (people, commitments, topics tables)
- [x] Phase 5b: Entity Extraction Engine (auto-extract after summarization)
- [x] Phase 5c: People Browser page
- [x] Phase 5d: Commitment Tracker page
- [x] Phase 5e: "You said you would..." Home widget
- [x] Phase 5f: Live Coaching Overlay (real-time WPM, talk ratio, fillers, nudges)
- [x] Tray icon redesign (S monogram, template mode for dark/light)
- [x] Dock icon redesign (copper S on dark background)
- [x] gstack installation
- [x] Phase 6a: Role-Aware Coaching Knowledge Base (10 roles, curated frameworks, Settings dropdown)
- [x] Phase 6b: Live Coaching Overlay wired into recording page
- [x] Phase 6c: Entity Extraction auto-triggers after summarization
