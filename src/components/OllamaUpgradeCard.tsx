import { useState } from "react";
import { Zap, ExternalLink, X } from "lucide-react";
import { getElectronAPI } from "@/lib/electron-api";

/**
 * Shown on homepage when using bundled models (Track 2) and Ollama is not installed.
 * Encourages upgrade to Ollama for better quality.
 */
export function OllamaUpgradeCard() {
  const [dismissed, setDismissed] = useState(false);
  const api = getElectronAPI();

  if (dismissed) return null;

  const handleDismiss = async () => {
    setDismissed(true);
    try {
      await api?.db?.settings?.set('ollama-upgrade-dismissed', 'true');
    } catch {}
  };

  const handleInstall = () => {
    // Open Ollama website
    if (api?.app?.openExternal) {
      api.app.openExternal('https://ollama.com/download');
    } else {
      window.open('https://ollama.com/download', '_blank');
    }
  };

  return (
    <div
      className="rounded-lg border border-primary/20 bg-primary/[0.03] p-4 relative"
    >
      <button
        onClick={handleDismiss}
        className="absolute top-2.5 right-2.5 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0 mt-0.5">
          <Zap className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0 pr-4">
          <h3 className="text-[13px] font-semibold text-foreground mb-0.5">
            Want better AI quality?
          </h3>
          <p className="text-[12px] text-muted-foreground leading-relaxed mb-3">
            Install Ollama to unlock Qwen3 8B — 95% cloud quality, runs locally on your Mac. Free and private.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleInstall}
              className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground transition-all hover:opacity-90"
            >
              <ExternalLink className="h-3 w-3" />
              Install Ollama
            </button>
            <button
              onClick={handleDismiss}
              className="rounded-md px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
            >
              Maybe later
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
