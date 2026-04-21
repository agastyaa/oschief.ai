/**
 * Asana connection dialog — user enters a Personal Access Token (PAT).
 * Follows the same pattern as JiraConnectDialog.tsx.
 */

import { useState } from "react";
import { X, Loader2, CheckCircle2, ExternalLink } from "lucide-react";
import { getElectronAPI } from "@/lib/electron-api";

export interface AsanaConfig {
  token: string;
  name?: string;
  email?: string;
  workspaceGid?: string;
  workspaceName?: string;
  /** v2.11.1 — default project for every task created from a commitment/action item.
   *  Selected once at connect/re-connect time in Settings so AsanaCreateTaskDialog
   *  can skip the per-task project picker entirely. */
  defaultProjectGid?: string;
  defaultProjectName?: string;
}

interface AsanaConnectDialogProps {
  open: boolean;
  onClose: () => void;
  onConnected: (config: AsanaConfig) => void;
}

export function AsanaConnectDialog({ open, onClose, onConnected }: AsanaConnectDialogProps) {
  const api = getElectronAPI();
  const [token, setToken] = useState("");
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [workspaces, setWorkspaces] = useState<{ gid: string; name: string }[]>([]);
  const [selectedWorkspace, setSelectedWorkspace] = useState("");
  const [projects, setProjects] = useState<{ gid: string; name: string }[]>([]);
  const [selectedProject, setSelectedProject] = useState("");
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [step, setStep] = useState<"token" | "workspace" | "project">("token");

  if (!open) return null;

  const handleTestToken = async () => {
    if (!token.trim() || !api?.asana) return;
    setTesting(true);
    setError("");

    try {
      const result = await api.asana.testToken(token.trim());
      if (!result.ok) {
        setError(result.error || "Invalid token");
        setTesting(false);
        return;
      }

      // Load workspaces
      const ws = await api.asana.getWorkspaces(token.trim());
      if (ws.length === 0) {
        setError("No workspaces found. Check your token permissions.");
        setTesting(false);
        return;
      }

      setWorkspaces(ws);
      setSelectedWorkspace(ws[0].gid);
      setStep("workspace");
    } catch (err: any) {
      setError(err.message || "Connection failed");
    } finally {
      setTesting(false);
    }
  };

  // After workspace is chosen, fetch projects so the user can pick a default.
  const handleWorkspaceNext = async () => {
    if (!selectedWorkspace || !api?.asana) {
      setError("Pick a workspace first.");
      return;
    }
    setLoadingProjects(true);
    setError("");
    try {
      const projs = await api.asana.getProjects(token.trim(), selectedWorkspace);
      setProjects(projs);
      // Default to first project so "save as-is" has a sensible target.
      if (projs.length > 0) setSelectedProject(projs[0].gid);
      setStep("project");
    } catch (err: any) {
      setError(err?.message || "Couldn't load projects. Check your token's workspace access.");
    } finally {
      setLoadingProjects(false);
    }
  };

  const handleConnect = async () => {
    const ws = workspaces.find((w) => w.gid === selectedWorkspace);
    const proj = projects.find((p) => p.gid === selectedProject);
    const config: AsanaConfig = {
      token: token.trim(),
      workspaceGid: selectedWorkspace,
      workspaceName: ws?.name,
      defaultProjectGid: selectedProject || undefined,
      defaultProjectName: proj?.name,
    };

    // Get user info for display
    try {
      const user = await api?.asana?.testToken(token.trim());
      if (user?.ok) {
        config.name = user.name;
        config.email = user.email;
      }
    } catch {}

    // Store in keychain
    await api?.keychain?.set("asana-config", JSON.stringify(config));
    // Mirror to localStorage so AsanaCreateTaskDialog's legacy default-project
    // lookup keeps working during the upgrade.
    if (selectedProject) {
      try { localStorage.setItem("asana-default-project", selectedProject); } catch {}
    }
    onConnected(config);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-[10px] border border-border bg-card p-6 shadow-xl mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-semibold text-foreground">Connect Asana</h2>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        {step === "token" && (
          <div className="space-y-4">
            <div>
              <label className="text-body-sm font-medium text-foreground block mb-1">Personal Access Token</label>
              <p className="text-[11px] text-muted-foreground mb-2">
                Generate a PAT in{" "}
                <button
                  onClick={() => window.open("https://app.asana.com/0/developer-console", "_blank")}
                  className="text-primary underline hover:text-primary/80 inline-flex items-center gap-0.5"
                >
                  Asana Developer Console <ExternalLink className="h-2.5 w-2.5" />
                </button>
              </p>
              <input
                type="password"
                value={token}
                onChange={(e) => { setToken(e.target.value); setError(""); }}
                placeholder="1/1234567890:abcdef..."
                className="w-full rounded-[10px] border border-border bg-background px-3 py-2 text-body-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 font-mono"
                onKeyDown={(e) => e.key === "Enter" && handleTestToken()}
              />
            </div>

            {error && (
              <div className="rounded-[10px] border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                {error}
              </div>
            )}

            <button
              onClick={handleTestToken}
              disabled={!token.trim() || testing}
              className="w-full rounded-[10px] bg-primary text-primary-foreground py-2 text-body-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
            >
              {testing ? (
                <span className="flex items-center justify-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Verifying...</span>
              ) : (
                "Connect & Verify"
              )}
            </button>
          </div>
        )}

        {step === "workspace" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-body-sm text-green">
              <CheckCircle2 className="h-4 w-4" />
              Token verified
            </div>

            <div>
              <label className="text-body-sm font-medium text-foreground block mb-1">Select Workspace</label>
              <select
                value={selectedWorkspace}
                onChange={(e) => setSelectedWorkspace(e.target.value)}
                className="w-full rounded-[10px] border border-border bg-background px-3 py-2 text-body-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
              >
                {workspaces.map((ws) => (
                  <option key={ws.gid} value={ws.gid}>{ws.name}</option>
                ))}
              </select>
            </div>

            {error && (
              <div className="rounded-[10px] border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] text-destructive">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => setStep("token")}
                className="flex-1 rounded-[10px] border border-border py-2 text-body-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleWorkspaceNext}
                disabled={!selectedWorkspace || loadingProjects}
                className="flex-1 rounded-[10px] bg-primary text-primary-foreground py-2 text-body-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-40"
              >
                {loadingProjects ? (
                  <span className="flex items-center justify-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading projects…</span>
                ) : (
                  "Next: choose project"
                )}
              </button>
            </div>
          </div>
        )}

        {step === "project" && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-body-sm text-green">
              <CheckCircle2 className="h-4 w-4" />
              Workspace selected
            </div>

            <div>
              <label className="text-body-sm font-medium text-foreground block mb-1">Default Project</label>
              <p className="text-[11px] text-muted-foreground mb-2">
                Tasks created from action items go here by default. You can still change it per-task in the Create dialog.
              </p>
              {projects.length === 0 ? (
                <div className="rounded-[10px] border border-amber/30 bg-amber-bg/40 px-3 py-2 text-[12px] text-amber">
                  No projects found in this workspace. Tasks will go to the workspace top level — you can move them into a project from Asana after.
                </div>
              ) : (
                <select
                  value={selectedProject}
                  onChange={(e) => setSelectedProject(e.target.value)}
                  className="w-full rounded-[10px] border border-border bg-background px-3 py-2 text-body-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                >
                  <option value="">— No default —</option>
                  {projects.map((p) => (
                    <option key={p.gid} value={p.gid}>{p.name}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setStep("workspace")}
                className="flex-1 rounded-[10px] border border-border py-2 text-body-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleConnect}
                className="flex-1 rounded-[10px] bg-primary text-primary-foreground py-2 text-body-sm font-medium hover:bg-primary/90 transition-colors"
              >
                Connect
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
