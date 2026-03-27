import {
  User, Mic, Globe, Calendar, Bell, Sparkles, Brain, Download,
  ChevronRight, Check, ExternalLink, Plus, Trash2, RefreshCw, HardDrive, Cloud,
  Volume2, Save, Sliders, Monitor, Sun, Moon, FileText, ChevronDown, ChevronUp,
  Search, Info, MicOff, MonitorSpeaker, CheckCircle2, XCircle, Loader2,
  FolderOpen, BookOpen, Shield, Terminal, Copy, Eye, EyeOff
} from "lucide-react";
import { toast } from "sonner";
import { Sidebar, SidebarCollapseButton } from "@/components/Sidebar";
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useModelSettings, localModels } from "@/contexts/ModelSettingsContext";
import {
  useCalendar,
  GOOGLE_CALENDAR_FEED_ID,
  MICROSOFT_CALENDAR_FEED_ID,
} from "@/contexts/CalendarContext";
import { ICSDialog, type CalendarProviderId } from "@/components/ICSDialog";
import { isElectron, getElectronAPI } from "@/lib/electron-api";
import { ACCOUNT_LS_KEY } from "@/lib/account-context";
import { dispatchPreferencesUpdated } from "@/lib/preferences-events";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { JiraConnectDialog, type JiraConfig } from "@/components/JiraConnectDialog";
import { SlackConnectDialog, type SlackConfig } from "@/components/SlackConnectDialog";
import { TeamsConnectDialog, type TeamsConfig } from "@/components/TeamsConnectDialog";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const AI_MODELS_SUB_QUERY = "aiSub";
type AiModelsSubTab = "models" | "transcription";

const sections = [
  { icon: User, label: "Account", id: "account" },
  { icon: Sparkles, label: "AI Models", id: "ai-models" },
  { icon: Mic, label: "Transcription", id: "transcription" },
  { icon: FileText, label: "Meeting", id: "meeting" },
  { icon: Globe, label: "Connections", id: "connections" },
  { icon: BookOpen, label: "Knowledge Base", id: "knowledge-base" },
  { icon: HardDrive, label: "Obsidian Vault", id: "vault" },
  { icon: Shield, label: "Privacy & Data", id: "privacy" },
  { icon: Sliders, label: "Advanced", id: "advanced" },
  { icon: Info, label: "About", id: "about" },
];

// Maps UI toggle keys to their database setting keys
const TOGGLE_DB_KEYS: Record<string, string> = {
  autoRecord: 'auto-record',
  realTimeTranscribe: 'real-time-transcription',
  transcribeWhenStopped: 'transcribe-when-stopped',
  llmPostProcess: 'llm-post-process-transcript',
  aiSummaries: 'auto-generate-notes',
  summaryReady: 'summary-ready-notification',
  actionReminder: 'action-reminder-notification',
  weeklyDigest: 'weekly-digest-notification',
  calendarSync: 'calendar-sync',
  showUpcoming: 'show-upcoming-meetings',
  meetingDetectionRequireMic: 'meeting-detection-require-mic',
  audioNoiseSuppression: 'audio-noise-suppression',
  audioDenoiseBeforeStt: 'audio-denoise-before-stt',
  useDiarization: 'use-diarization',
};

const DEFAULT_TOGGLES: Record<string, boolean> = {
  autoRecord: true,
  realTimeTranscribe: true,
  transcribeWhenStopped: false,
  llmPostProcess: false,
  aiSummaries: true,
  summaryReady: true,
  actionReminder: true,
  weeklyDigest: false,
  calendarSync: true,
  showUpcoming: true,
  meetingDetectionRequireMic: false,
  audioNoiseSuppression: true,
  audioDenoiseBeforeStt: false,
  useDiarization: false,
};

function Toggle({ enabled, onToggle, disabled }: { enabled: boolean; onToggle: () => void; disabled?: boolean }) {
  return (
    <button
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      className={cn(
        "relative h-5 w-9 rounded-full transition-colors flex-shrink-0",
        disabled ? "bg-muted opacity-50 cursor-not-allowed" : enabled ? "bg-accent" : "bg-secondary"
      )}
    >
      <div
        className="absolute top-0.5 h-4 w-4 rounded-full bg-accent-foreground shadow-sm transition-transform"
        style={{ left: 2, transform: enabled ? "translateX(16px)" : "translateX(0px)" }}
      />
    </button>
  );
}

function SettingRow({ label, description, children }: { label: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-card p-3 gap-4">
      <div className="min-w-0">
        <span className="text-[13px] text-foreground">{label}</span>
        {description && <p className="text-[11px] text-muted-foreground mt-0.5">{description}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

function SectionHeader({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h2 className="font-display text-lg text-foreground">{title}</h2>
      {description && <p className="text-[12px] text-muted-foreground mt-1">{description}</p>}
    </div>
  );
}

// ─── Knowledge Base Section ──────────────────────────────────────────────

function SyncSection({ api }: { api: ReturnType<typeof getElectronAPI> }) {
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
    ? "text-emerald-600 dark:text-emerald-400"
    : status?.state === "syncing"
    ? "text-amber-600 dark:text-amber-400"
    : status?.state === "error"
    ? "text-red-600 dark:text-red-400"
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
      <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
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
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
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
            className="flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground hover:bg-muted/50 transition-colors"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Sync now
          </button>
        </>
      )}
    </div>
  );
}

