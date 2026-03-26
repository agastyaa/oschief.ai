import { useState, useEffect, useMemo } from "react"
import { Sidebar, SidebarCollapseButton } from "@/components/Sidebar"
import { SectionTabs, MEETING_TABS } from "@/components/SectionTabs"
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext"
import { isElectron, getElectronAPI } from "@/lib/electron-api"
import { useNavigate } from "react-router-dom"
import { Repeat, FileText, CheckCircle2, TrendingUp, Users, ChevronRight, ChevronDown, Gavel, Clock } from "lucide-react"
import { cn } from "@/lib/utils"
import { useNotes } from "@/contexts/NotesContext"

interface MeetingSeries {
  key: string        // normalized title pattern
  title: string      // display title
  meetings: any[]    // notes in this series
  people: string[]   // unique attendee names
  totalCommitments: number
  completedCommitments: number
  lastMeeting: string // date
}

/**
 * Detect recurring meeting patterns by grouping notes with similar titles.
 * "Weekly 1:1 with Jane — March 15" and "Weekly 1:1 with Jane — March 22"
 * should group together.
 */
function detectSeries(notes: any[]): MeetingSeries[] {
  // Normalize title: strip dates, numbers, "week of", day names
  const normalize = (title: string) =>
    title
      .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\w*\s+\d{1,2}/gi, '')
      .replace(/\b\d{1,2}\/\d{1,2}\b/g, '')
      .replace(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/gi, '')
      .replace(/\b(week\s+of|week\s+\d+)\b/gi, '')
      .replace(/\s*[-–—]\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()

  const groups = new Map<string, any[]>()
  for (const note of notes) {
    if (!note.title) continue
    const key = normalize(note.title)
    if (!key || key.length < 3) continue
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(note)
  }

  // Only keep groups with 2+ meetings (that's what makes it a "series")
  return [...groups.entries()]
    .filter(([_, meetings]) => meetings.length >= 2)
    .map(([key, meetings]) => {
      // Sort by date descending
      meetings.sort((a: any, b: any) => (b.date || '').localeCompare(a.date || ''))

      // Extract unique people from meeting attendees
      const peopleSet = new Set<string>()
      for (const m of meetings) {
        if (m.people) m.people.forEach((p: any) => peopleSet.add(p.name || p))
      }

      return {
        key,
        title: meetings[0].title, // Use the most recent title
        meetings,
        people: [...peopleSet],
        totalCommitments: 0,  // Will be populated if data available
        completedCommitments: 0,
        lastMeeting: meetings[0].date || '',
      }
    })
    .sort((a, b) => b.meetings.length - a.meetings.length)
}

