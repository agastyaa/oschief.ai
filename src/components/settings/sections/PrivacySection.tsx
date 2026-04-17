import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { getElectronAPI } from '@/lib/electron-api'
import { SectionHeader } from '../shared/primitives'

export function PrivacySection({ api }: { api: ReturnType<typeof getElectronAPI> }) {
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

      <div className="rounded-[10px] border border-border bg-card p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm font-medium flex items-center gap-2">
              Air-Gapped Mode
              {airgapped && <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-bg text-green">Active</span>}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Blocks cloud AI and cloud STT. Transcription and summarization use on-device models only. Calendar sync, updates, and iCloud continue to work.
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
              airgapped ? "bg-green" : "bg-muted"
            )}
          >
            <span className={cn("pointer-events-none inline-block h-4 w-4 rounded-full bg-white shadow transform transition-transform mt-0.5", airgapped ? "translate-x-4.5 ml-0.5" : "translate-x-0.5")} />
          </button>
        </div>
      </div>

      <div className="rounded-[10px] border border-border bg-card p-4 space-y-4">
        <div className="text-sm font-medium">Cloud AI Prompts</div>
        <div className="text-xs text-muted-foreground mb-3">
          When using cloud models (via OpenRouter or custom providers), OSChief sends your transcript to generate summaries. These settings control what personal data is included.
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
          <div className="text-xs text-amber px-2 py-1.5 rounded bg-amber-bg">
            When anonymization is on, cloud AI won't see real names. Summaries will use "Person A" etc., then OSChief restores real names locally.
          </div>
        )}
      </div>

      <div className="rounded-[10px] border border-border bg-card p-4 space-y-3">
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

      <div className="rounded-[10px] border border-border bg-card p-4 space-y-3">
        <div className="text-sm font-medium">Forget a Person</div>
        <div className="text-xs text-muted-foreground">
          Completely remove someone from OSChief's memory — deletes their profile, meeting links, commitments, decisions, and vault file. Does not affect your calendar or email.
        </div>
        <button
          onClick={() => { navigate("/people"); }}
          className="text-xs font-medium text-primary hover:underline"
        >
          Go to People → select a person → Delete
        </button>
      </div>

      <div className="rounded-[10px] border border-border bg-card p-4 space-y-2">
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
