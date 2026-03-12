import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { isElectron, getElectronAPI } from "@/lib/electron-api";
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
  const api = getElectronAPI();

  useEffect(() => {
    if (api) {
      api.db.notes.getAll().then((dbNotes) => setNotes(dbNotes));
    }
  }, []);

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

  return (
    <NotesContext.Provider value={{ notes, addNote, updateNote, deleteNote, updateNoteFolder, getNotesInFolder, refreshNotes }}>
      {children}
    </NotesContext.Provider>
  );
}

export function useNotes() {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error("useNotes must be used within NotesProvider");
  return ctx;
}
