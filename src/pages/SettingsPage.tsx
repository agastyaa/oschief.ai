import {
  User, Mic, Globe, Calendar, Bell, Sparkles, Brain, Download,
  ChevronRight, Check, ExternalLink, Plus, Trash2, RefreshCw, HardDrive, Cloud,
  Volume2, Save, Sliders, Monitor, Sun, Moon, FileText, ChevronDown, ChevronUp,
  Search
} from "lucide-react";
import { toast } from "sonner";
import { Sidebar } from "@/components/Sidebar";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef, useMemo } from "react";
import { useModelSettings, localModels, enterpriseProviders } from "@/contexts/ModelSettingsContext";
import { isElectron, getElectronAPI } from "@/lib/electron-api";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";

const sections = [
  { icon: User, label: "Account", id: "account" },
  { icon: Sliders, label: "Preferences", id: "preferences" },
  { icon: Sparkles, label: "AI Models", id: "ai-models" },
  { icon: Mic, label: "Transcription", id: "transcription" },
  { icon: FileText, label: "Templates", id: "templates" },
  { icon: Calendar, label: "Calendar", id: "calendar" },
  { icon: Bell, label: "Notifications", id: "notifications" },
  { icon: Globe, label: "Integrations", id: "integrations" },
];

// Maps UI toggle keys to their database setting keys
const TOGGLE_DB_KEYS: Record<string, string> = {
  autoRecord: 'auto-record',
  realTimeTranscribe: 'real-time-transcription',
  aiSummaries: 'auto-generate-notes',
  summaryReady: 'summary-ready-notification',
  actionReminder: 'action-reminder-notification',
  weeklyDigest: 'weekly-digest-notification',
  calendarSync: 'calendar-sync',
  showUpcoming: 'show-upcoming-meetings',
  meetingDetectionRequireMic: 'meeting-detection-require-mic',
};

const DEFAULT_TOGGLES: Record<string, boolean> = {
  autoRecord: true,
  realTimeTranscribe: true,
  aiSummaries: true,
  summaryReady: true,
  actionReminder: true,
  weeklyDigest: false,
  calendarSync: true,
  showUpcoming: true,
  meetingDetectionRequireMic: true,
};

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "relative h-5 w-9 rounded-full transition-colors flex-shrink-0",
        enabled ? "bg-accent" : "bg-secondary"
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
      <h2 className="text-lg text-foreground font-medium font-body">{title}</h2>
      {description && <p className="text-[12px] text-muted-foreground mt-1">{description}</p>}
    </div>
  );
}

const ACCOUNT_LS_KEY = "syag-account";
const PREFS_LS_KEY = "syag-preferences";

interface Preferences {
  showRecordingIndicator: boolean;
  launchOnStartup: boolean;
  autoReposition: boolean;
  appearance: "light" | "dark" | "system";
}

const defaultPrefs: Preferences = {
  showRecordingIndicator: true,
  launchOnStartup: false,
  autoReposition: true,
  appearance: "light",
};

