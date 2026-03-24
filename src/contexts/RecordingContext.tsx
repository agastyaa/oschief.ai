import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
import { toast } from "sonner";
import { isElectron, getElectronAPI } from "@/lib/electron-api";

interface RecordingSession {
  noteId: string;
  title: string;
  elapsedSeconds: number;
  isRecording: boolean;
  startTime: number; // Date.now() when recording started
}

/** Transcript line: speaker is "You" (user/mic) or "Others" (system/remote). UI shows "Me" / "Them". */
type TranscriptLine = { speaker: string; time: string; text: string };

export const CAPTURE_ERROR_NO_SOURCE =
  'No microphone or system audio. Allow microphone access in System Settings (Privacy & Security → Microphone) and optionally Screen Recording for system audio.';

interface RecordingContextType {
  activeSession: RecordingSession | null;
  isActive: boolean;
  startSession: (noteId: string) => void;
  /** Restore session after "stopped" so user can resume recording without clearing transcript. */
  resumeSession: (noteId: string, title: string, elapsedSeconds: number) => void;
  updateSession: (updates: Partial<RecordingSession>) => void;
  clearSession: () => void;
  transcriptLines: TranscriptLine[];
  /** Remove a transcript line by index (e.g. for delete-chunk in transcript panel). */
  removeTranscriptLineAt: (index: number) => void;
  /** Remove multiple transcript lines by indices (e.g. when deleting a grouped block). */
  removeTranscriptLinesAt: (indices: number[]) => void;
  isCapturing: boolean;
  usingWebSpeech: boolean;
  /** Set when capture failed (e.g. no mic, worklet load failed). Clear on retry or when user dismisses. */
  captureError: string | null;
  clearCaptureError: () => void;
  /** STT pipeline state: idle, processing (VAD+STT running), or error (last chunk failed). */
  sttStatus: 'idle' | 'processing' | 'error';
  /** Last error message from STT (when sttStatus === 'error'). */
  sttErrorMessage: string | null;
  /** Timestamp of last successful transcript chunk (for stale hint). */
  lastSuccessfulTranscriptTime: number | null;
  startAudioCapture: (sttModel: string, options?: { meetingTitle?: string; vocabulary?: string[] }) => Promise<void>;
  stopAudioCapture: () => Promise<void>;
  pauseAudioCapture: () => Promise<void>;
  resumeAudioCapture: (sttModel?: string) => Promise<void>;
  /** Scratch for current session (personalNotes, title, userEditedTitle) so indicator pause-and-summarize can restore state when navigating back. */
  setSessionScratch: (scratch: { personalNotes?: string; title?: string; userEditedTitle?: boolean }) => void;
  getSessionScratch: () => { personalNotes?: string; title?: string; userEditedTitle?: boolean };
  /** Meeting context assembled by Command Center for the current recording session. */
  meetingContext: any | null;
  setMeetingContext: (ctx: any | null) => void;
}

const RecordingContext = createContext<RecordingContextType | undefined>(undefined);

