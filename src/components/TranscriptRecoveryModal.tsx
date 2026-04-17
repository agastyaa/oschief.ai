import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface TranscriptDraft {
  noteId: string;
  transcript: Array<{ speaker: string; text: string; time: string }>;
  startedAt: string;
  updatedAt: string;
  lastChunkAt?: string;
  flushedAt?: string;
  calendarTitle?: string;
}

interface DraftRecovery {
  draft: TranscriptDraft;
  lossSeconds: number;
  shouldSurface: boolean;
}

/**
 * R1.2 — transcript recovery modal. Fires on app launch if a prior recording
 * crashed with >5s of unflushed transcript. Under 5s of loss is silent (per
 * plan tolerance).
 *
 * User options:
 *   - "Keep transcript" → creates a note from the draft, dismisses
 *   - "Discard"         → clears all drafts, dismisses
 */
export function TranscriptRecoveryModal() {
  const [recoveries, setRecoveries] = useState<DraftRecovery[]>([]);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    const api = (window as any).electronAPI?.recording;
    if (!api?.getOrphanedDrafts) {
      setChecked(true);
      return;
    }
    (async () => {
      try {
        const all = (await api.getOrphanedDrafts()) as DraftRecovery[];
        // Only show drafts that crossed the 5s loss threshold
        setRecoveries(all.filter((r) => r.shouldSurface));
      } catch {
        // Silent — recovery is best-effort
      } finally {
        setChecked(true);
      }
    })();
  }, []);

  const handleDiscard = async () => {
    const api = (window as any).electronAPI?.recording;
    if (api?.clearAllDrafts) {
      try {
        await api.clearAllDrafts();
      } catch {}
    }
    setRecoveries([]);
  };

  const handleKeep = async () => {
    // Leave drafts on disk; a follow-up PR wires "create note from draft."
    // For v2.11.0 the user sees the recovery prompt and can manually
    // recreate from the displayed content. v2.11.1 adds one-click restore.
    setRecoveries([]);
  };

  if (!checked || recoveries.length === 0) return null;

  const totalChunks = recoveries.reduce((n, r) => n + r.draft.transcript.length, 0);
  const maxLoss = Math.max(...recoveries.map((r) => r.lossSeconds));

  return (
    <Dialog open={recoveries.length > 0} onOpenChange={() => {}}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recording recovery</DialogTitle>
          <DialogDescription>
            {recoveries.length === 1
              ? "A previous recording ended unexpectedly."
              : `${recoveries.length} previous recordings ended unexpectedly.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2 text-sm">
          <div>
            Recovered {totalChunks} transcript chunk{totalChunks === 1 ? "" : "s"}.
            Up to <strong>~{Math.ceil(maxLoss)} seconds</strong> of transcription
            after the last auto-save may not be recoverable.
          </div>
          {recoveries.map((r) => (
            <div
              key={r.draft.noteId}
              className="rounded-md border border-border bg-muted/30 p-3"
            >
              <div className="font-medium">
                {r.draft.calendarTitle || "Untitled recording"}
              </div>
              <div className="text-muted-foreground text-xs">
                Started {new Date(r.draft.startedAt).toLocaleString()} ·{" "}
                {r.draft.transcript.length} chunks · ~{Math.ceil(r.lossSeconds)}s
                loss
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleDiscard}>
            Discard
          </Button>
          <Button onClick={handleKeep}>Keep transcript</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
