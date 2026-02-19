import {
  User, Mic, Globe, Keyboard, Calendar, Share2, Bell, Sparkles, Brain, Download,
  ChevronRight, Check, ExternalLink, Plus, Trash2, RefreshCw, HardDrive, Cloud,
  Languages, Volume2, PanelLeftClose, PanelLeft, ArrowLeft
} from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useModelSettings, localModels, enterpriseProviders } from "@/contexts/ModelSettingsContext";

// ── Section nav ──────────────────────────────────────────────
const sections = [
  { icon: User, label: "Account", id: "account" },
  { icon: Sparkles, label: "AI Models", id: "ai-models" },
  { icon: Mic, label: "Transcription", id: "transcription" },
  { icon: Languages, label: "Language", id: "language" },
  { icon: Calendar, label: "Calendar", id: "calendar" },
  { icon: Bell, label: "Notifications", id: "notifications" },
  { icon: Share2, label: "Sharing", id: "sharing" },
  { icon: Keyboard, label: "Shortcuts", id: "shortcuts" },
  { icon: Globe, label: "Integrations", id: "integrations" },
];

// ── Toggle helper ────────────────────────────────────────────
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
      <h2 className="font-display text-lg text-foreground">{title}</h2>
      {description && <p className="text-[12px] text-muted-foreground mt-1">{description}</p>}
    </div>
  );
}


