import { useState, useRef } from "react";
import {
  Calendar, Clock, Users, CheckCircle2, Circle,
  FolderOpen, Plus, Check, X, Hash
} from "lucide-react";
import type { Meeting } from "@/data/meetings";
import { cn } from "@/lib/utils";
import { useFolders } from "@/contexts/FolderContext";

interface MeetingDetailProps {
  meeting: Meeting;
  viewMode?: "my-notes" | "ai-notes";
}

export function MeetingDetail({ meeting, viewMode = "ai-notes" }: MeetingDetailProps) {
  const [personalNotes, setPersonalNotes] = useState("");
  const [showFolderPicker, setShowFolderPicker] = useState(false);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { folders, noteFolders, addNoteToFolder, removeNoteFromFolder, createFolder } = useFolders();

  const currentFolderId = noteFolders[meeting.id];
  const currentFolder = folders.find((f) => f.id === currentFolderId);

  const handleCreateAndAssign = () => {
    if (newFolderName.trim()) {
      const folder = createFolder(newFolderName.trim());
      addNoteToFolder(meeting.id, folder.id);
      setNewFolderName("");
      setCreatingFolder(false);
      setShowFolderPicker(false);
    }
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display text-2xl text-foreground leading-tight mb-3">{meeting.title}</h1>

        {/* Meta chips row */}
        <div className="flex items-center gap-2 flex-wrap relative">
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground">
            <Calendar className="h-3 w-3" />
            {meeting.date}
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground">
            <Clock className="h-3 w-3" />
            {meeting.time} · {meeting.duration}
          </span>
          <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground">
            <Users className="h-3 w-3" />
            {meeting.participants.length <= 2
              ? meeting.participants.join(", ")
              : `${meeting.participants[0]} & ${meeting.participants.length - 1} others`}
          </span>

          {currentFolder ? (
            <button
              onClick={() => setShowFolderPicker(!showFolderPicker)}
              className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground hover:bg-secondary transition-colors"
            >
              <FolderOpen className="h-3 w-3 text-accent" />
              {currentFolder.name}
              <X
                className="h-3 w-3 text-muted-foreground hover:text-foreground ml-0.5"
                onClick={(e) => { e.stopPropagation(); removeNoteFromFolder(meeting.id); }}
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
                    onClick={() => { addNoteToFolder(meeting.id, f.id); setShowFolderPicker(false); }}
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
                      placeholder="Folder name"
                      className="flex-1 min-w-0 bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
                    />
                    <button onClick={handleCreateAndAssign} className="text-accent"><Check className="h-3 w-3" /></button>
                    <button onClick={() => { setCreatingFolder(false); setNewFolderName(""); }} className="text-muted-foreground"><X className="h-3 w-3" /></button>
                  </div>
                ) : (
                  <button
                    onClick={() => setCreatingFolder(true)}
                    className="flex items-center gap-1.5 text-xs text-accent hover:underline"
                  >
                    <Plus className="h-3 w-3" />
                    New folder
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* AI Notes sections - shown in ai-notes mode */}
      {viewMode === "ai-notes" && (
        <>
          {/* Meeting Overview */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-2">
              <Hash className="h-3.5 w-3.5 text-muted-foreground/60" />
              <h2 className="font-display text-base font-semibold text-foreground/70">Meeting Overview</h2>
            </div>
            <p className="text-[15px] leading-relaxed text-foreground/70 pl-6">{meeting.summary}</p>
          </div>

          {/* Key Points */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Hash className="h-3.5 w-3.5 text-muted-foreground/60" />
              <h2 className="font-display text-base font-semibold text-foreground/70">Key Points</h2>
            </div>
            <ul className="space-y-2 pl-6">
              {meeting.keyPoints.map((point, i) => (
                <li key={i} className="flex gap-2.5 text-[15px] text-foreground/70 leading-relaxed">
                  <span className="mt-2.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-foreground/30" />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          {/* Next Steps / Action Items */}
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-3">
              <Hash className="h-3.5 w-3.5 text-muted-foreground/60" />
              <h2 className="font-display text-base font-semibold text-foreground/70">Next Steps</h2>
            </div>
            <div className="space-y-2 pl-6">
              {meeting.actionItems.map((item, i) => (
                <div key={i} className="flex items-start gap-2.5 text-[15px] leading-relaxed">
                  {item.done ? (
                    <CheckCircle2 className="mt-1 h-4 w-4 flex-shrink-0 text-accent" />
                  ) : (
                    <Circle className="mt-1 h-4 w-4 flex-shrink-0 text-foreground/30" />
                  )}
                  <div>
                    <span className={cn(item.done ? "text-muted-foreground line-through" : "text-foreground/70")}>
                      {item.text}
                    </span>
                    <span className="text-xs text-muted-foreground ml-2">— {item.assignee}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
