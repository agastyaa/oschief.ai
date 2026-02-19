import { Bell, Globe, Key, Mic, User, Palette, Languages, Shield, Keyboard, Monitor, Moon, Sun } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { cn } from "@/lib/utils";
import { useState } from "react";

const sections = [
  { icon: User, label: "Profile", id: "profile" },
  { icon: Palette, label: "Appearance", id: "appearance" },
  { icon: Mic, label: "Recording", id: "recording" },
  { icon: Bell, label: "Notifications", id: "notifications" },
  { icon: Globe, label: "Integrations", id: "integrations" },
  { icon: Languages, label: "Language", id: "language" },
  { icon: Shield, label: "Privacy & Data", id: "privacy" },
  { icon: Keyboard, label: "Shortcuts", id: "shortcuts" },
  { icon: Key, label: "API", id: "api" },
];

function Toggle({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      className={cn(
        "relative h-5 w-9 rounded-full transition-colors",
        enabled ? "bg-accent" : "bg-secondary"
      )}
    >
      <div className={cn(
        "absolute top-0.5 h-4 w-4 rounded-full bg-accent-foreground transition-transform shadow-sm",
        enabled ? "translate-x-4.5 left-0" : "left-0.5"
      )} style={{ transform: enabled ? "translateX(18px)" : "translateX(0px)" }} />
    </button>
  );
}

