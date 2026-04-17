import { useState, useEffect, useRef } from 'react'
import { Mic, MicOff, MonitorSpeaker, Loader2, CheckCircle2, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getElectronAPI } from '@/lib/electron-api'

type AudioTestStatus = "idle" | "testing" | "success" | "error"

export function AudioTestPanel({ selectedDeviceId }: { selectedDeviceId: string }) {
  const api = getElectronAPI();

  const [micStatus, setMicStatus] = useState<AudioTestStatus>("idle");
  const [micPermission, setMicPermission] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnimRef = useRef<number>(0);

  const [sysStatus, setSysStatus] = useState<AudioTestStatus>("idle");
  const [sysPermission, setSysPermission] = useState<string | null>(null);
  const [sysError, setSysError] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (micAnimRef.current) cancelAnimationFrame(micAnimRef.current);
    };
  }, []);

  const testMicrophone = async () => {
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (micAnimRef.current) cancelAnimationFrame(micAnimRef.current);

    setMicStatus("testing");
    setMicError(null);
    setMicLevel(0);

    try {
      if (api?.permissions?.checkMicrophone) {
        const perm = await api.permissions.checkMicrophone();
        setMicPermission(perm);
        if (perm === "denied" || perm === "restricted") {
          if (api.permissions.requestMicrophone) {
            const granted = await api.permissions.requestMicrophone();
            if (!granted) {
              setMicStatus("error");
              setMicError("Microphone access denied. Grant permission in System Settings → Privacy & Security → Microphone.");
              return;
            }
            setMicPermission("granted");
          }
        }
      }

      const constraints: MediaStreamConstraints = {
        audio: {
          ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      micStreamRef.current = stream;

      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let peakSeen = false;

      const tick = () => {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        const normalized = Math.min(1, avg / 80);
        setMicLevel(normalized);
        if (normalized > 0.05) peakSeen = true;
        micAnimRef.current = requestAnimationFrame(tick);
      };
      tick();

      await new Promise(r => setTimeout(r, 3000));

      cancelAnimationFrame(micAnimRef.current);
      stream.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
      audioCtx.close();

      if (peakSeen) {
        setMicStatus("success");
      } else {
        setMicStatus("error");
        setMicError("Microphone captured but no audio detected. Try speaking louder or check your input device.");
      }
    } catch (err: any) {
      setMicStatus("error");
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setMicError("Microphone access denied. Grant permission in System Settings → Privacy & Security → Microphone.");
      } else if (err.name === "NotFoundError") {
        setMicError("No microphone found. Connect a microphone and try again.");
      } else {
        setMicError(err.message || "Failed to access microphone.");
      }
    }
  };

  const testSystemAudio = async () => {
    setSysStatus("testing");
    setSysError(null);

    try {
      if (api?.permissions?.checkScreenRecording) {
        const perm = await api.permissions.checkScreenRecording();
        setSysPermission(perm);
        if (perm === "denied" || perm === "restricted" || perm === "not-determined") {
          if (api.permissions.requestScreenRecording) {
            await api.permissions.requestScreenRecording();
            const perm2 = await api.permissions.checkScreenRecording();
            setSysPermission(perm2);
            if (perm2 !== "granted") {
              setSysStatus("error");
              setSysError("Screen Recording permission required for system audio. Grant in System Settings → Privacy & Security → Screen Recording.");
              return;
            }
          }
        }
      }

      if (api?.audio?.getDesktopSources) {
        const sources = await api.audio.getDesktopSources();
        if (sources && sources.length > 0) {
          setSysStatus("success");
        } else {
          setSysStatus("error");
          setSysError("No desktop audio sources found. Ensure Screen Recording permission is granted.");
        }
      } else {
        setSysStatus("error");
        setSysError("System audio capture is not available in this environment.");
      }
    } catch (err: any) {
      setSysStatus("error");
      setSysError(err.message || "Failed to check system audio.");
    }
  };

  const statusIcon = (status: AudioTestStatus) => {
    switch (status) {
      case "testing": return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
      case "success": return <CheckCircle2 className="h-3.5 w-3.5 text-green" />;
      case "error": return <XCircle className="h-3.5 w-3.5 text-destructive" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-3">
      <label className="text-body-sm font-medium text-foreground mb-1 block">Audio test</label>
      <p className="text-[11px] text-muted-foreground -mt-2 mb-2">
        Check that your microphone and system audio are working before starting a recording.
      </p>

      <div className="rounded-md border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary flex-shrink-0">
              {micStatus === "error" ? <MicOff className="h-3.5 w-3.5 text-destructive" /> : <Mic className="h-3.5 w-3.5 text-muted-foreground" />}
            </div>
            <div className="min-w-0">
              <span className="text-body-sm text-foreground block">Microphone</span>
              {micPermission && (
                <span className={cn("text-[10px]", micPermission === "granted" ? "text-green" : "text-muted-foreground")}>
                  Permission: {micPermission}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {statusIcon(micStatus)}
            <button
              onClick={testMicrophone}
              disabled={micStatus === "testing"}
              className={cn(
                "rounded-md border px-3 py-1.5 text-[11px] font-medium transition-colors",
                micStatus === "testing"
                  ? "border-border bg-secondary text-muted-foreground cursor-not-allowed"
                  : "border-border bg-card text-foreground hover:bg-secondary"
              )}
            >
              {micStatus === "testing" ? "Listening…" : micStatus === "idle" ? "Test" : "Retest"}
            </button>
          </div>
        </div>

        {micStatus === "testing" && (
          <div className="mt-2.5">
            <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-[width] duration-100"
                style={{ width: `${Math.max(2, micLevel * 100)}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Speak into your mic — you should see the bar move</p>
          </div>
        )}

        {micStatus === "success" && (
          <p className="text-[11px] text-green mt-2">Microphone is working — audio detected.</p>
        )}

        {micError && (
          <p className="text-[11px] text-destructive mt-2">{micError}</p>
        )}
      </div>

      <div className="rounded-md border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary flex-shrink-0">
              <MonitorSpeaker className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <span className="text-body-sm text-foreground block">System audio</span>
              {sysPermission && (
                <span className={cn("text-[10px]", sysPermission === "granted" ? "text-green" : "text-muted-foreground")}>
                  Screen Recording: {sysPermission}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {statusIcon(sysStatus)}
            <button
              onClick={testSystemAudio}
              disabled={sysStatus === "testing"}
              className={cn(
                "rounded-md border px-3 py-1.5 text-[11px] font-medium transition-colors",
                sysStatus === "testing"
                  ? "border-border bg-secondary text-muted-foreground cursor-not-allowed"
                  : "border-border bg-card text-foreground hover:bg-secondary"
              )}
            >
              {sysStatus === "testing" ? "Checking…" : sysStatus === "idle" ? "Test" : "Retest"}
            </button>
          </div>
        </div>

        {sysStatus === "success" && (
          <p className="text-[11px] text-green mt-2">System audio capture is available.</p>
        )}

        {sysError && (
          <p className="text-[11px] text-destructive mt-2">{sysError}</p>
        )}
      </div>
    </div>
  );
}
