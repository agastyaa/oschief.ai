import { Bell, Globe, Key, Mic, User } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { cn } from "@/lib/utils";
import { useState } from "react";

const sections = [
  { icon: User, label: "Profile", id: "profile" },
  { icon: Mic, label: "Recording", id: "recording" },
  { icon: Bell, label: "Notifications", id: "notifications" },
  { icon: Globe, label: "Integrations", id: "integrations" },
  { icon: Key, label: "API", id: "api" },
];

export default function SettingsPage() {
  const [active, setActive] = useState("profile");

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-8 py-10">
          <h1 className="font-display text-3xl font-bold text-foreground mb-8">Settings</h1>

          <div className="flex gap-8">
            {/* Settings Nav */}
            <nav className="flex w-48 flex-shrink-0 flex-col gap-1">
              {sections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setActive(s.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    active === s.id
                      ? "bg-secondary text-foreground"
                      : "text-muted-foreground hover:bg-secondary/50 hover:text-foreground"
                  )}
                >
                  <s.icon className="h-4 w-4" />
                  {s.label}
                </button>
              ))}
            </nav>

            {/* Settings Content */}
            <div className="flex-1 animate-fade-in">
              {active === "profile" && (
                <div className="space-y-6">
                  <h2 className="font-display text-lg font-semibold text-foreground">Profile</h2>
                  <div className="space-y-4">
                    <div>
                      <label className="text-sm font-medium text-foreground">Name</label>
                      <input defaultValue="Alex Johnson" className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">Email</label>
                      <input defaultValue="alex@company.com" className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-foreground">Role</label>
                      <input defaultValue="Product Lead" className="mt-1 w-full rounded-lg border border-border bg-card px-3 py-2.5 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20" />
                    </div>
                  </div>
                  <button className="rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground hover:opacity-90">
                    Save Changes
                  </button>
                </div>
              )}
              {active === "recording" && (
                <div className="space-y-6">
                  <h2 className="font-display text-lg font-semibold text-foreground">Recording Settings</h2>
                  <div className="space-y-4">
                    {["Auto-record all meetings", "Transcribe in real-time", "Generate AI summaries automatically"].map((label) => (
                      <label key={label} className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
                        <span className="text-sm text-foreground">{label}</span>
                        <div className="h-5 w-9 rounded-full bg-accent/80 p-0.5">
                          <div className="h-4 w-4 translate-x-4 rounded-full bg-accent-foreground transition-transform" />
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {active === "notifications" && (
                <div className="space-y-6">
                  <h2 className="font-display text-lg font-semibold text-foreground">Notifications</h2>
                  <div className="space-y-4">
                    {["Meeting summary ready", "Action item reminder", "Weekly digest"].map((label) => (
                      <label key={label} className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
                        <span className="text-sm text-foreground">{label}</span>
                        <div className="h-5 w-9 rounded-full bg-accent/80 p-0.5">
                          <div className="h-4 w-4 translate-x-4 rounded-full bg-accent-foreground transition-transform" />
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {active === "integrations" && (
                <div className="space-y-6">
                  <h2 className="font-display text-lg font-semibold text-foreground">Integrations</h2>
                  <div className="space-y-3">
                    {[
                      { name: "Google Calendar", connected: true },
                      { name: "Slack", connected: true },
                      { name: "Notion", connected: false },
                      { name: "Linear", connected: false },
                    ].map((item) => (
                      <div key={item.name} className="flex items-center justify-between rounded-lg border border-border bg-card p-4">
                        <span className="text-sm font-medium text-foreground">{item.name}</span>
                        <button
                          className={cn(
                            "rounded-lg px-3 py-1.5 text-xs font-medium",
                            item.connected
                              ? "bg-sage-light text-accent"
                              : "bg-secondary text-muted-foreground hover:text-foreground"
                          )}
                        >
                          {item.connected ? "Connected" : "Connect"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {active === "api" && (
                <div className="space-y-6">
                  <h2 className="font-display text-lg font-semibold text-foreground">API Keys</h2>
                  <div className="rounded-lg border border-border bg-card p-4">
                    <label className="text-sm font-medium text-foreground">API Key</label>
                    <div className="mt-2 flex gap-2">
                      <input value="grnl_sk_••••••••••••••••" readOnly className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm font-mono text-muted-foreground" />
                      <button className="rounded-lg bg-secondary px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary/80">
                        Copy
                      </button>
                    </div>
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
