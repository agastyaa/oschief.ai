import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";

export interface SavedNote {
  id: string;
  title: string;
  date: string;
  time: string;
  duration: string;
  personalNotes: string;
  transcript: { speaker: string; time: string; text: string }[];
  summary: {
    overview: string;
    keyPoints: string[];
    nextSteps: { text: string; assignee: string; done: boolean }[];
  } | null;
  folderId: string | null;
}

interface NotesContextType {
  notes: SavedNote[];
  addNote: (note: SavedNote) => void;
  deleteNote: (id: string) => void;
  updateNoteFolder: (noteId: string, folderId: string | null) => void;
  getNotesInFolder: (folderId: string) => SavedNote[];
}

const STORAGE_KEY = "syag-notes";

function loadNotes(): SavedNote[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveNotes(notes: SavedNote[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  } catch {}
}

const NotesContext = createContext<NotesContextType | undefined>(undefined);

export function NotesProvider({ children }: { children: ReactNode }) {
  const [notes, setNotes] = useState<SavedNote[]>(loadNotes);

  useEffect(() => {
    saveNotes(notes);
  }, [notes]);

  const addNote = useCallback((note: SavedNote) => {
    setNotes((prev) => {
      // Avoid duplicate if already saved
      if (prev.some((n) => n.id === note.id)) return prev;
      return [note, ...prev];
    });
  }, []);

  const deleteNote = useCallback((id: string) => {
    setNotes((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const updateNoteFolder = useCallback((noteId: string, folderId: string | null) => {
    setNotes((prev) =>
      prev.map((n) => (n.id === noteId ? { ...n, folderId } : n))
    );
  }, []);

  const getNotesInFolder = useCallback(
    (folderId: string) => notes.filter((n) => n.folderId === folderId),
    [notes]
  );

  return (
    <NotesContext.Provider value={{ notes, addNote, deleteNote, updateNoteFolder, getNotesInFolder }}>
      {children}
    </NotesContext.Provider>
  );
}

export function useNotes() {
  const ctx = useContext(NotesContext);
  if (!ctx) throw new Error("useNotes must be used within NotesProvider");
  return ctx;
}