export default function SettingsPage() {
  const modelSettings = useModelSettings();
  const { selectedAIModel, setSelectedAIModel, selectedSTTModel, setSelectedSTTModel, downloadStates, handleDownload, handleDeleteModel, connectedProviders, setConnectedProviders, useLocalModels, setUseLocalModels } = modelSettings;
  const [active, setActive] = useState("account");
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Toggles
  const [toggles, setToggles] = useState<Record<string, boolean>>({
    autoRecord: true,
    realTimeTranscribe: true,
    aiSummaries: true,
    summaryReady: true,
    actionReminder: true,
    weeklyDigest: false,
    shareByDefault: false,
    calendarSync: true,
    showUpcoming: true,
    speakerLabels: true,
    customVocab: false,
    autoLanguageDetect: true,
    
  });
  const toggle = (key: string) => setToggles((prev) => ({ ...prev, [key]: !prev[key] }));

  const [editingApiKey, setEditingApiKey] = useState<string | null>(null);
  const [tempApiKey, setTempApiKey] = useState("");

  // Language
  const [language, setLanguage] = useState("en");
  const [transcriptLang, setTranscriptLang] = useState("auto");
  const [customTerms, setCustomTerms] = useState("");

  const handleConnectProvider = (providerId: string) => {
    if (editingApiKey === providerId) {
      // Save
      setConnectedProviders((prev) => ({
        ...prev,
        [providerId]: { connected: true, apiKey: tempApiKey },
      }));
      setEditingApiKey(null);
      setTempApiKey("");
    } else {
      setEditingApiKey(providerId);
      setTempApiKey(connectedProviders[providerId]?.apiKey || "");
    }
  };

  const handleDisconnectProvider = (providerId: string) => {
    setConnectedProviders((prev) => {
      const next = { ...prev };
      delete next[providerId];
      return next;
    });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className={cn(
        "transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0",
        sidebarOpen ? "w-56" : "w-0"
      )}>
        <Sidebar />
      </div>

      <main className="flex-1 overflow-y-auto">
        {/* Top bar */}
        <div className="flex items-center gap-2 px-6 pt-4 pb-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
          </button>
        </div>

        <div className="mx-auto max-w-3xl px-6 pb-12">
          <h1 className="font-display text-2xl text-foreground mb-6">Settings</h1>

          <div className="flex gap-8">
            {/* Side nav */}
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

            {/* Content */}
            <div className="flex-1 min-w-0 animate-fade-in" key={active}>
              {/* ─── Account ─── */}
              {active === "account" && (
                <div className="space-y-5">
                  <SectionHeader title="Account" description="Your personal information and preferences" />
                  <div className="space-y-3">
                    {[
                      { label: "Name", value: "Alex Johnson" },
                      { label: "Email", value: "alex@company.com" },
                      { label: "Role", value: "Product Lead" },
                      { label: "Company", value: "Acme Inc." },
                    ].map((field) => (
                      <div key={field.label}>
                        <label className="text-[13px] font-medium text-foreground">{field.label}</label>
                        <input
                          defaultValue={field.value}
                          className="mt-1 w-full rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button className="rounded-md bg-accent px-3 py-2 text-xs font-medium text-accent-foreground hover:opacity-90">Save Changes</button>
                    <button className="rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary">Cancel</button>
                  </div>
                  <div className="pt-4 border-t border-border">
                    <button className="text-[12px] text-destructive hover:underline">Delete Account</button>
                  </div>
                </div>
              )}

              {/* ─── AI Models ─── */}
              {active === "ai-models" && (
                <div className="space-y-6">
                  <SectionHeader title="AI Models" description="Choose which AI models power your notes and transcription. Use local models for privacy or connect to enterprise providers for maximum quality." />

                  {/* Default Model Selection */}
                  <div className="space-y-3">
                    <h3 className="text-[13px] font-medium text-foreground flex items-center gap-2">
                      <Brain className="h-3.5 w-3.5 text-accent" />
                      Default AI Model (for notes & chat)
                    </h3>
                    <select
                      value={selectedAIModel}
                      onChange={(e) => setSelectedAIModel(e.target.value)}
                      className="w-full rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                    >
                      <optgroup label="🖥 Local Models">
                        {localModels.filter((m) => m.type === "llm" && downloadStates[m.id] === "downloaded").map((m) => (
                          <option key={m.id} value={`local:${m.id}`}>{m.name} (Local)</option>
                        ))}
                      </optgroup>
                      {Object.entries(connectedProviders).filter(([_, v]) => v.connected).map(([pid]) => {
                        const provider = enterpriseProviders.find((p) => p.id === pid);
                        if (!provider || provider.sttOnly) return null;
                        return (
                          <optgroup key={pid} label={`${provider.icon} ${provider.name}`}>
                            {provider.models.map((m) => (
                              <option key={`${pid}:${m}`} value={`${pid}:${m}`}>{m}</option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
                  </div>

                  {/* Default STT Model */}
                  <div className="space-y-3">
                    <h3 className="text-[13px] font-medium text-foreground flex items-center gap-2">
                      <Volume2 className="h-3.5 w-3.5 text-accent" />
                      Speech-to-Text Model (transcription)
                    </h3>
                    <select
                      value={selectedSTTModel}
                      onChange={(e) => setSelectedSTTModel(e.target.value)}
                      className="w-full rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                    >
                      <optgroup label="🖥 Local Models">
                        {localModels.filter((m) => m.type === "stt" && downloadStates[m.id] === "downloaded").map((m) => (
                          <option key={m.id} value={`local:${m.id}`}>{m.name} (Local)</option>
                        ))}
                      </optgroup>
                      {Object.entries(connectedProviders).filter(([_, v]) => v.connected).map(([pid]) => {
                        const provider = enterpriseProviders.find((p) => p.id === pid);
                        if (!provider) return null;
                        const sttModels = provider.sttOnly ? provider.models : provider.models.filter((m) => m.toLowerCase().includes("whisper"));
                        if (sttModels.length === 0) return null;
                        return (
                          <optgroup key={pid} label={`${provider.icon} ${provider.name}`}>
                            {sttModels.map((m) => (
                              <option key={`${pid}:${m}`} value={`${pid}:${m}`}>{m}</option>
                            ))}
                          </optgroup>
                        );
                      })}
                    </select>
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
                        return (
                          <div key={model.id} className="flex items-center justify-between rounded-md border border-border bg-card p-3">
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
                                  Downloading...
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
                    <p className="text-[11px] text-muted-foreground -mt-2">Connect your own API keys to use cloud models. Your keys are stored locally and encrypted.</p>

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

                            {/* API Key input */}
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

              {/* ─── Transcription ─── */}
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
                    <SettingRow label="Speaker labels" description="Identify and label different speakers in the transcript">
                      <Toggle enabled={toggles.speakerLabels} onToggle={() => toggle("speakerLabels")} />
                    </SettingRow>
                    <SettingRow label="Auto-generate AI notes" description="Create summaries and action items when recording ends">
                      <Toggle enabled={toggles.aiSummaries} onToggle={() => toggle("aiSummaries")} />
                    </SettingRow>
                  </div>
                  <div>
                    <label className="text-[13px] font-medium text-foreground mb-2 block">Audio input device</label>
                    <select className="w-full rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20">
                      <option>System Default</option>
                      <option>MacBook Pro Microphone</option>
                      <option>External USB Microphone</option>
                      <option>AirPods Pro</option>
                    </select>
                  </div>
                </div>
              )}

              {/* ─── Language ─── */}
              {active === "language" && (
                <div className="space-y-5">
                  <SectionHeader title="Language" description="Set your preferred languages for the app and transcription" />
                  <div>
                    <label className="text-[13px] font-medium text-foreground mb-2 block">App language</label>
                    <select
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="w-full rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                    >
                      <option value="en">English</option>
                      <option value="es">Español</option>
                      <option value="fr">Français</option>
                      <option value="de">Deutsch</option>
                      <option value="ja">日本語</option>
                      <option value="zh">中文</option>
                      <option value="ko">한국어</option>
                      <option value="pt">Português</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[13px] font-medium text-foreground mb-2 block">Transcription language</label>
                    <select
                      value={transcriptLang}
                      onChange={(e) => setTranscriptLang(e.target.value)}
                      className="w-full rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                    >
                      <option value="auto">Auto-detect</option>
                      <option value="en">English</option>
                      <option value="es">Spanish</option>
                      <option value="fr">French</option>
                      <option value="de">German</option>
                      <option value="ja">Japanese</option>
                      <option value="zh">Chinese</option>
                      <option value="ko">Korean</option>
                    </select>
                  </div>
                  <SettingRow label="Auto-detect language" description="Automatically detect the spoken language during recording">
                    <Toggle enabled={toggles.autoLanguageDetect} onToggle={() => toggle("autoLanguageDetect")} />
                  </SettingRow>
                  <div>
                    <label className="text-[13px] font-medium text-foreground mb-2 block">Custom vocabulary</label>
                    <p className="text-[11px] text-muted-foreground mb-2">Add company-specific terms to improve transcription accuracy. One term per line.</p>
                    <textarea
                      value={customTerms}
                      onChange={(e) => setCustomTerms(e.target.value)}
                      placeholder={"Acme Corp\nProject Falcon\nQ3 Roadmap"}
                      rows={4}
                      className="w-full rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 resize-none font-mono"
                    />
                  </div>
                </div>
              )}

              {/* ─── Calendar ─── */}
              {active === "calendar" && (
                <div className="space-y-5">
                  <SectionHeader title="Calendar" description="Manage your calendar connections and meeting preferences" />
                  <SettingRow label="Sync calendar" description="Keep your meetings synced with your calendar">
                    <Toggle enabled={toggles.calendarSync} onToggle={() => toggle("calendarSync")} />
                  </SettingRow>
                  <SettingRow label="Show upcoming meetings" description="Display upcoming meetings on the home screen">
                    <Toggle enabled={toggles.showUpcoming} onToggle={() => toggle("showUpcoming")} />
                  </SettingRow>
                  <div className="space-y-2">
                    <h3 className="text-[13px] font-medium text-foreground">Connected Calendars</h3>
                    {[
                      { name: "Google Calendar", email: "alex@company.com", connected: true },
                      { name: "Outlook Calendar", email: "", connected: false },
                    ].map((cal) => (
                      <div key={cal.name} className="flex items-center justify-between rounded-md border border-border bg-card p-3">
                        <div>
                          <span className="text-[13px] font-medium text-foreground">{cal.name}</span>
                          {cal.email && <p className="text-[11px] text-muted-foreground">{cal.email}</p>}
                        </div>
                        <button className={cn(
                          "rounded-md px-2.5 py-1 text-[11px] font-medium",
                          cal.connected ? "bg-accent/10 text-accent" : "border border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                        )}>
                          {cal.connected ? "Connected" : "Connect"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ─── Notifications ─── */}
              {active === "notifications" && (
                <div className="space-y-5">
                  <SectionHeader title="Notifications" description="Choose what you'd like to be notified about" />
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

              {/* ─── Sharing ─── */}
              {active === "sharing" && (
                <div className="space-y-5">
                  <SectionHeader title="Sharing" description="Control how you share meeting notes with others" />
                  <SettingRow label="Share notes by default" description="Automatically share notes with meeting participants">
                    <Toggle enabled={toggles.shareByDefault} onToggle={() => toggle("shareByDefault")} />
                  </SettingRow>
                  <div>
                    <label className="text-[13px] font-medium text-foreground mb-2 block">Default sharing permission</label>
                    <select className="w-full rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20">
                      <option>Can view</option>
                      <option>Can comment</option>
                      <option>Can edit</option>
                    </select>
                  </div>
                </div>
              )}

              {/* ─── Shortcuts ─── */}
              {active === "shortcuts" && (
                <div className="space-y-5">
                  <SectionHeader title="Keyboard Shortcuts" description="Quick keys to navigate and control the app" />
                  <div className="space-y-0.5">
                    {[
                      { action: "New quick note", keys: "⌘ N" },
                      { action: "Search notes", keys: "⌘ K" },
                      { action: "Toggle sidebar", keys: "⌘ B" },
                      { action: "Start / stop recording", keys: "⌘ R" },
                      { action: "Pause / resume recording", keys: "⌘ P" },
                      { action: "Toggle transcript panel", keys: "⌘ T" },
                      { action: "Open settings", keys: "⌘ ," },
                      { action: "Focus ask bar", keys: "/" },
                      { action: "Navigate back", keys: "⌘ ←" },
                    ].map((s) => (
                      <div key={s.action} className="flex items-center justify-between rounded-md px-3 py-2.5 hover:bg-secondary/50 transition-colors">
                        <span className="text-[13px] text-foreground">{s.action}</span>
                        <kbd className="rounded border border-border bg-card px-2 py-0.5 text-[11px] font-mono text-muted-foreground">{s.keys}</kbd>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ─── Integrations ─── */}
              {active === "integrations" && (
                <div className="space-y-5">
                  <SectionHeader title="Integrations" description="Connect third-party tools to enhance your workflow" />
                  <div className="space-y-2">
                    {[
                      { name: "Google Calendar", desc: "Sync meetings and events", connected: true },
                      { name: "Slack", desc: "Share summaries to channels", connected: true },
                      { name: "Notion", desc: "Export notes to Notion pages", connected: false },
                      { name: "Linear", desc: "Create issues from action items", connected: false },
                      { name: "Zoom", desc: "Record Zoom meetings directly", connected: false },
                      { name: "Microsoft Teams", desc: "Integrate with Teams calls", connected: false },
                      { name: "Jira", desc: "Create tickets from action items", connected: false },
                      { name: "Confluence", desc: "Export notes as Confluence pages", connected: false },
                    ].map((item) => (
                      <div key={item.name} className="flex items-center justify-between rounded-md border border-border bg-card p-3">
                        <div>
                          <span className="text-[13px] font-medium text-foreground">{item.name}</span>
                          <p className="text-[11px] text-muted-foreground">{item.desc}</p>
                        </div>
                        <button className={cn(
                          "rounded-md px-2.5 py-1 text-[11px] font-medium transition-colors",
                          item.connected ? "bg-accent/10 text-accent" : "border border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                        )}>
                          {item.connected ? "Connected" : "Connect"}
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
