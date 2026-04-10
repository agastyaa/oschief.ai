import { useState } from "react";
import { X, Loader2, Check, AlertCircle, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { getElectronAPI } from "@/lib/electron-api";

interface JiraConnectDialogProps {
  open: boolean;
  onClose: () => void;
  onConnected: (config: JiraConfig) => void;
}

export interface JiraConfig {
  mode: "token";
  siteUrl: string;
  email: string;
  apiToken: string;
  displayName?: string;
}

export function JiraConnectDialog({ open, onClose, onConnected }: JiraConnectDialogProps) {
  const [siteUrl, setSiteUrl] = useState("");
  const [email, setEmail] = useState("");
  const [apiToken, setApiToken] = useState("");
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const api = getElectronAPI();

  const handleTest = async () => {
    if (!siteUrl || !email || !apiToken) {
      setError("All fields are required");
      return;
    }

    setTesting(true);
    setError("");
    setSuccess("");

    try {
      const result = await api?.jira?.testToken(siteUrl.replace(/\/$/, ""), email, apiToken);
      if (result?.ok) {
        setSuccess(`Connected as ${result.displayName}`);
        // Save connection config
        const config: JiraConfig = {
          mode: "token",
          siteUrl: siteUrl.replace(/\/$/, ""),
          email,
          apiToken,
          displayName: result.displayName,
        };
        // Store token securely in keychain
        await api?.keychain?.set("jira-config", JSON.stringify(config));
        onConnected(config);
      } else {
        setError(result?.error || "Connection failed");
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
              <path d="M11.53 2L3 10.53V14.47L11.53 22L14.47 22L22 14.47V10.53L11.53 2Z" fill="#2684FF" />
              <path d="M11.53 2L3 10.53V14.47L11.53 22L14.47 22L11.53 14.47V10.53L11.53 2Z" fill="#2684FF" opacity="0.7" />
            </svg>
            <h2 className="text-base font-semibold text-foreground">Connect to Jira</h2>
          </div>
          <button onClick={onClose} className="rounded p-1 text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          Enter your Jira site URL and API token to create tickets from action items.
          <a
            href="https://id.atlassian.com/manage-profile/security/api-tokens"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 ml-1 text-accent hover:underline"
          >
            Get API token <ExternalLink className="h-2.5 w-2.5" />
          </a>
        </p>

        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Jira Site URL</label>
            <input
              value={siteUrl}
              onChange={(e) => setSiteUrl(e.target.value)}
              placeholder="https://yourteam.atlassian.net"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Email</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              type="email"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label className="text-[11px] font-medium text-muted-foreground mb-1 block">API Token</label>
            <input
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="Paste your API token"
              type="password"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>

        {error && (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
            {error}
          </div>
        )}

        {success && (
          <div className="mt-3 flex items-center gap-2 rounded-md bg-green-bg px-3 py-2 text-xs text-green">
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
            disabled={testing || !siteUrl || !email || !apiToken}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              testing
                ? "bg-accent/50 text-accent-foreground cursor-wait"
                : "bg-accent text-accent-foreground hover:bg-accent/90",
              (!siteUrl || !email || !apiToken) && "opacity-50 cursor-not-allowed"
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
