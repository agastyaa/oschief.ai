import { useState, useEffect, useCallback } from "react";
import { X, Loader2, Check, AlertCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { getElectronAPI } from "@/lib/electron-api";
import type { JiraConfig } from "@/components/JiraConnectDialog";

interface JiraCreateTicketDialogProps {
  open: boolean;
  onClose: () => void;
  actionItemText: string;
  assignee?: string;
  priority?: string;
  dueDate?: string;
  meetingTitle?: string;
  meetingDate?: string;
  onCreated: (issueKey: string, issueUrl: string) => void;
}

interface JiraProject {
  id: string;
  key: string;
  name: string;
}

interface JiraIssueType {
  id: string;
  name: string;
}

export function JiraCreateTicketDialog({
  open,
  onClose,
  actionItemText,
  assignee,
  priority,
  dueDate,
  meetingTitle,
  meetingDate,
  onCreated,
}: JiraCreateTicketDialogProps) {
  const api = getElectronAPI();

  const [jiraConfig, setJiraConfig] = useState<JiraConfig | null>(null);
  const [projects, setProjects] = useState<JiraProject[]>([]);
  const [issueTypes, setIssueTypes] = useState<JiraIssueType[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [selectedIssueType, setSelectedIssueType] = useState("");
  const [summary, setSummary] = useState(actionItemText);
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ key: string; url: string } | null>(null);

  // Load Jira config from keychain
  useEffect(() => {
    if (!open) return;
    setCreated(null);
    setError("");
    setSummary(actionItemText);
    setDescription(
      `From meeting: ${meetingTitle || "Unknown"} (${meetingDate || ""})\n\nAction item: ${actionItemText}${assignee ? `\nAssigned to: ${assignee}` : ""}${dueDate ? `\nDue: ${dueDate}` : ""}`
    );

    api?.keychain?.get("jira-config").then((raw) => {
      if (raw) {
        const config = JSON.parse(raw) as JiraConfig;
        setJiraConfig(config);
      }
    });
  }, [open, actionItemText, assignee, dueDate, meetingTitle, meetingDate, api]);

  // Load projects when config is ready
  useEffect(() => {
    if (!jiraConfig || !api?.jira) return;
    setLoadingProjects(true);
    api.jira.getProjects(JSON.stringify(jiraConfig)).then((projs) => {
      setProjects(projs || []);
      // Auto-select saved default project or first
      const defaultKey = localStorage.getItem("jira-default-project");
      if (defaultKey && projs.some((p: JiraProject) => p.key === defaultKey)) {
        setSelectedProject(defaultKey);
      } else if (projs.length > 0) {
        setSelectedProject(projs[0].key);
      }
      setLoadingProjects(false);
    }).catch(() => setLoadingProjects(false));
  }, [jiraConfig, api]);

  // Load issue types when project changes
  useEffect(() => {
    if (!selectedProject || !jiraConfig || !api?.jira) return;
    api.jira.getIssueTypes(JSON.stringify(jiraConfig), selectedProject).then((types) => {
      setIssueTypes(types || []);
      // Default to "Task" if available
      const task = types?.find((t: JiraIssueType) => t.name === "Task");
      setSelectedIssueType(task?.id || types?.[0]?.id || "");
    });
  }, [selectedProject, jiraConfig, api]);

  const handleCreate = useCallback(async () => {
    if (!jiraConfig || !api?.jira || !selectedProject || !selectedIssueType || !summary.trim()) return;
    setLoading(true);
    setError("");

    try {
      const result = await api.jira.createIssue(JSON.stringify(jiraConfig), {
        projectKey: selectedProject,
        issueTypeId: selectedIssueType,
        summary: summary.trim(),
        description: description.trim() || undefined,
        priority: priority === "high" ? "High" : priority === "low" ? "Low" : "Medium",
        dueDate: dueDate || undefined,
      });

      if (result.ok && result.issue) {
        const siteUrl = jiraConfig.siteUrl || "";
        const issueUrl = `${siteUrl}/browse/${result.issue.key}`;
        setCreated({ key: result.issue.key, url: issueUrl });
        localStorage.setItem("jira-default-project", selectedProject);
        onCreated(result.issue.key, issueUrl);
      } else {
        setError(result.error || "Failed to create ticket");
      }
    } catch (err: any) {
      setError(err.message || "Failed to create ticket");
    } finally {
      setLoading(false);
    }
  }, [jiraConfig, api, selectedProject, selectedIssueType, summary, description, priority, dueDate, onCreated]);

  if (!open) return null;

  if (!jiraConfig) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
        <div className="w-full max-w-sm rounded-[10px] border border-border bg-card p-6 shadow-xl text-center">
          <AlertCircle className="h-8 w-8 text-amber-500 mx-auto mb-3" />
          <h3 className="text-sm font-semibold text-foreground mb-1">Jira Not Connected</h3>
          <p className="text-xs text-muted-foreground mb-4">
            Connect Jira in Settings &gt; Integrations to create tickets from action items.
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
          <h2 className="text-base font-semibold text-foreground">Create Jira Ticket</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {created ? (
          <div className="text-center py-4">
            <Check className="h-8 w-8 text-emerald-500 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground mb-1">Ticket Created</p>
            <a
              href={created.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
            >
              {created.key} <ExternalLink className="h-3 w-3" />
            </a>
            <div className="mt-4">
              <button
                onClick={onClose}
                className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {/* Project */}
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Project</label>
                {loadingProjects ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading projects...
                  </div>
                ) : (
                  <select
                    value={selectedProject}
                    onChange={(e) => setSelectedProject(e.target.value)}
                    className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    {projects.map((p) => (
                      <option key={p.key} value={p.key}>{p.key} — {p.name}</option>
                    ))}
                  </select>
                )}
              </div>

              {/* Issue Type */}
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Issue Type</label>
                <select
                  value={selectedIssueType}
                  onChange={(e) => setSelectedIssueType(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  {issueTypes.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              {/* Summary */}
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Summary</label>
                <input
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground resize-none focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>

            {error && (
              <div className="mt-3 flex items-center gap-2 rounded-md bg-red-50 dark:bg-red-950/30 px-3 py-2 text-xs text-red-600 dark:text-red-400">
                <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                {error}
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
                onClick={handleCreate}
                disabled={loading || !summary.trim() || !selectedProject || !selectedIssueType}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  loading
                    ? "bg-accent/50 text-accent-foreground cursor-wait"
                    : "bg-accent text-accent-foreground hover:bg-accent/90",
                  (!summary.trim() || !selectedProject || !selectedIssueType) && "opacity-50 cursor-not-allowed"
                )}
              >
                {loading ? (
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" /> Creating...
                  </span>
                ) : (
                  "Create Ticket"
                )}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
