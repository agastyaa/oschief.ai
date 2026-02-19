import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { AskBar } from "@/components/AskBar";
import { NotesViewToggle } from "@/components/NotesViewToggle";
import { useNotes } from "@/contexts/NotesContext";
import { PanelLeftClose, PanelLeft, Share2, MoreHorizontal, FileText, CheckCircle2, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function NoteDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { notes } = useNotes();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [viewMode, setViewMode] = useState<"my-notes" | "ai-notes">("ai-notes");

  const note = notes.find((n) => n.id === id);

  if (!note) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-center">
          <FileText className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-[13px] text-muted-foreground mb-3">Note not found</p>
          <button onClick={() => navigate("/")} className="text-xs text-accent hover:underline">
            Back to home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className={cn(
        "transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0",
        sidebarOpen ? "w-56" : "w-0"
      )}>
        <Sidebar />
      </div>
      <main className="flex flex-1 flex-col min-w-0">
        <div className="flex items-center justify-between px-4 pt-3 pb-0">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
            </button>
            <button
              onClick={() => navigate(-1)}
              className="text-[13px] text-muted-foreground transition-colors hover:text-foreground"
            >
              ← Back to notes
            </button>
          </div>
          <div className="flex items-center gap-1.5">
            <NotesViewToggle viewMode={viewMode} onViewModeChange={setViewMode} />
            <button className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              <Share2 className="h-3.5 w-3.5" />
            </button>
            <button className="rounded-md border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground">
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto pb-24">
          <div className="mx-auto max-w-3xl px-6 py-4">
            {/* Title & meta */}
            <h1 className="font-display text-2xl text-foreground mb-1">{note.title}</h1>
            <div className="flex items-center gap-3 text-xs text-muted-foreground mb-6">
              <span>{note.date}</span>
              <span>{note.time}</span>
              <span>{note.duration}</span>
            </div>

            {viewMode === "ai-notes" ? (
              <>
                {/* Summary */}
                {note.summary && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="font-display text-sm font-medium text-foreground mb-2">Overview</h2>
                      <p className="text-[13px] text-muted-foreground leading-relaxed">{note.summary.overview}</p>
                    </div>

                    {note.summary.keyPoints.length > 0 && (
                      <div>
                        <h2 className="font-display text-sm font-medium text-foreground mb-2">Key Points</h2>
                        <ul className="space-y-1.5">
                          {note.summary.keyPoints.map((point, i) => (
                            <li key={i} className="flex items-start gap-2 text-[13px] text-muted-foreground">
                              <span className="mt-1.5 h-1 w-1 rounded-full bg-accent flex-shrink-0" />
                              {point}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {note.summary.nextSteps.length > 0 && (
                      <div>
                        <h2 className="font-display text-sm font-medium text-foreground mb-2">Action Items</h2>
                        <ul className="space-y-1.5">
                          {note.summary.nextSteps.map((step, i) => (
                            <li key={i} className="flex items-start gap-2 text-[13px]">
                              {step.done ? (
                                <CheckCircle2 className="h-4 w-4 text-accent flex-shrink-0 mt-0.5" />
                              ) : (
                                <Circle className="h-4 w-4 text-muted-foreground/40 flex-shrink-0 mt-0.5" />
                              )}
                              <span className={cn("text-muted-foreground", step.done && "line-through")}>
                                {step.text}
                                {step.assignee && <span className="ml-1 text-[11px] text-muted-foreground/60">— {step.assignee}</span>}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}

                {!note.summary && (
                  <p className="text-sm text-muted-foreground">No AI summary available for this note.</p>
                )}
              </>
            ) : (
              /* Personal notes */
              <div>
                <h2 className="font-display text-sm font-medium text-foreground mb-2">My Notes</h2>
                {note.personalNotes ? (
                  <p className="text-[13px] text-muted-foreground leading-relaxed whitespace-pre-line">{note.personalNotes}</p>
                ) : (
                  <p className="text-sm text-muted-foreground">No personal notes recorded.</p>
                )}
              </div>
            )}

            {/* Transcript */}
            {note.transcript.length > 0 && (
              <div className="mt-8">
                <h2 className="font-display text-sm font-medium text-foreground mb-3">Transcript</h2>
                <div className="space-y-3">
                  {note.transcript.map((entry, i) => (
                    <div key={i} className="flex gap-3">
                      <div className="flex-shrink-0 w-16">
                        <span className="text-[11px] text-muted-foreground">{entry.time}</span>
                      </div>
                      <div>
                        <span className="text-[11px] font-medium text-foreground">{entry.speaker}</span>
                        <p className="text-[13px] text-muted-foreground leading-relaxed">{entry.text}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        <div className="relative">
          <AskBar context="meeting" meetingTitle={note.title} />
        </div>
      </main>
    </div>
  );
}
