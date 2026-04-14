import { useState, useCallback, useMemo } from "react";
import { getElectronAPI } from "@/lib/electron-api";
import { useModelSettings } from "@/contexts/ModelSettingsContext";
import { computeCoachingMetrics, type CoachingMetrics } from "@/lib/coaching-analytics";
import { computeConversationHeuristics } from "@/lib/conversation-heuristics";
import type { SavedNote } from "@/contexts/NotesContext";

interface UseRunCoachingAnalysisOptions {
  updateNote: (id: string, updates: Partial<SavedNote>) => void;
}

export function useRunCoachingAnalysis({ updateNote }: UseRunCoachingAnalysisOptions) {
  const api = getElectronAPI();
  const { selectedAIModel } = useModelSettings();
  const [loadingNoteId, setLoadingNoteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accountRoleId = useMemo(() => {
    try {
      const raw = localStorage.getItem("syag-account");
      if (raw) return JSON.parse(raw)?.roleId as string | undefined;
    } catch { /* ignore */ }
    return undefined;
  }, []);

  const analyze = useCallback(async (note: SavedNote): Promise<boolean> => {
    if (!api?.coaching?.analyzeConversation || !note.transcript?.length || !accountRoleId) return false;

    setLoadingNoteId(note.id);
    setError(null);

    try {
      // Parse duration once
      const parts = (note.duration || "0:00").split(":").map(Number);
      let durationSec = 0;
      if (parts.length === 2) durationSec = parts[0] * 60 + parts[1];
      if (parts.length === 3) durationSec = parts[0] * 3600 + parts[1] * 60 + parts[2];

      // Ensure metrics exist
      let metrics = note.coachingMetrics;
      if (!metrics || metrics.overallScore <= 0) {
        if (durationSec <= 0) {
          setLoadingNoteId(null);
          return false;
        }
        metrics = computeCoachingMetrics(note.transcript, durationSec);
        updateNote(note.id, { coachingMetrics: metrics });
      }

      // Compute heuristics
      const heuristics = durationSec > 0
        ? computeConversationHeuristics(note.transcript, durationSec, accountRoleId)
        : null;

      const { roleInsights: _ri, conversationInsights: _ci, ...metricsForApi } = metrics;
      const result = await api.coaching.analyzeConversation({
        transcript: note.transcript,
        metrics: metricsForApi as unknown as Record<string, unknown>,
        heuristics,
        roleId: accountRoleId,
        model: selectedAIModel || undefined,
      });

      if (result.ok) {
        updateNote(note.id, { coachingMetrics: { ...metrics, conversationInsights: result.data } });
        setLoadingNoteId(null);
        return true;
      } else {
        setError(result.message);
        setLoadingNoteId(null);
        return false;
      }
    } catch {
      setError("Conversation analysis failed unexpectedly.");
      setLoadingNoteId(null);
      return false;
    }
  }, [api, accountRoleId, selectedAIModel, updateNote]);

  return { analyze, loadingNoteId, error, accountRoleId };
}
