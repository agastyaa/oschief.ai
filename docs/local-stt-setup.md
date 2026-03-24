# Local speech-to-text: what Syag does for you

Syag keeps **transcripts on your device** when you use local models. This page explains **what happens when you click Download** and **what your Mac must already have** so you can fix issues quickly.

## Whisper Large V3 Turbo (whisper.cpp) — recommended default

1. **Syag downloads** the model file (~1.6 GB) into `~/.syag/models`.
2. **Then Syag looks for** `whisper-cli` (or `whisper-cpp`): your Syag models folder, your PATH, then common Homebrew paths.
3. **If missing**, Syag tries in order:
   - Build **whisper.cpp** from source (needs **CMake**, **compiler**, several minutes), or  
   - Run **`brew install whisper-cpp`** (needs **Homebrew**).

**You may need to install yourself:** [Homebrew](https://brew.sh), or Xcode Command Line Tools (`xcode-select --install`) for builds.

## MLX Whisper (full or 8-bit)

Used for Apple Silicon–optimized inference via Python.

1. **ffmpeg** — Syag checks first; on macOS it may run **`brew install ffmpeg`** for you.
2. **pip** — Syag runs `python3 -m pip install mlx-whisper` or `mlx-audio-plus`.
3. **Verify** — Syag runs a real `import` under the same PATH as pip (includes common Homebrew bin dirs). If verification fails, the error includes **Python’s traceback** and the **`python3` path** Syag used — copy the suggested `… -m pip install --user --force-reinstall mlx-whisper` line into Terminal.

**You need:** **Python 3** with a working `pip`, and usually **Homebrew** for ffmpeg. If the app’s automatic steps fail, run the same commands in **Terminal** (the toast shows the exact suggestion).

**Common “import failed” causes:** `pip` installed the wheel for a **different** Python than GUI Syag’s `python3`; or **`mlx`** / native deps failed (Apple Silicon vs Rosetta). Use the path from the error message, or run `which python3` in Terminal and `that-path -m pip install --user --force-reinstall mlx-whisper`.

## Why the app can’t always do 100% automatically

- Packaged apps often have a **minimal PATH** (no Homebrew until we add common paths).
- **`brew install`** sometimes needs **password / interaction** — that works more reliably in Terminal.
- **Corporate Macs** may block brew or pip.

## Maximum transparency in the app

After install or download, **Settings → AI Models** toasts list **each step** Syag attempted (ffmpeg, pip, whisper-cli, etc.). If something fails, the toast includes a **short manual command** to run in Terminal.

## Easier path if local setup is too heavy

Use **cloud STT** (Deepgram, AssemblyAI, Groq, provider APIs) or **Apple** speech where available — no whisper-cli or Python required.
