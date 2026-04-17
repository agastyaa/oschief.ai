import { useState, useEffect } from 'react'
import { Eye, EyeOff, Copy, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { getElectronAPI } from '@/lib/electron-api'

export function AgentApiSection({ api }: { api: ReturnType<typeof getElectronAPI> }) {
  const [enabled, setEnabled] = useState(false);
  const [running, setRunning] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [socketPath, setSocketPath] = useState("");
  const [tokenVisible, setTokenVisible] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!api?.agentApi) return;
    api.agentApi.getStatus().then((s) => {
      setEnabled(s.enabled);
      setRunning(s.running);
      setToken(s.token);
      setSocketPath(s.socketPath);
    });
  }, [api]);

  const handleToggle = async () => {
    if (!api?.agentApi) return;
    setLoading(true);
    try {
      if (enabled) {
        await api.agentApi.disable();
        setEnabled(false);
        setRunning(false);
      } else {
        await api.agentApi.enable();
        const s = await api.agentApi.getStatus();
        setEnabled(s.enabled);
        setRunning(s.running);
        setToken(s.token);
        setSocketPath(s.socketPath);
      }
    } catch { toast.error("Failed to toggle API"); }
    setLoading(false);
  };

  const handleRegenerate = async () => {
    if (!api?.agentApi) return;
    const newToken = await api.agentApi.regenerateToken();
    setToken(newToken);
    toast.success("Token regenerated");
  };

  const copyToken = () => {
    if (token) { navigator.clipboard.writeText(token); toast.success("Token copied"); }
  };

  const copySocketPath = () => {
    if (socketPath) { navigator.clipboard.writeText(socketPath); toast.success("Socket path copied"); }
  };

  const copyCurlExample = () => {
    const cmd = `curl -s --unix-socket "${socketPath}" -H "Authorization: Bearer ${token ?? '<TOKEN>'}" "http://localhost/v1/notes?limit=5"`;
    navigator.clipboard.writeText(cmd);
    toast.success("curl example copied");
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground mb-1">Agent API</h2>
        <p className="text-xs text-muted-foreground">
          Read-only Unix socket API for AI agents and tools to access your notes. Local-only — never leaves your machine.
        </p>
      </div>

      <div className="flex items-center justify-between rounded-[10px] border border-border bg-card p-4">
        <div>
          <p className="text-sm font-medium text-foreground">Enable Agent API</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {running ? (
              <span className="text-green">Running</span>
            ) : enabled ? (
              <span className="text-amber">Enabled but not running</span>
            ) : (
              "Disabled"
            )}
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={loading}
          className={cn(
            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
            enabled ? "bg-accent" : "bg-muted-foreground/30"
          )}
        >
          <span className={cn(
            "inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform",
            enabled ? "translate-x-[18px]" : "translate-x-[3px]"
          )} />
        </button>
      </div>

      {enabled && (
        <>
          <div className="rounded-[10px] border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Bearer Token</h3>
              <div className="flex items-center gap-1">
                <button onClick={() => setTokenVisible(!tokenVisible)} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors" title={tokenVisible ? "Hide" : "Show"}>
                  {tokenVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
                <button onClick={copyToken} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors" title="Copy token">
                  <Copy className="h-3.5 w-3.5" />
                </button>
                <button onClick={handleRegenerate} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors" title="Regenerate token">
                  <RefreshCw className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="font-mono text-xs bg-background rounded-md px-3 py-2 text-foreground/80 break-all select-all">
              {tokenVisible ? (token ?? "—") : "••••••••••••••••••••••••••••••••"}
            </div>
          </div>

          <div className="rounded-[10px] border border-border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Socket Path</h3>
              <button onClick={copySocketPath} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors" title="Copy path">
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="font-mono text-xs bg-background rounded-md px-3 py-2 text-foreground/80 break-all select-all">
              {socketPath || "—"}
            </div>
          </div>

          <div className="rounded-[10px] border border-border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quick Start</h3>
              <button onClick={copyCurlExample} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors" title="Copy curl command">
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <pre className="font-mono text-[11px] bg-background rounded-md px-3 py-2 text-foreground/80 overflow-x-auto whitespace-pre-wrap">
{`curl -s --unix-socket "${socketPath}" \\
  -H "Authorization: Bearer ${token}" \\
  "http://localhost/v1/notes?limit=5"`}
            </pre>
            <div className="space-y-1 mt-2">
              <p className="text-[11px] text-muted-foreground font-medium">Available endpoints:</p>
              <ul className="text-[11px] text-muted-foreground space-y-0.5 list-disc list-inside">
                <li><code className="text-[10px]">GET /v1/health</code> — check if OSChief is running</li>
                <li><code className="text-[10px]">GET /v1/notes</code> — list notes (supports ?q=, ?limit=, ?offset=)</li>
                <li><code className="text-[10px]">GET /v1/notes/:id</code> — full note with summary</li>
                <li><code className="text-[10px]">GET /v1/notes/:id/transcript</code> — transcript lines</li>
                <li><code className="text-[10px]">GET /v1/notes/:id/action-items</code> — action items only</li>
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
