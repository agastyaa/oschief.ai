/**
 * Create Asana task from a commitment/action item.
 * Follows the same pattern as JiraCreateTicketDialog.tsx.
 */

import { useState, useEffect } from "react";
import { X, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { getElectronAPI } from "@/lib/electron-api";
import type { AsanaConfig } from "./AsanaConnectDialog";

interface AsanaCreateTaskDialogProps {
  open: boolean;
  onClose: () => void;
  actionItemText: string;
  assignee?: string;
  dueDate?: string;
  meetingTitle?: string;
  meetingDate?: string;
  onCreated: (taskGid: string, taskUrl: string) => void;
}

export function AsanaCreateTaskDialog({
  open,
  onClose,
  actionItemText,
  assignee,
  dueDate,
  meetingTitle,
  meetingDate,
  onCreated,
}: AsanaCreateTaskDialogProps) {
  const api = getElectronAPI();
  const [config, setConfig] = useState<AsanaConfig | null>(null);
  const [projects, setProjects] = useState<{ gid: string; name: string }[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [taskName, setTaskName] = useState(actionItemText);
  const [taskNotes, setTaskNotes] = useState("");
  const [taskDueDate, setTaskDueDate] = useState(dueDate || "");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<{ gid: string; url: string } | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!open || !api?.keychain) return;

    api.keychain.get("asana-config").then(async (raw: string | null) => {
      if (!raw) {
        setError("Asana not connected. Go to Settings > Connections to connect.");
        setLoading(false);
        return;
      }

      const cfg = JSON.parse(raw) as AsanaConfig;
      setConfig(cfg);

      // Load projects for the workspace
      if (cfg.workspaceGid && api?.asana) {
        const projs = await api.asana.getProjects(cfg.token, cfg.workspaceGid);
        setProjects(projs);

        // Restore saved default
        const savedDefault = localStorage.getItem("asana-default-project");
        if (savedDefault && projs.some((p) => p.gid === savedDefault)) {
          setSelectedProject(savedDefault);
        } else if (projs.length > 0) {
          setSelectedProject(projs[0].gid);
        }
      }

      // Build notes with meeting context
      const notes = [
        meetingTitle && `From meeting: ${meetingTitle}`,
        meetingDate && `Date: ${meetingDate}`,
        assignee && `Assigned to: ${assignee}`,
        "",
        "Created by OSChief",
      ].filter(Boolean).join("\n");
      setTaskNotes(notes);

      setLoading(false);
    }).catch(() => {
      setError("Failed to load Asana configuration");
      setLoading(false);
    });
  }, [open, api]);

  if (!open) return null;

  const handleCreate = async () => {
    if (!config || !api?.asana || !taskName.trim()) return;
    setCreating(true);
    setError("");

    try {
      const result = await api.asana.createTask(config.token, {
        name: taskName.trim(),
        notes: taskNotes,
        due_on: taskDueDate || undefined,
        projects: selectedProject ? [selectedProject] : undefined,
        workspace: config.workspaceGid!,
      });

      if (!result.ok) {
        setError(result.error || "Failed to create task");
        setCreating(false);
        return;
      }

      // Save default project
      if (selectedProject) {
        localStorage.setItem("asana-default-project", selectedProject);
      }

      setCreated({ gid: result.task!.gid, url: result.task!.permalink_url });
      onCreated(result.task!.gid, result.task!.permalink_url);
    } catch (err: any) {
      setError(err.message || "Failed to create task");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[10px] border border-border bg-card p-6 shadow-xl mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-semibold text-foreground">Create Asana Task</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : created ? (
          <div className="text-center py-4 space-y-3">
            <CheckCircle2 className="h-10 w-10 text-green mx-auto" />
            <p className="text-body-sm text-foreground">Task created in Asana</p>
            <a
              href={created.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-[12px] text-primary underline hover:text-primary/80"
            >
              Open in Asana <ExternalLink className="h-3 w-3" />
            </a>
            <div>
              <button onClick={onClose} className="rounded-[10px] border border-border px-4 py-2 text-body-sm text-muted-foreground hover:text-foreground transition-colors">
                Close
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">Task Name</label>
              <input
                value={taskName}
                onChange={(e) => setTaskName(e.target.value)}
                className="w-full rounded-[10px] border border-border bg-background px-3 py-2 text-body-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            {projects.length > 0 && (
              <div>
                <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">Project</label>
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="w-full rounded-[10px] border border-border bg-background px-3 py-2 text-body-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">No project</option>
                  {projects.map((p) => (
                    <option key={p.gid} value={p.gid}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">Due Date</label>
              <input
                type="date"
                value={taskDueDate}
                onChange={(e) => setTaskDueDate(e.target.value)}
                className="w-full rounded-[10px] border border-border bg-background px-3 py-2 text-body-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>

            <div>
              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider block mb-1">Notes</label>
              <textarea
                value={taskNotes}
                onChange={(e) => setTaskNotes(e.target.value)}
                rows={3}
                className="w-full rounded-[10px] border border-border bg-background px-3 py-2 text-body-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 resize-none"
              />
            </div>

            {error && (
              <div className="rounded-[10px] border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                {error}
              </div>
            )}

            <button
              onClick={handleCreate}
              disabled={!taskName.trim() || creating}
              className="w-full rounded-[10px] bg-primary text-primary-foreground py-2 text-body-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
            >
              {creating ? (
                <span className="flex items-center justify-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Creating...</span>
              ) : (
                "Create Task"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