function AgentApiSection({ api }: { api: ReturnType<typeof getElectronAPI> }) {
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
    const cmd = `curl -s --unix-socket "${socketPath}" -H "Authorization: Bearer ${token ?? '<TOKEN>'}" http://localhost/v1/notes?limit=5`;
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

      {/* Enable toggle */}
      <div className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
        <div>
          <p className="text-sm font-medium text-foreground">Enable Agent API</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {running ? (
              <span className="text-emerald-600 dark:text-emerald-400">Running</span>
            ) : enabled ? (
              <span className="text-amber-600 dark:text-amber-400">Enabled but not running</span>
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
          {/* Token */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
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

          {/* Socket path */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-2">
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

          {/* Usage example */}
          <div className="rounded-lg border border-border bg-card p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Quick Start</h3>
              <button onClick={copyCurlExample} className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors" title="Copy curl command">
                <Copy className="h-3.5 w-3.5" />
              </button>
            </div>
            <pre className="font-mono text-[11px] bg-background rounded-md px-3 py-2 text-foreground/80 overflow-x-auto whitespace-pre-wrap">
{`curl -s --unix-socket "$SYAG_SOCK" \\
  -H "Authorization: Bearer $SYAG_TOKEN" \\
  http://localhost/v1/notes?limit=5`}
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

function PrivacySection({ api }: { api: ReturnType<typeof getElectronAPI> }) {
  const navigate = useNavigate();
  const [airgapped, setAirgapped] = useState(false);
  const [anonymize, setAnonymize] = useState(false);
  const [includeNames, setIncludeNames] = useState(true);
  const [retention, setRetention] = useState("all");

  useEffect(() => {
    api?.db.settings.get("privacy-airgapped").then((v) => { if (v === "true") setAirgapped(true) });
    api?.db.settings.get("privacy-anonymize-cloud").then((v) => { if (v === "true") setAnonymize(true) });
    api?.db.settings.get("privacy-include-names").then((v) => { if (v === "false") setIncludeNames(false) });
    api?.db.settings.get("privacy-retention-days").then((v) => { if (v) setRetention(v) });
  }, [api]);

  const updateSetting = (key: string, value: string) => {
    api?.db.settings.set(key, value);
  };

  return (
    <div className="space-y-5">
      <SectionHeader title="Privacy & Data" description="Control what OSChief stores and sends. Your data never leaves your Mac unless you explicitly enable cloud features." />

      {/* Air-Gapped Mode */}
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium flex items-center gap-2">
              Air-Gapped Mode
              {airgapped && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400">Active</span>}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Guarantees zero network access. All transcription and summarization use on-device models only. Cloud providers are disabled.
            </div>
          </div>
          <button
            onClick={() => {
              const next = !airgapped;
              setAirgapped(next);
              updateSetting("privacy-airgapped", String(next));
              if (next) {
                toast.success("Air-gapped mode enabled — no data will leave your Mac");
              } else {
                toast("Air-gapped mode disabled — cloud models available again");
              }
            }}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors",
              airgapped ? "bg-green-500" : "bg-muted"
            )}
          >
            <span className={cn("pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5", airgapped ? "translate-x-4.5 ml-0.5" : "translate-x-0.5")} />
          </button>
        </div>
      </div>

      {/* Cloud AI Privacy */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        <div className="text-sm font-medium">Cloud AI Prompts</div>
        <div className="text-xs text-muted-foreground mb-3">
          When using cloud models (OpenAI, Anthropic, etc.), OSChief sends your transcript to generate summaries. These settings control what personal data is included.
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm">Include attendee names</div>
            <div className="text-xs text-muted-foreground">Send real names to the AI for better summaries</div>
          </div>
          <button
            onClick={() => { setIncludeNames(!includeNames); updateSetting("privacy-include-names", (!includeNames).toString()) }}
            className={cn("relative w-9 h-5 rounded-full transition-colors", includeNames ? "bg-primary" : "bg-muted")}
          >
            <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform", includeNames && "translate-x-4")} />
          </button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm">Anonymize in cloud prompts</div>
            <div className="text-xs text-muted-foreground">Replace names with "Person A", "Person B" before sending to AI</div>
          </div>
          <button
            onClick={() => { setAnonymize(!anonymize); updateSetting("privacy-anonymize-cloud", (!anonymize).toString()) }}
            className={cn("relative w-9 h-5 rounded-full transition-colors", anonymize ? "bg-primary" : "bg-muted")}
          >
            <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform", anonymize && "translate-x-4")} />
          </button>
        </div>

        {anonymize && (
          <div className="text-xs text-amber-600 dark:text-amber-400 px-2 py-1.5 rounded bg-amber-50 dark:bg-amber-900/20">
            When anonymization is on, cloud AI won't see real names. Summaries will use "Person A" etc., then OSChief restores real names locally.
          </div>
        )}
      </div>

      {/* Data Retention */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="text-sm font-medium">Data Retention</div>
        <div className="text-xs text-muted-foreground">How long OSChief keeps meeting history. Older data is deleted automatically.</div>
        <select
          value={retention}
          onChange={e => { setRetention(e.target.value); updateSetting("privacy-retention-days", e.target.value) }}
          className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md"
        >
          <option value="30">30 days</option>
          <option value="90">90 days</option>
          <option value="365">1 year</option>
          <option value="all">Keep everything</option>
        </select>
      </div>

      {/* Forget a Person */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="text-sm font-medium">Forget a Person</div>
        <div className="text-xs text-muted-foreground">
          Completely remove someone from OSChief's memory — deletes their profile, meeting links, commitments, decisions, and vault file. Does not affect your calendar or email.
        </div>
        <button
          onClick={() => {
            // Navigate to People page where they can select and delete
            navigate("/people");
          }}
          className="text-xs font-medium text-primary hover:underline"
        >
          Go to People → select a person → Delete
        </button>
      </div>

      {/* Data Location */}
      <div className="rounded-lg border border-border bg-card p-4 space-y-2">
        <div className="text-sm font-medium">Where Your Data Lives</div>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>All data is stored locally on your Mac:</p>
          <p className="font-mono text-[11px]">~/Library/Application Support/OSChief/data/syag.db</p>
          <p>No server sync by default. Cloud LLMs are only used when you explicitly choose a cloud model. Local models (Ollama, whisper.cpp) keep everything on-device.</p>
        </div>
      </div>
    </div>
  );
}

function VaultSection({ api }: { api: ReturnType<typeof getElectronAPI> }) {
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [vaultName, setVaultName] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    api?.vault?.getConfig().then((config) => {
      setVaultPath(config.path);
      setVaultName(config.vaultName);
      setConfigured(config.configured);
      if (config.validation?.warning) setWarning(config.validation.warning);
    });
  }, [api]);

  const handlePickFolder = async () => {
    if (!api?.vault) return;
    const result = await api.vault.pickFolder?.();
    if (result?.ok) {
      setVaultPath(result.path);
      setVaultName(result.vaultName);
      setConfigured(true);
      setWarning(result.warning || null);
      toast.success(`Vault connected: ${result.vaultName || result.path}`);
    } else if (result?.error && result.error !== 'Cancelled') {
      toast.error(result.error);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader title="Obsidian Vault" description="Connect your Obsidian vault to export meeting notes with rich metadata, people links, and project connections" />
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Vault Location</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {configured ? (
                  <span className="font-mono">{vaultPath}</span>
                ) : (
                  "No vault configured — export a note to set it up"
                )}
              </div>
            </div>
            {configured && vaultName && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400">
                {vaultName}
              </span>
            )}
          </div>
          {warning && (
            <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <span>⚠</span> {warning}
            </div>
          )}
          <button
            onClick={handlePickFolder}
            className="w-full flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
          >
            {configured ? "Change Vault Folder" : "Connect Obsidian Vault"}
          </button>
          <div className="text-xs text-muted-foreground">
            When you export a note, OSChief writes structured markdown with YAML frontmatter, [[wikilinks]] to people and projects, and updates people files automatically.
          </div>
        </div>
      </div>
    </div>
  );
}

function KnowledgeBaseSection({ api }: { api: ReturnType<typeof getElectronAPI> }) {
  const [folderPath, setFolderPath] = useState<string>("");
  const [chunkCount, setChunkCount] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    api?.db.settings.get("kb-folder-path").then((p) => { if (p) setFolderPath(p) });
    api?.kb?.getChunkCount().then(setChunkCount);
  }, [api]);

  const handlePickFolder = async () => {
    if (!api?.kb) return;
    setScanning(true);
    setStatus(null);
    try {
      const result = await api.kb.pickFolder();
      if (result.ok && result.path) {
        setFolderPath(result.path);
        setChunkCount(result.total ?? 0);
        setStatus(`Indexed ${result.added ?? 0} new files, ${result.total ?? 0} chunks total`);
      }
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    }
    setScanning(false);
  };

  const handleRescan = async () => {
    if (!api?.kb) return;
    setScanning(true);
    setStatus(null);
    try {
      const result = await api.kb.scan();
      if (result.ok) {
        setChunkCount(result.total ?? 0);
        setStatus(`Scan complete: +${result.added ?? 0} added, ${result.updated ?? 0} updated, ${result.removed ?? 0} removed — ${result.total ?? 0} chunks`);
      } else {
        setStatus(result.error || "Scan failed");
      }
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    }
    setScanning(false);
  };

  const handleClear = async () => {
    if (!api?.kb) return;
    await api.kb.clear();
    setFolderPath("");
    setChunkCount(0);
    setStatus("Knowledge base cleared");
  };

  return (
    <div className="space-y-5">
      <SectionHeader title="Knowledge Base" description="Point OSChief at a folder of notes — it will search them during live meetings and suggest relevant talking points" />
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[13px] font-medium text-foreground flex items-center gap-2">
                <FolderOpen className="h-3.5 w-3.5 text-accent" />
                Notes folder
              </p>
              {folderPath ? (
                <p className="text-[11px] text-muted-foreground mt-1 font-mono truncate max-w-[320px]">{folderPath}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-1">No folder selected</p>
              )}
            </div>
            <button
              onClick={handlePickFolder}
              disabled={scanning}
              className="rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
            >
              {folderPath ? "Change" : "Select folder"}
            </button>
          </div>

          {folderPath && (
            <div className="flex items-center justify-between border-t border-border pt-3">
              <p className="text-[12px] text-muted-foreground">
                <span className="font-medium text-foreground">{chunkCount}</span> chunks indexed
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleRescan}
                  disabled={scanning}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/50 px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={cn("h-3 w-3", scanning && "animate-spin")} />
                  Rescan
                </button>
                <button
                  onClick={handleClear}
                  className="flex items-center gap-1.5 rounded-md border border-red-200 dark:border-red-900 px-2.5 py-1 text-[11px] font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </button>
              </div>
            </div>
          )}

          {status && (
            <p className="text-[11px] text-muted-foreground border-t border-border pt-2">{status}</p>
          )}
        </div>

        <div className="rounded-md border border-blue-100 dark:border-blue-900 bg-blue-50/50 dark:bg-blue-950/20 p-3">
          <p className="text-[11px] text-blue-700 dark:text-blue-300 leading-relaxed">
            <strong>How it works:</strong> OSChief reads .md and .txt files from this folder, chunks and indexes them locally. During live meetings, it searches your notes for context relevant to the conversation and suggests talking points — powered by your selected AI model. Everything stays on your machine.
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Audio Test Panel ─────────────────────────────────────────────────────
type AudioTestStatus = "idle" | "testing" | "success" | "error";

function AudioTestPanel({ selectedDeviceId }: { selectedDeviceId: string }) {
  const api = getElectronAPI();

  // Mic state
  const [micStatus, setMicStatus] = useState<AudioTestStatus>("idle");
  const [micPermission, setMicPermission] = useState<string | null>(null);
  const [micLevel, setMicLevel] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const micAnimRef = useRef<number>(0);

  // System audio state
  const [sysStatus, setSysStatus] = useState<AudioTestStatus>("idle");
  const [sysPermission, setSysPermission] = useState<string | null>(null);
  const [sysError, setSysError] = useState<string | null>(null);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach(t => t.stop());
      }
      if (micAnimRef.current) cancelAnimationFrame(micAnimRef.current);
    };
  }, []);

  const testMicrophone = async () => {
    // Stop any existing stream
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
    }
    if (micAnimRef.current) cancelAnimationFrame(micAnimRef.current);

    setMicStatus("testing");
    setMicError(null);
    setMicLevel(0);

    try {
      // Check permission first (macOS)
      if (api?.permissions?.checkMicrophone) {
        const perm = await api.permissions.checkMicrophone();
        setMicPermission(perm);
        if (perm === "denied" || perm === "restricted") {
          // Try to request
          if (api.permissions.requestMicrophone) {
            const granted = await api.permissions.requestMicrophone();
            if (!granted) {
              setMicStatus("error");
              setMicError("Microphone access denied. Grant permission in System Settings → Privacy & Security → Microphone.");
              return;
            }
            setMicPermission("granted");
          }
        }
      }

      // Get user media
      const constraints: MediaStreamConstraints = {
        audio: {
          ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 16000,
        },
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      micStreamRef.current = stream;

      // Set up analyser to show live level
      const audioCtx = new AudioContext();
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      source.connect(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let peakSeen = false;

      const tick = () => {
        analyser.getByteFrequencyData(dataArray);
        // RMS-ish average
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
        const avg = sum / dataArray.length;
        const normalized = Math.min(1, avg / 80); // 0–1 range
        setMicLevel(normalized);
        if (normalized > 0.05) peakSeen = true;
        micAnimRef.current = requestAnimationFrame(tick);
      };
      tick();

      // Listen for 3 seconds, then report
      await new Promise(r => setTimeout(r, 3000));

      // Stop
      cancelAnimationFrame(micAnimRef.current);
      stream.getTracks().forEach(t => t.stop());
      micStreamRef.current = null;
      audioCtx.close();

      if (peakSeen) {
        setMicStatus("success");
      } else {
        setMicStatus("error");
        setMicError("Microphone captured but no audio detected. Try speaking louder or check your input device.");
      }
    } catch (err: any) {
      setMicStatus("error");
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        setMicError("Microphone access denied. Grant permission in System Settings → Privacy & Security → Microphone.");
      } else if (err.name === "NotFoundError") {
        setMicError("No microphone found. Connect a microphone and try again.");
      } else {
        setMicError(err.message || "Failed to access microphone.");
      }
    }
  };

  const testSystemAudio = async () => {
    setSysStatus("testing");
    setSysError(null);

    try {
      // Check screen recording permission (needed for system audio on macOS)
      if (api?.permissions?.checkScreenRecording) {
        const perm = await api.permissions.checkScreenRecording();
        setSysPermission(perm);
        if (perm === "denied" || perm === "restricted" || perm === "not-determined") {
          if (api.permissions.requestScreenRecording) {
            await api.permissions.requestScreenRecording();
            // Re-check
            const perm2 = await api.permissions.checkScreenRecording();
            setSysPermission(perm2);
            if (perm2 !== "granted") {
              setSysStatus("error");
              setSysError("Screen Recording permission required for system audio. Grant in System Settings → Privacy & Security → Screen Recording.");
              return;
            }
          }
        }
      }

      // Try to get desktop sources
      if (api?.audio?.getDesktopSources) {
        const sources = await api.audio.getDesktopSources();
        if (sources && sources.length > 0) {
          setSysStatus("success");
        } else {
          setSysStatus("error");
          setSysError("No desktop audio sources found. Ensure Screen Recording permission is granted.");
        }
      } else {
        setSysStatus("error");
        setSysError("System audio capture is not available in this environment.");
      }
    } catch (err: any) {
      setSysStatus("error");
      setSysError(err.message || "Failed to check system audio.");
    }
  };

  const statusIcon = (status: AudioTestStatus) => {
    switch (status) {
      case "testing": return <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />;
      case "success": return <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />;
      case "error": return <XCircle className="h-3.5 w-3.5 text-destructive" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-3">
      <label className="text-[13px] font-medium text-foreground mb-1 block">Audio test</label>
      <p className="text-[11px] text-muted-foreground -mt-2 mb-2">
        Check that your microphone and system audio are working before starting a recording.
      </p>

      {/* Microphone test */}
      <div className="rounded-md border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary flex-shrink-0">
              {micStatus === "error" ? <MicOff className="h-3.5 w-3.5 text-destructive" /> : <Mic className="h-3.5 w-3.5 text-muted-foreground" />}
            </div>
            <div className="min-w-0">
              <span className="text-[13px] text-foreground block">Microphone</span>
              {micPermission && (
                <span className={cn("text-[10px]", micPermission === "granted" ? "text-emerald-500" : "text-muted-foreground")}>
                  Permission: {micPermission}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {statusIcon(micStatus)}
            <button
              onClick={testMicrophone}
              disabled={micStatus === "testing"}
              className={cn(
                "rounded-md border px-3 py-1.5 text-[11px] font-medium transition-colors",
                micStatus === "testing"
                  ? "border-border bg-secondary text-muted-foreground cursor-not-allowed"
                  : "border-border bg-card text-foreground hover:bg-secondary"
              )}
            >
              {micStatus === "testing" ? "Listening…" : micStatus === "idle" ? "Test" : "Retest"}
            </button>
          </div>
        </div>

        {/* Live level meter */}
        {micStatus === "testing" && (
          <div className="mt-2.5">
            <div className="h-1.5 w-full rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all duration-100"
                style={{ width: `${Math.max(2, micLevel * 100)}%` }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">Speak into your mic — you should see the bar move</p>
          </div>
        )}

        {micStatus === "success" && (
          <p className="text-[11px] text-emerald-500 mt-2">Microphone is working — audio detected.</p>
        )}

        {micError && (
          <p className="text-[11px] text-destructive mt-2">{micError}</p>
        )}
      </div>

      {/* System audio test */}
      <div className="rounded-md border border-border bg-card p-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex h-7 w-7 items-center justify-center rounded-md bg-secondary flex-shrink-0">
              <MonitorSpeaker className="h-3.5 w-3.5 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <span className="text-[13px] text-foreground block">System audio</span>
              {sysPermission && (
                <span className={cn("text-[10px]", sysPermission === "granted" ? "text-emerald-500" : "text-muted-foreground")}>
                  Screen Recording: {sysPermission}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {statusIcon(sysStatus)}
            <button
              onClick={testSystemAudio}
              disabled={sysStatus === "testing"}
              className={cn(
                "rounded-md border px-3 py-1.5 text-[11px] font-medium transition-colors",
                sysStatus === "testing"
                  ? "border-border bg-secondary text-muted-foreground cursor-not-allowed"
                  : "border-border bg-card text-foreground hover:bg-secondary"
              )}
            >
              {sysStatus === "testing" ? "Checking…" : sysStatus === "idle" ? "Test" : "Retest"}
            </button>
          </div>
        </div>

        {sysStatus === "success" && (
          <p className="text-[11px] text-emerald-500 mt-2">System audio capture is available.</p>
        )}

        {sysError && (
          <p className="text-[11px] text-destructive mt-2">{sysError}</p>
        )}
      </div>
    </div>
  );
}

const PREFS_LS_KEY = "syag-preferences";
const CALENDAR_PROVIDER_KEY = "syag_calendar_provider";

function getStoredCalendarProvider(): CalendarProviderId | null {
  try {
    const v = localStorage.getItem(CALENDAR_PROVIDER_KEY);
    if (v === "google" || v === "outlook" || v === "apple") return v;
  } catch {}
  return null;
}

interface Preferences {
  showRecordingIndicator: boolean;
  launchOnStartup: boolean;
  hideFromScreenShare: boolean;
  appearance: "light" | "dark" | "system";
}

const defaultPrefs: Preferences = {
  showRecordingIndicator: true,
  launchOnStartup: false,
  hideFromScreenShare: false,
  appearance: "system",
};

function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(PREFS_LS_KEY);
    if (raw) return { ...defaultPrefs, ...JSON.parse(raw) };
  } catch {}
  return defaultPrefs;
}

function savePreferences(prefs: Preferences) {
  localStorage.setItem(PREFS_LS_KEY, JSON.stringify(prefs));
}

function applyAppearance(mode: Preferences["appearance"]) {
  const root = document.documentElement;
  if (mode === "dark") {
    root.classList.add("dark");
  } else if (mode === "light") {
    root.classList.remove("dark");
  } else {
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.classList.toggle("dark", prefersDark);
  }
}

export { applyAppearance };
export { loadPreferences };

function loadAccount() {
  try {
    const raw = localStorage.getItem(ACCOUNT_LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { name: "", email: "", role: "", roleId: "", company: "" };
}

/** Predefined roles for the coaching knowledge base — must match electron/main/models/coaching-kb.ts */
const ROLE_OPTIONS = [
  { id: 'product-manager', label: 'Product Manager', icon: '📦' },
  { id: 'engineering-manager', label: 'Engineering Manager', icon: '⚙️' },
  { id: 'engineer', label: 'Software Engineer', icon: '💻' },
  { id: 'founder-ceo', label: 'Founder / CEO', icon: '🚀' },
  { id: 'designer', label: 'Designer', icon: '🎨' },
  { id: 'sales', label: 'Sales', icon: '💼' },
  { id: 'marketing', label: 'Marketing', icon: '📣' },
  { id: 'operations', label: 'Operations', icon: '🔧' },
  { id: 'data-science', label: 'Data / Analytics', icon: '📊' },
  { id: 'people-hr', label: 'People / HR', icon: '🤝' },
  { id: 'custom', label: 'Other', icon: '✏️' },
] as const;

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function AccountSection() {
  const [account, setAccount] = useState(loadAccount);
  const [saved, setSaved] = useState(false);
  const [roleDropdownOpen, setRoleDropdownOpen] = useState(false);
  const roleDropdownRef = useRef<HTMLDivElement>(null);

  const handleChange = (field: string, value: string) => {
    setAccount((prev: any) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleRoleSelect = (roleId: string) => {
    const role = ROLE_OPTIONS.find(r => r.id === roleId);
    setAccount((prev: any) => ({
      ...prev,
      roleId,
      role: roleId === 'custom' ? prev.role : (role?.label ?? ''),
    }));
    setRoleDropdownOpen(false);
    setSaved(false);
  };

  const handleSave = () => {
    localStorage.setItem(ACCOUNT_LS_KEY, JSON.stringify(account));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  // Close dropdown on outside click
  useEffect(() => {
    if (!roleDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (roleDropdownRef.current && !roleDropdownRef.current.contains(e.target as Node)) {
        setRoleDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [roleDropdownOpen]);

  const selectedRole = ROLE_OPTIONS.find(r => r.id === account.roleId);
  const isCustomRole = account.roleId === 'custom';

  const textFields = [
    { key: "name", label: "Name", placeholder: "Your name" },
    { key: "email", label: "Email", placeholder: "you@example.com" },
    { key: "company", label: "Company", placeholder: "e.g. Acme Inc." },
  ];

  return (
    <>
      <div className="space-y-3">
        {textFields.map((field) => (
          <div key={field.key}>
            <label className="text-[13px] font-medium text-foreground">{field.label}</label>
            <input
              value={account[field.key] || ""}
              onChange={(e) => handleChange(field.key, e.target.value)}
              placeholder={field.placeholder}
              className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
          </div>
        ))}

        {/* Role selector — drives the coaching knowledge base */}
        <div ref={roleDropdownRef} className="relative">
          <label className="text-[13px] font-medium text-foreground">Role</label>
          <p className="text-[11px] text-muted-foreground mb-1">Your role determines the coaching advice and frameworks OSChief uses.</p>
          <button
            onClick={() => setRoleDropdownOpen(!roleDropdownOpen)}
            className="mt-1 flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground hover:bg-secondary/50 transition-colors focus:outline-none focus:ring-2 focus:ring-ring/20"
          >
            <span className="flex items-center gap-2">
              {selectedRole ? (
                <>
                  <span>{selectedRole.icon}</span>
                  <span>{selectedRole.label}</span>
                </>
              ) : (
                <span className="text-muted-foreground">Select your role...</span>
              )}
            </span>
            <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", roleDropdownOpen && "rotate-180")} />
          </button>

          {roleDropdownOpen && (
            <div className="absolute left-0 top-full mt-1 w-full rounded-lg border border-border bg-popover shadow-lg z-50 overflow-hidden py-1 max-h-64 overflow-y-auto">
              {ROLE_OPTIONS.map((role) => (
                <button
                  key={role.id}
                  onClick={() => handleRoleSelect(role.id)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-2 text-[13px] transition-colors",
                    account.roleId === role.id
                      ? "bg-secondary text-foreground font-medium"
                      : "text-foreground hover:bg-secondary/60"
                  )}
                >
                  <span className="w-5 text-center">{role.icon}</span>
                  <span>{role.label}</span>
                  {account.roleId === role.id && <Check className="h-3.5 w-3.5 ml-auto text-accent" />}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Custom role text input — shown when "Other" is selected */}
        {isCustomRole && (
          <div>
            <label className="text-[13px] font-medium text-foreground">Custom Role</label>
            <input
              value={account.role || ""}
              onChange={(e) => handleChange("role", e.target.value)}
              placeholder="e.g. Product Marketing Manager"
              className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
            />
          </div>
        )}

      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={handleSave}
          className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-2 text-xs font-medium text-accent-foreground hover:opacity-90"
        >
          <Save className="h-3 w-3" />
          Save Changes
        </button>
        {saved && <span className="text-xs text-accent flex items-center gap-1"><Check className="h-3 w-3" /> Saved</span>}
      </div>
      <div className="pt-4 border-t border-border">
        <button className="text-[12px] text-destructive hover:underline">Delete Account</button>
      </div>
    </>
  );
}


import { BUILTIN_TEMPLATES } from "@/data/templates";

function TemplatesSection() {
  const api = getElectronAPI();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [customTemplates, setCustomTemplates] = useState<Array<{ id: string; name: string; prompt: string }>>([]);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (!api) return;
    api.db.settings.get("custom-templates").then((val: string | null) => {
      if (val) {
        try { setCustomTemplates(JSON.parse(val)); } catch {}
      }
    });
  }, []);

  const addCustomTemplate = () => {
    if (!newName.trim()) return;
    const id = `custom-${Date.now()}`;
    const updated = [...customTemplates, { id, name: newName.trim(), prompt: "" }];
    setCustomTemplates(updated);
    setNewName("");
    setExpandedId(id);
    if (api) api.db.settings.set("custom-templates", JSON.stringify(updated));
  };

  const updateCustomTemplate = (id: string, field: "name" | "prompt", value: string) => {
    const updated = customTemplates.map((t) => (t.id === id ? { ...t, [field]: value } : t));
    setCustomTemplates(updated);
    if (api) {
      api.db.settings.set("custom-templates", JSON.stringify(updated));
      if (field === "prompt") {
        api.db.settings.set(`template-prompt-${id}`, value);
      }
    }
  };

  const deleteCustomTemplate = (id: string) => {
    const updated = customTemplates.filter((t) => t.id !== id);
    setCustomTemplates(updated);
    if (api) api.db.settings.set("custom-templates", JSON.stringify(updated));
  };

  return (
    <div className="space-y-5">
      <SectionHeader title="Note Templates" description="Customize the prompts used to generate meeting notes for each template type" />

      <div className="space-y-2">
        <h3 className="text-[13px] font-medium text-foreground">Built-in Templates</h3>
        <p className="text-[11px] text-muted-foreground mb-2">Industry-standard templates. Locked; use as-is. Default is General.</p>
        {BUILTIN_TEMPLATES.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span>{t.icon}</span>
              <span className="text-[13px] font-medium text-foreground">{t.name}</span>
            </div>
            <span className="text-[10px] text-muted-foreground px-2 py-0.5 rounded-full border border-border">Locked</span>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <h3 className="text-[13px] font-medium text-foreground">Custom Templates</h3>
        {customTemplates.map((ct) => {
          const isExpanded = expandedId === ct.id;
          return (
            <div key={ct.id} className="rounded-md border border-border bg-card overflow-hidden">
              <button
                onClick={() => setExpandedId(isExpanded ? null : ct.id)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-secondary/50 transition-colors"
              >
                <span className="text-[13px] font-medium text-foreground">{ct.name}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteCustomTemplate(ct.id); }}
                    className="rounded p-1 text-muted-foreground hover:text-red-500 transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>
              </button>
              {isExpanded && (
                <div className="px-3 pb-3 border-t border-border space-y-2">
                  <div className="mt-2">
                    <label className="text-[11px] text-muted-foreground">Template name</label>
                    <input
                      value={ct.name}
                      onChange={(e) => updateCustomTemplate(ct.id, "name", e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground">Custom prompt</label>
                    <textarea
                      value={ct.prompt}
                      onChange={(e) => updateCustomTemplate(ct.id, "prompt", e.target.value)}
                      placeholder="Describe how notes should be structured for this type of meeting..."
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 resize-none mt-1"
                      rows={5}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div className="flex gap-2 mt-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustomTemplate()}
            placeholder="New template name..."
            className="flex-1 rounded-md border border-border bg-card px-3 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
          <button
            onClick={addCustomTemplate}
            disabled={!newName.trim()}
            className="flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-[12px] text-foreground hover:bg-secondary transition-colors disabled:opacity-40"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const modelSettings = useModelSettings();
  const { icsFeeds, removeCalendarFeed, clearCalendar } = useCalendar();
  const [calendarProvider, setCalendarProvider] = useState<CalendarProviderId | null>(getStoredCalendarProvider);
  const [icsDialogOpen, setIcsDialogOpen] = useState(false);
  const [icsDialogProvider, setIcsDialogProvider] = useState<CalendarProviderId | null>(null);
  const { sidebarOpen } = useSidebarVisibility();
  const {
    selectedAIModel, setSelectedAIModel,
    selectedSTTModel, setSelectedSTTModel,
    downloadStates, downloadProgress,
    handleDownload, handleDeleteModel, handleRepairModel,
    connectedProviders, setConnectedProviders,
    connectProvider, disconnectProvider,
    useLocalModels, setUseLocalModels,
    getAvailableAIModels,
    appleFoundationAvailable,
    effectiveProviders,
    ollamaStatus,
    refreshOllama,
    pullOllamaModel,
  } = modelSettings;
  const [active, setActive] = useState("account");
  const [aiModelsTab, setAiModelsTab] = useState<AiModelsSubTab>("models");
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updateDownloaded, setUpdateDownloaded] = useState<string | null>(null);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateResult, setUpdateResult] = useState<string | null>(null);
  const [updateErrorDetail, setUpdateErrorDetail] = useState<string | null>(null);

  const [toggles, setToggles] = useState<Record<string, boolean>>({ ...DEFAULT_TOGGLES });
  const [togglesLoaded, setTogglesLoaded] = useState(false);
  const [trayAgendaEnabled, setTrayAgendaEnabled] = useState(false);
  const [trayCalendarRange, setTrayCalendarRange] = useState<"today" | "today_tomorrow">("today_tomorrow");
  const [trayCalendarClick, setTrayCalendarClick] = useState<"note" | "calendar">("note");
  /** default = balanced gates; sensitive = looser energy + dedup (see electron/main/audio/capture.ts) */
  const [sttCaptureSensitivity, setSttCaptureSensitivity] = useState<"default" | "sensitive">("default");
  const api = getElectronAPI();

  useEffect(() => {
    const sec = searchParams.get("section");
    if (sec && sections.some((s) => s.id === sec)) setActive(sec);
    if (sec === "ai-models") {
      const sub = searchParams.get(AI_MODELS_SUB_QUERY);
      setAiModelsTab(sub === "transcription" ? "transcription" : "models");
    }
  }, [searchParams]);

  const handleAiModelsTabChange = (value: string) => {
    const v: AiModelsSubTab = value === "transcription" ? "transcription" : "models";
    setAiModelsTab(v);
    setSearchParams((prev) => {
      const p = new URLSearchParams(prev);
      p.set("section", "ai-models");
      p.set(AI_MODELS_SUB_QUERY, v);
      return p;
    });
  };

  useEffect(() => {
    if (!api) return;
    (async () => {
      try {
        const a = await api.db.settings.get("tray-calendar-agenda");
        setTrayAgendaEnabled(a === "true");
        const r = await api.db.settings.get("tray-calendar-range");
        if (r === "today" || r === "today_tomorrow") setTrayCalendarRange(r);
        const c = await api.db.settings.get("tray-calendar-click");
        if (c === "note" || c === "calendar") setTrayCalendarClick(c);
        const sens = await api.db.settings.get("stt-capture-sensitivity");
        if (sens === "sensitive") setSttCaptureSensitivity("sensitive");
      } catch {
        /* defaults */
      }
    })();
  }, [api]);

  useEffect(() => {
    if (api?.app?.getVersion) {
      api.app.getVersion().then(setAppVersion).catch(() => setAppVersion(null));
    }
  }, [api]);

  useEffect(() => {
    if (!api?.app?.onUpdateDownloaded) return;
    const unsub = api.app.onUpdateDownloaded((version) => {
      setUpdateDownloaded(version);
      setUpdateChecking(false);
      setUpdateResult(null);
      setUpdateErrorDetail(null);
    });
    return unsub;
  }, [api]);

  useEffect(() => {
    if (!api?.app?.onUpdateError) return;
    return api.app.onUpdateError((message) => {
      setUpdateChecking(false);
      setUpdateResult("error");
      setUpdateErrorDetail(message);
    });
  }, [api]);

  // Load all toggle values from DB on mount
  useEffect(() => {
    if (!api) { setTogglesLoaded(true); return; }

    (async () => {
      const loaded = { ...DEFAULT_TOGGLES };
      for (const [uiKey, dbKey] of Object.entries(TOGGLE_DB_KEYS)) {
        try {
          const val = await api.db.settings.get(dbKey);
          if (val !== null) {
            loaded[uiKey] = JSON.parse(val);
          }
        } catch {}
      }
      // Capture reads `transcribe-when-stopped` only; keep legacy `real-time-transcription` aligned.
      const batchMode = loaded.transcribeWhenStopped;
      const expectLiveUi = !batchMode;
      if (loaded.realTimeTranscribe !== expectLiveUi) {
        loaded.realTimeTranscribe = expectLiveUi;
        api.db.settings.set('real-time-transcription', JSON.stringify(expectLiveUi)).catch(console.error);
      }
      setToggles(loaded);
      setTogglesLoaded(true);
    })();
  }, []);

  const toggle = (key: string) => {
    setToggles((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      const dbKey = TOGGLE_DB_KEYS[key];
      if (api && dbKey) {
        api.db.settings.set(dbKey, JSON.stringify(next[key])).catch(console.error);
      }
      return next;
    });
  };

  const [prefs, setPrefs] = useState<Preferences>(loadPreferences);

  // Align hide-from-screen-share with main process DB (window uses this on startup) and migrate legacy LS-only state.
  useEffect(() => {
    if (!api) return;
    (async () => {
      try {
        const v = await api.db.settings.get("hide-from-screen-share");
        const prev = loadPreferences();
        let hide = prev.hideFromScreenShare;
        if (v === "true") hide = true;
        else if (v === "false") hide = false;
        else if (v === null && prev.hideFromScreenShare) {
          await api.db.settings.set("hide-from-screen-share", "true");
          await api.contentProtection?.set(true);
          hide = true;
        }
        setPrefs((p) => {
          if (p.hideFromScreenShare === hide) return p;
          const next = { ...p, hideFromScreenShare: hide };
          savePreferences(next);
          return next;
        });
      } catch {
        /* ignore */
      }
    })();
  }, [api]);

  const updatePref = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      savePreferences(next);
      if (key === "appearance") applyAppearance(value as Preferences["appearance"]);
      if (key === "launchOnStartup" && api) {
        api.app.setLoginItem(value as boolean).catch(console.error);
      }
      if (key === "showRecordingIndicator") {
        dispatchPreferencesUpdated();
      }
      return next;
    });
  };

  const [editingApiKey, setEditingApiKey] = useState<string | null>(null);
  const [tempApiKey, setTempApiKey] = useState("");
  const [aiModelOpen, setAiModelOpen] = useState(false);
  const [sttModelOpen, setSttModelOpen] = useState(false);

  // AI model options: from context (includes Apple on-device when available, local, connected providers)
  const aiOptions = useMemo(
    () => getAvailableAIModels(),
    [getAvailableAIModels, appleFoundationAvailable, connectedProviders, downloadStates]
  );

  // Build STT model options: local + system (darwin) + connected providers (sttOnly all, supportsStt whisper-only)
  const sttOptions = useMemo(() => {
    const out: { value: string; label: string; group: string }[] = [];
    localModels
      .filter((m) => m.type === "stt" && downloadStates[m.id] === "downloaded")
      .forEach((m) => out.push({ value: `local:${m.id}`, label: `${m.name} (Local)`, group: "Local Models" }));
    if (api?.app?.getPlatform?.() === "darwin") {
      out.push({ value: "system:default", label: "Apple Speech (macOS)", group: "System" });
    }
    Object.entries(connectedProviders)
      .filter(([_, v]) => v.connected)
      .forEach(([pid]) => {
        const provider = effectiveProviders.find((p) => p.id === pid);
        if (!provider) return;
        const sttModels = provider.sttOnly
          ? provider.models
          : provider.models.filter((m) => m.toLowerCase().includes("whisper"));
        if (sttModels.length === 0) return;
        sttModels.forEach((m) =>
          out.push({ value: `${pid}:${m}`, label: m, group: `${provider.icon} ${provider.name}` })
        );
      });
    return out;
  }, [connectedProviders, downloadStates, api, effectiveProviders]);

  const selectedAILabel = selectedAIModel ? (aiOptions.find((o) => o.value === selectedAIModel)?.label ?? selectedAIModel) : "";
  const selectedSTTLabel = selectedSTTModel ? (sttOptions.find((o) => o.value === selectedSTTModel)?.label ?? selectedSTTModel) : "";

  // Custom vocabulary (persisted to DB)
  const [customTerms, setCustomTerms] = useState("");
  const customTermsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!api) return;
    api.db.settings.get('custom-vocabulary').then(val => {
      if (val) setCustomTerms(val);
    }).catch(console.error);
  }, []);

  const handleCustomTermsChange = (value: string) => {
    setCustomTerms(value);
    if (customTermsTimerRef.current) clearTimeout(customTermsTimerRef.current);
    customTermsTimerRef.current = setTimeout(() => {
      if (api) {
        api.db.settings.set('custom-vocabulary', value).catch(console.error);
      }
    }, 500);
  };

  // Audio input devices
  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>("");

  useEffect(() => {
    navigator.mediaDevices.enumerateDevices().then(devices => {
      setAudioDevices(devices.filter(d => d.kind === 'audioinput'));
    }).catch(console.error);

    if (api) {
      api.db.settings.get('audio-input-device').then(val => {
        if (val) setSelectedDeviceId(val);
      }).catch(console.error);
    }
  }, []);

  const handleDeviceChange = (deviceId: string) => {
    setSelectedDeviceId(deviceId);
    if (api) {
      api.db.settings.set('audio-input-device', deviceId).catch(console.error);
    }
  };

  const handleConnectProvider = async (providerId: string) => {
    if (editingApiKey === providerId) {
      if (tempApiKey.trim()) {
        await connectProvider(providerId, tempApiKey.trim());
      }
      setEditingApiKey(null);
      setTempApiKey("");
    } else {
      setEditingApiKey(providerId);
      setTempApiKey(connectedProviders[providerId]?.apiKey || "");
    }
  };

  const handleDisconnectProvider = async (providerId: string) => {
    await disconnectProvider(providerId);
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {sidebarOpen && (
        <div className="w-48 flex-shrink-0 overflow-hidden">
          <Sidebar />
        </div>
      )}
      <main className={cn("flex-1 overflow-y-auto", !sidebarOpen && isElectron && "pl-20")}>
        <div className={cn("flex items-center justify-between px-4 pb-0", isElectron ? "pt-10" : "pt-3")}>
          <SidebarCollapseButton />
        </div>
        <div className="mx-auto max-w-3xl px-6 pt-4 pb-12">
          <h1 className="font-display text-2xl text-foreground mb-6">Settings</h1>

          <div className="flex gap-8">
            <nav className="flex w-40 flex-shrink-0 flex-col gap-0.5 sticky top-4 self-start">
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors text-left",
                    active === s.id
                      ? "bg-secondary text-foreground font-medium"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  )}
                >
                  <s.icon className="h-3.5 w-3.5 flex-shrink-0" />
                  {s.label}
                </button>
              ))}
            </nav>

            <div className="flex-1 min-w-0 animate-fade-in" key={active}>
              {active === "account" && (
                <div className="space-y-5">
                  <SectionHeader title="Account" description="Your personal information and preferences" />
                  <AccountSection />
                </div>
              )}

              {active === "meeting" && (
                <div className="space-y-5">
                  <SectionHeader title="Meeting & Preferences" description="Recording behavior, templates, and appearance" />
                  <div className="space-y-2">
                    <SettingRow label="Live recording indicator" description="Shows a compact pill at the top-right while transcribing when you’re not on the live note screen. Turn off to hide it. Open OSChief from the Dock or menu bar anytime.">
                      <Toggle enabled={prefs.showRecordingIndicator} onToggle={() => updatePref("showRecordingIndicator", !prefs.showRecordingIndicator)} />
                    </SettingRow>
                    <SettingRow label="Launch OSChief on startup" description="OSChief will open automatically when you log in">
                      <Toggle enabled={prefs.launchOnStartup} onToggle={() => updatePref("launchOnStartup", !prefs.launchOnStartup)} />
                    </SettingRow>
                    <SettingRow label="Hide from screen sharing" description="Prevents the OSChief window from appearing in screen shares and recordings — invisible to others on calls">
                      <Toggle enabled={prefs.hideFromScreenShare ?? false} onToggle={() => {
                        const newVal = !(prefs.hideFromScreenShare ?? false);
                        updatePref("hideFromScreenShare", newVal);
                        api?.contentProtection?.set(newVal);
                      }} />
                    </SettingRow>
                  </div>
                  <div>
                    <label className="text-[13px] font-medium text-foreground mb-2 block">Appearance</label>
                    <p className="text-[11px] text-muted-foreground mb-3">Select your interface color scheme</p>
                    <div className="flex gap-2">
                      {([
                        { value: "light" as const, label: "Light", icon: Sun },
                        { value: "dark" as const, label: "Dark", icon: Moon },
                        { value: "system" as const, label: "System", icon: Monitor },
                      ]).map((opt) => (
                        <button
                          key={opt.value}
                          onClick={() => updatePref("appearance", opt.value)}
                          className={cn(
                            "flex items-center gap-2 rounded-md border px-4 py-2 text-[13px] font-medium transition-colors",
                            prefs.appearance === opt.value
                              ? "border-accent bg-accent/10 text-foreground"
                              : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                          )}
                        >
                          <opt.icon className="h-3.5 w-3.5" />
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <label className="text-[13px] font-medium text-foreground mb-2 block">Custom vocabulary</label>
                    <p className="text-[11px] text-muted-foreground mb-2">Add company-specific terms to improve transcription accuracy. Used as keywords for Deepgram and as context for local Whisper; one term per line.</p>
                    <textarea
                      value={customTerms}
                      onChange={(e) => handleCustomTermsChange(e.target.value)}
                      placeholder={"Acme Corp\nProject Falcon\nQ3 Roadmap"}
                      rows={4}
                      className="w-full rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 resize-none font-mono"
                    />
                  </div>
                </div>
              )}

              {active === "ai-models" && (
                <div className="space-y-6">
                  <SectionHeader title="AI Models" description="Choose which AI models power your notes and transcription. Use local models for privacy or connect to enterprise providers for maximum quality." />

                  {!isElectron && (
                    <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800 p-3">
                      <p className="text-[12px] text-amber-700 dark:text-amber-300">
                        Running in web mode. Local model downloads require the desktop app. Cloud providers work in both modes.
                      </p>
                    </div>
                  )}

                  <div className="mt-4 space-y-6">
                  {/* Default Model Selection */}
                  <div className="space-y-3">
                    <h3 className="text-[13px] font-medium text-foreground flex items-center gap-2">
                      <Brain className="h-3.5 w-3.5 text-accent" />
                      Default AI Model (for notes & chat)
                    </h3>
                    <Popover open={aiModelOpen} onOpenChange={setAiModelOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="w-full flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                        >
                          <span className={selectedAILabel ? "" : "text-muted-foreground"}>
                            {selectedAILabel || "Select a model..."}
                          </span>
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                        <Command className="rounded-md border-0">
                          <CommandInput placeholder="Search models..." className="h-9" />
                          <CommandList>
                            <CommandEmpty>No model found.</CommandEmpty>
                            {Array.from(new Set(aiOptions.map((o) => o.group))).map((group) => (
                              <CommandGroup key={group} heading={group}>
                                {aiOptions.filter((o) => o.group === group).map((o) => (
                                  <CommandItem
                                    key={o.value}
                                    value={`${o.label} ${o.group}`}
                                    onSelect={() => {
                                      setSelectedAIModel(o.value);
                                      setAiModelOpen(false);
                                    }}
                                  >
                                    {o.label}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            ))}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Default STT Model */}
                  <div className="space-y-3">
                    <h3 className="text-[13px] font-medium text-foreground flex items-center gap-2">
                      <Volume2 className="h-3.5 w-3.5 text-accent" />
                      Speech-to-Text Model (transcription)
                    </h3>
                    <Popover open={sttModelOpen} onOpenChange={setSttModelOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="w-full flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                        >
                          <span className={selectedSTTLabel ? "" : "text-muted-foreground"}>
                            {selectedSTTLabel || "Select a model..."}
                          </span>
                          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
                        <Command className="rounded-md border-0">
                          <CommandInput placeholder="Search models..." className="h-9" />
                          <CommandList>
                            <CommandEmpty>No model found.</CommandEmpty>
                            {Array.from(new Set(sttOptions.map((o) => o.group))).map((group) => (
                              <CommandGroup key={group} heading={group}>
                                {sttOptions.filter((o) => o.group === group).map((o) => (
                                  <CommandItem
                                    key={o.value}
                                    value={`${o.label} ${o.group}`}
                                    onSelect={() => {
                                      setSelectedSTTModel(o.value);
                                      setSttModelOpen(false);
                                    }}
                                  >
                                    {o.label}
                                  </CommandItem>
                                ))}
                              </CommandGroup>
                            ))}
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  {/* Local Models Section */}
                  <div className="space-y-3 pt-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-[13px] font-medium text-foreground flex items-center gap-2">
                        <HardDrive className="h-3.5 w-3.5" />
                        Local Models
                      </h3>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground shrink-0">
                        <span>Use local by default</span>
                        <Toggle enabled={useLocalModels} onToggle={() => setUseLocalModels(!useLocalModels)} />
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground -mt-2">Download models to run entirely on your device. With local models, transcription and summaries stay on this device.</p>

                    {isElectron && (
                      <details className="rounded-md border border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
                        <summary className="cursor-pointer select-none font-medium text-foreground flex items-center gap-2 list-none [&::-webkit-details-marker]:hidden">
                          <Info className="h-3.5 w-3.5 shrink-0 text-accent" />
                          How local install works (step-by-step toasts)
                        </summary>
                        <ul className="mt-2.5 list-disc pl-4 space-y-1.5">
                          <li>
                            <span className="text-foreground font-medium">Whisper Large V3 Turbo</span> — OSChief downloads the model file, then looks for or installs{" "}
                            <code className="rounded bg-muted px-1 py-0.5 text-[10px]">whisper-cli</code> (build from source or{" "}
                            <code className="rounded bg-muted px-1 py-0.5 text-[10px]">brew install whisper-cpp</code>). When it finishes, a toast lists every step.
                          </li>
                          <li>
                            <span className="text-foreground font-medium">MLX Whisper</span> — OSChief ensures{" "}
                            <code className="rounded bg-muted px-1 py-0.5 text-[10px]">ffmpeg</code> (often via Homebrew), then runs{" "}
                            <code className="rounded bg-muted px-1 py-0.5 text-[10px]">pip</code> for the Python package. You need Python 3; the toast shows what ran and what to run in{" "}
                            <Terminal className="inline h-3 w-3 align-text-bottom" /> Terminal if something fails.
                          </li>
                          <li className="list-none pl-0 -ml-4 text-[10px] pt-1">
                            More detail: <code className="rounded bg-muted px-1 py-0.5">docs/local-stt-setup.md</code> in the OSChief repo.
                          </li>
                        </ul>
                      </details>
                    )}

                    <div className="space-y-1.5">
                      {localModels.map((model) => {
                        const state = downloadStates[model.id] || "idle";
                        const progress = downloadProgress[model.id];
                        return (
                          <div key={model.id} className="rounded-md border border-border bg-card overflow-hidden">
                            <div className="flex items-center justify-between p-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-[13px] font-medium text-foreground">{model.name}</span>
                                  <span className={cn(
                                    "rounded px-1.5 py-0.5 text-[9px] font-medium uppercase",
                                    model.type === "stt" ? "bg-accent/10 text-accent" : "bg-primary/10 text-primary"
                                  )}>
                                    {model.type === "stt" ? "Speech-to-Text" : "LLM"}
                                  </span>
                                </div>
                                <p className="text-[11px] text-muted-foreground">{model.description} · {model.size}</p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {state === "idle" && (
                                  <button
                                    onClick={() => handleDownload(model.id)}
                                    className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-secondary transition-colors"
                                  >
                                    <Download className="h-3 w-3" />
                                    Download
                                  </button>
                                )}
                                {state === "downloading" && (
                                  <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-muted-foreground">
                                    <RefreshCw className="h-3 w-3 animate-spin" />
                                    {progress ? `${progress.percent}%` : 'Starting...'}
                                  </div>
                                )}
                                {state === "downloaded" && (
                                  <>
                                    <span className="flex items-center gap-1 text-[11px] text-accent font-medium">
                                      <Check className="h-3 w-3" />
                                      Ready
                                    </span>
                                    {model.id.includes('mlx') && (
                                      <button
                                        onClick={() => handleRepairModel(model.id)}
                                        className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                                        title="Repair: reinstall dependencies"
                                      >
                                        <RefreshCw className="h-3 w-3" />
                                      </button>
                                    )}
                                    <button
                                      onClick={() => handleDeleteModel(model.id)}
                                      className="rounded p-1 text-muted-foreground hover:text-destructive transition-colors"
                                      title="Remove model"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </>
                                )}
                              </div>
                            </div>
                            {state === "downloading" && progress && (
                              <div className="px-3 pb-3">
                                <div className="w-full h-1 rounded-full bg-secondary overflow-hidden">
                                  <div
                                    className="h-full bg-accent rounded-full transition-all duration-300"
                                    style={{ width: `${progress.percent}%` }}
                                  />
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-1">
                                  {formatBytes(progress.bytesDownloaded)} / {formatBytes(progress.totalBytes)}
                                </p>
                                {model.id === "whisper-large-v3-turbo" && progress.percent >= 100 && (
                                  <p className="text-[10px] text-muted-foreground mt-1.5 leading-snug">
                                    Model file done. Setting up <code className="rounded bg-muted px-0.5">whisper-cli</code> (build or Homebrew) — can take several minutes. You’ll get a step-by-step toast when finished.
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Ollama (larger local models via Ollama) */}
                  {isElectron && (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-[13px] font-medium text-foreground flex items-center gap-2">
                          <Monitor className="h-3.5 w-3.5" />
                          Ollama
                          {!ollamaStatus.available && (
                            <span className="text-[10px] font-normal text-muted-foreground">(not running)</span>
                          )}
                        </h3>
                        <button
                          onClick={() => refreshOllama()}
                          className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <RefreshCw className="h-3 w-3" />
                          {ollamaStatus.available ? "Refresh" : "Detect"}
                        </button>
                      </div>

                      {!ollamaStatus.available ? (
                        <div className="rounded-md border border-border bg-muted/40 p-3">
                          <p className="text-[11px] text-muted-foreground">
                            Run larger AI models locally for better quality notes.{" "}
                            <a
                              href="https://ollama.com"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-accent hover:underline inline-flex items-center gap-0.5"
                            >
                              Install Ollama
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                            , then restart OSChief.
                          </p>
                        </div>
                      ) : (
                        <>
                          {/* Recommended model: Llama 3.1 8B */}
                          {(() => {
                            const RECOMMENDED_TAG = "llama3.1:8b";
                            const RECOMMENDED_NAME = "Llama 3.1 8B";
                            const RECOMMENDED_SIZE = "~5 GB";
                            const isAlreadyPulled = ollamaStatus.models.some(
                              (m) => m.includes("llama3.1") || m.includes("llama3.1:8b")
                            );
                            const isPulling = ollamaStatus.pulling === RECOMMENDED_TAG;
                            const lowRam = ollamaStatus.ramGB > 0 && ollamaStatus.ramGB < 16;

                            return (
                              <div className="space-y-1.5">
                                <div className="rounded-md border border-border bg-card overflow-hidden">
                                  <div className="flex items-center justify-between p-3">
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2">
                                        <span className="text-[13px] font-medium text-foreground">{RECOMMENDED_NAME}</span>
                                        <span className="rounded px-1.5 py-0.5 text-[9px] font-medium uppercase bg-primary/10 text-primary">
                                          LLM
                                        </span>
                                      </div>
                                      <p className="text-[11px] text-muted-foreground">
                                        Recommended local model for meeting notes · {RECOMMENDED_SIZE}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      {isAlreadyPulled ? (
                                        <span className="flex items-center gap-1 text-[11px] text-accent font-medium">
                                          <Check className="h-3 w-3" />
                                          Ready
                                        </span>
                                      ) : isPulling ? (
                                        <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-muted-foreground">
                                          <RefreshCw className="h-3 w-3 animate-spin" />
                                          {ollamaStatus.pullPercent > 0 ? `${ollamaStatus.pullPercent}%` : "Starting..."}
                                        </div>
                                      ) : (
                                        <button
                                          onClick={() => pullOllamaModel(RECOMMENDED_TAG)}
                                          disabled={lowRam}
                                          className={cn(
                                            "flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium transition-colors",
                                            lowRam
                                              ? "text-muted-foreground cursor-not-allowed opacity-50"
                                              : "text-foreground hover:bg-secondary"
                                          )}
                                        >
                                          <Download className="h-3 w-3" />
                                          Pull
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                  {isPulling && ollamaStatus.pullPercent > 0 && (
                                    <div className="px-3 pb-3">
                                      <div className="w-full h-1 rounded-full bg-secondary overflow-hidden">
                                        <div
                                          className="h-full bg-accent rounded-full transition-all duration-300"
                                          style={{ width: `${ollamaStatus.pullPercent}%` }}
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                                {lowRam && (
                                  <p className="text-[10px] text-muted-foreground">
                                    Your Mac has {ollamaStatus.ramGB}GB RAM. Ollama models work best with 16GB+. You can still use the lightweight local models above.
                                  </p>
                                )}
                              </div>
                            );
                          })()}

                          {/* Already-pulled Ollama models */}
                          {ollamaStatus.models.length > 0 && (
                            <p className="text-[10px] text-muted-foreground">
                              {ollamaStatus.models.length} model{ollamaStatus.models.length !== 1 ? "s" : ""} available: {ollamaStatus.models.join(", ")}
                            </p>
                          )}

                          <p className="text-[10px] text-muted-foreground">
                            Want other models? Run{" "}
                            <code className="rounded bg-muted px-1 py-0.5 text-[9px]">ollama pull &lt;model&gt;</code>{" "}
                            in Terminal — they'll appear in the model picker automatically.
                          </p>
                        </>
                      )}
                    </div>
                  )}

                  {/* Enterprise / Cloud Providers */}
                  <div className="space-y-3 pt-2">
                    <h3 className="text-[13px] font-medium text-foreground flex items-center gap-2">
                      <Cloud className="h-3.5 w-3.5" />
                      Enterprise & Cloud Providers
                    </h3>
                    <p className="text-[11px] text-muted-foreground -mt-2">
                      Connect your own API keys to use cloud models.
                      {isElectron ? " Your keys are stored securely in the system keychain." : " Your keys are stored locally in your browser."}
                    </p>

                    <div className="space-y-1.5">
                      {effectiveProviders.map((provider) => {
                        const isConnected = connectedProviders[provider.id]?.connected;
                        const isEditing = editingApiKey === provider.id;
                        const displayModels = provider.models;

                        return (
                          <div key={provider.id} className="rounded-md border border-border bg-card overflow-hidden">
                            <div className="flex items-center justify-between p-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-base">{provider.icon}</span>
                                  <span className="text-[13px] font-medium text-foreground">{provider.name}</span>
                                  {provider.sttOnly && (
                                    <span className="rounded px-1.5 py-0.5 text-[9px] font-medium uppercase bg-accent/10 text-accent">STT Only</span>
                                  )}
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-0.5 pl-7">
                                  {displayModels.join(", ")}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {isConnected && !isEditing ? (
                                  <>
                                    <span className="flex items-center gap-1 text-[11px] text-accent font-medium">
                                      <Check className="h-3 w-3" />
                                      Connected
                                    </span>
                                    <button
                                      onClick={() => handleDisconnectProvider(provider.id)}
                                      className="rounded p-1 text-muted-foreground hover:text-destructive transition-colors"
                                      title="Disconnect"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  </>
                                ) : !isEditing ? (
                                  <button
                                    onClick={() => handleConnectProvider(provider.id)}
                                    className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-secondary transition-colors"
                                  >
                                    <Plus className="h-3 w-3" />
                                    Connect
                                  </button>
                                ) : null}
                              </div>
                            </div>

                            {isEditing && (
                              <div className="px-3 pb-3 pt-0 border-t border-border mt-0">
                                <div className="pt-3 space-y-2">
                                  <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">API Key</label>
                                  <div className="flex gap-1.5">
                                    <input
                                      type="password"
                                      value={tempApiKey}
                                      onChange={(e) => setTempApiKey(e.target.value)}
                                      placeholder={`Enter your ${provider.name} API key...`}
                                      className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                                      autoFocus
                                    />
                                    <button
                                      onClick={() => handleConnectProvider(provider.id)}
                                      disabled={!tempApiKey.trim()}
                                      className="rounded-md bg-accent px-3 py-1.5 text-[11px] font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
                                    >
                                      Save
                                    </button>
                                    <button
                                      onClick={() => { setEditingApiKey(null); setTempApiKey(""); }}
                                      className="rounded-md border border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                  <a href="#" className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline">
                                    Get an API key <ExternalLink className="h-2.5 w-2.5" />
                                  </a>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  </div>
                </div>
              )}

              {active === "transcription" && (
                <div className="space-y-5">
                  <SectionHeader title="Transcription" description="Control how OSChief listens and transcribes your meetings" />
                  <div className="space-y-2">
                    <SettingRow label="Auto-record meetings" description="Start recording automatically when a calendar meeting begins">
                      <Toggle enabled={toggles.autoRecord} onToggle={() => toggle("autoRecord")} />
                    </SettingRow>
                    <SettingRow label="Live transcription" description="Recommended on. Real-time transcription during recording. Turn off only for privacy-friendly batch mode (full pass after you stop). When off, little or no text appears until you stop — and long meetings can look very delayed or incomplete on one side.">
                      <Toggle enabled={!toggles.transcribeWhenStopped} onToggle={() => {
                        setToggles((prev) => {
                          const nextBatch = !prev.transcribeWhenStopped;
                          const next = {
                            ...prev,
                            transcribeWhenStopped: nextBatch,
                            realTimeTranscribe: !nextBatch,
                          };
                          if (api) {
                            api.db.settings.set('transcribe-when-stopped', JSON.stringify(nextBatch)).catch(console.error);
                            api.db.settings.set('real-time-transcription', JSON.stringify(!nextBatch)).catch(console.error);
                          }
                          return next;
                        });
                      }} />
                    </SettingRow>
                    {isElectron && (
                      <>
                        <div className="rounded-md border border-border bg-card p-3 space-y-2">
                          <div>
                            <label htmlFor="stt-capture-sensitivity" className="text-[13px] font-medium text-foreground block">
                              Live capture sensitivity
                            </label>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              <strong>Balanced</strong> reduces false mic transcripts when you are muted. <strong>More sensitive</strong> lowers energy and echo-suppression thresholds — use if live lines are sparse; may add noise or duplicate lines from speaker bleed. Applies after you resume or start the next recording.
                            </p>
                          </div>
                          <select
                            id="stt-capture-sensitivity"
                            value={sttCaptureSensitivity}
                            onChange={(e) => {
                              const v = e.target.value === "sensitive" ? "sensitive" : "default";
                              setSttCaptureSensitivity(v);
                              api?.db.settings.set("stt-capture-sensitivity", v).catch(console.error);
                            }}
                            className="w-full max-w-xs rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                          >
                            <option value="default">Balanced (default)</option>
                            <option value="sensitive">More sensitive</option>
                          </select>
                        </div>
                        <p className="text-[11px] text-muted-foreground rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                          <strong className="text-foreground">macOS:</strong> allow <strong>Microphone</strong> for “Me” lines. For meeting audio on <strong>Them</strong>, Screen Recording (and system audio) must be allowed for Syag in System Settings → Privacy & Security.
                        </p>
                      </>
                    )}
                    <SettingRow
                      label="Enhance transcript with AI"
                      description={selectedAIModel ? "Use your AI model to fix grammar, punctuation, and proper nouns in real-time." : "Requires an AI model — configure in Models & Providers above."}
                    >
                      <Toggle enabled={toggles.llmPostProcess && !!selectedAIModel} onToggle={() => { if (selectedAIModel) toggle("llmPostProcess") }} disabled={!selectedAIModel} />
                    </SettingRow>
                    <SettingRow label="Auto-generate AI notes" description="Create summaries and action items when recording ends">
                      <Toggle enabled={toggles.aiSummaries} onToggle={() => toggle("aiSummaries")} />
                    </SettingRow>
                    <SettingRow label="Browser noise suppression" description="Use the browser’s built-in noise suppression on the microphone. Turn off if it causes artifacts or cuts speech.">
                      <Toggle enabled={toggles.audioNoiseSuppression} onToggle={() => toggle("audioNoiseSuppression")} />
                    </SettingRow>
                    {/* "Reduce noise before transcription" removed — not wired to backend.
                        VAD energy thresholds in capture.ts handle this automatically. */}
                    <SettingRow label="Speaker diarization (mic only)" description="Will label who spoke (Speaker 1, 2, ...) using on-device speaker embeddings.">
                      <span className="text-xs text-muted-foreground bg-muted px-2.5 py-1 rounded-full font-medium">Coming soon</span>
                    </SettingRow>
                  </div>
                  <div>
                    <label className="text-[13px] font-medium text-foreground mb-2 block">Audio input device</label>
                    <select
                      value={selectedDeviceId}
                      onChange={(e) => handleDeviceChange(e.target.value)}
                      className="w-full rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                    >
                      <option value="">System Default</option>
                      {audioDevices.map((d) => (
                        <option key={d.deviceId} value={d.deviceId}>
                          {d.label || `Microphone (${d.deviceId.slice(0, 8)}...)`}
                        </option>
                      ))}
                    </select>
                  </div>
                  <AudioTestPanel selectedDeviceId={selectedDeviceId} />
                </div>
              )}

              {active === "meeting" && (
                <div className="mt-6 border-t border-border pt-5">
                  <TemplatesSection />
                </div>
              )}

              {active === "connections" && (
                <div className="space-y-5">
                  <SectionHeader title="Connections" description="Calendar, integrations, and sync" />
                  <SettingRow label="Sync calendar" description="Keep your meetings synced with your calendar">
                    <Toggle enabled={toggles.calendarSync} onToggle={() => toggle("calendarSync")} />
                  </SettingRow>
                  <SettingRow label="Show upcoming meetings" description="Display upcoming meetings on the home screen">
                    <Toggle enabled={toggles.showUpcoming} onToggle={() => toggle("showUpcoming")} />
                  </SettingRow>
                  <SettingRow label="Only notify when microphone is in use" description="Fewer false positives: show “Meeting detected” only when a meeting app is in use and the mic is active (ad-hoc calls). Turn off if you join muted and miss prompts.">
                    <Toggle enabled={toggles.meetingDetectionRequireMic} onToggle={() => toggle("meetingDetectionRequireMic")} />
                  </SettingRow>
                  {isElectron && (
                    <div className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
                      <h3 className="text-[13px] font-medium text-foreground">Menu bar & tray</h3>
                      <p className="text-[11px] text-muted-foreground -mt-1">
                        macOS menu bar icon: show a compact agenda popover instead of only focusing the app when you click the icon (when not recording).
                      </p>
                      <SettingRow label="Show agenda in tray" description="Open a Notion-style agenda when clicking the OSChief menu bar icon.">
                        <Toggle
                          enabled={trayAgendaEnabled}
                          onToggle={() => {
                            const next = !trayAgendaEnabled;
                            setTrayAgendaEnabled(next);
                            api?.db.settings.set("tray-calendar-agenda", next ? "true" : "false").catch(console.error);
                          }}
                        />
                      </SettingRow>
                      {trayAgendaEnabled && (
                        <>
                          <div className="flex items-center justify-between rounded-md border border-border bg-card p-3 gap-4">
                            <div className="min-w-0">
                              <span className="text-[13px] text-foreground">Agenda range</span>
                              <p className="text-[11px] text-muted-foreground mt-0.5">Which days appear in the tray popover</p>
                            </div>
                            <select
                              value={trayCalendarRange}
                              onChange={(e) => {
                                const v = e.target.value === "today" ? "today" : "today_tomorrow";
                                setTrayCalendarRange(v);
                                api?.db.settings.set("tray-calendar-range", v).catch(console.error);
                              }}
                              className="text-[12px] rounded-md border border-border bg-background px-2 py-1.5 max-w-[11rem]"
                            >
                              <option value="today">Today only</option>
                              <option value="today_tomorrow">Today + tomorrow</option>
                            </select>
                          </div>
                          <div className="flex items-center justify-between rounded-md border border-border bg-card p-3 gap-4">
                            <div className="min-w-0">
                              <span className="text-[13px] text-foreground">Clicking an event</span>
                              <p className="text-[11px] text-muted-foreground mt-0.5">Where to go when you select a row</p>
                            </div>
                            <select
                              value={trayCalendarClick}
                              onChange={(e) => {
                                const v = e.target.value === "calendar" ? "calendar" : "note";
                                setTrayCalendarClick(v);
                                api?.db.settings.set("tray-calendar-click", v).catch(console.error);
                              }}
                              className="text-[12px] rounded-md border border-border bg-background px-2 py-1.5 max-w-[11rem]"
                            >
                              <option value="note">Open linked note / new note</option>
                              <option value="calendar">Open OSChief calendar</option>
                            </select>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  <div className="space-y-2">
                    <h3 className="text-[13px] font-medium text-foreground">Connected Calendars</h3>
                    <p className="text-[11px] text-muted-foreground -mt-1 mb-2">
                      Add several ICS feeds or use OAuth (below in Integrations). On the Calendar page, use{" "}
                      <strong className="text-foreground/90">All calendars</strong> or pick one source — like Google Calendar or Notion.
                    </p>
                    {(
                      [
                        { id: "google" as CalendarProviderId, name: "Google Calendar", desc: "Sync with Google Calendar" },
                        { id: "outlook" as CalendarProviderId, name: "Outlook Calendar", desc: "Sync with Microsoft Outlook" },
                        { id: "apple" as CalendarProviderId, name: "Apple Calendar", desc: "Sync with iCloud Calendar" },
                      ] as const
                    ).map((cal) => {
                      const connected = icsFeeds.some((f) => f.providerHint === cal.id);
                      return (
                        <div key={cal.name} className="flex items-center justify-between rounded-md border border-border bg-card p-3">
                          <div>
                            <span className="text-[13px] font-medium text-foreground">{cal.name}</span>
                            <p className="text-[11px] text-muted-foreground">{cal.desc}</p>
                          </div>
                          {connected ? (
                            <button
                              onClick={() => {
                                icsFeeds
                                  .filter((f) => f.providerHint === cal.id)
                                  .forEach((f) => removeCalendarFeed(f.id));
                                setCalendarProvider(null);
                                try {
                                  localStorage.removeItem(CALENDAR_PROVIDER_KEY);
                                } catch {}
                              }}
                              className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10 transition-colors"
                            >
                              Disconnect
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setIcsDialogProvider(cal.id);
                                setIcsDialogOpen(true);
                              }}
                              className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                            >
                              Connect
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <ICSDialog
                    open={icsDialogOpen}
                    onOpenChange={setIcsDialogOpen}
                    provider={icsDialogProvider ?? undefined}
                    onSuccess={(p) => {
                      setCalendarProvider(p);
                      localStorage.setItem(CALENDAR_PROVIDER_KEY, p);
                      setIcsDialogProvider(null);
                    }}
                  />
                </div>
              )}

              {active === "advanced" && (
                <div className="space-y-5">
                  <SectionHeader title="Advanced" description="Notifications, Agent API, and developer settings" />
                  <div className="space-y-2">
                    <SettingRow label="Meeting summary ready" description="Get notified when AI finishes generating a summary">
                      <Toggle enabled={toggles.summaryReady} onToggle={() => toggle("summaryReady")} />
                    </SettingRow>
                    <SettingRow label="Action item reminders" description="Reminders about pending action items from meetings">
                      <Toggle enabled={toggles.actionReminder} onToggle={() => toggle("actionReminder")} />
                    </SettingRow>
                    <SettingRow label="Weekly digest" description="Weekly summary of all your meetings and action items">
                      <Toggle enabled={toggles.weeklyDigest} onToggle={() => toggle("weeklyDigest")} />
                    </SettingRow>
                  </div>
                </div>
              )}

              {active === "connections" && (
                <div className="space-y-5 mt-6 border-t border-border pt-5">
                  <h3 className="text-[13px] font-semibold text-foreground">Integrations</h3>
                  <div className="space-y-2">
                    <JiraIntegrationRow />
                    <GoogleCalendarIntegrationRow />
                    <MicrosoftCalendarIntegrationRow />
                    <SlackIntegrationRow />
                    <TeamsIntegrationRow />
                  </div>
                </div>
              )}

              {active === "knowledge-base" && (
                <KnowledgeBaseSection api={api} />
              )}

              {active === "vault" && (
                <VaultSection api={api} />
              )}

              {active === "privacy" && (
                <PrivacySection api={api} />
              )}

              {active === "connections" && (
                <div className="mt-6 border-t border-border pt-5">
                  <SyncSection api={api} />
                </div>
              )}

              {active === "advanced" && (
                <div className="mt-6 border-t border-border pt-5">
                  <AgentApiSection api={api} />
                </div>
              )}

              {active === "about" && (
                <div className="space-y-5">
                  <SectionHeader title="About OSChief" description="Your private, on-device meeting companion" />

                  {/* Version + Update */}
                  <div className="rounded-lg border border-border bg-card p-4 space-y-3" style={{ boxShadow: "var(--card-shadow)" }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[14px] font-semibold text-foreground">OSChief {appVersion ?? ''}</p>
                        <p className="text-[11px] text-muted-foreground">macOS (Apple Silicon)</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {updateDownloaded ? (
                          <button
                            onClick={() => api?.app?.installUpdate?.()}
                            className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-medium text-primary-foreground hover:opacity-90"
                          >
                            Update to v{updateDownloaded}
                          </button>
                        ) : (
                          <>
                            {updateResult === "latest" && (
                              <span className="text-[11px] text-green-600 dark:text-green-400">You're on the latest version</span>
                            )}
                            {updateResult === "downloading" && (
                              <span className="text-[11px] text-muted-foreground max-w-[200px] text-right">
                                Downloading update… the Install button appears when ready.
                              </span>
                            )}
                            {updateResult === "error" && (
                              <div className="text-right max-w-[240px]">
                                <span className="text-[11px] text-destructive block">Update check failed</span>
                                <span className="text-[10px] text-muted-foreground block mt-0.5">
                                  Could not reach GitHub. Try again later.
                                </span>
                              </div>
                            )}
                            <button
                              disabled={updateChecking}
                              onClick={async () => {
                                if (!api?.app?.checkForUpdates) return;
                                setUpdateChecking(true);
                                setUpdateResult(null);
                                setUpdateErrorDetail(null);
                                try {
                                  const res = await api.app.checkForUpdates();
                                  if (!res.ok) {
                                    setUpdateChecking(false);
                                    setUpdateResult("error");
                                    setUpdateErrorDetail(res.error);
                                    return;
                                  }
                                  if (res.isUpdateAvailable) {
                                    setUpdateResult("downloading");
                                    setUpdateChecking(false);
                                    return;
                                  }
                                  setUpdateChecking(false);
                                  setUpdateResult("latest");
                                } catch (e) {
                                  setUpdateChecking(false);
                                  setUpdateResult("error");
                                  setUpdateErrorDetail(e instanceof Error ? e.message : String(e));
                                }
                              }}
                              className="rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-secondary/50 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {updateChecking ? "Checking..." : "Check for updates"}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* What OSChief does */}
                  <div className="space-y-2">
                    <h3 className="text-[13px] font-semibold text-foreground">What OSChief does</h3>
                    <div className="text-[12px] text-muted-foreground space-y-1.5 leading-relaxed">
                      <p><strong className="text-foreground">Record & transcribe</strong> — Capture mic and system audio with live speaker-labeled transcription. Works with Zoom, Meet, Teams, or any audio source.</p>
                      <p><strong className="text-foreground">AI summaries</strong> — Structured notes after each meeting: overview, key points, action items, decisions, and open questions.</p>
                      <p><strong className="text-foreground">Work Coach</strong> — Post-meeting behavioral coaching tuned to your role, grounded in transcript evidence.</p>
                      <p><strong className="text-foreground">People & relationships</strong> — Automatically extracts and tracks the people you meet with.</p>
                      <p><strong className="text-foreground">Knowledge base</strong> — Point OSChief at a folder of docs. During calls, it surfaces relevant talking points in real time.</p>
                    </div>
                  </div>

                  {/* Privacy */}
                  <div className="space-y-2">
                    <h3 className="text-[13px] font-semibold text-foreground">Privacy</h3>
                    <div className="text-[12px] text-muted-foreground space-y-1 leading-relaxed">
                      <p>All data stored locally in <code className="text-[11px] bg-muted px-1 rounded">~/Library/Application Support/OSChief/</code></p>
                      <p>API keys encrypted via macOS Keychain</p>
                      <p>No telemetry, no analytics, no cloud sync by default</p>
                      <p>Supports fully local transcription (MLX Whisper / whisper.cpp) and local LLMs (via Ollama)</p>
                      <p>Cloud providers are opt-in — bring your own keys</p>
                    </div>
                  </div>

                  {/* Links */}
                  <div className="flex gap-3 text-[12px]">
                    <a href="https://github.com/iamsagar125/syag-note" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">GitHub</a>
                    <a href="https://github.com/iamsagar125/syag-note/releases" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Releases</a>
                    <span className="text-muted-foreground">MIT License</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Jira Integration Row ─────────────────────────────────────────────────

function JiraIntegrationRow() {
  const api = getElectronAPI();
  const [connected, setConnected] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    api?.keychain?.get("jira-config").then((raw) => {
      if (raw) {
        try {
          const config = JSON.parse(raw) as JiraConfig;
          setConnected(true);
          setDisplayName(config.displayName || config.email || "Connected");
        } catch {
          /* ignore */
        }
      }
    });
  }, [api]);

  const handleDisconnect = async () => {
    await api?.keychain?.delete("jira-config");
    setConnected(false);
    setDisplayName("");
    toast.success("Jira disconnected");
  };

  return (
    <>
      <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
        <div className="flex items-center gap-2.5">
          <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
            <path d="M11.53 2L3 10.53V14.47L11.53 22L14.47 22L22 14.47V10.53L11.53 2Z" fill="#2684FF" />
          </svg>
          <div>
            <span className="text-[13px] font-medium text-foreground">Jira</span>
            <p className="text-[11px] text-muted-foreground">
              {connected ? `Connected as ${displayName}` : "Create tickets from action items"}
            </p>
          </div>
        </div>
        {connected ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
              <Check className="h-3 w-3" /> Connected
            </span>
            <button
              onClick={handleDisconnect}
              className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDialog(true)}
            className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Connect
          </button>
        )}
      </div>
      <JiraConnectDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        onConnected={(config) => {
          setConnected(true);
          setDisplayName(config.displayName || config.email || "Connected");
          setShowDialog(false);
          toast.success("Jira connected successfully");
        }}
      />
    </>
  );
}

// ── Slack Integration Row ─────────────────────────────────────────────────

function SlackIntegrationRow() {
  const api = getElectronAPI();
  const [connected, setConnected] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    api?.keychain?.get("slack-config").then((raw) => {
      if (raw) {
        try {
          const config = JSON.parse(raw) as SlackConfig;
          setConnected(true);
          setChannelName(config.channelName || "Webhook");
        } catch { /* ignore */ }
      }
    });
  }, [api]);

  const handleDisconnect = async () => {
    await api?.keychain?.delete("slack-config");
    setConnected(false);
    setChannelName("");
    toast.success("Slack disconnected");
  };

  return (
    <>
      <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
        <div className="flex items-center gap-2.5">
          <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
            <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313z" fill="#E01E5A"/>
            <path d="M8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312z" fill="#36C5F0"/>
            <path d="M18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zm-1.27 0a2.528 2.528 0 0 1-2.522 2.521 2.528 2.528 0 0 1-2.521-2.521V2.522A2.528 2.528 0 0 1 15.165 0a2.528 2.528 0 0 1 2.521 2.522v6.312z" fill="#2EB67D"/>
            <path d="M15.165 18.956a2.528 2.528 0 0 1 2.521 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.521-2.522v-2.522h2.521zm0-1.27a2.527 2.527 0 0 1-2.521-2.522 2.527 2.527 0 0 1 2.521-2.521h6.313A2.528 2.528 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.521h-6.313z" fill="#ECB22E"/>
          </svg>
          <div>
            <span className="text-[13px] font-medium text-foreground">Slack</span>
            <p className="text-[11px] text-muted-foreground">
              {connected ? `Connected — ${channelName}` : "Share summaries to channels"}
            </p>
          </div>
        </div>
        {connected ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
              <Check className="h-3 w-3" /> Connected
            </span>
            <button
              onClick={handleDisconnect}
              className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDialog(true)}
            className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Connect
          </button>
        )}
      </div>
      <SlackConnectDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        onConnected={(webhookUrl, channel) => {
          setConnected(true);
          setChannelName(channel || "Webhook");
          setShowDialog(false);
          toast.success("Slack connected successfully");
        }}
      />
    </>
  );
}

// ── Google Calendar Integration Row ───────────────────────────────────────

function TeamsIntegrationRow() {
  const api = getElectronAPI();
  const [connected, setConnected] = useState(false);
  const [channelName, setChannelName] = useState("");
  const [showDialog, setShowDialog] = useState(false);

  useEffect(() => {
    api?.keychain?.get("teams-config").then((raw) => {
      if (raw) {
        try {
          const config = JSON.parse(raw) as TeamsConfig;
          setConnected(true);
          setChannelName(config.channelName || "Webhook");
        } catch { /* ignore */ }
      }
    });
  }, [api]);

  const handleDisconnect = async () => {
    await api?.keychain?.delete("teams-config");
    setConnected(false);
    setChannelName("");
    toast.success("Teams disconnected");
  };

  return (
    <>
      <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
        <div className="flex items-center gap-2.5">
          <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
            <path d="M20.625 6.547h-3.516V4.36a2.11 2.11 0 0 0-2.11-2.11h-5.06A2.11 2.11 0 0 0 7.83 4.36v2.187H4.313a1.313 1.313 0 0 0-1.313 1.313v10.828A1.313 1.313 0 0 0 4.313 20h16.312A1.313 1.313 0 0 0 22 18.688V7.86a1.313 1.313 0 0 0-1.375-1.313zM9.89 4.36a.047.047 0 0 1 .047-.047h5.063a.047.047 0 0 1 .047.047v2.187H9.89V4.36z" fill="#5059C9"/>
            <circle cx="16.5" cy="3" r="2.5" fill="#7B83EB"/>
            <rect x="3" y="8" width="12" height="10" rx="1" fill="#4B53BC"/>
            <path d="M6 11h6v1H6zm0 2.5h6v1H6zm0 2.5h4v1H6z" fill="white"/>
          </svg>
          <div>
            <span className="text-[13px] font-medium text-foreground">Microsoft Teams</span>
            <p className="text-[11px] text-muted-foreground">
              {connected ? `Connected — ${channelName}` : "Share summaries to channels"}
            </p>
          </div>
        </div>
        {connected ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
              <Check className="h-3 w-3" /> Connected
            </span>
            <button
              onClick={handleDisconnect}
              className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowDialog(true)}
            className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Connect
          </button>
        )}
      </div>
      <TeamsConnectDialog
        open={showDialog}
        onClose={() => setShowDialog(false)}
        onConnected={(webhookUrl, channel) => {
          setConnected(true);
          setChannelName(channel || "Webhook");
          setShowDialog(false);
          toast.success("Teams connected successfully");
        }}
      />
    </>
  );
}

function GoogleCalendarIntegrationRow() {
  const { removeCalendarFeed, refetchAllCalendars } = useCalendar();
  const api = getElectronAPI();
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [clientId, setClientId] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api?.keychain?.get("google-calendar-config").then((raw) => {
      if (raw) {
        try {
          const config = JSON.parse(raw);
          setConnected(true);
          setEmail(config.email || "Connected");
        } catch { /* ignore */ }
      }
    });
  }, [api]);

  const handleConnect = async () => {
    if (!clientId.trim()) {
      setError("Client ID is required");
      return;
    }
    setConnecting(true);
    setError("");
    try {
      const result = await api?.google?.calendarAuth(clientId.trim());
      if (result?.ok) {
        const config = {
          clientId: clientId.trim(),
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresAt: Date.now() + (result.expiresIn || 3600) * 1000,
          email: result.email,
        };
        await api?.keychain?.set("google-calendar-config", JSON.stringify(config));
        setConnected(true);
        setEmail(result.email || "Connected");
        setShowSetup(false);
        toast.success("Google Calendar connected");
        void refetchAllCalendars();
      } else {
        setError(result?.error || "Connection failed");
      }
    } catch (err: any) {
      setError(err.message || "Connection failed");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await api?.keychain?.delete("google-calendar-config");
    removeCalendarFeed(GOOGLE_CALENDAR_FEED_ID);
    setConnected(false);
    setEmail("");
    toast.success("Google Calendar disconnected");
  };

  return (
    <>
      <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
        <div className="flex items-center gap-2.5">
          <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
            <rect x="2" y="3" width="20" height="19" rx="2" fill="#4285F4"/>
            <rect x="2" y="3" width="20" height="5" fill="#1967D2"/>
            <rect x="6" y="10" width="4" height="4" rx="0.5" fill="white"/>
            <rect x="14" y="10" width="4" height="4" rx="0.5" fill="white"/>
            <rect x="6" y="15" width="4" height="4" rx="0.5" fill="white"/>
          </svg>
          <div>
            <span className="text-[13px] font-medium text-foreground">Google Calendar</span>
            <p className="text-[11px] text-muted-foreground">
              {connected ? `Connected — ${email}` : "Sync meetings and events via OAuth"}
            </p>
          </div>
        </div>
        {connected ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
              <Check className="h-3 w-3" /> Connected
            </span>
            <button
              onClick={handleDisconnect}
              className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowSetup(true)}
            className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Connect
          </button>
        )}
      </div>

      {/* Google OAuth setup dialog */}
      {showSetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-foreground">Connect Google Calendar</h2>
              <button onClick={() => setShowSetup(false)} className="rounded p-1 text-muted-foreground hover:text-foreground">
                <span className="text-lg">&times;</span>
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Enter your Google OAuth Client ID to connect. You can create one in the{" "}
              <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-0.5">
                Google Cloud Console <ExternalLink className="h-2.5 w-2.5" />
              </a>
              . Enable the Google Calendar API and add a Desktop application OAuth client.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">OAuth Client ID</label>
                <input
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="123456789.apps.googleusercontent.com"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
            {error && (
              <p className="mt-3 text-xs text-red-500">{error}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowSetup(false)} className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary transition-colors">
                Cancel
              </button>
              <button
                onClick={handleConnect}
                disabled={connecting || !clientId.trim()}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  connecting ? "bg-accent/50 text-accent-foreground cursor-wait" : "bg-accent text-accent-foreground hover:bg-accent/90",
                  !clientId.trim() && "opacity-50 cursor-not-allowed"
                )}
              >
                {connecting ? "Connecting..." : "Sign in with Google"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function MicrosoftCalendarIntegrationRow() {
  const { removeCalendarFeed, refetchAllCalendars } = useCalendar();
  const api = getElectronAPI();
  const [connected, setConnected] = useState(false);
  const [email, setEmail] = useState("");
  const [showSetup, setShowSetup] = useState(false);
  const [clientId, setClientId] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api?.keychain?.get("microsoft-calendar-config").then((raw) => {
      if (raw) {
        try {
          const config = JSON.parse(raw);
          setConnected(true);
          setEmail(config.email || "Connected");
        } catch { /* ignore */ }
      }
    });
  }, [api]);

  const handleConnect = async () => {
    if (!clientId.trim()) {
      setError("Application (client) ID is required");
      return;
    }
    setConnecting(true);
    setError("");
    try {
      const result = await api?.microsoft?.calendarAuth(clientId.trim());
      if (result?.ok) {
        const config = {
          clientId: clientId.trim(),
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresAt: Date.now() + (result.expiresIn || 3600) * 1000,
          email: result.email,
        };
        await api?.keychain?.set("microsoft-calendar-config", JSON.stringify(config));
        setConnected(true);
        setEmail(result.email || "Connected");
        setShowSetup(false);
        toast.success("Microsoft Calendar connected");
        void refetchAllCalendars();
      } else {
        setError(result?.error || "Connection failed");
      }
    } catch (err: any) {
      setError(err.message || "Connection failed");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    await api?.keychain?.delete("microsoft-calendar-config");
    removeCalendarFeed(MICROSOFT_CALENDAR_FEED_ID);
    setConnected(false);
    setEmail("");
    toast.success("Microsoft Calendar disconnected");
  };

  return (
    <>
      <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
        <div className="flex items-center gap-2.5">
          <svg className="h-5 w-5 flex-shrink-0" viewBox="0 0 24 24" fill="none">
            <rect x="1" y="1" width="10" height="10" fill="#F25022"/>
            <rect x="13" y="1" width="10" height="10" fill="#7FBA00"/>
            <rect x="1" y="13" width="10" height="10" fill="#00A4EF"/>
            <rect x="13" y="13" width="10" height="10" fill="#FFB900"/>
          </svg>
          <div>
            <span className="text-[13px] font-medium text-foreground">Microsoft Teams / Outlook</span>
            <p className="text-[11px] text-muted-foreground">
              {connected ? `Connected — ${email}` : "Sync Teams calls and Outlook calendar"}
            </p>
          </div>
        </div>
        {connected ? (
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400">
              <Check className="h-3 w-3" /> Connected
            </span>
            <button
              onClick={handleDisconnect}
              className="rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors"
            >
              Disconnect
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowSetup(true)}
            className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Connect
          </button>
        )}
      </div>

      {showSetup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-foreground">Connect Microsoft Teams / Outlook</h2>
              <button onClick={() => setShowSetup(false)} className="rounded p-1 text-muted-foreground hover:text-foreground">
                <span className="text-lg">&times;</span>
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              Enter your Azure AD Application (client) ID. Register an app in the{" "}
              <a href="https://portal.azure.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" target="_blank" rel="noopener noreferrer" className="text-accent hover:underline inline-flex items-center gap-0.5">
                Azure Portal <ExternalLink className="h-2.5 w-2.5" />
              </a>
              . Add a Mobile &amp; Desktop redirect URI with <code className="text-[10px] bg-secondary px-1 rounded">http://localhost</code> and enable Calendars.Read permission.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Application (client) ID</label>
                <input
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  className="w-full rounded-md border border-border bg-background px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </div>
            </div>
            {error && (
              <p className="mt-3 text-xs text-red-500">{error}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setShowSetup(false)} className="rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary transition-colors">
                Cancel
              </button>
              <button
                onClick={handleConnect}
                disabled={connecting || !clientId.trim()}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  connecting ? "bg-accent/50 text-accent-foreground cursor-wait" : "bg-accent text-accent-foreground hover:bg-accent/90",
                  !clientId.trim() && "opacity-50 cursor-not-allowed"
                )}
              >
                {connecting ? "Connecting..." : "Sign in with Microsoft"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
