import { createContext, useContext, useState, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { useNotes } from "@/contexts/NotesContext";
import { useRecordingSession } from "@/contexts/RecordingContext";
import { FileText } from "lucide-react";

const SearchCommandContext = createContext<{ open: () => void } | null>(null);

export function useSearchCommand() {
  const ctx = useContext(SearchCommandContext);
  return ctx ?? { open: () => {} };
}

export function SearchCommandProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { notes } = useNotes();
  const { activeSession } = useRecordingSession();

  const openSearch = useCallback(() => setOpen(true), []);

  // v2.11.2 — the legacy shortcut listener that used to live here has been
  // removed. It was registered at document-level BEFORE the ShortcutProvider's
  // own listener, called preventDefault on every match, and the provider's
  // `if (ev.defaultPrevented) return` check meant the registry-based
  // shortcuts (Cmd+K / Cmd+N / Cmd+, / Cmd+Shift+P / Cmd+Shift+D) silently
  // never fired. See `src/components/GlobalShortcutBinder.tsx` for the
  // active wiring. Any new shortcut goes in `src/lib/keyboard/registry.ts`
  // and binds in GlobalShortcutBinder — not here.

  const handleSelect = useCallback(
    (noteId: string) => {
      const note = notes.find((n) => n.id === noteId);
      if (!note) return;
      const isRecording = activeSession?.noteId === noteId && !note.summary;
      navigate(isRecording ? `/new-note?session=${noteId}` : `/note/${noteId}`);
      setOpen(false);
    },
    [notes, activeSession?.noteId, navigate]
  );

  return (
    <SearchCommandContext.Provider value={{ open: openSearch }}>
      {children}
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search notes..." />
        <CommandList>
          <CommandEmpty>No notes found.</CommandEmpty>
          <CommandGroup heading="Notes">
            {notes.map((n) => {
              const isRecording = activeSession?.noteId === n.id && !n.summary;
              return (
                <CommandItem
                  key={n.id}
                  value={`${n.title} ${n.summary?.overview ?? ""} ${n.personalNotes ?? ""}`}
                  onSelect={() => handleSelect(n.id)}
                >
                  <FileText className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="truncate flex-1">{n.title || "Untitled"}</span>
                  {isRecording && (
                    <span className="text-[10px] text-accent font-medium ml-1">Recording</span>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </SearchCommandContext.Provider>
  );
}
