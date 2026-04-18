import {
  User, Mic, Globe, Calendar, Bell, Sparkles, Brain, Download,
  ChevronRight, Check, ExternalLink, Plus, Trash2, RefreshCw, HardDrive, Cloud,
  Volume2, Save, Sliders, Monitor, Sun, Moon, FileText, ChevronDown, ChevronUp,
  Search, Info, MicOff, MonitorSpeaker, CheckCircle2, XCircle, Loader2,
  FolderOpen, BookOpen, Shield, Terminal, Copy, Eye, EyeOff, Clock, Keyboard
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useState, useEffect, useRef, useMemo } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useModelSettings, localModels } from "@/contexts/ModelSettingsContext";
import {
  useCalendar,
  GOOGLE_CALENDAR_FEED_ID,
} from "@/contexts/CalendarContext";
import { ICSDialog, type CalendarProviderId } from "@/components/ICSDialog";
import { isElectron, getElectronAPI } from "@/lib/electron-api";
import { ACCOUNT_LS_KEY } from "@/lib/account-context";
import { dispatchPreferencesUpdated } from "@/lib/preferences-events";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { JiraConnectDialog, type JiraConfig } from "@/components/JiraConnectDialog";
import { SlackConnectDialog, type SlackConfig } from "@/components/SlackConnectDialog";
import { AsanaConnectDialog, type AsanaConfig } from "@/components/AsanaConnectDialog";
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
import { Toggle, SettingRow, SectionHeader } from "@/components/settings/shared/primitives";
import { SyncSection } from "@/components/settings/sections/SyncSection";
import { AgentApiSection } from "@/components/settings/sections/AgentApiSection";
import { PrivacySection } from "@/components/settings/sections/PrivacySection";
import { VaultSection } from "@/components/settings/sections/VaultSection";
import { KnowledgeBaseSection } from "@/components/settings/sections/KnowledgeBaseSection";
import { AudioTestPanel } from "@/components/settings/sections/AudioTestPanel";
import { AccountSection } from "@/components/settings/sections/AccountSection";
import { TemplatesSection } from "@/components/settings/sections/TemplatesSection";
import { KeyboardShortcutsSection } from "@/components/settings/KeyboardShortcutsSection";
import { BUILTIN_TEMPLATES } from "@/data/templates";
import {
  JiraIntegrationRow,
  SlackIntegrationRow,
  AppleCalendarIntegrationRow,
  TeamsIntegrationRow,
  GmailIntegrationRow,
  AsanaIntegrationRow,
  GoogleCalendarIntegrationRow,
} from "@/components/settings/integrations/IntegrationRows";
import {
  AI_MODELS_SUB_QUERY,
  CALENDAR_PROVIDER_KEY,
  type AiModelsSubTab,
  getStoredCalendarProvider,
  loadPreferences,
  savePreferences,
  applyAppearance,
  type Preferences,
  ROLE_OPTIONS,
  formatBytes,
} from "@/components/settings/shared/prefs";

// Re-export for backward compat — App.tsx and LiveMeetingIndicator.tsx
// import these directly from SettingsPage.
export { applyAppearance, loadPreferences };

const sections = [
  { icon: User, label: "Account", id: "account" },
  { icon: Sparkles, label: "AI Models", id: "ai-models" },
  { icon: FileText, label: "Meeting", id: "meeting" },
  { icon: Globe, label: "Connections", id: "connections" },
  { icon: HardDrive, label: "Data", id: "data" },
  { icon: Shield, label: "Privacy & Data", id: "privacy" },
  { icon: Keyboard, label: "Keyboard", id: "keyboard" },
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
  meetingAutoDetect: 'meeting-auto-detect',
  meetingDetectionRequireMic: 'meeting-detection-require-mic',
  audioNoiseSuppression: 'audio-noise-suppression',
  useDiarization: 'use-diarization',
  meetingStartNotify: 'meeting-start-notify',
  longRecordingReminder: 'long-recording-reminder',
};

const DEFAULT_TOGGLES: Record<string, boolean> = {
  autoRecord: true,
  realTimeTranscribe: true,
  transcribeWhenStopped: false,
  llmPostProcess: false,
  aiSummaries: true,
  summaryReady: true,
  actionReminder: true,
  meetingAutoDetect: true,
  meetingDetectionRequireMic: false,
  audioNoiseSuppression: true,
  useDiarization: true,
  meetingStartNotify: true,
  longRecordingReminder: true,
};

// Toggle, SettingRow, SectionHeader extracted to
// @/components/settings/shared/primitives (v2.10 decomposition).


// SyncSection, AgentApiSection, PrivacySection, VaultSection, KnowledgeBaseSection
// extracted to @/components/settings/sections/* (v2.10 decomposition).

