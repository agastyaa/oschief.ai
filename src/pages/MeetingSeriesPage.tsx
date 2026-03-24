import { useState, useEffect, useMemo } from "react"
import { Sidebar, SidebarCollapseButton } from "@/components/Sidebar"
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext"
import { isElectron, getElectronAPI } from "@/lib/electron-api"
import { useNavigate } from "react-router-dom"
import { Repeat, FileText, CheckCircle2, TrendingUp, Users, ChevronRight } from "lucide-react"
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

  const series = useMemo(() => detectSeries(notes), [notes])

  return (
    <div className="flex h-screen bg-background text-foreground">
      {sidebarOpen && (
        <div className="w-56 flex-shrink-0 overflow-hidden">
          <Sidebar />
        </div>
      )}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <div className="flex items-center gap-2 mb-1">
            {!sidebarOpen && <SidebarCollapseButton />}
            <Repeat className="h-4.5 w-4.5 text-muted-foreground" />
            <h1 className="text-xl font-semibold">Meeting Series</h1>
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
              {series.map(s => (
                <div
                  key={s.key}
                  className="rounded-lg border border-border bg-card p-4 hover:bg-secondary/30 cursor-pointer transition-colors"
                  onClick={() => {
                    // Navigate to the most recent meeting in this series
                    if (s.meetings[0]?.id) navigate(`/note/${s.meetings[0].id}`)
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
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                  </div>

                  {/* Mini timeline — last 5 meetings as dots */}
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
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
