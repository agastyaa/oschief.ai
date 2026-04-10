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
  const [step, setStep] = useState<"token" | "workspace">("token");

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

  const handleConnect = async () => {
    const ws = workspaces.find((w) => w.gid === selectedWorkspace);
    const config: AsanaConfig = {
      token: token.trim(),
      workspaceGid: selectedWorkspace,
      workspaceName: ws?.name,
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

            <div className="flex gap-2">
              <button
                onClick={() => setStep("token")}
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
