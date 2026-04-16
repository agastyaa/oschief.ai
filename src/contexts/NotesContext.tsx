import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { isElectron, getElectronAPI } from "@/lib/electron-api";
import { toast } from "sonner";
import type { CoachingMetrics } from "@/lib/coaching-analytics";

export interface SavedNote {
  id: string;
  title: string;
  date: string;
  time: string;
  duration: string;
  /** Optional start-to-end time range (e.g. "7:00 PM – 7:34 PM") */
  timeRange?: string;
  /** Optional calendar event id when note was created from a calendar meeting (for mapping back) */
  calendarEventId?: string;
  personalNotes: string;
  transcript: { speaker: string; time: string; text: string; words?: { word: string; start: number; end: number }[] }[];
  summary: {
    overview: string;
    keyPoints?: string[];
    nextSteps?: { text: string; assignee: string; done: boolean; dueDate?: string }[];
    actionItems?: { text: string; assignee: string; done: boolean; dueDate?: string; priority?: string }[];
    discussionTopics?: { topic: string; summary: string; speakers: string[] }[];
    decisions?: string[];
    questionsAndOpenItems?: string[];
    attachments?: { type: "image"; url: string }[];
  } | null;
  folderId: string | null;
  /** True when recorded with mic only (no system audio). Used to exclude from coaching. */
  micOnly?: boolean;
  /** Computed speech coaching metrics — generated after transcription completes */
  coachingMetrics?: CoachingMetrics;
}

interface NotesContextType {
  notes: SavedNote[];
  addNote: (note: SavedNote) => void;
  updateNote: (id: string, updates: Partial<SavedNote>) => void;
  deleteNote: (id: string) => void;
  updateNoteFolder: (noteId: string, folderId: string | null) => void;
  getNotesInFolder: (folderId: string) => SavedNote[];
  refreshNotes: () => Promise<void>;
  /** Set of note IDs currently being summarized in the background. */
  summarizingNoteIds: Set<string>;
  /** Mark a note as "summarizing" (call before firing summarizeBackground IPC). */
  addSummarizingNote: (noteId: string) => void;
  /** Last summary-ready event: { noteId, durationMs } — consumed by NewNotePage to update inline. */
  lastSummaryReady: { noteId: string; summary: any; durationMs: number } | null;
}

const STORAGE_KEY = "syag-notes";

