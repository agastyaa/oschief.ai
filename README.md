# Syag

AI-powered meeting notes and audio transcription for macOS. Record meetings with near real-time transcription (mic + system audio), “You” vs “Others” speaker labels, and AI summaries.

---

## Tech stack

- **Frontend:** React 18, TypeScript, Vite, React Router, Tailwind CSS, shadcn/ui, TanStack Query
- **Desktop:** Electron 40
- **Data:** better-sqlite3 (local DB), Electron safeStorage (encrypted API keys)
- **Build:** electron-vite, electron-builder (DMG for macOS arm64)

---

## App architecture

### High-level flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  Renderer (React)                                                            │
│  • Pages: NewNote, AllNotes, NoteDetail, Calendar, Settings, Onboarding       │
│  • Contexts: Recording, Notes, Folders, ModelSettings, Calendar               │
│  • UI: shadcn/ui, Tailwind                                                   │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                 │ preload (contextBridge)
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  IPC (invoke / on)                                                           │
│  db:*, models:*, recording:*, llm:*, keychain:*, app:*, permissions:*, etc. │
└───────────────────────────────┬─────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  Main process (Electron)                                                     │
│  • ipc-handlers.ts → database, capture, router, tray, keychain               │
│  • windows.ts, tray.ts, meeting-detector, power-manager                       │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 1. Frontend (src/)

| Layer | Path | Role |
|-------|------|------|
| **Entry** | `main.tsx` | React root, mounts `App` |
| **App** | `App.tsx` | Providers (Model, Folder, Notes, Recording, Calendar), Router, GlobalRecordingBanner, MeetingDetectionHandler |
| **Routes** | Routes in `App.tsx` | `/` Index, `/notes` AllNotes, `/new-note` NewNotePage, `/note/:id` NoteDetailPage, `/calendar` CalendarPage, `/settings` SettingsPage, `/onboarding` OnboardingPage, `/ask` AskSyag |
| **Contexts** | `contexts/*.tsx` | **RecordingContext**: session, transcript lines, start/stop/pause/resume capture, Web Speech fallback. **NotesContext**: CRUD notes. **FolderContext**: folders. **ModelSettingsContext**: selected AI/STT models, download states, connected cloud providers, keychain sync. **CalendarContext**: calendar events for meeting detection |
| **Pages** | `pages/*.tsx` | NewNotePage (record, live transcript, summary), NoteDetailPage (view/edit note, Ask bar), SettingsPage (AI models, STT, keychain connect), CalendarPage, OnboardingPage, etc. |
| **Components** | `components/*.tsx` | GlobalRecordingBanner, TrayMenu, AskBar, EditableSummary, Sidebar, MeetingCard, ICSDialog, UI primitives (components/ui/) |
| **API bridge** | `lib/electron-api.ts` | Typed access to `window.electronAPI` (or undefined in web); used by contexts/pages |

---

### 2. Electron main process (electron/main/)

| Module | File | Role |
|--------|------|------|
| **Entry** | `index.ts` | `app.whenReady`: init DB, ensure models dir, register IPC, create window, setup tray, meeting detection, power monitor. `before-quit`: stop meeting detection. |
| **IPC** | `ipc-handlers.ts` | All handlers: **db** (notes, folders, settings), **models** (download, cancel, delete, list, progress, MLX check/install), **recording** (start, stop, pause, resume, audio-chunk), **llm** (summarize, chat), **keychain** (get/set/delete), **audio** (devices, desktop sources), **permissions** (mic, screen), **app** (version, login item), **tray** (update recording state, meeting info), **meeting** (set calendar events). Keychain path: `userData/secure/keychain.enc` (encrypted with safeStorage). |
| **Windows** | `windows.ts` | Create main BrowserWindow, load app (dev vs prod), open tray preview window. |
| **Tray** | `tray.ts` | System tray icon (colored “S”), recording state (red dot), menu (New note, Pause/Resume, Open, Quit), tray events → IPC to renderer. |
| **Database** | `storage/database.ts` | better-sqlite3, `userData/data/syag.db`, WAL mode. Tables: notes (id, title, date, time, duration, personal_notes, transcript, summary, folder_id), folders, settings. CRUD + migrations. |
| **Migrations** | `storage/migrations.ts` | Schema versioning and migrations for DB. |

