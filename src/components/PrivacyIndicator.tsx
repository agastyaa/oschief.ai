import { Lock, Cloud } from "lucide-react";
import { useModelSettings } from "@/contexts/ModelSettingsContext";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function PrivacyIndicator() {
  const { selectedAIModel, selectedSTTModel } = useModelSettings();
  const [showDetail, setShowDetail] = useState(false);

  const isCloudAI = selectedAIModel?.includes("openai:") || selectedAIModel?.includes("anthropic:") ||
    selectedAIModel?.includes("google:") || selectedAIModel?.includes("groq:");
  const isCloudSTT = selectedSTTModel?.includes("openai:") || selectedSTTModel?.includes("deepgram:") ||
    selectedSTTModel?.includes("assemblyai:") || selectedSTTModel?.includes("groq:");

  const isFullyLocal = !isCloudAI && !isCloudSTT;
  const label = isFullyLocal ? "Local" : "Cloud";
  const Icon = isFullyLocal ? Lock : Cloud;

  return (
    <div className="relative">
      <button
        onClick={() => setShowDetail(!showDetail)}
        className={cn(
          "flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium transition-colors",
          isFullyLocal
            ? "text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
            : "text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
        )}
      >
        <Icon className="h-3 w-3" />
        {label}
      </button>
      {showDetail && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setShowDetail(false)} />
          <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-lg border border-border bg-card p-3 shadow-lg text-xs space-y-2">
            <div className="font-medium text-foreground">Data boundary</div>
            <div className="flex items-center gap-2">
              <Lock className="h-3 w-3 text-emerald-500 flex-shrink-0" />
              <span><strong>Audio</strong> — always stays on your device</span>
            </div>
            <div className="flex items-center gap-2">
              {isCloudSTT
                ? <Cloud className="h-3 w-3 text-amber-500 flex-shrink-0" />
                : <Lock className="h-3 w-3 text-emerald-500 flex-shrink-0" />
              }
              <span><strong>Transcription</strong> — {isCloudSTT ? "text sent to cloud STT" : "processed on device"}</span>
            </div>
            <div className="flex items-center gap-2">
              {isCloudAI
                ? <Cloud className="h-3 w-3 text-amber-500 flex-shrink-0" />
                : <Lock className="h-3 w-3 text-emerald-500 flex-shrink-0" />
              }
              <span><strong>AI notes & chat</strong> — {isCloudAI ? "text sent to cloud LLM" : "processed on device"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="h-3 w-3 text-emerald-500 flex-shrink-0" />
              <span><strong>Database</strong> — always local (SQLite)</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
