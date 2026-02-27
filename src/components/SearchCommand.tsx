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
import { useRecording } from "@/contexts/RecordingContext";
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
  const { activeSession } = useRecording();

  const openSearch = useCallback(() => setOpen(true), []);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

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
