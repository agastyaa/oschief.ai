import { useState, useRef, useEffect } from "react";
import { MoreHorizontal, Trash2, FolderOpen, Share2, Plus, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFolders } from "@/contexts/FolderContext";

interface NoteCardMenuProps {
  noteId: string;
  currentFolderId: string | null;
  onDelete: (id: string) => void;
  onMoveToFolder: (noteId: string, folderId: string | null) => void;
}

export function NoteCardMenu({ noteId, currentFolderId, onDelete, onMoveToFolder }: NoteCardMenuProps) {
  const [open, setOpen] = useState(false);
  const [showFolders, setShowFolders] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const { folders, createFolder } = useFolders();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setShowFolders(false);
        setCreatingFolder(false);
      }
    };
    if (open) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleCreateAndAssign = () => {
    if (newFolderName.trim()) {
      const folder = createFolder(newFolderName.trim());
      onMoveToFolder(noteId, folder.id);
      setNewFolderName("");
      setCreatingFolder(false);
      setShowFolders(false);
      setOpen(false);
    }
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="rounded-md p-1 text-muted-foreground opacity-0 group-hover:opacity-100 transition-all hover:bg-secondary hover:text-foreground"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1 w-48 rounded-lg border border-border bg-popover shadow-lg z-50 overflow-hidden">
          {!showFolders ? (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setShowFolders(true); }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-foreground hover:bg-secondary transition-colors"
              >
                <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
                {currentFolderId ? "Move to folder" : "Add to folder"}
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); navigator.clipboard.writeText(noteId); setOpen(false); }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-foreground hover:bg-secondary transition-colors"
              >
                <Share2 className="h-3.5 w-3.5 text-muted-foreground" />
                Share
              </button>
              <div className="border-t border-border" />
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(noteId); setOpen(false); }}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-[13px] text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Move to trash
              </button>
            </>
          ) : (
            <>
              <div className="px-3 py-2 border-b border-border">
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Move to folder</span>
              </div>
              {currentFolderId && (
                <button
                  onClick={(e) => { e.stopPropagation(); onMoveToFolder(noteId, null); setShowFolders(false); setOpen(false); }}
                  className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-muted-foreground hover:bg-secondary transition-colors"
                >
                  <X className="h-3 w-3" />
                  Remove from folder
                </button>
              )}
              <div className="max-h-32 overflow-y-auto py-1">
                {folders.map((f) => (
                  <button
                    key={f.id}
                    onClick={(e) => { e.stopPropagation(); onMoveToFolder(noteId, f.id); setShowFolders(false); setOpen(false); }}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-1.5 text-xs transition-colors",
                      currentFolderId === f.id
                        ? "bg-accent/10 text-foreground font-medium"
                        : "text-foreground hover:bg-secondary"
                    )}
                  >
                    <FolderOpen className="h-3 w-3 text-accent" />
                    {f.name}
                    {currentFolderId === f.id && <Check className="h-3 w-3 ml-auto text-accent" />}
                  </button>
                ))}
              </div>
              <div className="px-3 py-2 border-t border-border">
                {creatingFolder ? (
                  <div className="flex items-center gap-1">
                    <input
                      autoFocus
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleCreateAndAssign();
                        if (e.key === "Escape") { setCreatingFolder(false); setNewFolderName(""); }
                      }}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="Folder name"
                      className="flex-1 min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                    />
                    <button onClick={(e) => { e.stopPropagation(); handleCreateAndAssign(); }} className="text-accent"><Check className="h-3 w-3" /></button>
                    <button onClick={(e) => { e.stopPropagation(); setCreatingFolder(false); setNewFolderName(""); }} className="text-muted-foreground"><X className="h-3 w-3" /></button>
                  </div>
                ) : (
                  <button
                    onClick={(e) => { e.stopPropagation(); setCreatingFolder(true); }}
                    className="flex items-center gap-1.5 text-xs text-accent hover:underline"
                  >
                    <Plus className="h-3 w-3" />
                    New folder
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