export default function SettingsPage() {
  const [active, setActive] = useState("profile");
  const [toggles, setToggles] = useState<Record<string, boolean>>({
    autoRecord: true,
    realTimeTranscribe: true,
    aiSummaries: true,
    summaryReady: true,
    actionReminder: true,
    weeklyDigest: false,
    shareAnalytics: false,
    storeTranscripts: true,
    autoDelete: false,
    darkMode: false,
    compactMode: false,
    animatedTransitions: true,
  });

  const toggle = (key: string) => setToggles((prev) => ({ ...prev, [key]: !prev[key] }));

  const [language, setLanguage] = useState("en");
  const [theme, setTheme] = useState<"light" | "dark" | "system">("light");

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-3xl px-6 py-8">
          <h1 className="font-display text-2xl text-foreground mb-6">Settings</h1>

          <div className="flex gap-8">
            <nav className="flex w-44 flex-shrink-0 flex-col gap-0.5">
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] transition-colors",
                    active === s.id
                      ? "bg-secondary text-foreground font-medium"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  )}
                >
                  <s.icon className="h-3.5 w-3.5" />
                  {s.label}
                </button>
              ))}
            </nav>

            <div className="flex-1 animate-fade-in">
              {/* Profile */}
              {active === "profile" && (
                <div className="space-y-5">
                  <h2 className="font-display text-base text-foreground">Profile</h2>
                  <div className="space-y-3">
                    {[
                      { label: "Name", value: "Alex Johnson" },
                      { label: "Email", value: "alex@company.com" },
                      { label: "Role", value: "Product Lead" },
                      { label: "Company", value: "Acme Inc." },
                      { label: "Timezone", value: "America/New_York (EST)" },
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
                    <button className="rounded-md bg-accent px-3 py-2 text-xs font-medium text-accent-foreground hover:opacity-90">
                      Save Changes
                    </button>
                    <button className="rounded-md border border-border px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Appearance */}
              {active === "appearance" && (
                <div className="space-y-5">
                  <h2 className="font-display text-base text-foreground">Appearance</h2>
                  <div>
                    <label className="text-[13px] font-medium text-foreground mb-2 block">Theme</label>
                    <div className="flex gap-2">
                      {([
                        { value: "light", icon: Sun, label: "Light" },
                        { value: "dark", icon: Moon, label: "Dark" },
                        { value: "system", icon: Monitor, label: "System" },
                      ] as const).map((t) => (
                        <button
                          key={t.value}
                          onClick={() => setTheme(t.value)}
                          className={cn(
                            "flex items-center gap-2 rounded-md border px-3 py-2.5 text-[13px] transition-colors",
                            theme === t.value
                              ? "border-accent bg-accent/10 text-foreground font-medium"
                              : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-secondary"
                          )}
                        >
                          <t.icon className="h-3.5 w-3.5" />
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <SettingToggle label="Compact mode" description="Reduce spacing for denser layout" enabled={toggles.compactMode} onToggle={() => toggle("compactMode")} />
                    <SettingToggle label="Animated transitions" description="Enable smooth animations throughout the app" enabled={toggles.animatedTransitions} onToggle={() => toggle("animatedTransitions")} />
                  </div>
                  <div>
                    <label className="text-[13px] font-medium text-foreground mb-2 block">Font size</label>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] text-muted-foreground">A</span>
                      <input type="range" min="12" max="18" defaultValue="14" className="flex-1 accent-accent" />
                      <span className="text-[15px] text-muted-foreground">A</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Recording */}
              {active === "recording" && (
                <div className="space-y-5">
                  <h2 className="font-display text-base text-foreground">Recording Settings</h2>
                  <div className="space-y-2">
                    <SettingToggle label="Auto-record all meetings" description="Automatically start recording when a meeting begins" enabled={toggles.autoRecord} onToggle={() => toggle("autoRecord")} />
                    <SettingToggle label="Transcribe in real-time" description="Show live transcription during recording" enabled={toggles.realTimeTranscribe} onToggle={() => toggle("realTimeTranscribe")} />
                    <SettingToggle label="Generate AI summaries automatically" description="Create meeting summaries when recording ends" enabled={toggles.aiSummaries} onToggle={() => toggle("aiSummaries")} />
                  </div>
                  <div>
                    <label className="text-[13px] font-medium text-foreground mb-2 block">Default audio input</label>
                    <select className="w-full rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20">
                      <option>System Default Microphone</option>
                      <option>MacBook Pro Microphone</option>
                      <option>External USB Microphone</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Notifications */}
              {active === "notifications" && (
                <div className="space-y-5">
                  <h2 className="font-display text-base text-foreground">Notifications</h2>
                  <div className="space-y-2">
                    <SettingToggle label="Meeting summary ready" description="Notify when AI finishes generating a summary" enabled={toggles.summaryReady} onToggle={() => toggle("summaryReady")} />
                    <SettingToggle label="Action item reminder" description="Get reminded about pending action items" enabled={toggles.actionReminder} onToggle={() => toggle("actionReminder")} />
                    <SettingToggle label="Weekly digest" description="Receive a weekly summary of all meetings" enabled={toggles.weeklyDigest} onToggle={() => toggle("weeklyDigest")} />
                  </div>
                </div>
              )}

              {/* Integrations */}
              {active === "integrations" && (
                <div className="space-y-5">
                  <h2 className="font-display text-base text-foreground">Integrations</h2>
                  <div className="space-y-2">
                    {[
                      { name: "Google Calendar", connected: true, desc: "Sync meetings and events" },
                      { name: "Slack", connected: true, desc: "Share summaries to channels" },
                      { name: "Notion", connected: false, desc: "Export notes to Notion pages" },
                      { name: "Linear", connected: false, desc: "Create issues from action items" },
                      { name: "Zoom", connected: false, desc: "Record Zoom meetings directly" },
                      { name: "Microsoft Teams", connected: false, desc: "Integrate with Teams calls" },
                    ].map((item) => (
                      <div key={item.name} className="flex items-center justify-between rounded-md border border-border bg-card p-3">
                        <div>
                          <span className="text-[13px] font-medium text-foreground">{item.name}</span>
                          <p className="text-[11px] text-muted-foreground">{item.desc}</p>
                        </div>
                        <button className={cn(
                          "rounded-md px-2.5 py-1 text-[11px] font-medium",
                          item.connected ? "bg-accent/10 text-accent" : "bg-secondary text-muted-foreground hover:text-foreground"
                        )}>
                          {item.connected ? "Connected" : "Connect"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Language */}
              {active === "language" && (
                <div className="space-y-5">
                  <h2 className="font-display text-base text-foreground">Language & Region</h2>
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
                    </select>
                  </div>
                  <div>
                    <label className="text-[13px] font-medium text-foreground mb-2 block">Transcription language</label>
                    <select className="w-full rounded-md border border-border bg-card px-3 py-2 text-[13px] text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20">
                      <option>Auto-detect</option>
                      <option>English</option>
                      <option>Spanish</option>
                      <option>French</option>
                      <option>German</option>
                      <option>Japanese</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[13px] font-medium text-foreground mb-2 block">Date format</label>
                    <div className="flex gap-2">
                      {["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"].map((fmt) => (
                        <button key={fmt} className="rounded-md border border-border bg-card px-3 py-1.5 text-[12px] text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors">
                          {fmt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Privacy */}
              {active === "privacy" && (
                <div className="space-y-5">
                  <h2 className="font-display text-base text-foreground">Privacy & Data</h2>
                  <div className="space-y-2">
                    <SettingToggle label="Share usage analytics" description="Help improve the product by sharing anonymous usage data" enabled={toggles.shareAnalytics} onToggle={() => toggle("shareAnalytics")} />
                    <SettingToggle label="Store transcripts" description="Keep meeting transcripts for future reference" enabled={toggles.storeTranscripts} onToggle={() => toggle("storeTranscripts")} />
                    <SettingToggle label="Auto-delete after 90 days" description="Automatically remove recordings older than 90 days" enabled={toggles.autoDelete} onToggle={() => toggle("autoDelete")} />
                  </div>
                  <div className="rounded-md border border-border bg-card p-4 space-y-3">
                    <h3 className="text-[13px] font-medium text-foreground">Data Management</h3>
                    <div className="flex gap-2">
                      <button className="rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-secondary transition-colors">
                        Export All Data
                      </button>
                      <button className="rounded-md border border-destructive/30 px-3 py-1.5 text-[12px] font-medium text-destructive hover:bg-destructive/10 transition-colors">
                        Delete All Data
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Shortcuts */}
              {active === "shortcuts" && (
                <div className="space-y-5">
                  <h2 className="font-display text-base text-foreground">Keyboard Shortcuts</h2>
                  <div className="space-y-1">
                    {[
                      { action: "New quick note", keys: "⌘ N" },
                      { action: "Search notes", keys: "⌘ K" },
                      { action: "Toggle sidebar", keys: "⌘ B" },
                      { action: "Start/stop recording", keys: "⌘ R" },
                      { action: "Pause/resume recording", keys: "⌘ P" },
                      { action: "Open settings", keys: "⌘ ," },
                      { action: "Toggle transcript panel", keys: "⌘ T" },
                      { action: "Ask bar focus", keys: "/" },
                    ].map((shortcut) => (
                      <div key={shortcut.action} className="flex items-center justify-between rounded-md px-3 py-2.5 hover:bg-secondary/50 transition-colors">
                        <span className="text-[13px] text-foreground">{shortcut.action}</span>
                        <kbd className="rounded border border-border bg-card px-2 py-0.5 text-[11px] font-mono text-muted-foreground">
                          {shortcut.keys}
                        </kbd>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* API */}
              {active === "api" && (
                <div className="space-y-5">
                  <h2 className="font-display text-base text-foreground">API Keys</h2>
                  <div className="rounded-md border border-border bg-card p-3">
                    <label className="text-[13px] font-medium text-foreground">API Key</label>
                    <div className="mt-1.5 flex gap-1.5">
                      <input value="grnl_sk_••••••••••••••••" readOnly className="flex-1 rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] font-mono text-muted-foreground" />
                      <button className="rounded-md bg-secondary px-2.5 py-1.5 text-xs font-medium text-foreground hover:bg-secondary/80">Copy</button>
                    </div>
                  </div>
                  <button className="rounded-md border border-border px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-secondary transition-colors">
                    Generate New Key
                  </button>
                  <div className="rounded-md border border-border bg-card p-3">
                    <label className="text-[13px] font-medium text-foreground">Webhook URL</label>
                    <input
                      placeholder="https://your-app.com/webhooks/granola"
                      className="mt-1.5 w-full rounded-md border border-border bg-background px-2.5 py-1.5 text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
                    />
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

function SettingToggle({ label, description, enabled, onToggle }: { label: string; description: string; enabled: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border bg-card p-3">
      <div>
        <span className="text-[13px] text-foreground">{label}</span>
        <p className="text-[11px] text-muted-foreground">{description}</p>
      </div>
      <Toggle enabled={enabled} onToggle={onToggle} />
    </div>
  );
}
