import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { AskBar } from "@/components/AskBar";
import { NotesViewToggle } from "@/components/NotesViewToggle";
import { useNotes } from "@/contexts/NotesContext";
import { PanelLeftClose, PanelLeft, Share2, MoreHorizontal, FileText, CheckCircle2, Circle, Hash, Calendar, Clock, Users } from "lucide-react";
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
          <div className="mx-auto max-w-3xl px-8 py-3">
            {/* Title */}
            <h1 className="mb-3 font-display text-2xl text-foreground leading-tight">{note.title}</h1>

            {/* Meta chips */}
            <div className="flex items-center gap-2 mb-6 flex-wrap">
              <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground">
                <Calendar className="h-3 w-3" />
                {note.date}
              </span>
              <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground">
                <Clock className="h-3 w-3" />
                {note.duration}
              </span>
              <span className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs text-foreground">
                <Users className="h-3 w-3" />
                Me
              </span>
            </div>

            {viewMode === "ai-notes" ? (
              <>
                {note.summary ? (
                  <div className="animate-fade-in">
                    <div className="mb-8">
                      <div className="flex items-center gap-2 mb-2">
                        <Hash className="h-3.5 w-3.5 text-muted-foreground/60" />
                        <h2 className="font-display text-base font-semibold text-foreground/70">Meeting Overview</h2>
                      </div>
                      <p className="text-[15px] leading-relaxed text-foreground/70 pl-6">{note.summary.overview}</p>
                    </div>

                    {note.summary.keyPoints.length > 0 && (
                      <div className="mb-8">
                        <div className="flex items-center gap-2 mb-3">
                          <Hash className="h-3.5 w-3.5 text-muted-foreground/60" />
                          <h2 className="font-display text-base font-semibold text-foreground/70">Key Points</h2>
                        </div>
                        <ul className="space-y-2 pl-6">
                          {note.summary.keyPoints.map((point, i) => (
                            <li key={i} className="flex gap-2.5 text-[15px] text-foreground/70 leading-relaxed">
                              <span className="mt-2.5 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-foreground/30" />
                              {point}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {note.summary.nextSteps.length > 0 && (
                      <div className="mb-8">
                        <div className="flex items-center gap-2 mb-3">
                          <Hash className="h-3.5 w-3.5 text-muted-foreground/60" />
                          <h2 className="font-display text-base font-semibold text-foreground/70">Next Steps</h2>
                        </div>
                        <div className="space-y-2 pl-6">
                          {note.summary.nextSteps.map((step, i) => (
                            <div key={i} className="flex items-start gap-2.5 text-[15px] leading-relaxed">
                              {step.done ? (
                                <CheckCircle2 className="mt-1 h-4 w-4 flex-shrink-0 text-accent" />
                              ) : (
                                <Circle className="mt-1 h-4 w-4 flex-shrink-0 text-foreground/30" />
                              )}
                              <div>
                                <span className={cn(step.done ? "text-muted-foreground line-through" : "text-foreground/70")}>
                                  {step.text}
                                </span>
                                {step.assignee && <span className="text-xs text-muted-foreground ml-2">— {step.assignee}</span>}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">No AI summary available for this note.</p>
                )}
              </>
            ) : (
              /* Personal notes */
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Hash className="h-3.5 w-3.5 text-muted-foreground/60" />
                  <h2 className="font-display text-base font-semibold text-foreground/70">My Notes</h2>
                </div>
                {note.personalNotes ? (
                  <p className="text-[15px] text-foreground/70 leading-relaxed whitespace-pre-line pl-6">{note.personalNotes}</p>
                ) : (
                  <p className="text-sm text-muted-foreground pl-6">No personal notes recorded.</p>
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
