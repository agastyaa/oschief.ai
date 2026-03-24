import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, Sparkles, FileText, ArrowRight, Check, ShieldCheck, AlertCircle, Monitor, Calendar, Briefcase, Users as UsersIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { isElectron, getElectronAPI } from "@/lib/electron-api";

const ONBOARDING_KEY = "syag-onboarding-complete";

export function isOnboardingComplete() {
  return localStorage.getItem(ONBOARDING_KEY) === "true";
}

export function completeOnboarding() {
  localStorage.setItem(ONBOARDING_KEY, "true");
}

const featureSteps = [
  {
    icon: Mic,
    title: "Your on-device chief of staff",
    description: "OSChief sits beside your calls, captures everything, and builds a living memory of your work — all on your Mac.",
  },
  {
    icon: Sparkles,
    title: "Meetings become structured memory",
    description: "Every meeting produces summaries, decisions, action items, and project connections — automatically linked to people and work streams.",
  },
  {
    icon: FileText,
    title: "Your data stays under your control",
    description: "Everything lives on your machine. Cloud AI is opt-in, bring-your-own-keys, and you can anonymize names before sending.",
  },
];

const TOTAL_DOTS = isElectron ? 8 : 7;
const MIC_STEP = 3;
const SCREEN_STEP = isElectron ? 4 : -1;
const NAME_STEP = isElectron ? 5 : 4;
const ROLE_STEP = isElectron ? 6 : 5;
const CALENDAR_STEP = isElectron ? 7 : 6;

const ROLES = [
  { id: "product-manager", label: "Product Manager" },
  { id: "engineering-manager", label: "Engineering Manager" },
  { id: "engineer", label: "Software Engineer" },
  { id: "founder-ceo", label: "Founder / CEO" },
  { id: "designer", label: "Designer" },
  { id: "sales", label: "Sales" },
  { id: "marketing", label: "Marketing" },
  { id: "operations", label: "Operations" },
  { id: "data", label: "Data / Analytics" },
  { id: "people-hr", label: "People / HR" },
];

