import { useState, useEffect } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { getElectronAPI } from '@/lib/electron-api'

export function SyncSection({ api }: { api: ReturnType<typeof getElectronAPI> }) {
  const [status, setStatus] = useState<{
    enabled: boolean;
    icloudAvailable: boolean;
    lastSyncAt: string | null;
    deviceCount: number;
    pendingChanges: number;
    state: "synced" | "syncing" | "offline" | "error" | "disabled";
    error?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);

  const refreshStatus = async () => {
    if (!api?.sync) return;
    const s = await api.sync.getStatus();
    setStatus(s);
  };

  useEffect(() => {
    refreshStatus();
    const interval = setInterval(refreshStatus, 30_000);
    return () => clearInterval(interval);
  }, [api]);

  const handleToggle = async () => {
    if (!api?.sync || !status) return;
    setLoading(true);
    try {
      if (status.enabled) {
        if (!confirm("Disable iCloud sync? Your notes will remain on this Mac. Data already in iCloud stays there for other devices.")) {
          setLoading(false);
          return;
        }
        await api.sync.disable();
        toast.success("iCloud sync disabled");
      } else {
        const available = await api.sync.isICloudAvailable();
        if (!available) {
          toast.error("iCloud Drive is not available. Sign in to iCloud in System Settings.");
          setLoading(false);
          return;
        }
        if (!confirm("Enable iCloud sync? This will sync your notes database to iCloud Drive. Notes on other Macs signed into the same Apple ID will sync automatically.")) {
          setLoading(false);
          return;
        }
        const result = await api.sync.enable();
        if (!result.ok) {
          toast.error(result.error ?? "Failed to enable sync");
          setLoading(false);
          return;
        }
        toast.success("iCloud sync enabled");
      }
      await refreshStatus();
    } catch {
      toast.error("Failed to toggle sync");
    }
    setLoading(false);
  };

  const handleForceSync = async () => {
    if (!api?.sync) return;
    setLoading(true);
    try {
      await api.sync.forceSync();
      await refreshStatus();
      toast.success("Sync completed");
    } catch {
      toast.error("Sync failed");
    }
    setLoading(false);
  };

  const stateLabel = status?.state === "synced"
    ? "Up to date"
    : status?.state === "syncing"
    ? "Syncing..."
    : status?.state === "offline"
    ? "Offline"
    : status?.state === "error"
    ? `Error: ${status.error ?? "unknown"}`
    : "Disabled";

  const stateColor = status?.state === "synced"
    ? "text-green"
    : status?.state === "syncing"
    ? "text-amber"
    : status?.state === "error"
    ? "text-destructive"
    : "text-muted-foreground";

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-foreground mb-1">iCloud Sync</h2>
        <p className="text-xs text-muted-foreground">
          Sync your notes across all your Macs via iCloud Drive. Your data stays private — synced through your personal iCloud account.
        </p>
      </div>

      {/* Enable toggle */}
      <div className="flex items-center justify-between rounded-[10px] border border-border bg-card p-4">
        <div>
          <p className="text-sm font-medium text-foreground">Enable iCloud Sync</p>
          <p className={cn("text-xs mt-0.5", stateColor)}>
            {stateLabel}
          </p>
        </div>
        <button
          onClick={handleToggle}
          disabled={loading}
          className={cn(
            "relative inline-flex h-5 w-9 items-center rounded-full transition-colors",
            status?.enabled ? "bg-accent" : "bg-muted-foreground/30"
          )}
        >
          <span
            className={cn(
              "inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform",
              status?.enabled ? "translate-x-[18px]" : "translate-x-[3px]"
            )}
          />
        </button>
      </div>

      {/* Status details (only when enabled) */}
      {status?.enabled && (
        <>
          <div className="rounded-[10px] border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Devices synced</span>
              <span className="text-xs font-mono text-foreground">{status.deviceCount}</span>
            </div>
            {status.lastSyncAt && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Last synced</span>
                <span className="text-xs font-mono text-foreground">
                  {new Date(status.lastSyncAt).toLocaleString()}
                </span>
              </div>
            )}
            {status.pendingChanges > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">Pending changes</span>
                <span className="text-xs font-mono text-foreground">{status.pendingChanges}</span>
              </div>
            )}
          </div>

          {/* Force sync button */}
          <button
            onClick={handleForceSync}
            disabled={loading}
            className="flex items-center gap-2 rounded-[10px] border border-border bg-card px-4 py-2.5 text-sm text-foreground hover:bg-muted/50 transition-colors"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Sync now
          </button>
        </>
      )}
    </div>
  );
}
