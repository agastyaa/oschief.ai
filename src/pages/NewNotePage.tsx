import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { AskBar } from "@/components/AskBar";
import {
  Calendar, Users, Plus, FolderOpen, Check, X
} from "lucide-react";
import { useFolders } from "@/contexts/FolderContext";

export default function NewNotePage() {
  const navigate = useNavigate();
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const { folders, createFolder } = useFolders();

  const today = new Date().toLocaleDateString("en-US", { weekday: "long" });
  const selectedFolder = folders.find((f) => f.id === selectedFolderId);

  useEffect(() => {
    if (isEditingTitle) titleRef.current?.select();
  }, [isEditingTitle]);

  const handleCreateAndAssign = () => {
    if (newFolderName.trim()) {
      const folder = createFolder(newFolderName.trim());
      setSelectedFolderId(folder.id);
      setNewFolderName("");
      setCreatingFolder(false);
      setShowFolderPicker(false);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-background">
      <main className="flex flex-1 flex-col min-w-0">
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-3xl px-8 py-10">
            {/* Title */}
            {isEditingTitle ? (
              <input
                ref={titleRef}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => setIsEditingTitle(false)}
                onKeyDown={(e) => e.key === "Enter" && setIsEditingTitle(false)}
                className="mb-3 w-full font-display text-3xl text-foreground bg-transparent border-none outline-none focus:ring-0"
                placeholder="New note"
              />
            ) : (
              <h1
                onClick={() => setIsEditingTitle(true)}
                className="mb-3 font-display text-3xl text-foreground/40 cursor-text hover:text-foreground/60 transition-colors"
              >
                {title || "New note"}
              </h1>
            )}

            {/* Meta chips */}
            <div className="flex items-center gap-2 mb-6 relative">
              <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground">
                <Calendar className="h-3 w-3" />
                Today
              </span>
              <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground">
                <Users className="h-3 w-3" />
                Me
              </span>

              {selectedFolder ? (
                <button
                  onClick={() => setShowFolderPicker(!showFolderPicker)}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
                >
                  <FolderOpen className="h-3 w-3 text-accent" />
                  {selectedFolder.name}
                  <X
                    className="h-3 w-3 text-muted-foreground hover:text-foreground ml-0.5"
                    onClick={(e) => { e.stopPropagation(); setSelectedFolderId(null); }}
                  />
                </button>
              ) : (
                <button
                  onClick={() => setShowFolderPicker(!showFolderPicker)}
                  className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="h-3 w-3" />
                  Add to folder
                </button>
              )}

              {showFolderPicker && (
                <div className="absolute top-full left-0 mt-1 w-52 rounded-lg border border-border bg-popover shadow-lg z-50 overflow-hidden">
                  <div className="px-3 py-2 border-b border-border">
                    <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Move to folder</span>
                  </div>
                  <div className="max-h-40 overflow-y-auto py-1">
                    {folders.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => { setSelectedFolderId(f.id); setShowFolderPicker(false); }}
                        className="flex w-full items-center gap-2.5 px-3 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
                      >
                        <FolderOpen className="h-3 w-3 text-accent" />
                        {f.name}
                        {selectedFolderId === f.id && <Check className="h-3 w-3 ml-auto text-accent" />}
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
                          placeholder="Folder name"
                          className="flex-1 min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                        />
                        <button onClick={handleCreateAndAssign} className="text-accent"><Check className="h-3 w-3" /></button>
                        <button onClick={() => { setCreatingFolder(false); setNewFolderName(""); }} className="text-muted-foreground"><X className="h-3 w-3" /></button>
                      </div>
                    ) : (
                      <button onClick={() => setCreatingFolder(true)} className="flex items-center gap-1.5 text-xs text-accent hover:underline">
                        <Plus className="h-3 w-3" />
                        New folder
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Notes area */}
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Write notes..."
              className="min-h-[60vh] w-full resize-none bg-transparent text-[15px] text-foreground leading-relaxed placeholder:text-muted-foreground/50 focus:outline-none"
              autoFocus
            />
          </div>
        </div>

        {/* Ask bar */}
        <div className="relative">
          <AskBar context="meeting" meetingTitle={title || "New note"} />
        </div>
      </main>
    </div>
  );
}
