import { useState } from "react";
import { X, Loader2, Check, AlertCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { getElectronAPI } from "@/lib/electron-api";

interface SlackConnectDialogProps {
  open: boolean;
  onClose: () => void;
  onConnected: (webhookUrl: string, channelName?: string) => void;
}

export interface SlackConfig {
  webhookUrl: string;
  channelName?: string;
}

export function SlackConnectDialog({ open, onClose, onConnected }: SlackConnectDialogProps) {
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
    if (!webhookUrl.startsWith("https://hooks.slack.com/")) {
      setError("Invalid webhook URL — must start with https://hooks.slack.com/");
      return;
    }

    setTesting(true);
    setError("");
    setSuccess("");

    try {
      const result = await api?.slack?.testWebhook(webhookUrl);
      if (result?.ok) {
        setSuccess("Connected! Test message sent to channel.");
        const config: SlackConfig = {
          webhookUrl,
          channelName: channelName.trim() || undefined,
        };
        await api?.keychain?.set("slack-config", JSON.stringify(config));
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
      <div className="w-full max-w-md rounded-[10px] border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none">
              <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
              <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/>
              <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.522 2.521 2.528 2.528 0 0 1-2.521-2.521V2.522A2.528 2.528 0 0 1 15.165 0a2.528 2.528 0 0 1 2.521 2.522v6.312z" fill="#2EB67D"/>
              <path d="M15.165 18.956a2.528 2.528 0 0 1 2.521 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.521-2.522v-2.522h2.521zm0-1.27a2.527 2.527 0 0 1-2.521-2.522 2.527 2.527 0 0 1 2.521-2.521h6.313A2.528 2.528 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.521h-6.313z" fill="#ECB22E"/>
            </svg>
            <h2 className="text-base font-semibold text-foreground">Connect to Slack</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          Create an Incoming Webhook in your Slack workspace to share meeting summaries.
          <a
            href="https://api.slack.com/messaging/webhooks"
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
              placeholder="https://hooks.slack.com/services/T.../B.../..."
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