function loadPreferences(): Preferences {
  try {
    const raw = localStorage.getItem(PREFS_LS_KEY);
    if (raw) return { ...defaultPrefs, ...JSON.parse(raw) };
  } catch { /* ignore */ }
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
  } catch { /* ignore */ }
  return { name: "", email: "", role: "", company: "" };
}

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

  const handleChange = (field: string, value: string) => {
    setAccount((prev: any) => ({ ...prev, [field]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    localStorage.setItem(ACCOUNT_LS_KEY, JSON.stringify(account));
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const fields = [
    { key: "name", label: "Name", placeholder: "Your name" },
    { key: "email", label: "Email", placeholder: "you@example.com" },
    { key: "role", label: "Role", placeholder: "e.g. Product Lead" },
    { key: "company", label: "Company", placeholder: "e.g. Acme Inc." },
  ];

  return (
    <>
      <div className="space-y-3">
        {fields.map((field) => (
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


const BUILTIN_TEMPLATES = [
  { id: "general", name: "General Meeting", icon: "📋" },
  { id: "standup", name: "Standup / Daily", icon: "🏃" },
  { id: "one-on-one", name: "1:1 Meeting", icon: "🤝" },
  { id: "brainstorm", name: "Brainstorm", icon: "💡" },
  { id: "customer-call", name: "Customer Call", icon: "📞" },
  { id: "interview", name: "Interview", icon: "🎯" },
  { id: "retrospective", name: "Retrospective", icon: "🔄" },
];

function TemplatesSection() {
  const api = getElectronAPI();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [customTemplates, setCustomTemplates] = useState<Array<{ id: string; name: string; prompt: string }>>([]);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (!api) return;
    api.db.settings.get("custom-templates").then((val: string | null) => {
      if (val) {
        try { setCustomTemplates(JSON.parse(val)); } catch { /* ignore */ }
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
  const modelSettings = useModelSettings();
  const {
    selectedAIModel, setSelectedAIModel,
    selectedSTTModel, setSelectedSTTModel,
    downloadStates, downloadProgress,
    handleDownload, handleDeleteModel,
    connectedProviders, setConnectedProviders,
    connectProvider, disconnectProvider,
    useLocalModels, setUseLocalModels
  } = modelSettings;
  const [active, setActive] = useState("account");

  const [toggles, setToggles] = useState<Record<string, boolean>>({ ...DEFAULT_TOGGLES });
  const [togglesLoaded, setTogglesLoaded] = useState(false);
  const api = getElectronAPI();

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
        } catch { /* ignore */ }
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
  const updatePref = <K extends keyof Preferences>(key: K, value: Preferences[K]) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      savePreferences(next);
      if (key === "appearance") applyAppearance(value as Preferences["appearance"]);
      if (key === "launchOnStartup" && api) {
        api.app.setLoginItem(value as boolean).catch(console.error);
      }
      return next;
    });
  };

  const [editingApiKey, setEditingApiKey] = useState<string | null>(null);
  const [tempApiKey, setTempApiKey] = useState("");
  const [aiModelOpen, setAiModelOpen] = useState(false);
  const [sttModelOpen, setSttModelOpen] = useState(false);
  const [appleFoundationAvailable, setAppleFoundationAvailable] = useState(false);

  useEffect(() => {
    if (!api?.app?.appleFoundationAvailable || api.app.getPlatform?.() !== "darwin") return;
    api.app.appleFoundationAvailable().then(setAppleFoundationAvailable).catch(() => setAppleFoundationAvailable(false));
  }, [api]);

  // Build AI model options (for searchable dropdown): local + Apple (darwin) + connected providers, exclude whisper for supportsStt
  const aiOptions = useMemo(() => {
    const out: { value: string; label: string; group: string }[] = [];
    localModels
      .filter((m) => m.type === "llm" && downloadStates[m.id] === "downloaded")
      .forEach((m) => out.push({ value: `local:${m.id}`, label: `${m.name} (Local)`, group: "Local Models" }));
    if (api?.app?.getPlatform?.() === "darwin") {
      out.push({
        value: "apple:default",
        label: appleFoundationAvailable ? "Apple Intelligence (On-Device)" : "Apple Intelligence (On-Device) — macOS 26+ (Tahoe)",
        group: "Apple",
      });
    }
    Object.entries(connectedProviders)
      .filter(([_, v]) => v.connected)
      .forEach(([pid]) => {
        const provider = enterpriseProviders.find((p) => p.id === pid);
        if (!provider || provider.sttOnly) return;
        const aiModels = provider.supportsStt
          ? provider.models.filter((m) => !m.toLowerCase().includes("whisper"))
          : provider.models;
        aiModels.forEach((m) =>
          out.push({ value: `${pid}:${m}`, label: m, group: `${provider.icon} ${provider.name}` })
        );
      });
    return out;
  }, [api, connectedProviders, downloadStates, appleFoundationAvailable]);

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
        const provider = enterpriseProviders.find((p) => p.id === pid);
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
  }, [connectedProviders, downloadStates, api]);

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

  const [testingCopart, setTestingCopart] = useState(false);
  const handleTestCopart = async () => {
    const electronApi = getElectronAPI();
    if (!electronApi?.copart?.test) return;
    setTestingCopart(true);
    try {
      const result = await electronApi.copart.test();
      if (result.ok) {
        toast.success("Copart Genie: connection OK");
      } else {
        toast.error(result.error ?? "Connection failed");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Test failed");
    } finally {
      setTestingCopart(false);
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 pt-4 pb-12">
          <h1 className="text-2xl text-foreground font-medium font-body mb-6">Settings</h1>

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

              {active === "preferences" && (
                <div className="space-y-5">
                  <SectionHeader title="Preferences" description="Customize how Syag behaves and appears" />
                  <div className="space-y-2">
                    <SettingRow label="Live recording indicator" description="The floating indicator sits on the right of your screen and shows when you're transcribing">
                      <Toggle enabled={prefs.showRecordingIndicator} onToggle={() => updatePref("showRecordingIndicator", !prefs.showRecordingIndicator)} />
                    </SettingRow>
                    <SettingRow label="Launch Syag on startup" description="Syag will open automatically when you log in">
                      <Toggle enabled={prefs.launchOnStartup} onToggle={() => updatePref("launchOnStartup", !prefs.launchOnStartup)} />
                    </SettingRow>
                    <SettingRow label="Auto-reposition during meetings" description="Syag will move to the side when you join a meeting, so you can keep taking notes">
                      <Toggle enabled={prefs.autoReposition} onToggle={() => updatePref("autoReposition", !prefs.autoReposition)} />
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
                    <p className="text-[11px] text-muted-foreground mb-2">Add company-specific terms to improve transcription accuracy. One term per line.</p>
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
                    <div className="flex items-center justify-between">
                      <h3 className="text-[13px] font-medium text-foreground flex items-center gap-2">
                        <HardDrive className="h-3.5 w-3.5" />
                        Local Models
                      </h3>
                      <SettingRow label="" description="">
                        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                          <span>Use local by default</span>
                          <Toggle enabled={useLocalModels} onToggle={() => setUseLocalModels(!useLocalModels)} />
                        </div>
                      </SettingRow>
                    </div>
                    <p className="text-[11px] text-muted-foreground -mt-2">Download models to run entirely on your device. No data leaves your machine.</p>

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
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>

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
                      {enterpriseProviders.map((provider) => {
                        const isConnected = connectedProviders[provider.id]?.connected;
                        const isEditing = editingApiKey === provider.id;

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
                                  {provider.models.join(", ")}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {isConnected && !isEditing ? (
                                  <>
                                    <span className="flex items-center gap-1 text-[11px] text-accent font-medium">
                                      <Check className="h-3 w-3" />
                                      Connected
                                    </span>
                                    {provider.id === "copart" && (
                                      <button
                                        onClick={handleTestCopart}
                                        disabled={testingCopart}
                                        className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-secondary disabled:opacity-50 transition-colors"
                                        title="Test API key with Copart Genie"
                                      >
                                        {testingCopart ? "Testing…" : "Test connection"}
                                      </button>
                                    )}
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
              )}

              {active === "transcription" && (
                <div className="space-y-5">
                  <SectionHeader title="Transcription" description="Control how Syag listens and transcribes your meetings" />
                  <div className="space-y-2">
                    <SettingRow label="Auto-record meetings" description="Start recording automatically when a calendar meeting begins">
                      <Toggle enabled={toggles.autoRecord} onToggle={() => toggle("autoRecord")} />
                    </SettingRow>
                    <SettingRow label="Real-time transcription" description="Show live transcript during recording">
                      <Toggle enabled={toggles.realTimeTranscribe} onToggle={() => toggle("realTimeTranscribe")} />
                    </SettingRow>
                    <SettingRow label="Auto-generate AI notes" description="Create summaries and action items when recording ends">
                      <Toggle enabled={toggles.aiSummaries} onToggle={() => toggle("aiSummaries")} />
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
                </div>
              )}

              {active === "templates" && (
                <TemplatesSection />
              )}

              {active === "calendar" && (
                <div className="space-y-5">
                  <SectionHeader title="Calendar" description="Manage your calendar connections and meeting preferences" />
                  <SettingRow label="Sync calendar" description="Keep your meetings synced with your calendar">
                    <Toggle enabled={toggles.calendarSync} onToggle={() => toggle("calendarSync")} />
                  </SettingRow>
                  <SettingRow label="Show upcoming meetings" description="Display upcoming meetings on the home screen">
                    <Toggle enabled={toggles.showUpcoming} onToggle={() => toggle("showUpcoming")} />
                  </SettingRow>
                  <SettingRow label="Only notify when microphone is in use" description="Fewer false positives: show “Meeting detected” only when a meeting app is in use and the mic is active (ad-hoc calls). Turn off if you join muted and miss prompts.">
                    <Toggle enabled={toggles.meetingDetectionRequireMic} onToggle={() => toggle("meetingDetectionRequireMic")} />
                  </SettingRow>
                  <div className="space-y-2">
                    <h3 className="text-[13px] font-medium text-foreground">Connected Calendars</h3>
                    {[
                      { name: "Google Calendar", desc: "Sync with Google Calendar", connected: false },
                      { name: "Outlook Calendar", desc: "Sync with Microsoft Outlook", connected: false },
                      { name: "Apple Calendar", desc: "Sync with iCloud Calendar", connected: false },
                    ].map((cal) => (
                      <div key={cal.name} className="flex items-center justify-between rounded-md border border-border bg-card p-3">
                        <div>
                          <span className="text-[13px] font-medium text-foreground">{cal.name}</span>
                          <p className="text-[11px] text-muted-foreground">{cal.desc}</p>
                        </div>
                        <button className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                          Connect
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {active === "notifications" && (
                <div className="space-y-5">
                  <SectionHeader title="Notifications" description="Choose what you'd like to be notified about" />
                  <div className="space-y-2">
                    <SettingRow label="Meeting summary ready" description="In-app when the app is open; system notification when the app is minimized">
                      <Toggle enabled={toggles.summaryReady} onToggle={() => toggle("summaryReady")} />
                    </SettingRow>
                    <SettingRow label="Action item reminders" description="System notification the day before an action item’s deadline">
                      <Toggle enabled={toggles.actionReminder} onToggle={() => toggle("actionReminder")} />
                    </SettingRow>
                    <SettingRow label="Weekly digest" description="Weekly summary of all your meetings and action items">
                      <Toggle enabled={toggles.weeklyDigest} onToggle={() => toggle("weeklyDigest")} />
                    </SettingRow>
                  </div>
                </div>
              )}

              {active === "integrations" && (
                <div className="space-y-5">
                  <SectionHeader title="Integrations" description="Connect third-party tools to enhance your workflow" />
                  <div className="space-y-2">
                    {[
                      { name: "Google Calendar", desc: "Sync meetings and events" },
                      { name: "Slack", desc: "Share summaries to channels" },
                      { name: "Microsoft Teams", desc: "Integrate with Teams calls" },
                      { name: "Jira", desc: "Create tickets from action items" },
                    ].map((item) => (
                      <div key={item.name} className="flex items-center justify-between rounded-md border border-border bg-card p-3">
                        <div>
                          <span className="text-[13px] font-medium text-foreground">{item.name}</span>
                          <p className="text-[11px] text-muted-foreground">{item.desc}</p>
                        </div>
                        <button className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                          Connect
                        </button>
                      </div>
                    ))}
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
