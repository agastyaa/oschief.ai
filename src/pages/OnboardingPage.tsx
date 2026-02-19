import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mic, Sparkles, FileText, ArrowRight, Check, ShieldCheck, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

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
    title: "Record your meetings",
    description: "Hit record and Syag captures everything — voice, context, and key moments in real time.",
  },
  {
    icon: Sparkles,
    title: "AI-powered summaries",
    description: "Get instant, editable summaries with key points and action items extracted automatically.",
  },
  {
    icon: FileText,
    title: "Your notes, organized",
    description: "All your meeting notes in one place. Search, edit, and revisit any conversation anytime.",
  },
];

// Total steps: 3 features + 1 mic permission + 1 name = 5
const TOTAL_DOTS = 5;
const MIC_STEP = 3;
const NAME_STEP = 4;

export default function OnboardingPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [name, setName] = useState("");
  const [micStatus, setMicStatus] = useState<"idle" | "granted" | "denied">("idle");

  const handleNext = () => {
    setCurrentStep((s) => s + 1);
  };

  const requestMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop tracks immediately — we just needed the permission
      stream.getTracks().forEach((t) => t.stop());
      setMicStatus("granted");
      // Auto-advance after a short delay
      setTimeout(() => setCurrentStep((s) => s + 1), 600);
    } catch {
      setMicStatus("denied");
    }
  };

  const handleFinish = () => {
    if (name.trim()) {
      try {
        const existing = localStorage.getItem("syag-account");
        const account = existing ? JSON.parse(existing) : {};
        account.name = name.trim();
        localStorage.setItem("syag-account", JSON.stringify(account));
      } catch {}
    }
    completeOnboarding();
    navigate("/");
  };

  const isFeatureStep = currentStep < featureSteps.length;
  const isMicStep = currentStep === MIC_STEP;
  const isNameStep = currentStep === NAME_STEP;
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
                ? "Syag needs microphone access to record meetings. You can enable it in your browser settings."
                : "Syag needs access to your microphone to capture meeting audio. We never record without your explicit action."}
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
              onKeyDown={(e) => e.key === "Enter" && handleFinish()}
              placeholder="Your name"
              className="w-full max-w-xs mx-auto block rounded-lg border border-border bg-card px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent mb-6"
            />
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={handleFinish}
                className="text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                Skip
              </button>
              <button
                onClick={handleFinish}
                className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-accent-foreground transition-all hover:opacity-90"
              >
                Get started
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