function loadNotesFromLS(): SavedNote[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveNotesToLS(notes: SavedNote[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch {}
}

const NotesContext = createContext<NotesContextType | undefined>(undefined);

export function NotesProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<SavedNote[]>(() => isElectron ? [] : loadNotesFromLS());
  const [summarizingNoteIds, setSummarizingNoteIds] = useState<Set<string>>(new Set());
  const [lastSummaryReady, setLastSummaryReady] = useState<{ noteId: string; summary: any; durationMs: number } | null>(null);
  const api = getElectronAPI();

  // _activeNewNotePageIds (module-level Set) tracks noteIds viewed on NewNotePage
  // to suppress redundant toasts — see useRegisterActiveNewNotePage() below

  useEffect(() => {
    if (api) {
      api.db.notes.getAll().then((dbNotes) => {
        setNotes(dbNotes);
        // Backfill: derive titles for notes stuck with generic titles.
        // Tries summary.overview → summary.tldr → first summary keyPoint → transcript.
        // Runs on app launch for existing notes that shipped before the title fix.
        const isGeneric = (t: string) => {
          const n = (t || "").toLowerCase().trim();
          if (!n) return true;
          if (["meeting notes", "this meeting", "untitled", "untitled meeting", "new note"].includes(n)) return true;
          // Auto-generated date-based titles like "Meeting — Apr 15, 10:30 AM"
          if (/^meeting\s*[—-]\s*\w{3}\s+\d{1,2}/i.test(n)) return true;
          return false;
        };

        const deriveFromText = (text: string): string | null => {
          if (!text || text.length < 10) return null;
          const firstClause = text.split(/[;.!?,\n]/).filter((c) => c.trim().length > 0)[0]?.trim();
          if (!firstClause || firstClause.length < 5) return null;
          if (firstClause.length <= 60) return firstClause;
          const truncated = firstClause.slice(0, 50).replace(/\s+\S*$/, "").trim();
          return truncated.length >= 5 ? truncated : null;
        };

        const updates: Array<{ id: string; title: string }> = [];
        for (const note of dbNotes) {
          if (!isGeneric(note.title || "")) continue;

          // Try multiple sources in order
          let derived: string | null = null;

          // 1. Summary overview / tldr
          derived = deriveFromText(note.summary?.overview || note.summary?.tldr || "");

          // 2. First summary keyPoint
          if (!derived && note.summary?.keyPoints?.length) {
            const kp = note.summary.keyPoints[0];
            derived = deriveFromText(typeof kp === "string" ? kp : "");
          }

          // 3. First summary action item
          if (!derived && note.summary?.actionItems?.length) {
            derived = deriveFromText(note.summary.actionItems[0]?.text || "");
          }

          // 4. First transcript line (last resort)
          if (!derived && note.transcript && note.transcript.length > 0) {
            const transcriptText = note.transcript.slice(0, 5).map((t: any) => t.text).join(" ");
            derived = deriveFromText(transcriptText);
          }

          if (derived) updates.push({ id: note.id, title: derived });
        }

        if (updates.length > 0) {
          console.log(`[NotesContext] Backfilling ${updates.length} meeting titles`);
          Promise.all(
            updates.map((u) => api.db.notes.update(u.id, { title: u.title }).catch(() => {})),
          ).then(() => {
            api.db.notes.getAll().then((refreshed) => setNotes(refreshed));
          });
        }
      });
    }
  }, []);

  // Refresh notes when sync pushes data from another device
  useEffect(() => {
    if (!api?.sync) return;
    const unsub = api.sync.onDataChanged(() => {
      api.db.notes.getAll().then((dbNotes) => setNotes(dbNotes));
    });
    return unsub;
  }, [api]);

  // Global summary-ready listener — fires regardless of which page the user is on
  useEffect(() => {
    if (!api?.llm) return;

    const cleanupReady = api.llm.onSummaryReady((noteId: string, summary: any, durationMs: number) => {
      // Remove from summarizing set
      setSummarizingNoteIds((prev) => {
        const next = new Set(prev);
        next.delete(noteId);
        return next;
      });

      // Update the note in context state with the new summary
      setNotes((prev) => prev.map((n) => (n.id === noteId ? { ...n, summary } : n)));

      // Publish for NewNotePage to pick up inline
      setLastSummaryReady({ noteId, summary, durationMs });

      // Show toast ONLY if user is NOT on the NewNotePage for this specific note
      // (NewNotePage shows the summary inline — toast would be redundant)
      if (!_activeNewNotePageIds.has(noteId)) {
        const note = notes.find((n) => n.id === noteId);
        const title = note?.title || "Meeting";
        const durationLabel = durationMs > 0 ? ` (${Math.round(durationMs / 1000)}s)` : "";
        toast.success(`Summary ready: ${title}${durationLabel}`, {
          duration: 8000,
          action: {
            label: "View",
            onClick: () => {
              // Navigate to the note — use hash router path
              window.location.hash = `#/note/${noteId}`;
            },
          },
        });
      }
    });

    const cleanupFailed = api.llm.onSummaryFailed((noteId: string) => {
      setSummarizingNoteIds((prev) => {
        const next = new Set(prev);
        next.delete(noteId);
        return next;
      });

      if (!_activeNewNotePageIds.has(noteId)) {
        toast.error("Summary generation failed. Try again from the note.");
      }
    });

    return () => { cleanupReady(); cleanupFailed(); };
  }, [api, notes]);

  useEffect(() => {
    if (!api) saveNotesToLS(notes);
  }, [notes]);

  const refreshNotes = useCallback(async () => {
    if (api) {
      const dbNotes = await api.db.notes.getAll();
      setNotes(dbNotes);
    }
  }, [api]);

  const addNote = useCallback((note: SavedNote) => {
    setNotes((prev) => {
      const existing = prev.findIndex((n) => n.id === note.id);
      if (existing >= 0) {
        const updated = [...prev];
        updated[existing] = note;
        return updated;
      }
      return [note, ...prev];
    });
    if (api) {
      api.db.notes.add(note).catch(console.error);
    }
  }, [api]);

  const updateNote = useCallback((id: string, updates: Partial<SavedNote>) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...updates } : n)));
    if (api) {
      api.db.notes.update(id, updates).catch(console.error);
    }
  }, [api]);

  const deleteNote = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (api) {
      api.db.notes.delete(id).catch(console.error);
    }
  }, [api]);

  const updateNoteFolder = useCallback((noteId: string, folderId: string | null) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, folderId } : n))
    );
    if (api) {
      api.db.notes.updateFolder(noteId, folderId).catch(console.error);
    }
  }, [api]);

  const getNotesInFolder = useCallback(
    (folderId: string) => notes.filter((n) => n.folderId === folderId),
    [notes]
  );

  const addSummarizingNote = useCallback((noteId: string) => {
    setSummarizingNoteIds((prev) => {
      const next = new Set(prev);
      next.add(noteId);
      return next;
    });
  }, []);

  return (
    <NotesContext.Provider value={{
      notes, addNote, updateNote, deleteNote, updateNoteFolder, getNotesInFolder, refreshNotes,
      summarizingNoteIds, addSummarizingNote, lastSummaryReady,
    }}>
      {children}
    </NotesContext.Provider>
  );
}

export function useNotes() {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error("useNotes must be used within NotesProvider");
  return ctx;
}

/**
 * Register a noteId as "actively viewed on NewNotePage" so the global
 * summary-ready toast is suppressed (summary appears inline instead).
 * Call from NewNotePage's useEffect with the current noteId.
 */
export function useRegisterActiveNewNotePage(noteId: string | null) {
  const api = getElectronAPI();
  useEffect(() => {
    if (!noteId) return;
    // Access the ref via a module-level approach — we store it on the context provider
    // For simplicity, we use a global set that the provider also reads
    _activeNewNotePageIds.add(noteId);
    return () => { _activeNewNotePageIds.delete(noteId); };
  }, [noteId]);
}

// Module-level set shared between provider and useRegisterActiveNewNotePage hook
const _activeNewNotePageIds = new Set<string>();