export function RecordingProvider({ children }: { children: ReactNode }) {
  const [activeSession, setActiveSession] = useState<RecordingSession | null>(null);
  const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [usingWebSpeech, setUsingWebSpeech] = useState(false);
  const [meetingContext, setMeetingContext] = useState<any | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [sttStatus, setSttStatus] = useState<'idle' | 'processing' | 'error'>('idle');
  const [sttErrorMessage, setSttErrorMessage] = useState<string | null>(null);
  const [lastSuccessfulTranscriptTime, setLastSuccessfulTranscriptTime] = useState<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const systemStreamRef = useRef<MediaStream | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const speechRecRef = useRef<any>(null);
  const elapsedRef = useRef(0);
  const sessionScratchRef = useRef<{ personalNotes?: string; title?: string; userEditedTitle?: boolean }>({});

  const api = getElectronAPI();

  const setSessionScratch = useCallback((scratch: { personalNotes?: string; title?: string; userEditedTitle?: boolean }) => {
    sessionScratchRef.current = { ...sessionScratchRef.current, ...scratch };
  }, []);
  const getSessionScratch = useCallback(() => ({ ...sessionScratchRef.current }), []);

  useEffect(() => {
    if (!api) return;

    const cleanupTranscript = api.recording.onTranscriptChunk((chunk) => {
      if (chunk.text.startsWith("[STT Error:")) {
        const message = chunk.text.replace(/^\[STT Error:\s*/i, "").replace(/\]$/, "").trim() || "Transcription failed.";
        toast.error(message, { duration: 6000 });
      } else if (chunk.speaker !== "System") {
        // Only real You/Others lines count for "stale transcript" — ignore [STT: …] system hints
        setLastSuccessfulTranscriptTime(Date.now());
      }
      setTranscriptLines((prev) => [...prev, chunk]);
    });

    // LLM post-processing: replace raw transcript line with corrected version
    const cleanupCorrected = api.recording.onCorrectedTranscript?.((corrected) => {
      setTranscriptLines((prev) => {
        // Find the matching line by time + speaker + original text
        const idx = prev.findIndex(
          (l) => l.time === corrected.time && l.speaker === corrected.speaker && l.text === corrected.originalText
        );
        if (idx === -1) return prev;
        const updated = [...prev];
        updated[idx] = { ...updated[idx], text: corrected.text };
        return updated;
      });
    });

    // Note: auto-paused/auto-resumed are not currently emitted (auto-pause on silence is disabled in capture.ts).
    // Manual pause is the only path that updates isRecording.
    const cleanupStatus = api.recording.onRecordingStatus((status) => {
      if (status.state === 'auto-paused') {
        setActiveSession(prev => prev ? { ...prev, isRecording: false } : null);
      } else if (status.state === 'auto-resumed') {
        setActiveSession(prev => prev ? { ...prev, isRecording: true } : null);
      } else if (status.state === 'stt-processing') {
        setSttStatus('processing');
        setSttErrorMessage(null);
      } else if (status.state === 'stt-idle') {
        setSttStatus(status.error ? 'error' : 'idle');
        setSttErrorMessage(status.error ?? null);
      }
    });

    cleanupRef.current = cleanupTranscript;

    return () => { cleanupTranscript(); cleanupCorrected?.(); cleanupStatus(); };
  }, []);

  const removeTranscriptLineAt = useCallback((index: number) => {
    setTranscriptLines((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  const removeTranscriptLinesAt = useCallback((indices: number[]) => {
    const set = new Set(indices);
    setTranscriptLines((prev) => prev.filter((_, i) => !set.has(i)));
  }, []);

  // Elapsed time is now derived by consumers via useElapsedTime(startTime, isRecording)
  // instead of ticking every second in context (which caused re-render cascades).

  const startSession = useCallback((noteId: string) => {
    const now = Date.now();
    setActiveSession({ noteId, title: "New note", elapsedSeconds: 0, isRecording: true, startTime: now });
    setTranscriptLines([]);
    if (api) {
      api.app.updateTrayMeetingInfo?.({ title: "New note", startTime: now });
    }
  }, [api]);

  const resumeSession = useCallback((noteId: string, title: string, elapsedSeconds: number) => {
    const startTime = Date.now() - elapsedSeconds * 1000;
    setActiveSession({ noteId, title: title || "New note", elapsedSeconds, isRecording: true, startTime });
    if (api) {
      api.app.updateTrayMeetingInfo?.({ title: title || "New note", startTime });
    }
  }, [api]);

  const updateSession = useCallback((updates: Partial<RecordingSession>) => {
    setActiveSession((prev) => {
      if (!prev) return null;
      const next = { ...prev, ...updates };
      if (api && ('title' in updates || 'isRecording' in updates || 'startTime' in updates)) {
        api.app.updateTrayMeetingInfo?.({ title: next.title, startTime: next.startTime });
      }
      return next;
    });
  }, [api]);

  const clearSession = useCallback(() => {
    setActiveSession(null);
    setTranscriptLines([]);
    setSttStatus('idle');
    setSttErrorMessage(null);
    setLastSuccessfulTranscriptTime(null);
    setCaptureError(null);
    sessionScratchRef.current = {};
    if (api) {
      api.app.updateTrayMeetingInfo?.(null);
    }
  }, [api]);

  // Keep elapsed ref in sync for Web Speech API callback — derive from startTime
  useEffect(() => {
    if (activeSession?.startTime && activeSession?.isRecording) {
      const updateRef = () => { elapsedRef.current = Math.floor((Date.now() - activeSession.startTime!) / 1000); };
      updateRef();
      const id = setInterval(updateRef, 5000); // Low-frequency update for ref only (not state)
      return () => clearInterval(id);
    } else {
      elapsedRef.current = 0;
    }
  }, [activeSession?.startTime, activeSession?.isRecording]);

  const stopSpeechRecognition = useCallback(() => {
    if (speechRecRef.current) {
      try { speechRecRef.current.abort(); } catch {}
      speechRecRef.current = null;
    }
    setUsingWebSpeech(false);
  }, []);

  const startSpeechRecognition = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      console.warn('Web Speech API not available in this environment');
      return;
    }

    stopSpeechRecognition();

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          const text = event.results[i][0].transcript;
          if (text && text.trim()) {
            const seconds = elapsedRef.current;
            const m = Math.floor(seconds / 60);
            const s = seconds % 60;
            setTranscriptLines(prev => [...prev, {
              speaker: 'You',
              time: `${m}:${String(s).padStart(2, '0')}`,
              text: text.trim()
            }]);
          }
        }
      }
    };

    recognition.onerror = (event: any) => {
      console.warn('Speech recognition error:', event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        speechRecRef.current = null;
        setUsingWebSpeech(false);
      }
    };

    recognition.onend = () => {
      if (speechRecRef.current === recognition) {
        try { recognition.start(); } catch {}
      }
    };

    try {
      recognition.start();
      speechRecRef.current = recognition;
      setUsingWebSpeech(true);
    } catch (err) {
      console.warn('Failed to start speech recognition:', err);
    }
  }, [stopSpeechRecognition]);

  const clearCaptureError = useCallback(() => setCaptureError(null), []);

  /** Release mic + system audio + worklet/context only. Does not call recording.stop/pause. */
  const releaseMediaOnly = useCallback(() => {
    if (workletNodeRef.current) {
      try {
        workletNodeRef.current.port.postMessage({ type: 'stop' });
        workletNodeRef.current.disconnect();
      } catch {}
      workletNodeRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (systemStreamRef.current) {
      systemStreamRef.current.getTracks().forEach(t => t.stop());
      systemStreamRef.current = null;
    }
    setIsCapturing(false);
  }, []);

  /** Acquire mic + optional system audio and wire to worklet. Sets refs and isCapturing. Caller must call api.recording.start or resume. */
  const acquireMediaAndWorklet = useCallback(async (preferredDeviceId: string | undefined) => {
    if (!api) return;
    const audioCtx = new AudioContext({ sampleRate: 16000 });
    audioContextRef.current = audioCtx;

    const workletCandidates = isElectron
      ? [
          new URL('./audio-processor.js', window.location.href).href,
          '/audio-processor.js',
          new URL('audio-processor.js', window.location.origin + '/').href,
        ]
      : ['/audio-processor.js'];
    let workletLoaded = false;
    for (const workletUrl of workletCandidates) {
      try {
        await audioCtx.audioWorklet.addModule(workletUrl);
        workletLoaded = true;
        break;
      } catch (e) {
        console.warn('Worklet load failed for', workletUrl, e);
      }
    }
    if (!workletLoaded) {
      await audioCtx.close();
      audioContextRef.current = null;
      throw new Error('Could not load audio capture. Try restarting the app.');
    }

    const merger = audioCtx.createChannelMerger(2);
    const worklet = new AudioWorkletNode(audioCtx, 'syag-audio-processor');
    workletNodeRef.current = worklet;

    worklet.port.onmessage = (event: MessageEvent) => {
      if (event.data.type === 'audio-chunk') {
        const channel = event.data.channel !== undefined ? event.data.channel : 0;
        api.recording.sendAudioChunk(event.data.pcm, channel);
      }
    };

    try {
      // Read noise suppression preference from DB (default: ON)
      let useNoiseSuppression = true;
      try {
        const noisePref = await api.db.settings.get('audio-noise-suppression');
        if (noisePref === 'false') useNoiseSuppression = false;
      } catch {}
      const audioConstraints: MediaTrackConstraints = {
        sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: useNoiseSuppression,
      };
      if (preferredDeviceId) {
        audioConstraints.deviceId = { exact: preferredDeviceId };
      }
      const micStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      micStreamRef.current = micStream;
      const micSource = audioCtx.createMediaStreamSource(micStream);
      micSource.connect(merger, 0, 0);
    } catch (micErr) {
      console.warn('Microphone access denied or unavailable:', micErr);
    }

    try {
      const sources = await api.audio.getDesktopSources();
      if (sources.length > 0) {
        const systemStream = await (navigator.mediaDevices as any).getUserMedia({
          audio: { mandatory: { chromeMediaSource: 'desktop' } },
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              minWidth: 1, maxWidth: 1, minHeight: 1, maxHeight: 1,
            },
          },
        });
        systemStream.getVideoTracks().forEach((t: MediaStreamTrack) => t.stop());
        systemStreamRef.current = systemStream;
        const systemSource = audioCtx.createMediaStreamSource(systemStream);
        systemSource.connect(merger, 0, 1);
      }
    } catch (sysErr) {
      console.warn('System audio capture not available:', sysErr);
    }

    if (!micStreamRef.current && !systemStreamRef.current) {
      releaseMediaOnly();
      setCaptureError(CAPTURE_ERROR_NO_SOURCE);
      throw new Error(CAPTURE_ERROR_NO_SOURCE);
    }

    merger.connect(worklet);
    worklet.connect(audioCtx.destination);
    setIsCapturing(true);
  }, [api, releaseMediaOnly]);

  const startAudioCapture = useCallback(async (sttModel: string, options?: { meetingTitle?: string; vocabulary?: string[] }) => {
    if (!api) return;
    setCaptureError(null);
    setSttStatus('idle');
    setSttErrorMessage(null);
    setLastSuccessfulTranscriptTime(null);

    releaseMediaOnly();

    // Read the user-selected audio device from DB
    let preferredDeviceId: string | undefined;
    try {
      const storedDevice = await api.db.settings.get('audio-input-device');
      if (storedDevice) preferredDeviceId = storedDevice;
    } catch {}

    try {
      // Force-stop any lingering backend recording before starting fresh
      try { await api.recording.stop(); } catch {}

      const started = await api.recording.start({
        sttModel: sttModel || '',
        meetingTitle: options?.meetingTitle,
        vocabulary: options?.vocabulary,
      });
      if (started === false) {
        console.warn('Backend recording failed to start (returned false). Retrying after stop...');
        await api.recording.stop();
        await api.recording.start({
          sttModel: sttModel || '',
          meetingTitle: options?.meetingTitle,
          vocabulary: options?.vocabulary,
        });
      }

      await acquireMediaAndWorklet(preferredDeviceId);

      // When no STT model is configured, use Web Speech API as zero-config fallback
      if (!sttModel) {
        startSpeechRecognition();
      }
    } catch (err) {
      console.error('Failed to start audio capture:', err);
      setIsCapturing(false);
      setCaptureError(err instanceof Error ? err.message : 'Failed to start audio capture.');
      // Even if full audio capture failed, try Web Speech API for basic transcription
      if (!sttModel) {
        startSpeechRecognition();
      }
      throw err;
    }
  }, [api, releaseMediaOnly, acquireMediaAndWorklet, startSpeechRecognition]);

  const pauseAudioCapture = useCallback(async () => {
    releaseMediaOnly();
    if (api) {
      await api.recording.pause();
    }
    if (speechRecRef.current) {
      try { speechRecRef.current.abort(); } catch {}
      speechRecRef.current = null;
      setUsingWebSpeech(false);
    }
    setActiveSession(prev => {
      if (!prev) return null;
      return { ...prev, isRecording: false };
    });
  }, [api, releaseMediaOnly]);

  const resumeAudioCapture = useCallback(async (sttModel?: string) => {
    if (!api) return;
    setCaptureError(null);
    let preferredDeviceId: string | undefined;
    try {
      const storedDevice = await api.db.settings.get('audio-input-device');
      if (storedDevice) preferredDeviceId = storedDevice;
    } catch {}
    try {
      await acquireMediaAndWorklet(preferredDeviceId);
      await api.recording.resume({ sttModel: sttModel ?? undefined });
      setActiveSession(prev => {
        if (!prev) {
          console.warn('resumeAudioCapture: activeSession is null — caller should restore session via resumeSession() first');
          return null;
        }
        return { ...prev, isRecording: true };
      });
      if (!sttModel) {
        startSpeechRecognition();
      }
    } catch (err) {
      console.error('Failed to resume audio capture:', err);
      setIsCapturing(false);
      setCaptureError(err instanceof Error ? err.message : 'Failed to resume audio capture.');
      throw err;
    }
  }, [api, acquireMediaAndWorklet, startSpeechRecognition]);

  const stopAudioCapture = useCallback(async () => {
    stopSpeechRecognition();
    releaseMediaOnly();
    if (api) {
      await api.recording.stop();
    }
    setSttStatus('idle');
    setSttErrorMessage(null);
  }, [api, releaseMediaOnly, stopSpeechRecognition]);

  const isActive = !!activeSession;

  return (
    <RecordingContext.Provider value={{
      activeSession, isActive, startSession, resumeSession, updateSession, clearSession,
      transcriptLines, removeTranscriptLineAt, removeTranscriptLinesAt, isCapturing, usingWebSpeech, captureError, clearCaptureError,
      sttStatus, sttErrorMessage, lastSuccessfulTranscriptTime,
      startAudioCapture, stopAudioCapture, pauseAudioCapture, resumeAudioCapture,
      setSessionScratch, getSessionScratch,
      meetingContext, setMeetingContext
    }}>
      {children}
    </RecordingContext.Provider>
  );
}

export function useRecording() {
  const ctx = useContext(RecordingContext);
  if (!ctx) throw new Error("useRecording must be used within RecordingProvider");
  return ctx;
}
