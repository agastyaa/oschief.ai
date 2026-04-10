import { Lock, Cloud } from "lucide-react";
import { useModelSettings } from "@/contexts/ModelSettingsContext";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export function PrivacyIndicator() {
  const { selectedAIModel, selectedSTTModel } = useModelSettings();
  const [showDetail, setShowDetail] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});

  const isCloudAI = selectedAIModel?.includes("openai:") || selectedAIModel?.includes("anthropic:") ||
    selectedAIModel?.includes("google:") || selectedAIModel?.includes("groq:");
  const isCloudSTT = selectedSTTModel?.includes("openai:") || selectedSTTModel?.includes("deepgram:") ||
    selectedSTTModel?.includes("assemblyai:") || selectedSTTModel?.includes("groq:");

  const isFullyLocal = !isCloudAI && !isCloudSTT;
  const label = isFullyLocal ? "Local" : "Cloud";
  const Icon = isFullyLocal ? Lock : Cloud;

  useEffect(() => {
    if (showDetail && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      // Ensure popup doesn't overflow viewport right edge (w-64 = 256px)
      const popupWidth = 288;
      const maxLeft = window.innerWidth - popupWidth - 8;
      setPopupStyle({
        position: "fixed",
        top: rect.bottom + 4,
        left: Math.min(Math.max(8, rect.left), maxLeft),
        zIndex: 9999,
      });
    }
  }, [showDetail]);

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setShowDetail(!showDetail)}
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
          isFullyLocal
            ? "text-green hover:bg-green-bg"
            : "text-amber hover:bg-amber-bg"
        )}
      >
        <Icon className="h-3 w-3" />
        {label}
      </button>
      {showDetail && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setShowDetail(false)} />
          <div style={popupStyle} className="w-72 rounded-[10px] border border-border bg-card p-3 shadow-lg text-xs space-y-2">
            <div className="font-medium text-foreground">Data boundary</div>
            <div className="flex items-start gap-2">
              <Lock className="h-3 w-3 text-green flex-shrink-0 mt-0.5" />
              <span><strong>Audio</strong> — always stays on your device</span>
            </div>
            <div className="flex items-start gap-2">
              {isCloudSTT
                ? <Cloud className="h-3 w-3 text-amber flex-shrink-0 mt-0.5" />
                : <Lock className="h-3 w-3 text-green flex-shrink-0 mt-0.5" />
              }
              <span><strong>Transcription</strong> — {isCloudSTT ? "text sent to cloud STT" : "processed on device"}</span>
            </div>
            <div className="flex items-start gap-2">
              {isCloudAI
                ? <Cloud className="h-3 w-3 text-amber flex-shrink-0 mt-0.5" />
                : <Lock className="h-3 w-3 text-green flex-shrink-0 mt-0.5" />
              }
              <span><strong>AI notes & chat</strong> — {isCloudAI ? "text sent to cloud LLM" : "processed on device"}</span>
            </div>
            <div className="flex items-start gap-2">
              <Lock className="h-3 w-3 text-green flex-shrink-0 mt-0.5" />
              <span><strong>Database</strong> — always local (SQLite)</span>
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