export default function OnboardingPage() {
  const navigate = useNavigate();
  const api = getElectronAPI();
  const [currentStep, setCurrentStep] = useState(0);
  const [name, setName] = useState("");
  const [micStatus, setMicStatus] = useState<"idle" | "granted" | "denied">("idle");
  const [screenStatus, setScreenStatus] = useState<"idle" | "granted" | "denied">("idle");
  const [selectedRole, setSelectedRole] = useState("");
  const [calendarConnected, setCalendarConnected] = useState(false);

  const handleNext = () => {
    setCurrentStep((s) => s + 1);
  };

  const requestMic = async () => {
    try {
      if (api) {
        const result = await api.permissions.requestMicrophone();
        setMicStatus(result ? "granted" : "denied");
        if (result) {
          setTimeout(() => setCurrentStep((s) => s + 1), 600);
        }
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => t.stop());
        setMicStatus("granted");
        setTimeout(() => setCurrentStep((s) => s + 1), 600);
      }
    } catch {
      setMicStatus("denied");
    }
  };

  const requestScreen = async () => {
    if (api) {
      const status = await api.permissions.checkScreenRecording();
      if (status === "granted") {
        setScreenStatus("granted");
        setTimeout(() => setCurrentStep((s) => s + 1), 600);
      } else {
        await api.permissions.requestScreenRecording();
        const newStatus = await api.permissions.checkScreenRecording();
        setScreenStatus(newStatus === "granted" ? "granted" : "denied");
        if (newStatus === "granted") {
          setTimeout(() => setCurrentStep((s) => s + 1), 600);
        }
      }
    } else {
      setScreenStatus("granted");
      setTimeout(() => setCurrentStep((s) => s + 1), 600);
    }
  };

  const handleFinish = () => {
    if (name.trim()) {
      try {
        const existing = localStorage.getItem("syag-account");
        const account = existing ? JSON.parse(existing) : {};
        account.name = name.trim();
        if (selectedRole) account.role = selectedRole;
        localStorage.setItem("syag-account", JSON.stringify(account));
        // Also save role to settings DB
        if (selectedRole && api?.db?.settings?.set) {
          api.db.settings.set("user-role", selectedRole);
        }
      } catch {}
    }
    completeOnboarding();
    navigate("/");
  };

  const connectGoogleCalendar = async () => {
    try {
      if (api?.google?.startAuth) {
        await api.google.startAuth();
        setCalendarConnected(true);
        setTimeout(() => setCurrentStep(s => s + 1), 800);
      }
    } catch {
      // Skip — user can connect later in settings
      setCurrentStep(s => s + 1);
    }
  };

  const isFeatureStep = currentStep < featureSteps.length;
  const isMicStep = currentStep === MIC_STEP;
  const isScreenStep = currentStep === SCREEN_STEP;
  const isNameStep = currentStep === NAME_STEP;
  const isRoleStep = currentStep === ROLE_STEP;
  const isCalendarStep = currentStep === CALENDAR_STEP;
  const isLastFeatureStep = currentStep === featureSteps.length - 1;

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md px-6">
        {/* Progress dots */}
        <div className="flex items-center justify-center gap-2 mb-12">
          {Array.from({ length: TOTAL_DOTS }).map((_, i) => (
            <div
              key={i}
              className={cn(
                "h-1.5 rounded-full transition-all duration-300",
                i === currentStep ? "w-6 bg-accent" : i < currentStep ? "w-1.5 bg-accent/50" : "w-1.5 bg-muted-foreground/20"
              )}
            />
          ))}
        </div>

        {isFeatureStep && (
          <div className="text-center animate-fade-in" key={currentStep}>
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent mx-auto mb-6">
              {(() => {
                const Icon = featureSteps[currentStep].icon;
                return <Icon className="h-7 w-7" />;
              })()}
            </div>
            <h1 className="font-display text-2xl text-foreground mb-3">
              {featureSteps[currentStep].title}
            </h1>
            <p className="text-[15px] text-muted-foreground leading-relaxed max-w-sm mx-auto mb-10">
              {featureSteps[currentStep].description}
            </p>
            <button
              onClick={handleNext}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-accent-foreground transition-all hover:opacity-90"
            >
              {isLastFeatureStep ? "Almost there" : "Next"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}

        {isMicStep && (
          <div className="text-center animate-fade-in" key="mic">
            <div className={cn(
              "flex h-16 w-16 items-center justify-center rounded-2xl mx-auto mb-6",
              micStatus === "granted" ? "bg-accent/10 text-accent" :
              micStatus === "denied" ? "bg-destructive/10 text-destructive" :
              "bg-accent/10 text-accent"
            )}>
              {micStatus === "granted" ? (
                <ShieldCheck className="h-7 w-7" />
              ) : micStatus === "denied" ? (
                <AlertCircle className="h-7 w-7" />
              ) : (
                <Mic className="h-7 w-7" />
              )}
            </div>
            <h1 className="font-display text-2xl text-foreground mb-2">
              {micStatus === "granted" ? "Microphone enabled!" :
               micStatus === "denied" ? "Microphone access denied" :
               "Enable your microphone"}
            </h1>
            <p className="text-[15px] text-muted-foreground leading-relaxed max-w-sm mx-auto mb-8">
              {micStatus === "granted"
                ? "You're all set to record meetings."
                : micStatus === "denied"
                ? "OSChief needs microphone access to record meetings. You can enable it in System Settings > Privacy & Security."
                : "OSChief needs access to your microphone to capture meeting audio. We never record without your explicit action."}
            </p>
            {micStatus === "idle" && (
              <button
                onClick={requestMic}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-accent-foreground transition-all hover:opacity-90"
              >
                <Mic className="h-4 w-4" />
                Allow microphone
              </button>
            )}
            {micStatus === "denied" && (
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={requestMic}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-accent-foreground transition-all hover:opacity-90"
                >
                  Try again
                </button>
                <button
                  onClick={handleNext}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Skip for now
                </button>
              </div>
            )}
          </div>
        )}

        {isScreenStep && (
          <div className="text-center animate-fade-in" key="screen">
            <div className={cn(
              "flex h-16 w-16 items-center justify-center rounded-2xl mx-auto mb-6",
              screenStatus === "granted" ? "bg-accent/10 text-accent" :
              screenStatus === "denied" ? "bg-destructive/10 text-destructive" :
              "bg-accent/10 text-accent"
            )}>
              {screenStatus === "granted" ? (
                <ShieldCheck className="h-7 w-7" />
              ) : screenStatus === "denied" ? (
                <AlertCircle className="h-7 w-7" />
              ) : (
                <Monitor className="h-7 w-7" />
              )}
            </div>
            <h1 className="font-display text-2xl text-foreground mb-2">
              {screenStatus === "granted" ? "Screen recording enabled!" :
               screenStatus === "denied" ? "Screen recording access needed" :
               "Enable screen audio capture"}
            </h1>
            <p className="text-[15px] text-muted-foreground leading-relaxed max-w-sm mx-auto mb-8">
              {screenStatus === "granted"
                ? "OSChief can now capture system audio from your meetings."
                : screenStatus === "denied"
                ? "To capture audio from meeting apps, enable Screen Recording in System Settings > Privacy & Security > Screen Recording."
                : "This allows OSChief to capture audio from meeting apps like Zoom, Google Meet, and Teams. Only audio is captured, never your screen."}
            </p>
            {screenStatus === "idle" && (
              <button
                onClick={requestScreen}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-accent-foreground transition-all hover:opacity-90"
              >
                <Monitor className="h-4 w-4" />
                Allow screen audio
              </button>
            )}
            {screenStatus === "denied" && (
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={requestScreen}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-accent-foreground transition-all hover:opacity-90"
                >
                  Check again
                </button>
                <button
                  onClick={handleNext}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Skip for now
                </button>
              </div>
            )}
          </div>
        )}

        {isNameStep && (
          <div className="text-center animate-fade-in" key="name">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent mx-auto mb-6">
              <Check className="h-7 w-7" />
            </div>
            <h1 className="font-display text-2xl text-foreground mb-2">
              What should we call you?
            </h1>
            <p className="text-[15px] text-muted-foreground mb-8">
              This helps personalize your experience.
            </p>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleNext()}
              placeholder="Your name"
              className="w-full max-w-xs mx-auto block rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent mb-6"
            />
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleNext}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip
              </button>
              <button
                onClick={handleNext}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-accent-foreground transition-all hover:opacity-90"
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {isRoleStep && (
          <div className="text-center animate-fade-in" key="role">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent mx-auto mb-6">
              <Briefcase className="h-7 w-7" />
            </div>
            <h1 className="font-display text-2xl text-foreground mb-2">
              What&apos;s your role?
            </h1>
            <p className="text-[15px] text-muted-foreground mb-6">
              OSChief tailors coaching and insights to how you work.
            </p>
            <div className="grid grid-cols-2 gap-2 max-w-sm mx-auto mb-6">
              {ROLES.map(r => (
                <button
                  key={r.id}
                  onClick={() => setSelectedRole(r.id)}
                  className={cn(
                    "px-3 py-2 rounded-lg border text-sm text-left transition-all",
                    selectedRole === r.id
                      ? "border-accent bg-accent/10 text-foreground font-medium"
                      : "border-border bg-card text-muted-foreground hover:border-accent/40"
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleNext}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip
              </button>
              <button
                onClick={handleNext}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-accent-foreground transition-all hover:opacity-90"
              >
                Next
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {isCalendarStep && (
          <div className="text-center animate-fade-in" key="calendar">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-accent/10 text-accent mx-auto mb-6">
              {calendarConnected ? <Check className="h-7 w-7" /> : <Calendar className="h-7 w-7" />}
            </div>
            <h1 className="font-display text-2xl text-foreground mb-2">
              {calendarConnected ? "Calendar connected!" : "Connect your calendar"}
            </h1>
            <p className="text-[15px] text-muted-foreground mb-8">
              {calendarConnected
                ? "OSChief will auto-detect meetings and prep you before each one."
                : "OSChief uses your calendar to detect meetings, show attendee context, and send prep briefs before each call."}
            </p>
            {!calendarConnected && (
              <div className="flex flex-col items-center gap-3 mb-6">
                <button
                  onClick={connectGoogleCalendar}
                  className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-accent-foreground transition-all hover:opacity-90"
                >
                  <Calendar className="h-4 w-4" />
                  Connect Google Calendar
                </button>
                <button
                  onClick={() => navigate("/settings?section=connections")}
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Or connect Outlook / ICS in Settings
                </button>
              </div>
            )}
            <button
              onClick={handleFinish}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg px-6 py-2.5 text-sm font-medium transition-all hover:opacity-90",
                calendarConnected
                  ? "bg-accent text-accent-foreground"
                  : "bg-card border border-border text-foreground"
              )}
            >
              {calendarConnected ? "Get started" : "Skip — I'll do this later"}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