export default function SettingsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const modelSettings = useModelSettings();
  const { icsFeeds, removeCalendarFeed, clearCalendar } = useCalendar();
  const [calendarProvider, setCalendarProvider] = useState<CalendarProviderId | null>(getStoredCalendarProvider);
  const [icsDialogOpen, setIcsDialogOpen] = useState(false);
  const [icsDialogProvider, setIcsDialogProvider] = useState<CalendarProviderId | null>(null);
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
    optionalProviders,
    ollamaStatus,
    refreshOllama,
    pullOllamaModel,
    openRouterModels,
    refreshOpenRouterModels,
    customProviders,
    addCustomProvider,
    updateCustomProvider,
    removeCustomProvider,
  } = modelSettings;
  const [optProviderKeyId, setOptProviderKeyId] = useState<string | null>(null);
  const [optProviderKey, setOptProviderKey] = useState("");
  const [optProviderTesting, setOptProviderTesting] = useState(false);
  const [showCustomProviderModal, setShowCustomProviderModal] = useState(false);
  const [editingCustomProvider, setEditingCustomProvider] = useState<string | null>(null);
  const [cpName, setCpName] = useState("");
  const [cpBaseURL, setCpBaseURL] = useState("");
  const [cpApiKey, setCpApiKey] = useState("");
  const [cpModels, setCpModels] = useState("");
  const [cpIcon, setCpIcon] = useState("🔌");
  const [cpTesting, setCpTesting] = useState(false);
  const [cpFetching, setCpFetching] = useState(false);
  const [active, setActiveRaw] = useState("account");
  const settingsContentRef = useRef<HTMLDivElement>(null);
  const setActive = (id: string) => {
    setActiveRaw(id);
    // Scroll settings content to top (not the entire AppShell)
    if (settingsContentRef.current) settingsContentRef.current.scrollTop = 0;
  };
  const [aiModelsTab, setAiModelsTab] = useState<AiModelsSubTab>("models");
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [updateDownloaded, setUpdateDownloaded] = useState<string | null>(null);
  const [updateChecking, setUpdateChecking] = useState(false);
  const [updateResult, setUpdateResult] = useState<string | null>(null);
  const [updateErrorDetail, setUpdateErrorDetail] = useState<string | null>(null);
  const [updateProgress, setUpdateProgress] = useState<{ percent: number; bytesPerSecond: number; transferred: number; total: number } | null>(null);
  const [benchmarkStats, setBenchmarkStats] = useState<any[]>([]);

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
    // Redirect removed sections to their new homes
    const sectionRedirects: Record<string, string> = {
      "transcription": "meeting",
      "advanced": "connections",
      "knowledge-base": "data",
      "vault": "data",
    };
    const resolved = sectionRedirects[sec ?? ""] ?? sec;
    if (resolved && sections.some((s) => s.id === resolved)) setActive(resolved);
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
      // Fetch summary benchmark stats
      try {
        const stats = await api.db.pipelineQualityStats?.();
        if (stats?.length) setBenchmarkStats(stats);
      } catch { /* no stats yet */ }
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

  useEffect(() => {
    if (!(api?.app as any)?.onUpdateDownloadProgress) return;
    return (api.app as any).onUpdateDownloadProgress((progress: any) => {
      setUpdateProgress(progress);
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
      // When diarization is turned ON, pre-download the models
      if (key === 'useDiarization' && next[key] && api) {
        (api as any).audio?.ensureDiarizationModels?.().catch(() => {});
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

  // Default meeting template (persisted to DB)
  const [defaultTemplate, setDefaultTemplate] = useState("general");
  const [settingsCustomTemplates, setSettingsCustomTemplates] = useState<Array<{ id: string; name: string }>>([]);
  useEffect(() => {
    if (!api) return;
    api.db.settings.get('default-template').then((val: string | null) => {
      if (val) setDefaultTemplate(val);
    }).catch(console.error);
    api.db.settings.get('custom-templates').then((val: string | null) => {
      if (val) try { setSettingsCustomTemplates(JSON.parse(val)); } catch {}
    }).catch(console.error);
  }, []);

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
    <div className="mx-auto max-w-3xl px-6 pt-4 pb-12">
          <h1 className="font-display text-2xl text-foreground mb-6">Settings</h1>

          <div className="flex gap-8">
            <nav className="flex w-40 flex-shrink-0 flex-col gap-0.5 pt-1">
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[12px] transition-colors text-left",
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

            <div ref={settingsContentRef} className="flex-1 min-w-0 min-h-[500px]">
              {active === "account" && (
                <div className="space-y-5">
                  <SectionHeader title="Account" description="Your personal information and preferences" />
                  <AccountSection />
                </div>
              )}

              {active === "meeting" && (
                <div className="space-y-5">
                  <SectionHeader title="Meeting & Preferences" description="Recording behavior, templates, transcription, and appearance" />
                  <Tabs defaultValue="general" className="w-full">
                    <TabsList className="w-full justify-start bg-secondary/50 rounded-lg p-0.5 mb-5">
                      <TabsTrigger value="general" className="text-[12px] rounded-md px-3 py-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm">General</TabsTrigger>
                      <TabsTrigger value="templates" className="text-[12px] rounded-md px-3 py-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm">Templates</TabsTrigger>
                      <TabsTrigger value="transcription" className="text-[12px] rounded-md px-3 py-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm">Transcription</TabsTrigger>
                    </TabsList>

                    <TabsContent value="general" className="space-y-5 mt-0">
                      <div className="space-y-2">
                        <SettingRow label="Live recording indicator" description="Shows a compact pill at the top-right while transcribing when you’re not on the live note screen. Turn off to hide it.">
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
                        <label className="text-body-sm font-medium text-foreground mb-2 block">Appearance</label>
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
                                "flex items-center gap-2 rounded-md border px-4 py-2 text-body-sm font-medium transition-colors",
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
                        <label className="text-body-sm font-medium text-foreground mb-2 block">Custom vocabulary</label>
                        <p className="text-[11px] text-muted-foreground mb-2">Add company-specific terms to improve transcription accuracy. One term per line.</p>
                        <textarea
                          value={customTerms}
                          onChange={(e) => handleCustomTermsChange(e.target.value)}
                          placeholder={"Acme Corp\nProject Falcon\nQ3 Roadmap"}
                          rows={4}
                          className="w-full rounded-md border border-border bg-card px-3 py-2 text-body-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 resize-none font-mono"
                        />
                      </div>
                    </TabsContent>

                    <TabsContent value="templates" className="space-y-5 mt-0">
                      <div>
                        <label className="text-body-sm font-medium text-foreground mb-2 block">Default meeting template</label>
                        <p className="text-[11px] text-muted-foreground mb-2">Choose which template to use by default when starting a new meeting note.</p>
                        <select
                          value={defaultTemplate}
                          onChange={(e) => {
                            setDefaultTemplate(e.target.value);
                            api?.db?.settings?.set("default-template", e.target.value).catch(console.error);
                          }}
                          className="w-full rounded-md border border-border bg-card px-3 py-2 text-body-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                        >
                          {BUILTIN_TEMPLATES.map((t) => (
                            <option key={t.id} value={t.id}>{t.icon} {t.name}</option>
                          ))}
                          {settingsCustomTemplates.length > 0 && (
                            <option disabled>── Custom ──</option>
                          )}
                          {settingsCustomTemplates.map((t) => (
                            <option key={t.id} value={t.id}>{t.name}</option>
                          ))}
                        </select>
                      </div>
                      <TemplatesSection />
                    </TabsContent>

                    <TabsContent value="transcription" className="space-y-5 mt-0">
                      <div className="space-y-2">
                        <SettingRow label="Detect meetings automatically" description="Show a notification when you join Teams, Zoom, or Google Meet (requires mic to be active)">
                          <Toggle enabled={toggles.meetingAutoDetect} onToggle={() => toggle("meetingAutoDetect")} />
                        </SettingRow>
                        <SettingRow label="Notify me when meetings start" description="Native macOS notification at the scheduled start time of a calendar event — click to record.">
                          <Toggle enabled={toggles.meetingStartNotify} onToggle={() => toggle("meetingStartNotify")} />
                        </SettingRow>
                        <SettingRow label="Remind me about long recordings" description="Gentle ping every hour so you notice if a recording has been running since the meeting ended.">
                          <Toggle enabled={toggles.longRecordingReminder} onToggle={() => toggle("longRecordingReminder")} />
                        </SettingRow>
                        {isElectron && (
                          <>
                            <div className="rounded-md border border-border bg-card p-3 space-y-2">
                              <div>
                                <label htmlFor="stt-capture-sensitivity" className="text-body-sm font-medium text-foreground block">
                                  Live capture sensitivity
                                </label>
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  <strong>Balanced</strong> reduces false mic transcripts when you are muted. <strong>More sensitive</strong> lowers energy and echo-suppression thresholds — use if live lines are sparse.
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
                                className="w-full max-w-xs rounded-md border border-border bg-card px-3 py-2 text-body-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                              >
                                <option value="default">Balanced (default)</option>
                                <option value="sensitive">More sensitive</option>
                              </select>
                            </div>
                            <p className="text-[11px] text-muted-foreground rounded-md border border-border/60 bg-muted/20 px-3 py-2">
                              <strong className="text-foreground">macOS:</strong> allow <strong>Microphone</strong> for "Me" lines. For meeting audio on <strong>Them</strong>, Screen Recording permission must be granted in System Settings.
                            </p>
                          </>
                        )}
                        <SettingRow
                          label="Enhance transcript with AI"
                          description={selectedAIModel ? "Use your AI model to fix grammar, punctuation, and proper nouns in real-time." : "Requires an AI model — configure in AI Models."}
                        >
                          <Toggle enabled={toggles.llmPostProcess && !!selectedAIModel} onToggle={() => { if (selectedAIModel) toggle("llmPostProcess") }} disabled={!selectedAIModel} />
                        </SettingRow>
                        <SettingRow label="Auto-generate AI notes" description="Create summaries and action items when recording ends">
                          <Toggle enabled={toggles.aiSummaries} onToggle={() => toggle("aiSummaries")} />
                        </SettingRow>
                      </div>
                      <div>
                        <label className="text-body-sm font-medium text-foreground mb-2 block">Audio input device</label>
                        <select
                          value={selectedDeviceId}
                          onChange={(e) => handleDeviceChange(e.target.value)}
                          className="w-full rounded-md border border-border bg-card px-3 py-2 text-body-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
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
                    </TabsContent>
                  </Tabs>
                </div>
              )}

              {active === "ai-models" && (
                <div className="space-y-6">
                  <SectionHeader title="AI Models" description="Choose which AI models power your notes and transcription. Connect OpenRouter for 300+ cloud models, add custom providers, or use local models for privacy." />

                  {!isElectron && (
                    <div className="rounded-md border border-amber/20 bg-amber-bg p-3">
                      <p className="text-[12px] text-amber">
                        Running in web mode. Local model downloads require the desktop app. Cloud providers work in both modes.
                      </p>
                    </div>
                  )}

                  <Tabs defaultValue="setup" className="w-full">
                    <TabsList className="w-full justify-start bg-secondary/50 rounded-lg p-0.5 mb-5">
                      <TabsTrigger value="setup" className="text-[12px] rounded-md px-3 py-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm">Setup</TabsTrigger>
                      <TabsTrigger value="local" className="text-[12px] rounded-md px-3 py-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm">Local</TabsTrigger>
                      <TabsTrigger value="cloud" className="text-[12px] rounded-md px-3 py-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm">Cloud</TabsTrigger>
                    </TabsList>

                    <TabsContent value="setup" className="space-y-6 mt-0">
                  {/* Default Model Selection */}
                  <div className="space-y-3">
                    <h3 className="text-body-sm font-medium text-foreground flex items-center gap-2">
                      <Brain className="h-3.5 w-3.5 text-accent" />
                      Default AI Model (for notes & chat)
                    </h3>
                    <Popover open={aiModelOpen} onOpenChange={setAiModelOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="w-full flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-body-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
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
                    <h3 className="text-body-sm font-medium text-foreground flex items-center gap-2">
                      <Volume2 className="h-3.5 w-3.5 text-accent" />
                      Speech-to-Text Model (transcription)
                    </h3>
                    <Popover open={sttModelOpen} onOpenChange={setSttModelOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="w-full flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-body-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
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

                    </TabsContent>

                    <TabsContent value="local" className="space-y-6 mt-0">
                  {/* Local Models Section */}
                  <div className="space-y-3 pt-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-body-sm font-medium text-foreground flex items-center gap-2">
                        <HardDrive className="h-3.5 w-3.5" />
                        Local Models
                      </h3>
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
                                  <span className="text-body-sm font-medium text-foreground">{model.name}</span>
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
                                    {model.id.startsWith('mlx-whisper') && (
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
                                    className="h-full bg-accent rounded-full transition-[width] duration-300"
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
                        <h3 className="text-body-sm font-medium text-foreground flex items-center gap-2">
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
                                        <span className="text-body-sm font-medium text-foreground">{RECOMMENDED_NAME}</span>
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
                                          className="h-full bg-accent rounded-full transition-[width] duration-300"
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

                          <div className="flex items-center gap-2">
                            <p className="text-[10px] text-muted-foreground flex-1">
                              Want other models? Run{" "}
                              <code className="rounded bg-muted px-1 py-0.5 text-[9px]">ollama pull &lt;model&gt;</code>{" "}
                              in Terminal, then click Refresh.
                            </p>
                            <button
                              onClick={() => refreshOllama()}
                              className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors shrink-0"
                            >
                              <RefreshCw className="h-2.5 w-2.5" />
                              Refresh
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}

                    </TabsContent>

                    <TabsContent value="cloud" className="space-y-6 mt-0">
                  {/* OpenRouter */}
                  <div className="space-y-3 pt-2">
                    <h3 className="text-body-sm font-medium text-foreground flex items-center gap-2">
                      <Cloud className="h-3.5 w-3.5" />
                      OpenRouter
                    </h3>
                    <p className="text-[11px] text-muted-foreground -mt-2">
                      One API key for 300+ models from all major providers.
                      {isElectron ? " Your key is stored securely in the system keychain." : ""}
                    </p>

                    <div className="rounded-md border border-border bg-card overflow-hidden">
                      <div className="flex items-center justify-between p-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-base">🌐</span>
                            <span className="text-body-sm font-medium text-foreground">OpenRouter</span>
                            {connectedProviders['openrouter']?.connected && openRouterModels.length > 0 && (
                              <span className="rounded px-1.5 py-0.5 text-[9px] font-medium bg-accent/10 text-accent">
                                {openRouterModels.length} models
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground mt-0.5 pl-7">
                            {connectedProviders['openrouter']?.connected
                              ? `Connected — ${openRouterModels.length} models available`
                              : "Access Claude, GPT, Gemini, Llama, and hundreds more"}
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {connectedProviders['openrouter']?.connected && editingApiKey !== 'openrouter' ? (
                            <>
                              <button
                                onClick={() => refreshOpenRouterModels()}
                                className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                                title="Refresh models"
                              >
                                <RefreshCw className="h-3 w-3" />
                              </button>
                              <span className="flex items-center gap-1 text-[11px] text-accent font-medium">
                                <Check className="h-3 w-3" />
                                Connected
                              </span>
                              <button
                                onClick={() => handleDisconnectProvider('openrouter')}
                                className="rounded p-1 text-muted-foreground hover:text-destructive transition-colors"
                                title="Disconnect"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </>
                          ) : editingApiKey !== 'openrouter' ? (
                            <button
                              onClick={() => handleConnectProvider('openrouter')}
                              className="flex items-center gap-1 rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-secondary transition-colors"
                            >
                              <Plus className="h-3 w-3" />
                              Connect
                            </button>
                          ) : null}
                        </div>
                      </div>

                      {editingApiKey === 'openrouter' && (
                        <div className="px-3 pb-3 pt-0 border-t border-border mt-0">
                          <div className="pt-3 space-y-2">
                            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">API Key</label>
                            <div className="flex gap-1.5">
                              <input
                                type="password"
                                value={tempApiKey}
                                onChange={(e) => setTempApiKey(e.target.value)}
                                placeholder="Enter your OpenRouter API key..."
                                className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-body-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                                autoFocus
                              />
                              <button
                                onClick={() => handleConnectProvider('openrouter')}
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
                            <a
                              href="#"
                              onClick={(e) => { e.preventDefault(); api?.app?.openExternal?.('https://openrouter.ai/keys'); }}
                              className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
                            >
                              Get an API key at openrouter.ai <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Optional Providers (e.g., Copart Genie — loaded from config files) */}
                  {optionalProviders.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <h3 className="text-body-sm font-medium text-foreground flex items-center gap-2">
                        <Sparkles className="h-3.5 w-3.5" />
                        Enterprise Providers
                      </h3>
                      <p className="text-[11px] text-muted-foreground -mt-2">
                        Providers configured by your organization. API keys are stored encrypted on this device.
                      </p>
                      <div className="space-y-1.5">
                        {optionalProviders.map((provider) => {
                          const isConnected = connectedProviders[provider.id]?.connected;
                          const isEditing = optProviderKeyId === provider.id;
                          return (
                            <div key={provider.id} className="rounded-md border border-border bg-card overflow-hidden">
                              <div className="flex items-center justify-between p-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <span className="text-base">{provider.icon}</span>
                                    <span className="text-body-sm font-medium text-foreground">{provider.name}</span>
                                  </div>
                                  {provider.models && (
                                    <p className="text-[11px] text-muted-foreground mt-0.5 pl-7">
                                      Models: {provider.models.slice(0, 3).join(", ")}{provider.models.length > 3 ? ` +${provider.models.length - 3} more` : ""}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  {isConnected && (
                                    <span className="flex items-center gap-1 text-[11px] text-accent font-medium">
                                      <Check className="h-3 w-3" />
                                      Connected
                                    </span>
                                  )}
                                  <button
                                    onClick={() => {
                                      if (isEditing) {
                                        setOptProviderKeyId(null);
                                        setOptProviderKey("");
                                      } else {
                                        setOptProviderKeyId(provider.id);
                                        setOptProviderKey(connectedProviders[provider.id]?.apiKey || "");
                                      }
                                    }}
                                    className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-secondary transition-colors"
                                  >
                                    {isConnected ? "Update Key" : "+ Connect"}
                                  </button>
                                  {isConnected && (
                                    <button
                                      onClick={() => { disconnectProvider(provider.id); toast.success(`${provider.name} disconnected`); }}
                                      className="rounded p-1 text-muted-foreground hover:text-destructive transition-colors"
                                      title="Disconnect"
                                    >
                                      <Trash2 className="h-3 w-3" />
                                    </button>
                                  )}
                                </div>
                              </div>
                              {isEditing && (
                                <div className="border-t border-border px-3 py-3 space-y-2">
                                  <div>
                                    <label className="text-[11px] text-muted-foreground">API Key</label>
                                    <input
                                      type="password"
                                      value={optProviderKey}
                                      onChange={(e) => setOptProviderKey(e.target.value)}
                                      placeholder="Enter your API key..."
                                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-body-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 mt-1"
                                    />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <button
                                      disabled={!optProviderKey.trim() || optProviderTesting}
                                      onClick={async () => {
                                        if (!optProviderKey.trim()) return;
                                        setOptProviderTesting(true);
                                        try {
                                          await connectProvider(provider.id, optProviderKey.trim());
                                          // Test the connection
                                          try {
                                            const result = await api?.app?.testOptionalProvider?.(provider.id);
                                            if (result?.ok === false) {
                                              toast.error(result.error || "Connection test failed");
                                            } else {
                                              toast.success(`${provider.name} connected`);
                                            }
                                          } catch {
                                            // Test IPC might not exist — that's ok, key is saved
                                            toast.success(`${provider.name} connected`);
                                          }
                                          setOptProviderKeyId(null);
                                          setOptProviderKey("");
                                        } catch (err: any) {
                                          toast.error(err.message || "Failed to connect");
                                        }
                                        setOptProviderTesting(false);
                                      }}
                                      className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground hover:opacity-90 disabled:opacity-40 transition-colors"
                                    >
                                      {optProviderTesting ? "Testing..." : "Save & Test"}
                                    </button>
                                    <button
                                      onClick={() => { setOptProviderKeyId(null); setOptProviderKey(""); }}
                                      className="text-[11px] text-muted-foreground hover:text-foreground"
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Custom Providers */}
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center justify-between">
                      <h3 className="text-body-sm font-medium text-foreground flex items-center gap-2">
                        <Globe className="h-3.5 w-3.5" />
                        Custom Providers
                      </h3>
                      <button
                        onClick={() => {
                          setShowCustomProviderModal(true);
                          setEditingCustomProvider(null);
                          setCpName(""); setCpBaseURL(""); setCpApiKey(""); setCpModels(""); setCpIcon("🔌");
                        }}
                        className="flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] font-medium text-foreground hover:bg-secondary transition-colors"
                      >
                        <Plus className="h-3 w-3" />
                        Add
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground -mt-2">
                      Connect any OpenAI-compatible endpoint (corporate AI gateways, vLLM, LiteLLM, etc.)
                    </p>

                    {customProviders.length === 0 && !showCustomProviderModal && (
                      <div className="rounded-md border border-dashed border-border p-4 text-center">
                        <p className="text-[11px] text-muted-foreground">No custom providers added yet.</p>
                      </div>
                    )}

                    <div className="space-y-1.5">
                      {customProviders.map((cp) => {
                        const isConnected = connectedProviders[cp.id]?.connected;
                        return (
                          <div key={cp.id} className="rounded-md border border-border bg-card overflow-hidden">
                            <div className="flex items-center justify-between p-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-base">{cp.icon}</span>
                                  <span className="text-body-sm font-medium text-foreground">{cp.name}</span>
                                </div>
                                <p className="text-[11px] text-muted-foreground mt-0.5 pl-7 truncate">
                                  {cp.baseURL}
                                </p>
                                <p className="text-[11px] text-muted-foreground mt-0.5 pl-7">
                                  Models: {cp.models.join(", ")}
                                </p>
                              </div>
                              <div className="flex items-center gap-1.5">
                                {isConnected && (
                                  <span className="flex items-center gap-1 text-[11px] text-accent font-medium">
                                    <Check className="h-3 w-3" />
                                    Connected
                                  </span>
                                )}
                                <button
                                  onClick={() => {
                                    setEditingCustomProvider(cp.id);
                                    setShowCustomProviderModal(true);
                                    setCpName(cp.name);
                                    setCpBaseURL(cp.baseURL);
                                    setCpIcon(cp.icon);
                                    setCpModels(cp.models.join(", "));
                                    setCpApiKey(connectedProviders[cp.id]?.apiKey || "");
                                  }}
                                  className="rounded p-1 text-muted-foreground hover:text-foreground transition-colors"
                                  title="Edit"
                                >
                                  <Sliders className="h-3 w-3" />
                                </button>
                                <button
                                  onClick={() => removeCustomProvider(cp.id)}
                                  className="rounded p-1 text-muted-foreground hover:text-destructive transition-colors"
                                  title="Remove"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Custom Provider Modal */}
                    {showCustomProviderModal && (
                      <div className="rounded-md border border-accent/30 bg-card p-4 space-y-3">
                        <h4 className="text-body-sm font-medium text-foreground">
                          {editingCustomProvider ? "Edit Provider" : "Add Custom Provider"}
                        </h4>
                        <div className="space-y-2">
                          <div>
                            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Name</label>
                            <input
                              type="text"
                              value={cpName}
                              onChange={(e) => setCpName(e.target.value)}
                              placeholder="Code Genie"
                              className="w-full mt-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-body-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Base URL</label>
                            <input
                              type="text"
                              value={cpBaseURL}
                              onChange={(e) => setCpBaseURL(e.target.value)}
                              placeholder="https://api.example.com/v1"
                              className="w-full mt-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-body-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                            />
                          </div>
                          <div>
                            <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">API Key</label>
                            <input
                              type="password"
                              value={cpApiKey}
                              onChange={(e) => setCpApiKey(e.target.value)}
                              placeholder="Enter API key..."
                              className="w-full mt-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-body-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                            />
                          </div>
                          <div>
                            <div className="flex items-center justify-between">
                              <label className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">Models</label>
                              <button
                                onClick={async () => {
                                  if (!api?.app?.fetchCustomProviderModels || !cpBaseURL.trim() || !cpApiKey.trim()) return;
                                  setCpFetching(true);
                                  try {
                                    const models = await api.app.fetchCustomProviderModels(cpApiKey.trim(), cpBaseURL.trim());
                                    if (models.length) {
                                      setCpModels(models.join(", "));
                                      toast.success(`Found ${models.length} models`);
                                    } else {
                                      toast.info("No models found via auto-discovery");
                                    }
                                  } catch {
                                    toast.error("Failed to fetch models");
                                  } finally {
                                    setCpFetching(false);
                                  }
                                }}
                                disabled={!cpBaseURL.trim() || !cpApiKey.trim() || cpFetching}
                                className="flex items-center gap-1 text-[10px] text-accent hover:underline disabled:opacity-50"
                              >
                                {cpFetching ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Download className="h-2.5 w-2.5" />}
                                Fetch Models
                              </button>
                            </div>
                            <input
                              type="text"
                              value={cpModels}
                              onChange={(e) => setCpModels(e.target.value)}
                              placeholder="GPT-4o, Claude Sonnet 4, llama-3.3-70b"
                              className="w-full mt-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-body-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                            />
                            <p className="text-[10px] text-muted-foreground mt-1">Comma-separated model names, or use Fetch Models to auto-discover.</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 pt-1">
                          <button
                            onClick={async () => {
                              if (!cpName.trim() || !cpBaseURL.trim() || !cpApiKey.trim()) {
                                toast.error("Name, Base URL, and API Key are required");
                                return;
                              }
                              const id = editingCustomProvider || cpName.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
                              const models = cpModels.split(',').map(s => s.trim()).filter(Boolean);
                              const config = { id, name: cpName.trim(), icon: cpIcon, baseURL: cpBaseURL.trim(), models };
                              if (editingCustomProvider) {
                                await updateCustomProvider(config);
                                await connectProvider(id, cpApiKey.trim());
                              } else {
                                await addCustomProvider(config, cpApiKey.trim());
                              }
                              setShowCustomProviderModal(false);
                              setCpName(""); setCpBaseURL(""); setCpApiKey(""); setCpModels(""); setCpIcon("🔌");
                              setEditingCustomProvider(null);
                              toast.success(editingCustomProvider ? "Provider updated" : "Provider added");
                            }}
                            disabled={!cpName.trim() || !cpBaseURL.trim() || !cpApiKey.trim()}
                            className="rounded-md bg-accent px-3 py-1.5 text-[11px] font-medium text-accent-foreground hover:opacity-90 disabled:opacity-50"
                          >
                            {editingCustomProvider ? "Update" : "Add Provider"}
                          </button>
                          <button
                            onClick={async () => {
                              if (!api?.app?.testCustomProvider || !cpBaseURL.trim() || !cpApiKey.trim()) return;
                              setCpTesting(true);
                              const firstModel = cpModels.split(',')[0]?.trim();
                              const result = await api.app.testCustomProvider(cpApiKey.trim(), cpBaseURL.trim(), firstModel || undefined);
                              setCpTesting(false);
                              if (result.ok) {
                                toast.success("Connection successful");
                              } else {
                                toast.error(`Connection failed: ${result.error || 'Unknown error'}`);
                              }
                            }}
                            disabled={!cpBaseURL.trim() || !cpApiKey.trim() || cpTesting}
                            className="rounded-md border border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-50"
                          >
                            {cpTesting ? <Loader2 className="h-3 w-3 animate-spin" /> : "Test Connection"}
                          </button>
                          <button
                            onClick={() => {
                              setShowCustomProviderModal(false);
                              setEditingCustomProvider(null);
                              setCpName(""); setCpBaseURL(""); setCpApiKey(""); setCpModels(""); setCpIcon("🔌");
                            }}
                            className="rounded-md border border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* STT Providers */}
                  <div className="space-y-3 pt-2">
                    <h3 className="text-body-sm font-medium text-foreground flex items-center gap-2">
                      <Mic className="h-3.5 w-3.5" />
                      Transcription Providers
                    </h3>
                    <p className="text-[11px] text-muted-foreground -mt-2">
                      Cloud speech-to-text services for transcription.
                    </p>

                    <div className="space-y-1.5">
                      {effectiveProviders.filter(p => p.sttOnly).map((provider) => {
                        const isConnected = connectedProviders[provider.id]?.connected;
                        const isEditing = editingApiKey === provider.id;

                        return (
                          <div key={provider.id} className="rounded-md border border-border bg-card overflow-hidden">
                            <div className="flex items-center justify-between p-3">
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-base">{provider.icon}</span>
                                  <span className="text-body-sm font-medium text-foreground">{provider.name}</span>
                                  <span className="rounded px-1.5 py-0.5 text-[9px] font-medium uppercase bg-accent/10 text-accent">STT</span>
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
                                      placeholder={provider.id === 'microsoft' ? 'region:apikey (e.g. eastus:abc123...)' : `Enter your ${provider.name} API key...`}
                                      className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-body-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
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
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  {/* Summary Benchmark Stats */}
                  {benchmarkStats.length > 0 && (
                    <div className="space-y-2 pt-2">
                      <h3 className="text-body-sm font-medium text-foreground flex items-center gap-2">
                        <Clock className="h-3.5 w-3.5 text-accent" />
                        Summary Generation Speed
                      </h3>
                      <p className="text-[11px] text-muted-foreground/70">Average time to generate meeting summaries, by model.</p>
                      <div className="rounded-md border border-border overflow-hidden">
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr className="bg-muted/30 border-b border-border">
                              <th className="text-left px-3 py-1.5 font-medium text-muted-foreground">Model</th>
                              <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Avg</th>
                              <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Range</th>
                              <th className="text-right px-3 py-1.5 font-medium text-muted-foreground">Samples</th>
                            </tr>
                          </thead>
                          <tbody>
                            {benchmarkStats.map((s: any) => (
                              <tr key={s.model} className="border-b border-border/50 last:border-0">
                                <td className="px-3 py-1.5 text-foreground font-mono text-[11px] truncate max-w-[180px]">{s.model}</td>
                                <td className="px-3 py-1.5 text-right tabular-nums">{s.avg_seconds}s</td>
                                <td className="px-3 py-1.5 text-right text-muted-foreground tabular-nums">{s.min_seconds}s – {s.max_seconds}s</td>
                                <td className="px-3 py-1.5 text-right text-muted-foreground tabular-nums">{s.count}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                    </TabsContent>
                  </Tabs>
                </div>
              )}

              {/* Templates and Transcription are now tabs inside the Meeting section above */}

              {active === "connections" && (
                <div className="space-y-5">
                  <SectionHeader title="Connections" description="Calendar, integrations, sync, and developer tools" />
                  <Tabs defaultValue="calendar" className="w-full">
                    <TabsList className="w-full justify-start bg-secondary/50 rounded-lg p-0.5 mb-5">
                      <TabsTrigger value="calendar" className="text-[12px] rounded-md px-3 py-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm">Calendar & Tray</TabsTrigger>
                      <TabsTrigger value="integrations" className="text-[12px] rounded-md px-3 py-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm">Integrations</TabsTrigger>
                      <TabsTrigger value="developer" className="text-[12px] rounded-md px-3 py-1.5 data-[state=active]:bg-card data-[state=active]:shadow-sm">Developer</TabsTrigger>
                    </TabsList>

                    <TabsContent value="calendar" className="space-y-5 mt-0">
                      <div className="rounded-[10px] border border-border bg-card/40 p-4 space-y-3">
                          <h3 className="text-body-sm font-medium text-foreground">Menu bar & tray</h3>
                          <p className="text-[11px] text-muted-foreground -mt-1">
                            Show a compact agenda popover when you click the menu bar icon (when not recording).
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
                                  <span className="text-body-sm text-foreground">Agenda range</span>
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
                                  <span className="text-body-sm text-foreground">Clicking an event</span>
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
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="text-body-sm font-medium text-foreground">Calendars</h3>
                          <button
                            onClick={() => {
                              setIcsDialogProvider(null);
                              setIcsDialogOpen(true);
                            }}
                            className="rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground hover:opacity-90 transition-colors"
                          >
                            + Add Calendar
                          </button>
                        </div>
                        <p className="text-[11px] text-muted-foreground -mt-1">
                          Paste an ICS feed URL or upload a .ics file. Works with Google, Apple, Notion, or any ICS-compatible calendar.
                        </p>
                        {icsFeeds.length > 0 ? (
                          <div className="space-y-1.5">
                            {icsFeeds.map((feed) => (
                              <div key={feed.id} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2.5">
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="flex items-center gap-1 text-[10px] text-green">
                                    <Check className="h-3 w-3" />
                                  </span>
                                  <span className="text-body-sm text-foreground truncate">
                                    {feed.providerHint ? feed.providerHint.charAt(0).toUpperCase() + feed.providerHint.slice(1) + ' Calendar' : feed.name || 'Calendar feed'}
                                  </span>
                                </div>
                                <button
                                  onClick={() => {
                                    removeCalendarFeed(feed.id);
                                    if (icsFeeds.length <= 1) {
                                      setCalendarProvider(null);
                                      try { localStorage.removeItem(CALENDAR_PROVIDER_KEY); } catch {}
                                    }
                                  }}
                                  className="rounded-md border border-border px-2 py-0.5 text-[10px] text-muted-foreground hover:text-destructive hover:border-destructive/30 transition-colors"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[11px] text-muted-foreground/60 py-2">No calendars connected yet.</p>
                        )}
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
                    </TabsContent>

                    <TabsContent value="integrations" className="space-y-5 mt-0">
                      <div className="space-y-2">
                        <GoogleCalendarIntegrationRow />
                        <AppleCalendarIntegrationRow />
                        <GmailIntegrationRow />
                        <SlackIntegrationRow />
                        <TeamsIntegrationRow />
                        <JiraIntegrationRow />
                        <AsanaIntegrationRow />
                      </div>
                    </TabsContent>

                    <TabsContent value="developer" className="space-y-5 mt-0">
                      <SyncSection api={api} />
                      <div className="border-t border-border pt-5">
                        <AgentApiSection api={api} />
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              )}

              {active === "data" && (
                <div className="space-y-5">
                  <SectionHeader title="Data" description="Knowledge base, Obsidian vault, and external data connections" />
                  <KnowledgeBaseSection api={api} />
                  <div className="border-t border-border pt-5">
                    <VaultSection api={api} />
                  </div>
                </div>
              )}

              {active === "privacy" && (
                <PrivacySection api={api} />
              )}

              {active === "keyboard" && (
                <KeyboardShortcutsSection />
              )}

              {/* Sync and Agent API are now tabs inside the Connections section above */}

              {active === "about" && (
                <div className="space-y-5">
                  <SectionHeader title="About OSChief" description="Your private, on-device meeting companion" />

                  {/* Version + Update */}
                  <div className="rounded-[10px] border border-border bg-card p-4 space-y-3" style={{ boxShadow: "var(--card-shadow)" }}>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-body-lg font-semibold text-foreground">OSChief {appVersion ?? ''}</p>
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
                              <span className="text-[11px] text-green">You're on the latest version</span>
                            )}
                            {updateResult === "downloading" && (
                              <span className="text-[11px] text-muted-foreground max-w-[240px] text-right">
                                {updateProgress ? (
                                  <>Downloading {updateProgress.percent}% — {Math.round(updateProgress.transferred / 1024 / 1024)}/{Math.round(updateProgress.total / 1024 / 1024)} MB</>
                                ) : (
                                  <>Downloading update…</>
                                )}
                              </span>
                            )}
                            {updateResult === "error" && (
                              <div className="text-right max-w-[280px]">
                                <span className="text-[11px] text-destructive block">Update check failed</span>
                                <span className="text-[10px] text-muted-foreground block mt-0.5">
                                  {updateErrorDetail?.includes('401') || updateErrorDetail?.includes('403')
                                    ? 'GitHub token missing or expired. Add export GH_TOKEN=ghp_... to your ~/.zshrc'
                                    : updateErrorDetail || 'Could not reach GitHub. Try again later.'}
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
                    <h3 className="text-body-sm font-semibold text-foreground">What OSChief does</h3>
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
                    <h3 className="text-body-sm font-semibold text-foreground">Privacy</h3>
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
  );
}

