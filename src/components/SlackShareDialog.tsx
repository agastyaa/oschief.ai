import { useState, useEffect } from "react";
import { X, Loader2, Check, AlertCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { getElectronAPI } from "@/lib/electron-api";
import type { SlackConfig } from "./SlackConnectDialog";
import type { SummaryData } from "./EditableSummary";

interface SlackShareDialogProps {
  open: boolean;
  onClose: () => void;
  noteTitle: string;
  noteDate?: string;
  summary?: SummaryData | null;
}

export function SlackShareDialog({ open, onClose, noteTitle, noteDate, summary }: SlackShareDialogProps) {
  const api = getElectronAPI();
  const [slackConfig, setSlackConfig] = useState<SlackConfig | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [includeActionItems, setIncludeActionItems] = useState(true);
  const [includeDecisions, setIncludeDecisions] = useState(true);
  const [includeKeyPoints, setIncludeKeyPoints] = useState(true);

  useEffect(() => {
    if (!open) return;
    setSent(false);
    setError("");
    api?.keychain?.get("slack-config").then((raw) => {
      if (raw) setSlackConfig(JSON.parse(raw) as SlackConfig);
    });
  }, [open, api]);

  const handleSend = async () => {
    if (!slackConfig?.webhookUrl || !api?.slack) return;
    setSending(true);
    setError("");

    // Build Slack Block Kit message
    const blocks: any[] = [];

    // Header
    blocks.push({
      type: "header",
      text: { type: "plain_text", text: `📋 ${noteTitle}`, emoji: true },
    });

    if (noteDate) {
      blocks.push({
        type: "context",
        elements: [{ type: "mrkdwn", text: `📅 ${noteDate}` }],
      });
    }

    // Overview
    if (summary?.overview) {
      blocks.push({ type: "divider" });
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*Summary*\n${summary.overview}` },
      });
    }

    // Key Points
    if (includeKeyPoints && summary?.keyPoints?.length) {
      blocks.push({ type: "divider" });
      const pointsText = summary.keyPoints.map((kp) => `• ${kp}`).join("\n");
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*Key Points*\n${pointsText}` },
      });
    }

    // Decisions
    if (includeDecisions && summary?.decisions?.length) {
      blocks.push({ type: "divider" });
      const decisionsText = summary.decisions.map((d) => `• ${d}`).join("\n");
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*Decisions*\n${decisionsText}` },
      });
    }

    // Action Items
    const actionItems = summary?.actionItems || summary?.nextSteps;
    if (includeActionItems && actionItems?.length) {
      blocks.push({ type: "divider" });
      const itemsText = actionItems
        .map((ai) => {
          const check = ai.done ? "✅" : "⬜";
          const assignee = ai.assignee && ai.assignee !== "Unassigned" ? ` — _${ai.assignee}_` : "";
          return `${check} ${ai.text}${assignee}`;
        })
        .join("\n");
      blocks.push({
        type: "section",
        text: { type: "mrkdwn", text: `*Action Items*\n${itemsText}` },
      });
    }

    // Footer
    blocks.push({ type: "divider" });
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: "_Shared from Syag Note_" }],
    });

    try {
      const result = await api.slack.sendSummary(slackConfig.webhookUrl, { blocks });
      if (result.ok) {
        setSent(true);
      } else {
        setError(result.error || "Failed to send to Slack");
      }
    } catch (err: any) {
      setError(err.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  if (!slackConfig) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xl text-center">
          <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-foreground mb-1">Slack Not Connected</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Connect Slack in Settings &gt; Integrations to share meeting summaries.
          </p>
          <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary">
            Close
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-foreground">Share to Slack</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {sent ? (
          <div className="text-center py-4">
            <Check className="h-8 w-8 text-emerald-500 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">Shared to Slack!</p>
            {slackConfig.channelName && (
              <p className="text-xs text-muted-foreground">Sent to {slackConfig.channelName}</p>
            )}
            <div className="mt-4">
              <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary">
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="text-xs text-muted-foreground mb-4">
              Send a formatted summary of <span className="font-medium text-foreground">{noteTitle}</span>
              {slackConfig.channelName ? ` to ${slackConfig.channelName}` : " to Slack"}.
            </p>

            <div className="space-y-2">
              <label className="text-[11px] font-medium text-muted-foreground block">Include sections:</label>
              <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeKeyPoints}
                  onChange={(e) => setIncludeKeyPoints(e.target.checked)}
                  className="rounded border-border"
                />
                Key Points
              </label>
              <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeDecisions}
                  onChange={(e) => setIncludeDecisions(e.target.checked)}
                  className="rounded border-border"
                />
                Decisions
              </label>
              <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeActionItems}
                  onChange={(e) => setIncludeActionItems(e.target.checked)}
                  className="rounded border-border"
                />
                Action Items
              </label>
            </div>

            {error && (
              <div className="mt-3 flex items-center gap-2 rounded-md bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                {error}
              </div>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={onClose} className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  sending ? "bg-accent/50 text-accent-foreground cursor-wait" : "bg-accent text-accent-foreground hover:bg-accent/90"
                )}
              >
                {sending ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" /> Sending...
                  </span>
                ) : (
                  "Send to Slack"
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