---

### 3. Recording & STT pipeline

| Step | Where | What |
|------|--------|------|
| 1. Capture | Renderer | **RecordingContext** starts capture: get mic + (optional) system audio via `getUserMedia` + `getDisplayMedia`, create AudioContext, load **AudioWorklet** `public/audio-processor.js`. |
| 2. Worklet | `public/audio-processor.js` | **SyagAudioProcessor**: buffers two channels (0 = mic, 1 = system), emits `audio-chunk` with `pcm` (Float32Array) and `channel`. Chunk size 4096 samples. |
| 3. To main | Preload + IPC | `recording:audio-chunk` (pcm, channel) → **processAudioChunk** in main. |
| 4. Buffers | `audio/capture.ts` | **audioBuffers[0]** (You), **audioBuffers[1]** (Others). Per-channel buffers; **processBufferedAudio** runs on timer (4s active, 15s idle) or when a channel has ≥ 2s of samples (setImmediate). |
| 5. Process | `audio/capture.ts` | Merge chunks per channel, optional VAD (silero), build WAV, call STT. **currentSTTModel** from `recording:start` options (e.g. `deepgram:Nova-2` or `local:mlx-whisper-large-v3-turbo`). |
| 6. STT local | `models/stt-engine.ts` | **processWithLocalSTT**: MLX Whisper (Python worker) or whisper.cpp CLI + downloaded ggml model. WAV written to temp file, result parsed. |
| 7. STT cloud | `cloud/router.ts` → `cloud/deepgram.ts` (etc.) | **routeSTT(wavBuffer, model)** → getApiKey(providerId) from keychain → **sttDeepgram** (or OpenAI, AssemblyAI, Groq). |
| 8. Transcript | `capture.ts` | **transcriptCallback** with `{ speaker: 'You'|'Others', time, text }` → IPC `recording:transcript-chunk` → renderer appends to transcript lines. |

Constants: `SAMPLE_RATE = 16000`, `MIN_SAMPLES_PER_CHANNEL = 2s`, `CHUNK_INTERVAL_ACTIVE_MS = 4000`, `CHUNK_INTERVAL_IDLE_MS = 15000`. Speaker labels: channel 0 → “You”, channel 1 → “Others”.

---

### 4. AI / LLM & models

| Component | Location | Role |
|-----------|----------|------|
| **Cloud router** | `cloud/router.ts` | **routeLLM(messages, model, onChunk)** and **routeSTT(wavBuffer, model)**. Model format: `providerId:modelName` (e.g. `openai:gpt-4o`, `deepgram:Nova-2`). **getApiKey(providerId)** reads from same keychain as IPC. |
| **Providers** | `cloud/*.ts` | openai, anthropic, google, groq (chat + optional STT), deepgram, assemblyai (STT). Each uses HTTPS and provider-specific APIs. |
| **Summarization** | `models/llm-engine.ts` | **summarize(transcript, personalNotes, model, meetingTemplateId)** builds prompt from template, calls **chat** (router), returns summary. **chat** used for Ask bar and streaming. |
| **Model manager** | `models/manager.ts` | **getModelsDir** = `~/.syag/models`. **MODEL_URLS**: whisper.cpp ggml, silero-vad, ecapa-tdnn, llama/phi/gemma GGUF. **downloadModel**, **listDownloadedModels**, **getModelPath**. |
| **STT engine** | `models/stt-engine.ts` | **processWithLocalSTT**: MLX path (Python worker, `mlx-whisper`), whisper.cpp path (binary + ggml file). **ensureWhisperBinary** / **ensureWhisperBinaryInBackground**, **installMLXWhisper** (pip install). **checkMLXWhisperAvailable**. |
| **Templates** | `models/templates.ts` | Meeting summary prompt templates. |

---

### 5. Audio & VAD

