# Syag

AI-powered meeting notes and audio transcription for macOS, Windows, and Linux. Record meetings with near real-time transcription (mic + system audio), “You” vs “Others” speaker labels, AI summaries, and optional coaching insights.

**Privacy:** Installers contain no API keys or user data. Your keys, notes, and calendar stay on your machine (stored in the app’s user data directory).

---

## How to run Syag

You can either **download a built installer** (DMG on macOS) or **run from source** with npm.

### Option 1: Download the DMG (or installer)

When a new version is released, the GitHub Action builds the app and attaches installers to the [Releases](https://github.com/iamsagar125/syag-note/releases) page.

1. Open **[Releases](https://github.com/iamsagar125/syag-note/releases)** for this repo.
2. Pick the latest release (e.g. **v1.0.4**).
3. Under **Assets**, download:
   - **macOS:** `Syag-<version>.dmg` (or the `.zip`).
   - *(Windows/Linux installers appear there when those builds are enabled.)*
4. Open the DMG, drag Syag to Applications, and run it.

The DMG is available as soon as the Release workflow finishes for that version (a few minutes after the tag is pushed).

### Option 2: Run from source (local repo)

Clone the repo, install dependencies, and run the Electron app locally (good for development or if you want to build yourself).

**Requirements:** Node.js **22.x** (recommended; the project uses tools that expect Node ≥22.12), npm, and Git.

```bash
# Clone (or pull if you already have it)
git clone https://github.com/iamsagar125/syag-note.git
cd syag-note

# Install dependencies (use npm ci for a clean install matching the lock file)
npm ci

# Run the app (Electron + Vite; full capture/STT)
npm run dev:electron
```

Other useful commands:

| Command | What it does |
|--------|----------------|
| `npm run dev:electron` | Run the desktop app (recommended for recording/STT). |
| `npm run dev:web` | Run in the browser only (no Electron; cloud STT still works). |
| `npm run build` | Build main + renderer for production. |
| `npm run package` | Build and package a Mac app (output in `dist/`). |
| `npm test` | Run tests (Vitest). |
| `npm run lint` | Run ESLint. |

---

## Tech stack

- **Frontend:** React 18, TypeScript, Vite, React Router, Tailwind CSS, shadcn/ui, TanStack Query
- **Desktop:** Electron 40
- **Data:** better-sqlite3 (local DB), Electron safeStorage (encrypted API keys)
- **Build:** electron-vite, electron-builder (DMG/zip on macOS, NSIS/portable on Windows, AppImage on Linux)

---

## App architecture

### High-level flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Renderer (React)                                                            │
│  Pages: Index, AllNotes, NewNote, NoteDetail, Calendar, Coaching, Settings,  │
│         Onboarding, AskSyag; TrayMenu, GlobalRecordingBanner                    │
│  Contexts: Recording, Notes, Folders, ModelSettings, Calendar, Sidebar       │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                 │ preload (contextBridge)
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  IPC (invoke / on)                                                            │
│  db:*, models:*, recording:*, llm:*, keychain:*, app:*, permissions:*,      │
│  meeting:*, tray:*, export:*, integrations:*, etc.                          │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Main process (Electron)                                                      │
│  ipc-handlers → database, capture, router, tray, keychain, export,           │
│  meeting-detector, power-manager, action-reminders, integrations             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 1. Frontend (src/)

| Layer | Path | Role |
|-------|------|------|
| **Entry** | `main.tsx` | React root, mounts `App` |
| **App** | `App.tsx` | Providers (Model, Folder, Notes, Recording, Calendar, SidebarVisibility), Router, GlobalRecordingBanner, MeetingDetectionHandler, SearchCommand, TrayNavigationHandler |
| **Routes** | `App.tsx` | `/` Index, `/notes` AllNotes, `/new-note` NewNotePage, `/note/:id` NoteDetailPage, `/calendar` CalendarPage, `/coaching` CoachingPage, `/settings` SettingsPage, `/ask` AskSyag, `/onboarding` OnboardingPage, `/tray-preview` TrayMenu, `*` NotFound |
| **Contexts** | `contexts/*.tsx` | **RecordingContext**: session, transcript, start/stop/pause/resume capture, Web Speech fallback. **NotesContext**: CRUD notes. **FolderContext**: folders. **ModelSettingsContext**: AI/STT models, download states, keychain. **CalendarContext**: events, ICS. **SidebarVisibilityContext**: sidebar state. |
| **Pages** | `pages/*.tsx` | NewNotePage (record, live transcript, summary), NoteDetailPage (view/edit, Ask bar), SettingsPage (Account, Preferences, AI Models, Transcription, Templates, Calendar, Notifications, Integrations, About), CalendarPage, CoachingPage, AskSyag, OnboardingPage |
| **Components** | `components/*.tsx` | GlobalRecordingBanner, TrayMenu, AskBar, EditableSummary, Sidebar, MeetingCard, ICSDialog, Jira/Slack/Teams connect dialogs, ErrorBoundary, SearchCommand, UI primitives (`components/ui/`) |
| **API bridge** | `lib/electron-api.ts` | Typed `window.electronAPI` (or undefined in web) |

---

### 2. Electron main process (electron/main/)

| Module | File | Role |
|--------|------|------|
| **Entry** | `index.ts` | `app.setName('Syag')`, protocol, DB init, models dir, IPC, window, tray, meeting detection, power monitor. `before-quit`: stop meeting detection. |
| **IPC** | `ipc-handlers.ts` | **db**: notes, folders, settings. **models**: download, cancel, delete, list, MLX check/install. **recording**: start, stop, pause, resume, audio-chunk. **llm**: summarize, chat. **keychain**: get/set/delete. **app**: version, login item, tray navigate/start/pause. **permissions**: mic, screen. **meeting**: set calendar events. **tray**: update state. **export**: docx, pdf, markdown. **integrations**: Jira, Slack, Teams, Google Calendar. Keychain: `userData/secure/keychain.enc` (safeStorage). |
| **Windows** | `windows.ts` | Main BrowserWindow, load app (dev vs prod), tray preview window. |
| **Tray** | `tray.ts` | System tray icon, recording state, menu (New note, Pause/Resume, Open, Quit). |
| **Database** | `storage/database.ts` | better-sqlite3, `userData/data/syag.db`, WAL. Tables: notes (id, title, date, time, duration, time_range, personal_notes, transcript, summary, folder_id, coaching_metrics), folders, settings. CRUD + migrations. |
| **Migrations** | `storage/migrations.ts` | Schema versions; notes get time_range, coaching_metrics in later migrations. |
| **Documents sync** | `storage/documents-sync.ts` | Sync notes to local Markdown/files. |
| **Export** | `export/docx-exporter.ts`, `export/pdf-exporter.ts`, `export/note-html-template.ts` | Export note to DOCX, PDF, or HTML. |
| **Integrations** | `integrations/jira-api.ts`, `jira-auth.ts`, `google-auth.ts`, `google-calendar.ts` | Jira, Google Calendar; secrets in keychain. |
| **Action reminders** | `action-reminders.ts` | Reminders derived from notes/summaries. |

---

### 3. Recording & STT pipeline

| Step | Where | What |
|------|--------|------|
| 1. Capture | Renderer | **RecordingContext** starts capture: mic + (optional) system audio via `getUserMedia` + desktop capture; AudioContext 16 kHz; **AudioWorklet** `public/audio-processor.js`. |
| 2. Worklet | `public/audio-processor.js` | Two channels (0 = mic, 1 = system); emits `audio-chunk` with `pcm` (Float32Array) and `channel`. |
| 3. To main | Preload + IPC | `recording:audio-chunk` → **processAudioChunk** in main. |
| 4. Buffers | `audio/capture.ts` | Per-channel **audioBuffers** (arrays of Float32Array chunks). **Chunk timer** runs every **5 s** (active) / **15 s** (idle); when enough samples, **processBufferedAudio** runs. Early trigger at **4 s** of data for low-latency first result. |
| 5. VAD & gate | `audio/capture.ts` | **runVAD** (Silero) on merged buffer; min speech duration and energy per channel (stricter for “You”). If no speech or too quiet, skip STT. |
| 6. STT | `audio/capture.ts` | Build WAV from (optionally VAD-extracted) speech; **currentSTTModel** from `recording:start`. **local:** → **processWithLocalSTT** (MLX or whisper.cpp). **system:** → macOS Speech. Else → **routeSTT** (cloud). Optional **defer**: transcribe once when recording stops (Settings). |
| 7. Local STT | `models/stt-engine.ts` | **processWithLocalSTT**: MLX Whisper (Python worker, `mlx-whisper` or 8-bit) or whisper.cpp CLI + ggml model. Temp WAV; word timestamps when supported. |
| 8. Cloud STT | `cloud/router.ts` → `cloud/*.ts` | **routeSTT(wavBuffer, model)** → keychain **getApiKey(providerId)** → OpenAI, Deepgram, Groq, AssemblyAI, Copart. |
| 9. Transcript | `capture.ts` | **filterHallucinatedTranscript** (per segment) → **transcriptCallback** `{ speaker, time, text, words? }` → IPC `recording:transcript-chunk` → renderer. |

Constants: `SAMPLE_RATE = 16000`, `CHUNK_INTERVAL_ACTIVE_MS = 5000`, `CHUNK_INTERVAL_IDLE_MS = 15000`, `MIN_SAMPLES_PER_CHANNEL` (2 s), `EARLY_TRIGGER_SAMPLES` (4 s). Speaker labels: channel 0 → “You”, channel 1 → “Others”.

---

### 4. AI / LLM & models

| Component | Location | Role |
|-----------|----------|------|
| **Cloud router** | `cloud/router.ts` | **routeLLM(messages, model, onChunk)**, **routeSTT(wavBuffer, model)**. Model format `providerId:modelName`. **getApiKey(providerId)** from keychain. |
| **Providers** | `cloud/*.ts` | OpenAI, Anthropic, Google, Groq (chat + STT), Deepgram, AssemblyAI, Copart (chat + STT). **apple-llm**: Apple Foundation / on-device LLM when available. |
| **Summarization** | `models/llm-engine.ts` | **summarize(transcript, personalNotes, model, templateId)** from templates; **chat** for Ask bar and streaming. Local LLM via node-llama-cpp when selected. |
| **Model manager** | `models/manager.ts` | **getModelsDir** = `~/.syag/models`. **MODEL_URLS**: whisper.cpp ggml, silero-vad, ecapa-tdnn, GGUF (Llama, Phi, Gemma). **downloadModel**, **listDownloadedModels**, **getModelPath**. |
| **STT engine** | `models/stt-engine.ts` | **processWithLocalSTT**: MLX Whisper (Python), whisper.cpp CLI. **ensureWhisperBinary**, **installMLXWhisper**, **checkMLXWhisperAvailable**. |
| **Templates** | `models/templates.ts` | Meeting summary prompt templates. |

---

### 5. Audio & VAD

| File | Role |
|------|------|
| `audio/capture.ts` | Timer-driven buffers, processBufferedAudio, VAD gate, WAV build, STT dispatch, filterHallucinatedTranscript, transcript callback, pause/resume, defer transcription. |
| `audio/vad.ts` | **runVAD(audio, sampleRate)** via **silero-vad** ONNX (auto-download to models dir). **ensureVADModel**. |
| `audio/processor.ts` | Resampling and helpers. |
| `audio/diarization.ts`, `audio/speaker-embeddings.ts` | Optional speaker diarization (ecapa-tdnn); default “You”/“Others” is channel-based. |
| `audio/stt-system-darwin.ts` | macOS system Speech Recognition (when STT model is `system:*`). |

---

### 6. Meeting detection & calendar

| File | Role |
|------|------|
| `meeting-detector.ts` | Polls frontmost app (e.g. Zoom, Meet). Meeting start/end → `meeting:detected` / `meeting:ended` to renderer. Uses calendar events (set via `meeting:set-calendar-events`) for title/context. |
| **Calendar** | Renderer: CalendarContext, CalendarPage; ICS import (ICSDialog). Events to main via `meeting:set-calendar-events`. |

---

### 7. Security & keychain

- **API keys** in `userData/secure/keychain.enc`, encrypted with Electron **safeStorage**.
- Key = provider id (e.g. `openai`, `deepgram`). Set from Settings when connecting a provider; read in main by **router.getApiKey** and IPC **keychain:get** for UI.
- No API keys in renderer; all LLM/STT and cloud calls from main.

---

### 8. Transcript display & utils

| File | Role |
|------|------|
| `audio/capture.ts` | **filterHallucinatedTranscript** (main): strip common STT hallucinations and blank/rep-only text before sending each chunk. |
| `lib/transcript-utils.ts` | **groupTranscriptBySpeaker**, **parseTimeToSeconds**, paragraph grouping and splitting for display. |

---

### 9. Data flow summary

- **Notes:** Renderer ↔ IPC ↔ **database.ts** (SQLite).
- **Transcript:** AudioWorklet → IPC `recording:audio-chunk` → **capture.ts** (buffers → timer → VAD → STT) → filter → IPC `recording:transcript-chunk` → **RecordingContext** → UI.
- **Summaries / chat:** NewNotePage / NoteDetailPage / AskSyag → IPC `llm:summarize` / `llm:chat` → **llm-engine** + **router** → cloud (or local LLM) → result to renderer.
- **Models & keys:** Settings → IPC models/download, keychain/set → main; **ModelSettingsContext** syncs selected STT/AI model and connected providers.

---

## Development

For day-to-day dev, use the commands in the [Run from source](#option-2-run-from-source-local-repo) table above. Quick reference: `npm ci` then `npm run dev:electron`.

**Tests:** `npm test` (Vitest). Tests live in `src/test/` (e.g. `ics-parser.test.ts`, `stt-model.test.ts`, `stt-quality-fixes.test.ts`, `diarization-cluster.test.ts`).

**Lint:** `npm run lint`.

**Versioning:** Bump `version` in `package.json` before releasing (e.g. `1.0.3` → `1.0.4`).

---

## Build & release

```bash
# Build main + renderer
npm run build

# Package (default: mac; config in package.json "build")
npm run package
```

Output: **dist/** — DMG/zip (mac), NSIS/portable (Windows), AppImage (Linux). Version from `package.json`.

**GitHub Releases:** Push a version tag (e.g. `v1.0.4`) to trigger the Release workflow (`.github/workflows/release.yml`): builds on macOS, Windows, and Linux and attaches installers to the release. Users download from the repo’s Releases page; no API keys or data are bundled.

**Updates preserve your data:** Installing a new build over an existing install (e.g. replacing Syag.app in Applications) keeps your notes, API keys, and settings. User data lives in `~/Library/Application Support/Syag` (macOS) and is tied to the app identity, not the build—like an in-place update without OTA.

---

## Project layout

```
electron/
  main/
    index.ts              # App lifecycle, tray, IPC, DB init
    ipc-handlers.ts       # All IPC handlers, keychain
    windows.ts            # Main window, tray preview
    tray.ts               # System tray icon and menu
    meeting-detector.ts   # Meeting start/end, calendar context
    power-manager.ts
    action-reminders.ts
    storage/
      database.ts         # SQLite CRUD (notes, folders, settings)
      migrations.ts
      documents-sync.ts   # Sync notes to Markdown
    models/
      manager.ts          # Model paths, download, list (whisper, vad, GGUF)
      stt-engine.ts       # Local STT (MLX Whisper, whisper.cpp)
      llm-engine.ts       # Summarization, chat (cloud + local)
      templates.ts
    audio/
      capture.ts          # Buffers, timer, VAD gate, STT, transcript callback
      vad.ts              # Silero VAD
      processor.ts
      diarization.ts
      speaker-embeddings.ts
      stt-system-darwin.ts
    cloud/
      router.ts           # routeLLM, routeSTT, getApiKey
      openai.ts, anthropic.ts, google.ts, groq.ts
      deepgram.ts, assemblyai.ts, copart.ts
      apple-llm.ts
      net-request.ts
    export/
      docx-exporter.ts
      pdf-exporter.ts
      note-html-template.ts
    integrations/
      jira-api.ts, jira-auth.ts
      google-auth.ts, google-calendar.ts
  preload/
    index.ts               # contextBridge electronAPI
public/
  audio-processor.js       # AudioWorklet (mic + system, 2 channels)
src/
  App.tsx                  # Providers, Router, GlobalRecordingBanner, MeetingDetectionHandler
  main.tsx
  contexts/                # Recording, Notes, Folders, ModelSettings, Calendar, SidebarVisibility
  pages/                   # Index, AllNotes, NewNote, NoteDetail, Calendar, Coaching, Settings, AskSyag, Onboarding
  components/              # TrayMenu, AskBar, EditableSummary, Sidebar, ICSDialog, Jira/Slack/Teams dialogs, etc.
  lib/
    electron-api.ts        # Typed electronAPI
    transcript-utils.ts    # Grouping, timestamps, paragraphs
    ics-parser.ts
    export-markdown.ts
    coaching-analytics.ts
    stt-model.ts
    diarization-cluster.ts
  test/                    # Vitest tests
```

---

## License

Private / Syag.
