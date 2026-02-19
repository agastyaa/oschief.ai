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
        <div className="mx-auto max-w-3xl px-6 py-8">
          <h1 className="font-display text-2xl text-foreground mb-6">Settings</h1>

          <div className="flex gap-8">
            <nav className="flex w-40 flex-shrink-0 flex-col gap-0.5">
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
              {active === "profile" && (
                <div className="space-y-5">
                  <h2 className="font-display text-base text-foreground">Profile</h2>
                  <div className="space-y-3">
                    {[
                      { label: "Name", value: "Alex Johnson" },
                      { label: "Email", value: "alex@company.com" },
                      { label: "Role", value: "Product Lead" },
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
                  <button className="rounded-md bg-accent px-3 py-2 text-xs font-medium text-accent-foreground hover:opacity-90">
                    Save Changes
                  </button>
                </div>
              )}
              {active === "recording" && (
                <div className="space-y-5">
                  <h2 className="font-display text-base text-foreground">Recording Settings</h2>
                  <div className="space-y-2">
                    {["Auto-record all meetings", "Transcribe in real-time", "Generate AI summaries automatically"].map((label) => (
                      <label key={label} className="flex items-center justify-between rounded-md border border-border bg-card p-3">
                        <span className="text-[13px] text-foreground">{label}</span>
                        <div className="h-4 w-8 rounded-full bg-accent/80 p-0.5">
                          <div className="h-3 w-3 translate-x-4 rounded-full bg-accent-foreground transition-transform" />
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {active === "notifications" && (
                <div className="space-y-5">
                  <h2 className="font-display text-base text-foreground">Notifications</h2>
                  <div className="space-y-2">
                    {["Meeting summary ready", "Action item reminder", "Weekly digest"].map((label) => (
                      <label key={label} className="flex items-center justify-between rounded-md border border-border bg-card p-3">
                        <span className="text-[13px] text-foreground">{label}</span>
                        <div className="h-4 w-8 rounded-full bg-accent/80 p-0.5">
                          <div className="h-3 w-3 translate-x-4 rounded-full bg-accent-foreground transition-transform" />
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
              {active === "integrations" && (
                <div className="space-y-5">
                  <h2 className="font-display text-base text-foreground">Integrations</h2>
                  <div className="space-y-2">
                    {[
                      { name: "Google Calendar", connected: true },
                      { name: "Slack", connected: true },
                      { name: "Notion", connected: false },
                      { name: "Linear", connected: false },
                    ].map((item) => (
                      <div key={item.name} className="flex items-center justify-between rounded-md border border-border bg-card p-3">
                        <span className="text-[13px] font-medium text-foreground">{item.name}</span>
                        <button className={cn(
                          "rounded-md px-2.5 py-1 text-[11px] font-medium",
                          item.connected ? "bg-sage-light text-accent" : "bg-secondary text-muted-foreground hover:text-foreground"
                        )}>
                          {item.connected ? "Connected" : "Connect"}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
