import { createContext, useContext, useState, useCallback, useEffect, useRef, type ReactNode } from "react";
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
  isCapturing: boolean;
  usingWebSpeech: boolean;
  /** Set when capture failed (e.g. no mic, worklet load failed). Clear on retry or when user dismisses. */
  captureError: string | null;
  clearCaptureError: () => void;
  startAudioCapture: (sttModel: string) => Promise<void>;
  stopAudioCapture: () => Promise<void>;
  pauseAudioCapture: () => Promise<void>;
  resumeAudioCapture: (sttModel?: string) => Promise<void>;
  /** Scratch for current session (personalNotes, title) so indicator pause-and-summarize can restore state when navigating back. */
  setSessionScratch: (scratch: { personalNotes?: string; title?: string }) => void;
  getSessionScratch: () => { personalNotes?: string; title?: string };
}

const RecordingContext = createContext<RecordingContextType | undefined>(undefined);

export function RecordingProvider({ children }: { children: ReactNode }) {
  const [activeSession, setActiveSession] = useState<RecordingSession | null>(null);
  const [transcriptLines, setTranscriptLines] = useState<TranscriptLine[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [usingWebSpeech, setUsingWebSpeech] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const workletNodeRef = useRef<AudioWorkletNode | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const systemStreamRef = useRef<MediaStream | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const speechRecRef = useRef<any>(null);
  const elapsedRef = useRef(0);
  const sessionScratchRef = useRef<{ personalNotes?: string; title?: string }>({});

  const api = getElectronAPI();

  const setSessionScratch = useCallback((scratch: { personalNotes?: string; title?: string }) => {
    sessionScratchRef.current = { ...sessionScratchRef.current, ...scratch };
  }, []);
  const getSessionScratch = useCallback(() => ({ ...sessionScratchRef.current }), []);

  useEffect(() => {
    if (!api) return;

    const cleanupTranscript = api.recording.onTranscriptChunk((chunk) => {
      setTranscriptLines((prev) => [...prev, chunk]);
    });

    const cleanupStatus = api.recording.onRecordingStatus((status) => {
      if (status.state === 'auto-paused') {
        setActiveSession(prev => prev ? { ...prev, isRecording: false } : null);
      } else if (status.state === 'auto-resumed') {
        setActiveSession(prev => prev ? { ...prev, isRecording: true } : null);
      }
    });

    cleanupRef.current = cleanupTranscript;

    return () => { cleanupTranscript(); cleanupStatus(); };
  }, []);

  const removeTranscriptLineAt = useCallback((index: number) => {
    setTranscriptLines((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      return prev.filter((_, i) => i !== index);
    });
  }, []);

  // Global elapsed timer -- ticks regardless of which page is mounted; sync elapsed to tray so tray matches in-app
  useEffect(() => {
    if (!activeSession?.isRecording) return;
    const id = setInterval(() => {
      setActiveSession((prev) => {
        if (!prev || !prev.isRecording) return prev;
        const next = { ...prev, elapsedSeconds: prev.elapsedSeconds + 1 };
        if (api) {
          api.app.updateTrayMeetingInfo?.({ title: next.title, startTime: next.startTime, elapsedSeconds: next.elapsedSeconds });
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [activeSession?.isRecording, api]);

  const startSession = useCallback((noteId: string) => {
    const now = Date.now();
    setActiveSession({ noteId, title: "New note", elapsedSeconds: 0, isRecording: true, startTime: now });
    setTranscriptLines([]);
    // Inform tray about meeting info
    if (api) {
      api.app.updateTrayMeetingInfo?.({ title: "New note", startTime: now, elapsedSeconds: 0 });
    }
  }, [api]);

  const resumeSession = useCallback((noteId: string, title: string, elapsedSeconds: number) => {
    const startTime = Date.now() - elapsedSeconds * 1000;
    setActiveSession({ noteId, title: title || "New note", elapsedSeconds, isRecording: true, startTime });
    if (api) {
      api.app.updateTrayMeetingInfo?.({ title: title || "New note", startTime, elapsedSeconds });
    }
  }, [api]);

  const updateSession = useCallback((updates: Partial<RecordingSession>) => {
    setActiveSession((prev) => {
      if (!prev) return null;
      const next = { ...prev, ...updates };
      // Sync title and elapsed to tray
      if ((updates.title != null || updates.elapsedSeconds != null) && api) {
        api.app.updateTrayMeetingInfo?.({ title: next.title, startTime: next.startTime, elapsedSeconds: next.elapsedSeconds });
      }
      return next;
    });
  }, [api]);

  const clearSession = useCallback(() => {
    setActiveSession(null);
    sessionScratchRef.current = {};
    if (api) {
      api.app.updateTrayMeetingInfo?.(null);
    }
  }, [api]);

  // Keep elapsed ref in sync for Web Speech API callback
  useEffect(() => {
    elapsedRef.current = activeSession?.elapsedSeconds ?? 0;
  }, [activeSession?.elapsedSeconds]);

  const stopSpeechRecognition = useCallback(() => {
    if (speechRecRef.current) {
      try { speechRecRef.current.abort(); } catch { /* ignore */ }
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
        try { recognition.start(); } catch { /* ignore */ }
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

  const startAudioCapture = useCallback(async (sttModel: string) => {
    if (!api) return;
    setCaptureError(null);

    // Read the user-selected audio device from DB
    let preferredDeviceId: string | undefined;
    try {
      const storedDevice = await api.db.settings.get('audio-input-device');
      if (storedDevice) preferredDeviceId = storedDevice;
    } catch { /* ignore */ }

    try {
      await api.recording.start({ sttModel: sttModel || '' });

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
        const msg = 'Could not load audio capture. Try restarting the app.';
        setCaptureError(msg);
        setIsCapturing(false);
        throw new Error(msg);
      }

      const merger = audioCtx.createChannelMerger(2);
      const worklet = new AudioWorkletNode(audioCtx, 'syag-audio-processor');
      workletNodeRef.current = worklet;

      worklet.port.onmessage = (event) => {
        if (event.data.type === 'audio-chunk') {
          const channel = event.data.channel !== undefined ? event.data.channel : 0;
          api.recording.sendAudioChunk(event.data.pcm, channel);
        }
      };

      // 1. Capture microphone audio (use user-selected device if set)
      try {
        const audioConstraints: MediaTrackConstraints = {
          sampleRate: 16000, channelCount: 1, echoCancellation: true, noiseSuppression: true,
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

      // 2. Capture system audio via desktopCapturer
      try {
        const sources = await api.audio.getDesktopSources();
        if (sources.length > 0) {
          const systemStream = await (navigator.mediaDevices as any).getUserMedia({
            audio: {
              mandatory: {
                chromeMediaSource: 'desktop',
              }
            },
            video: {
              mandatory: {
                chromeMediaSource: 'desktop',
                minWidth: 1,
                maxWidth: 1,
                minHeight: 1,
                maxHeight: 1,
              }
            }
          });
          // Remove the video track, we only need audio
          systemStream.getVideoTracks().forEach((t: MediaStreamTrack) => t.stop());

          systemStreamRef.current = systemStream;
          const systemSource = audioCtx.createMediaStreamSource(systemStream);
          systemSource.connect(merger, 0, 1);
        }
      } catch (sysErr) {
        console.warn('System audio capture not available (screen recording permission may be needed):', sysErr);
      }

      if (!micStreamRef.current && !systemStreamRef.current) {
        setCaptureError(CAPTURE_ERROR_NO_SOURCE);
      }

      merger.connect(worklet);
      worklet.connect(audioCtx.destination);
      setIsCapturing(true);

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
  }, [api, startSpeechRecognition]);

  const pauseAudioCapture = useCallback(async () => {
    if (api) {
      await api.recording.pause();
    }
    if (speechRecRef.current) {
      try { speechRecRef.current.abort(); } catch { /* ignore */ }
      speechRecRef.current = null;
      setUsingWebSpeech(false);
    }
    setActiveSession(prev => prev ? { ...prev, isRecording: false } : null);
  }, [api]);

  const resumeAudioCapture = useCallback(async (sttModel?: string) => {
    if (api) {
      await api.recording.resume();
    }
    setActiveSession(prev => prev ? { ...prev, isRecording: true } : null);
    // Restart Web Speech API fallback if no STT model
    if (!sttModel && !speechRecRef.current) {
      startSpeechRecognition();
    }
  }, [api, startSpeechRecognition]);

  const stopAudioCapture = useCallback(async () => {
    setIsCapturing(false);
    stopSpeechRecognition();

    if (workletNodeRef.current) {
      workletNodeRef.current.port.postMessage({ type: 'stop' });
      workletNodeRef.current.disconnect();
      workletNodeRef.current = null;
    }

    if (audioContextRef.current) {
      await audioContextRef.current.close();
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

    if (api) {
      await api.recording.stop();
    }
  }, [api, stopSpeechRecognition]);

  const isActive = !!activeSession;

  return (
    <RecordingContext.Provider value={{
      activeSession, isActive, startSession, resumeSession, updateSession, clearSession,
      transcriptLines, removeTranscriptLineAt, isCapturing, usingWebSpeech, captureError, clearCaptureError,
      startAudioCapture, stopAudioCapture, pauseAudioCapture, resumeAudioCapture,
      setSessionScratch, getSessionScratch
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
