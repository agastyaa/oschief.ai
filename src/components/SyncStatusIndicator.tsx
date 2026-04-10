import { useState, useEffect } from "react";
import { Cloud, CloudOff, Loader2, AlertCircle } from "lucide-react";
import { getElectronAPI } from "@/lib/electron-api";
import { cn } from "@/lib/utils";

export function SyncStatusIndicator() {
  const api = getElectronAPI();
  const [state, setState] = useState<
    "synced" | "syncing" | "offline" | "error" | "disabled"
  >("disabled");

  useEffect(() => {
    if (!api?.sync) return;

    const refresh = () => {
      api.sync!.getStatus().then((s) => setState(s.state));
    };

    refresh();
    // 5-min heartbeat (detects offline state); real-time updates come via onDataChanged
    const interval = setInterval(refresh, 300_000);

    const unsub = api.sync.onDataChanged(() => refresh());

    return () => {
      clearInterval(interval);
      unsub();
    };
  }, [api]);

  // Don't render anything when sync is disabled
  if (state === "disabled") return null;

  const config = {
    synced: {
      icon: Cloud,
      color: "text-green",
      title: "iCloud sync: up to date",
    },
    syncing: {
      icon: Loader2,
      color: "text-amber animate-spin",
      title: "iCloud sync: syncing...",
    },
    offline: {
      icon: CloudOff,
      color: "text-muted-foreground",
      title: "iCloud sync: offline",
    },
    error: {
      icon: AlertCircle,
      color: "text-destructive",
      title: "iCloud sync: error",
    },
  }[state];

  const Icon = config.icon;

  return (
    <div className="flex items-center" title={config.title}>
      <Icon className={cn("h-3.5 w-3.5", config.color)} />
    </div>
  );
}
