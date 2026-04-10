import { useState, useEffect } from "react";
import { X, Loader2, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { getElectronAPI } from "@/lib/electron-api";
import type { TeamsConfig } from "./TeamsConnectDialog";
import type { SummaryData } from "./EditableSummary";

interface TeamsShareDialogProps {
  open: boolean;
  onClose: () => void;
  noteTitle: string;
  noteDate?: string;
  summary?: SummaryData | null;
}

export function TeamsShareDialog({ open, onClose, noteTitle, noteDate, summary }: TeamsShareDialogProps) {
  const api = getElectronAPI();
  const [teamsConfig, setTeamsConfig] = useState<TeamsConfig | null>(null);
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
    api?.keychain?.get("teams-config").then((raw) => {
      if (raw) setTeamsConfig(JSON.parse(raw) as TeamsConfig);
    });
  }, [open, api]);

  const handleSend = async () => {
    if (!teamsConfig?.webhookUrl || !api?.teams) return;
    setSending(true);
    setError("");

    // Build Adaptive Card for Teams
    const bodyItems: any[] = [];

    // Header
    bodyItems.push({
      type: "TextBlock",
      size: "Large",
      weight: "Bolder",
      text: noteTitle,
      wrap: true,
    });

    if (noteDate) {
      bodyItems.push({
        type: "TextBlock",
        text: noteDate,
        isSubtle: true,
        spacing: "None",
      });
    }

    // Overview
    if (summary?.overview) {
      bodyItems.push({
        type: "TextBlock",
        text: "**Summary**",
        spacing: "Medium",
        wrap: true,
      });
      bodyItems.push({
        type: "TextBlock",
        text: summary.overview,
        wrap: true,
        spacing: "Small",
      });
    }

    // Key Points
    if (includeKeyPoints && summary?.keyPoints?.length) {
      bodyItems.push({
        type: "TextBlock",
        text: "**Key Points**",
        spacing: "Medium",
        wrap: true,
      });
      const pointsText = summary.keyPoints.map((kp) => `- ${kp}`).join("\n");
      bodyItems.push({
        type: "TextBlock",
        text: pointsText,
        wrap: true,
        spacing: "Small",
      });
    }

    // Decisions
    if (includeDecisions && summary?.decisions?.length) {
      bodyItems.push({
        type: "TextBlock",
        text: "**Decisions**",
        spacing: "Medium",
        wrap: true,
      });
      const decisionsText = summary.decisions.map((d) => `- ${d}`).join("\n");
      bodyItems.push({
        type: "TextBlock",
        text: decisionsText,
        wrap: true,
        spacing: "Small",
      });
    }

    // Action Items
    const actionItems = summary?.actionItems || summary?.nextSteps;
    if (includeActionItems && actionItems?.length) {
      bodyItems.push({
        type: "TextBlock",
        text: "**Action Items**",
        spacing: "Medium",
        wrap: true,
      });
      const itemsText = actionItems
        .map((ai) => {
          const check = ai.done ? "\u2705" : "\u2B1C";
          const assignee = ai.assignee && ai.assignee !== "Unassigned" ? ` \u2014 _${ai.assignee}_` : "";
          return `${check} ${ai.text}${assignee}`;
        })
        .join("\n");
      bodyItems.push({
        type: "TextBlock",
        text: itemsText,
        wrap: true,
        spacing: "Small",
      });
    }

    // Footer
    bodyItems.push({
      type: "TextBlock",
      text: "_Shared from OSChief Note_",
      isSubtle: true,
      spacing: "Medium",
      separator: true,
    });

    // Adaptive Card payload
    const payload = {
      type: "message",
      attachments: [
        {
          contentType: "application/vnd.microsoft.card.adaptive",
          contentUrl: null,
          content: {
            $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
            type: "AdaptiveCard",
            version: "1.4",
            body: bodyItems,
          },
        },
      ],
    };

    try {
      const result = await api.teams.sendSummary(teamsConfig.webhookUrl, payload);
      if (result.ok) {
        setSent(true);
      } else {
        setError(result.error || "Failed to send to Teams");
      }
    } catch (err: any) {
      setError(err.message || "Failed to send");
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  if (!teamsConfig) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-[10px] border border-border bg-card p-6 shadow-xl text-center">
          <AlertCircle className="h-8 w-8 text-amber mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-foreground mb-1">Teams Not Connected</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Connect Microsoft Teams in Settings &gt; Integrations to share meeting summaries.
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
      <div className="w-full max-w-md rounded-[10px] border border-border bg-card p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-foreground">Share to Teams</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {sent ? (
          <div className="text-center py-4">
            <Check className="h-8 w-8 text-green mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">Shared to Teams!</p>
            {teamsConfig.channelName && (
              <p className="text-xs text-muted-foreground">Sent to {teamsConfig.channelName}</p>
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
              {teamsConfig.channelName ? ` to ${teamsConfig.channelName}` : " to Teams"}.
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
              <div className="mt-3 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
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
                  "Send to Teams"
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