export default function MeetingSeriesPage() {
  const { sidebarOpen } = useSidebarVisibility()
  const navigate = useNavigate()
  const { notes } = useNotes()
  const api = isElectron ? getElectronAPI() : null
  const [expandedKey, setExpandedKey] = useState<string | null>(null)
  const [seriesDetails, setSeriesDetails] = useState<Record<string, { commitments: any[]; decisions: any[] }>>({})

  const series = useMemo(() => detectSeries(notes), [notes])

  // Load commitments + decisions for expanded series
  const loadSeriesDetails = async (s: MeetingSeries) => {
    if (!api?.memory) return
    const noteIds = s.meetings.map((m: any) => m.id)
    const allCommitments: any[] = []
    const allDecisions: any[] = []
    for (const noteId of noteIds) {
      try {
        const commitments = await api.memory.commitments.forNote(noteId)
        const decisions = await api.memory.decisions.forNote(noteId)
        allCommitments.push(...(commitments || []))
        allDecisions.push(...(decisions || []))
      } catch {}
    }
    setSeriesDetails(prev => ({ ...prev, [s.key]: { commitments: allCommitments, decisions: allDecisions } }))
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      {sidebarOpen && (
        <div className="w-56 flex-shrink-0 overflow-hidden">
          <Sidebar />
        </div>
      )}
      <main className={cn("flex-1 overflow-y-auto", !sidebarOpen && isElectron && "pl-20")}>
        <div className={cn("flex items-center px-4 pb-0", isElectron ? "pt-10" : "pt-3")}>
          <SidebarCollapseButton />
        </div>
        <div className="px-6 pt-2">
          <SectionTabs tabs={MEETING_TABS} />
        </div>
        <div className="max-w-3xl mx-auto px-6 py-6">
          <div className="flex items-center gap-2 mb-1">
            <Repeat className="h-4.5 w-4.5 text-muted-foreground" />
            <h1 className="font-display text-2xl text-foreground">Meeting Series</h1>
            <span className="text-xs text-muted-foreground ml-2">{series.length} recurring</span>
          </div>
          <p className="text-xs text-muted-foreground mb-6">
            Recurring meetings grouped automatically. See patterns across your 1:1s, standups, and recurring syncs.
          </p>

          {series.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Repeat className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No recurring meetings detected yet.</p>
              <p className="text-xs mt-1">Record 2+ meetings with similar titles and they will appear here.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {series.map(s => {
                const isExpanded = expandedKey === s.key
                const details = seriesDetails[s.key]
                return (
                <div key={s.key} className="rounded-lg border border-border bg-card overflow-hidden">
                  <div
                    className="p-4 hover:bg-secondary/30 cursor-pointer transition-colors"
                    onClick={() => {
                      if (isExpanded) {
                        setExpandedKey(null)
                      } else {
                        setExpandedKey(s.key)
                        if (!details) loadSeriesDetails(s)
                      }
                    }}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{s.title}</div>
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <FileText className="h-3 w-3" />
                            {s.meetings.length} meetings
                          </span>
                          {s.people.length > 0 && (
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {s.people.slice(0, 3).join(', ')}{s.people.length > 3 ? ` +${s.people.length - 3}` : ''}
                            </span>
                          )}
                          <span>Last: {s.lastMeeting}</span>
                        </div>
                      </div>
                      {isExpanded
                        ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                        : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                      }
                    </div>

                    {/* Mini timeline — last 8 meetings as dots */}
                    <div className="flex items-center gap-1 mt-3">
                      {s.meetings.slice(0, 8).map((m: any, i: number) => (
                        <button
                          key={m.id || i}
                          onClick={(e) => { e.stopPropagation(); navigate(`/note/${m.id}`) }}
                          className={cn(
                            "w-6 h-6 rounded-full text-[9px] font-medium flex items-center justify-center transition-colors",
                            i === 0
                              ? "bg-primary/10 text-primary border border-primary/20"
                              : "bg-secondary text-muted-foreground hover:bg-secondary/80"
                          )}
                          title={`${m.date}: ${m.title}`}
                        >
                          {(m.date || '').slice(8, 10) || '?'}
                        </button>
                      ))}
                      {s.meetings.length > 8 && (
                        <span className="text-[10px] text-muted-foreground ml-1">+{s.meetings.length - 8}</span>
                      )}
                    </div>
                  </div>

                  {/* Expanded detail view */}
                  {isExpanded && (
                    <div className="border-t border-border px-4 py-4 space-y-4 bg-secondary/10">
                      {/* All meetings in this series */}
                      <div>
                        <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-2">All Meetings</div>
                        <div className="space-y-1">
                          {s.meetings.map((m: any) => (
                            <button
                              key={m.id}
                              onClick={() => navigate(`/note/${m.id}`)}
                              className="w-full text-left flex items-center gap-2 px-2 py-1.5 rounded hover:bg-secondary/50 transition-colors"
                            >
                              <FileText className="h-3 w-3 text-muted-foreground shrink-0" />
                              <span className="text-sm truncate flex-1">{m.title || 'Untitled'}</span>
                              <span className="text-[11px] text-muted-foreground shrink-0">{m.date}</span>
                            </button>
                          ))}
                        </div>
                      </div>

                      {/* Cross-meeting decisions */}
                      {details?.decisions?.length ? (
                        <div>
                          <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-2 flex items-center gap-1">
                            <Gavel className="h-3 w-3" /> Decisions Across Series
                          </div>
                          <div className="space-y-1">
                            {details.decisions.map((d: any, i: number) => (
                              <div key={d.id || i} className="text-sm px-2 py-1">
                                <span>{d.text}</span>
                                {d.note_title && <span className="text-xs text-muted-foreground ml-2">— {d.note_title}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {/* Cross-meeting commitments */}
                      {details?.commitments?.length ? (
                        <div>
                          <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-2 flex items-center gap-1">
                            <CheckCircle2 className="h-3 w-3" /> Commitments Across Series
                          </div>
                          <div className="space-y-1">
                            {details.commitments.map((c: any, i: number) => (
                              <div key={c.id || i} className="flex items-center gap-2 text-sm px-2 py-1">
                                {c.status === 'completed'
                                  ? <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                                  : c.status === 'overdue'
                                  ? <Clock className="h-3 w-3 text-red-500 shrink-0" />
                                  : <Clock className="h-3 w-3 text-muted-foreground shrink-0" />
                                }
                                <span className={cn(c.status === 'completed' && "line-through text-muted-foreground")}>{c.text}</span>
                                {c.owner && <span className="text-xs text-muted-foreground ml-auto shrink-0">{c.owner}</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      ) : null}

                      {/* People involved */}
                      {s.people.length > 0 && (
                        <div>
                          <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-2 flex items-center gap-1">
                            <Users className="h-3 w-3" /> People Involved
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {s.people.map((name: string) => (
                              <span key={name} className="text-xs bg-secondary px-2 py-0.5 rounded-full">{name}</span>
                            ))}
                          </div>
                        </div>
                      )}

                      {!details && (
                        <div className="text-xs text-muted-foreground text-center py-2">Loading cross-meeting data...</div>
                      )}
                      {details && !details.decisions?.length && !details.commitments?.length && (
                        <div className="text-xs text-muted-foreground text-center py-2">No decisions or commitments extracted from these meetings yet.</div>
                      )}
                    </div>
                  )}
                </div>
              )})}

            </div>
          )}
        </div>
      </main>
    </div>
  )
}
