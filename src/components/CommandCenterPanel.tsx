/**
 * Command Center Panel
 *
 * Collapsible sidebar panel shown during active recording.
 * Surfaces relevant context: previous meetings, open commitments,
 * related notes, and project info.
 *
 * LAYOUT:
 *  ┌──────────────────────┐
 *  │ PREVIOUS MEETINGS    │
 *  │  Jane — Weekly (3/20)│
 *  │  Jane — Q1 Rev (3/12)│
 *  ├──────────────────────┤
 *  │ WHAT YOU PROMISED    │
 *  │  ⚠ Send forecast     │
 *  │  Due 3/28 — Pricing  │
 *  ├──────────────────────┤
 *  │ PROJECT              │
 *  │  ● Active ACME Revamp│
 *  └──────────────────────┘
 */

import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronLeft, ChevronRight, FileText, AlertTriangle, FolderKanban, BookOpen, Search } from "lucide-react"
import { cn } from "@/lib/utils"

interface MeetingContext {
  previousMeetings: Array<{
    personName: string
    meetings: Array<{ id: string; title: string; date: string }>
  }>
  openCommitments: Array<{
    text: string
    owner: string
    assignee: string | null
    dueDate: string | null
    isOverdue: boolean
  }>
  relatedNotes: Array<{
    title: string
    snippet: string
    score: number
  }>
  projects: Array<{
    id: string
    name: string
    meetingCount: number
    status: string
  }>
}

interface Props {
  context: MeetingContext | null
  onLookupPerson?: (name: string) => void
}

export default function CommandCenterPanel({ context, onLookupPerson }: Props) {
  const [lookupName, setLookupName] = useState("")
  const navigate = useNavigate()
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("syag-cc-collapsed") === "true" } catch { return false }
  })

  useEffect(() => {
    try { localStorage.setItem("syag-cc-collapsed", String(collapsed)) } catch {}
  }, [collapsed])

  if (!context) return null

  const hasContent =
    context.previousMeetings.length > 0 ||
    context.openCommitments.length > 0 ||
    context.relatedNotes.length > 0 ||
    context.projects.length > 0

  if (collapsed) {
    return (
      <button
        onClick={() => setCollapsed(false)}
        className="flex items-center justify-center w-8 h-full border-l border-border bg-card/50 hover:bg-secondary/50 transition-colors"
        title="Show meeting context"
      >
        <ChevronLeft className="h-3.5 w-3.5 text-muted-foreground" />
      </button>
    )
  }

  return (
    <div className="w-[280px] border-l border-border bg-card/50 overflow-y-auto flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">Context</span>
        <button onClick={() => setCollapsed(true)} className="p-0.5 rounded hover:bg-secondary">
          <ChevronRight className="h-3 w-3 text-muted-foreground" />
        </button>
      </div>

      {!hasContent ? (
        <div className="flex-1 p-3 space-y-3">
          {onLookupPerson && (
            <div>
              <label className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground block mb-1.5">Who are you meeting with?</label>
              <div className="flex items-center gap-1.5">
                <input
                  value={lookupName}
                  onChange={e => setLookupName(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter' && lookupName.trim()) { onLookupPerson(lookupName.trim()); setLookupName("") } }}
                  placeholder="Name..."
                  className="flex-1 px-2 py-1.5 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary/20"
                />
                <button
                  onClick={() => { if (lookupName.trim()) { onLookupPerson(lookupName.trim()); setLookupName("") } }}
                  className="p-1.5 rounded-md hover:bg-secondary text-muted-foreground"
                >
                  <Search className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}
          <p className="text-xs text-muted-foreground text-center leading-relaxed">
            {onLookupPerson ? "Type a name to look up meeting history." : "Recording in progress. Context will appear as your meeting history grows."}
          </p>
        </div>
      ) : (
        <div className="flex-1 p-2 space-y-2">
          {/* Previous Meetings */}
          {context.previousMeetings.length > 0 && (
            <ContextSection title="Previous Meetings">
              {context.previousMeetings.map(pm => (
                <div key={pm.personName} className="space-y-0.5">
                  {pm.meetings.map(m => (
                    <button
                      key={m.id}
                      onClick={() => navigate(`/note/${m.id}`)}
                      className="w-full flex items-start gap-2 px-2 py-1.5 rounded text-left hover:bg-secondary/60 transition-colors"
                    >
                      <FileText className="h-3 w-3 text-muted-foreground mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs truncate">
                          <span className="text-primary font-medium">{pm.personName}</span>
                          {" — "}
                          {m.title || "Untitled"}
                        </div>
                        <div className="text-[10px] text-muted-foreground">{m.date}</div>
                      </div>
                    </button>
                  ))}
                </div>
              ))}
            </ContextSection>
          )}

          {/* What You Promised */}
          {context.openCommitments.length > 0 && (
            <ContextSection title="What You Promised">
              {context.openCommitments.map((c, i) => (
                <div key={i} className="px-2 py-1.5">
                  <div className="text-xs leading-relaxed">
                    {c.isOverdue && (
                      <span className="text-amber-600 dark:text-amber-400 font-medium mr-1">Overdue</span>
                    )}
                    {c.text}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {c.owner === "you" ? "You" : c.owner}
                    {c.assignee && ` → ${c.assignee}`}
                    {c.dueDate && (
                      <span className={cn("ml-1", c.isOverdue && "text-amber-600 dark:text-amber-400")}>
                        · Due {c.dueDate}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </ContextSection>
          )}

          {/* Projects */}
          {context.projects.length > 0 && (
            <ContextSection title="Projects">
              {context.projects.map(p => (
                <button
                  key={p.id}
                  onClick={() => navigate(`/project/${p.id}`)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary/60 transition-colors"
                >
                  <FolderKanban className="h-3 w-3 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-xs font-medium truncate">{p.name}</div>
                    <div className="text-[10px] text-muted-foreground">{p.meetingCount} meetings</div>
                  </div>
                  <span className={cn(
                    "px-1.5 py-0 rounded-full text-[11px] font-medium",
                    p.status === "active"
                      ? "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  )}>
                    {p.status}
                  </span>
                </button>
              ))}
            </ContextSection>
          )}

          {/* Related Notes */}
          {context.relatedNotes.length > 0 && (
            <ContextSection title="Related Notes">
              {context.relatedNotes.map((n, i) => (
                <div key={i} className="px-2 py-1.5">
                  <div className="text-xs font-medium truncate flex items-center gap-1">
                    <BookOpen className="h-3 w-3 text-muted-foreground shrink-0" />
                    {n.title}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{n.snippet}</div>
                </div>
              ))}
            </ContextSection>
          )}
        </div>
      )}
    </div>
  )
}

function ContextSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-card">
      <div className="px-2 py-1.5 border-b border-border">
        <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground">{title}</span>
      </div>
      <div className="divide-y divide-border/50">
        {children}
      </div>
    </div>
  )
}
