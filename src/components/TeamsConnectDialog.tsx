import { useState } from "react";
import { X, Loader2, Check, AlertCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { getElectronAPI } from "@/lib/electron-api";

interface TeamsConnectDialogProps {
  open: boolean;
  onClose: () => void;
  onConnected: (webhookUrl: string, channelName?: string) => void;
}

export interface TeamsConfig {
  webhookUrl: string;
  channelName?: string;
}

export function TeamsConnectDialog({ open, onClose, onConnected }: TeamsConnectDialogProps) {
  const [webhookUrl, setWebhookUrl] = useState("");
  const [channelName, setChannelName] = useState("");
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const api = getElectronAPI();

  const handleTest = async () => {
    if (!webhookUrl) {
      setError("Webhook URL is required");
      return;
    }
    // Teams webhook URLs can be from multiple domains
    const validPrefixes = [
      "https://outlook.office.com/webhook/",
      "https://outlook.office365.com/webhook/",
      "https://prod-",
      "https://workflows.office.com/",
    ];
    const isValid = validPrefixes.some((p) => webhookUrl.startsWith(p)) || webhookUrl.includes(".webhook.office.com/");
    if (!isValid) {
      setError("Invalid webhook URL — must be a Microsoft Teams / Power Automate webhook URL");
      return;
    }

    setTesting(true);
    setError("");
    setSuccess("");

    try {
      const result = await api?.teams?.testWebhook(webhookUrl);
      if (result?.ok) {
        setSuccess("Connected! Test message sent to channel.");
        const config: TeamsConfig = {
          webhookUrl,
          channelName: channelName.trim() || undefined,
        };
        await api?.keychain?.set("teams-config", JSON.stringify(config));
        onConnected(webhookUrl, channelName.trim() || undefined);
      } else {
        setError(result?.error || "Connection failed — check your webhook URL");
      }
    } catch (err: any) {
      setError(err.message || "Connection failed");
    } finally {
      setTesting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {/* Teams icon */}
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
              <path d="M20.625 6.547h-3.516V4.36a2.11 2.11 0 0 0-2.11-2.11h-5.06A2.11 2.11 0 0 0 7.83 4.36v2.187H4.313a1.313 1.313 0 0 0-1.313 1.313v10.828A1.313 1.313 0 0 0 4.313 20h16.312A1.313 1.313 0 0 0 22 18.688V7.86a1.313 1.313 0 0 0-1.375-1.313zM9.89 4.36a.047.047 0 0 1 .047-.047h5.063a.047.047 0 0 1 .047.047v2.187H9.89V4.36z" fill="#5059C9"/>
              <circle cx="16.5" cy="3" r="2.5" fill="#7B83EB"/>
              <rect x="3" y="8" width="12" height="10" rx="1" fill="#4B53BC"/>
              <path d="M6 11h6v1H6zm0 2.5h6v1H6zm0 2.5h4v1H6z" fill="white"/>
            </svg>
            <h2 className="text-base font-semibold text-foreground">Connect to Microsoft Teams</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          Create an Incoming Webhook or Power Automate workflow for your Teams channel to share meeting summaries.
          <a
            href="https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 ml-1 text-accent hover:underline"
          >
            Setup guide <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Webhook URL</label>
            <input
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://outlook.office.com/webhook/..."
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Channel name (optional)</label>
            <input
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="#meeting-notes"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>

        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            {error}
          </div>
        )}
        {success && (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-emerald-50 dark:bg-emerald-950/30 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">
            <Check className="h-3.5 w-3.5 flex-shrink-0" />
            {success}
          </div>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleTest}
            disabled={testing || !webhookUrl}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              testing ? "bg-accent/50 text-accent-foreground cursor-wait" : "bg-accent text-accent-foreground hover:bg-accent/90",
              !webhookUrl && "opacity-50 cursor-not-allowed"
            )}
          >
            {testing ? (
              <span className="flex items-center gap-1.5">
                <Loader2 className="h-3 w-3 animate-spin" /> Testing...
              </span>
            ) : (
              "Connect & Test"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