| File | Role |
|------|------|
| `audio/capture.ts` | Buffers, timer, VAD gate, WAV build, STT dispatch, transcript callback, pause/resume, auto-pause on silence. |
| `audio/vad.ts` | **runVAD(audio, sampleRate)** using **silero-vad** ONNX (downloaded to models dir). **ensureVADModel** loads once. |
| `audio/processor.ts` | Optional fallback/helper for audio (used if needed alongside worklet). |
| `audio/diarization.ts`, `audio/speaker-embeddings.ts` | Speaker diarization / embeddings (ecapa-tdnn); “You” vs “Others” is channel-based, not full diarization. |

---

### 6. Meeting detection & calendar

| File | Role |
|------|------|
| `meeting-detector.ts` | Polls frontmost app (e.g. Zoom, Meet). On meeting start/end, sends `meeting:detected` / `meeting:ended` to renderer. Uses **calendar events** (set via `meeting:set-calendar-events`) for title/context. **startMeetingDetection(mainWindow)** / **stopMeetingDetection**. |
| **Calendar** | Renderer: CalendarContext, CalendarPage; ICS import (ICSDialog). Events passed to main via `meeting:set-calendar-events`. |

---

### 7. Security & keychain

- **API keys** stored in `userData/secure/keychain.enc`, encrypted with Electron **safeStorage**.
- **Keychain key** = provider id (e.g. `openai`, `deepgram`). Set from Settings when user “connects” a provider; read in main by **router.getApiKey** and by IPC **keychain:get** for UI state (e.g. “connected”).
- No API keys in renderer; all LLM/STT calls from main.

---

### 8. Data flow summary

- **Notes:** Renderer ↔ IPC ↔ **database.ts** (SQLite).
- **Transcript:** AudioWorklet → IPC `recording:audio-chunk` → **capture.ts** → STT (local or **router** → cloud) → IPC `recording:transcript-chunk` → **RecordingContext** → UI.
- **Summaries:** NewNotePage / NoteDetailPage → IPC `llm:summarize` / `llm:chat` → **llm-engine** + **router** → cloud LLM → result back to renderer.
- **Models:** Settings → IPC models/download, keychain/set → main; **ModelSettingsContext** syncs selected STT/AI model and connected providers to DB and keychain.

---

## Development

```bash
# Install
npm i

# Run app (Electron + Vite)
npm run dev

# Web-only (no Electron)
npm run dev:web
```

---

## Build & DMG

```bash
# Build main + renderer
npm run build

# Package macOS app and DMG (arm64)
npm run package
```

Output: **dist/Syag-1.0.0-arm64.dmg** (and `dist/mac-arm64/Syag.app`). Config: **electron-builder.yml** (appId: `com.syag.notes`, productName: Syag, asar with unpack for better-sqlite3 and onnxruntime-node).

---

## Project layout (source only)

```
electron/
  main/
    index.ts           # App lifecycle, tray, IPC, DB init
    ipc-handlers.ts    # All IPC handlers + keychain helpers
    windows.ts         # Main window creation
    tray.ts            # System tray icon and menu
    meeting-detector.ts
    power-manager.ts
    storage/
      database.ts      # SQLite CRUD
      migrations.ts
    models/
      manager.ts       # Download, paths, list models
      stt-engine.ts    # Local STT (MLX, whisper.cpp)
      llm-engine.ts    # Summarization, chat
      templates.ts
    audio/
      capture.ts       # Buffers, STT trigger, transcript callback
      vad.ts           # Silero VAD
      processor.ts
      diarization.ts
      speaker-embeddings.ts
    cloud/
      router.ts        # routeLLM, routeSTT, getApiKey
      openai.ts, anthropic.ts, google.ts, groq.ts
      deepgram.ts, assemblyai.ts
  preload/
    index.ts           # contextBridge electronAPI
public/
  audio-processor.js   # AudioWorklet (mic + system, 2 channels)
src/
  App.tsx              # Providers, Router
  main.tsx
  contexts/            # Recording, Notes, Folders, ModelSettings, Calendar
  pages/               # NewNote, AllNotes, NoteDetail, Settings, Calendar, etc.
  components/          # UI + app-specific
  lib/
    electron-api.ts    # Typed electronAPI access
```

---

## License

Private / Syag.
