# Transcript: “Me” vs “Them”

Syag labels speakers by **audio source**, not by who is named in the conversation.

| Label | Source |
|-------|--------|
| **Me** | Your **microphone** (channel 0) |
| **Them** | **System / meeting audio** (channel 1), e.g. what plays through speakers |

So hearing your name in the transcript does **not** switch the next lines to “Me.” If your mic is muted, quiet, or a reply is very short, the **mic** path may not pass stricter voice-detection thresholds while the same words still appear on **system** audio — those lines can show as **Them**.

**Tips**

- Keep your **meeting and OS microphone unmuted** when you want reliable “Me” attribution.
- Very short utterances are harder to attribute to the mic stream than longer speech.

### Why words can disappear at chunk boundaries (or feel “cut off”)

Live transcription sends **short successive slices** of audio to the speech model. If the model only sees a slice of a sentence, it may stop early (e.g. ending on “…To”). Syag mitigates this by:

- Keeping **separate “continuation” context per channel** (mic vs system) for Whisper’s initial prompt, so “You” and “Them” don’t steal context from each other.
- Using **slightly longer buffers** before the first pass of a segment (about **5s** instead of 4s) so fewer phrases are split awkwardly.
- **Relaxing the minimum speech length** on the mic channel a bit so short phrases right after you **unmute** in Zoom/Teams are less likely to be skipped.

You can still lose audio if:

- **You pause recording in Syag** — capture is stopped and nothing is buffered during that time (by design for privacy).
- **You mute in the meeting** — your voice is not sent to other participants; Syag’s **mic** path mostly hears silence, so “Me” lines may be thin or missing unless your voice is also audible on **system/meeting audio** (e.g. echo/speaker bleed).

### Pause and resume

**Your transcript is not cleared** when you pause — `transcriptLines` keep everything from before the pause, and new lines append after you resume.

After resume, the audio pipeline reconnects; the **first** buffers are often short noise or underrun. Speech models sometimes respond with **generic “meeting” sentences** that nobody said. Syag tightens energy/VAD requirements for the first few post-resume passes per channel and filters several known boilerplate phrases. If you still see junk once, delete that line from the transcript panel.

For **maximum completeness** at the cost of no live transcript, enable **Transcribe when stopped** (Settings): the full recording is processed once at the end, which avoids live chunk boundary issues.

### How apps like Granola tend to behave (high level)

Products such as **Granola** are usually built around **continuous capture of meeting audio** (often **system/output** or a **bot that joins the call**), **cloud transcription**, and **longer contexts** — sometimes post-processing the whole meeting rather than only tiny live slices. They don’t magically hear you when the meeting client is sending **no audio** from your mic; the difference is often **where** audio is tapped, **buffering**, and **batching** for STT. Syag’s dual path (mic + system) is similar in spirit; tuning above reduces unnecessary drops on the mic path.

## Debug: why mic chunks were skipped

If transcription seems wrong, you can log main-process skip reasons (energy, VAD, speech duration) for the microphone channel.

1. Enable the setting key **`debug-audio-capture`** in the app database (value `true`), **or** set environment variable **`SYAG_DEBUG_AUDIO=1`** before starting Syag from a terminal.
2. Watch the **main process** console (Terminal if you launched via CLI, or Electron devtools for main if attached).

This is verbose; turn it off when finished troubleshooting.

### What to capture when live transcript is sparse or stops

During a failing meeting, reproduce once with debug enabled, then collect **main process** log lines (Terminal if you started Syag from CLI, or attached main DevTools). Useful substrings:

| Pattern / prefix | Meaning |
|------------------|---------|
| `[capture-debug] mic(ch0) skip_buffer_energy` | Mic chunk dropped before VAD — level too low vs threshold |
| `[capture-debug] skip_vad_no_segments` / `skip_vad_short_duration` | VAD did not find enough speech in the buffer |
| `[capture-debug] skip_speech_energy` | Post-VAD audio still too quiet |
| `[capture-debug] skip_cross_channel_dedup` | Line looked like echo of the other channel |
| `Skipping local STT (backoff` | Local model errors — 30s cooldown |
| `Cloud STT timed out after 30s` | Network or provider slowness |
| `STT processing error:` | Full error after STT failure |

Share a 1–2 minute slice of logs around the gap; that pinpoints whether to tune gates, dedup, or connectivity.

### Settings checklist (before blaming the model)

1. **Speech-to-text model** — Settings → AI Models → Transcription: a model must be selected (local Whisper, Apple Speech on macOS, or a connected cloud STT).
2. **Live transcription** — If **Transcribe when stopped** is on, there is **no** live transcript during the meeting; text appears after you stop.
3. **Live capture sensitivity** — Settings → AI Models → Transcription → **More sensitive** relaxes mic/system energy gates and cross-channel dedup (tradeoff: more noise / duplicates).
4. **macOS permissions** — Microphone for your voice; Screen Recording (and system audio) for remote participants on the **Them** channel.
