import { createContext, useContext, useState, useCallback, type ReactNode } from "react";

interface RecordingSession {
  noteId: string;
  title: string;
  elapsedSeconds: number;
  isRecording: boolean;
}

interface RecordingContextType {
  activeSession: RecordingSession | null;
  startSession: (noteId: string) => void;
  updateSession: (updates: Partial<RecordingSession>) => void;
  clearSession: () => void;
}

const RecordingContext = createContext<RecordingContextType | undefined>(undefined);

export function RecordingProvider({ children }: { children: ReactNode }) {
  const [activeSession, setActiveSession] = useState<RecordingSession | null>(null);

  const startSession = useCallback((noteId: string) => {
    setActiveSession({ noteId, title: "New note", elapsedSeconds: 0, isRecording: true });
  }, []);

  const updateSession = useCallback((updates: Partial<RecordingSession>) => {
    setActiveSession((prev) => prev ? { ...prev, ...updates } : null);
  }, []);

  const clearSession = useCallback(() => {
    setActiveSession(null);
  }, []);

  return (
    <RecordingContext.Provider value={{ activeSession, startSession, updateSession, clearSession }}>
      {children}
    </RecordingContext.Provider>
  );
}

export function useRecording() {
  const ctx = useContext(RecordingContext);
  if (!ctx) throw new Error("useRecording must be used within RecordingProvider");
  return ctx;
}
