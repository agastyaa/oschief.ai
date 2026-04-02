import { useState, useEffect, useRef } from "react"
import { Sidebar, SidebarCollapseButton } from "@/components/Sidebar"
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext"
import { isElectron, getElectronAPI } from "@/lib/electron-api"
import { useNavigate, useParams } from "react-router-dom"
import {
  FolderKanban, ArrowLeft, FileText, Users, Gavel, CheckSquare,
  Calendar, ChevronRight
} from "lucide-react"
import { cn } from "@/lib/utils"

interface ProjectTimeline {
  meetings: any[]
  decisions: any[]
  people: any[]
  commitments: any[]
}

export default function ProjectDetailPage() {
  const { sidebarOpen } = useSidebarVisibility()
  const navigate = useNavigate()
  const { id } = useParams<{ id: string }>()
  const api = isElectron ? getElectronAPI() : null

  const [project, setProject] = useState<any>(null)
  const [timeline, setTimeline] = useState<ProjectTimeline | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [editingDesc, setEditingDesc] = useState(false)
  const [draftName, setDraftName] = useState("")
  const [draftDesc, setDraftDesc] = useState("")
  const nameRef = useRef<HTMLInputElement>(null)
  const [linkingMeeting, setLinkingMeeting] = useState(false)
  const [allNotes, setAllNotes] = useState<any[]>([])
  const [meetingSearch, setMeetingSearch] = useState("")
  const [linkingPerson, setLinkingPerson] = useState(false)
  const [allPeople, setAllPeople] = useState<any[]>([])
  const [personSearch, setPersonSearch] = useState("")

  const saveField = async (field: "name" | "description", value: string) => {
    if (!id || !api?.memory?.projects) return
    await api.memory.projects.update(id, { [field]: value })
    setProject((p: any) => p ? { ...p, [field]: value } : p)
  }

  useEffect(() => {
    if (!id || !api?.memory?.projects) return
    api.memory.projects.get(id).then(setProject)
    api.memory.projects.timeline(id).then(setTimeline)
  }, [id, api])

  if (!project) {
    return (
      <div className="flex h-screen bg-background text-foreground">
        {sidebarOpen && <Sidebar />}
        <main className="flex-1 flex items-center justify-center">
          <div className="text-muted-foreground text-sm">Loading...</div>
        </main>
      </div>
    )
  }

  const statusStyles: Record<string, string> = {
    suggested: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    active: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    archived: "bg-muted text-muted-foreground",
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      {sidebarOpen && <Sidebar />}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6">
          {/* Header */}
          <div className="flex items-center gap-2 mb-1">
            {!sidebarOpen && <SidebarCollapseButton />}
            <button onClick={() => navigate("/projects")} className="p-1 rounded hover:bg-secondary text-muted-foreground">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <FolderKanban className="h-4.5 w-4.5 text-muted-foreground" />
            {editingName ? (
              <input
                ref={nameRef}
                autoFocus
                value={draftName}
                onChange={e => setDraftName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') { saveField("name", draftName); setEditingName(false) }
                  if (e.key === 'Escape') setEditingName(false)
                }}
                onBlur={() => { if (draftName.trim() && draftName !== project.name) saveField("name", draftName); setEditingName(false) }}
                className="text-xl font-semibold bg-transparent border-b border-primary/40 outline-none px-0.5"
              />
            ) : (
              <h1
                className="text-xl font-semibold cursor-pointer hover:text-primary/80 transition-colors"
                onClick={() => { setDraftName(project.name); setEditingName(true) }}
                title="Click to edit"
              >
                {project.name}
              </h1>
            )}
            <span className={cn("px-2.5 py-0.5 rounded-full text-[11px] font-medium ml-2", statusStyles[project.status] || statusStyles.archived)}>
              {project.status}
            </span>
          </div>
          {editingDesc ? (
            <input
              autoFocus
              value={draftDesc}
              onChange={e => setDraftDesc(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { saveField("description", draftDesc); setEditingDesc(false) }
                if (e.key === 'Escape') setEditingDesc(false)
              }}
              onBlur={() => { saveField("description", draftDesc); setEditingDesc(false) }}
              placeholder="Add a description..."
              className="text-sm text-muted-foreground mb-6 ml-8 bg-transparent border-b border-border outline-none w-full max-w-md"
            />
          ) : (
            <p
              className="text-sm text-muted-foreground mb-6 ml-8 cursor-pointer hover:text-foreground/70 transition-colors"
              onClick={() => { setDraftDesc(project.description || ""); setEditingDesc(true) }}
              title="Click to edit"
            >
              {project.description || <span className="italic opacity-50">Add a description...</span>}
            </p>
          )}

          {/* Stats */}
          <div className="grid grid-cols-4 gap-3 mb-6">
            <StatCard icon={<FileText className="h-3.5 w-3.5" />} label="Meetings" value={timeline?.meetings.length ?? 0} />
            <StatCard icon={<Gavel className="h-3.5 w-3.5" />} label="Decisions" value={timeline?.decisions.length ?? 0} />
            <StatCard icon={<Users className="h-3.5 w-3.5" />} label="People" value={timeline?.people.length ?? 0} />
            <StatCard icon={<CheckSquare className="h-3.5 w-3.5" />} label="Action Items" value={timeline?.commitments.length ?? 0} />
          </div>

          {/* Quick Actions */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={async () => {
                if (!api) return
                const notes = await api.notes.getAll()
                setAllNotes(notes || [])
                setLinkingMeeting(true)
              }}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              <FileText className="h-3 w-3" /> Link Meeting
            </button>
            <button
              onClick={async () => {
                if (!api?.memory?.people) return
                const people = await api.memory.people.getAll()
                setAllPeople(people || [])
                setLinkingPerson(true)
              }}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              <Users className="h-3 w-3" /> Add Person
            </button>
          </div>

          {/* Link Meeting Picker */}
          {linkingMeeting && (
            <div className="rounded-lg border border-primary/30 bg-card p-3 mb-4 space-y-2">
              <input
                value={meetingSearch}
                onChange={e => setMeetingSearch(e.target.value)}
                placeholder="Search meetings to link..."
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
                autoFocus
              />
              <div className="max-h-48 overflow-y-auto space-y-1">
                {allNotes
                  .filter(n => !meetingSearch || (n.title || '').toLowerCase().includes(meetingSearch.toLowerCase()))
                  .slice(0, 10)
                  .map(n => (
                    <button
                      key={n.id}
                      onClick={async () => {
                        if (!id || !api?.memory?.projects) return
                        await api.memory.projects.linkToNote(n.id, id)
                        setLinkingMeeting(false)
                        setMeetingSearch("")
                        api.memory.projects.timeline(id).then(setTimeline)
                      }}
                      className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-secondary/50 transition-colors"
                    >
                      {n.title || "Untitled"} <span className="text-xs text-muted-foreground ml-2">{n.date}</span>
                    </button>
                  ))}
              </div>
              <button onClick={() => { setLinkingMeeting(false); setMeetingSearch("") }} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          )}

          {/* Add Person Picker */}
          {linkingPerson && (
            <div className="rounded-lg border border-primary/30 bg-card p-3 mb-4 space-y-2">
              <input
                value={personSearch}
                onChange={e => setPersonSearch(e.target.value)}
                placeholder="Search people to add..."
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
                autoFocus
              />
              <div className="max-h-48 overflow-y-auto space-y-1">
                {allPeople
                  .filter(p => !personSearch || (p.name || '').toLowerCase().includes(personSearch.toLowerCase()))
                  .slice(0, 10)
                  .map(p => (
                    <button
                      key={p.id}
                      onClick={async () => {
                        if (!id || !api?.memory?.projects) return
                        await api.memory.projects.linkPerson(id, p.id)
                        setLinkingPerson(false)
                        setPersonSearch("")
                        api.memory.projects.timeline(id).then(setTimeline)
                      }}
                      className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-secondary/50 transition-colors"
                    >
                      {p.name} <span className="text-xs text-muted-foreground ml-2">{p.company || p.role || ''}</span>
                    </button>
                  ))}
              </div>
              <button onClick={() => { setLinkingPerson(false); setPersonSearch("") }} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
            </div>
          )}

          {/* Meetings Timeline */}
          {timeline?.meetings.length ? (
            <Section title="MEETINGS" count={timeline.meetings.length}>
              {timeline.meetings.map(meeting => (
                <div
                  key={meeting.id}
                  onClick={() => navigate(`/note/${meeting.id}`)}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-secondary/50 cursor-pointer transition-colors"
                >
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{meeting.title || "Untitled Meeting"}</div>
                    <div className="text-xs text-muted-foreground">{meeting.date}{meeting.duration ? ` · ${meeting.duration}` : ""}</div>
                  </div>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
              ))}
            </Section>
          ) : null}

          {/* Decisions */}
          {timeline?.decisions.length ? (
            <Section title="DECISIONS" count={timeline.decisions.length}>
              {timeline.decisions.map(decision => (
                <div key={decision.id} className="px-3 py-2.5">
                  <div className="text-sm">{decision.text}</div>
                  {decision.context && <div className="text-xs text-muted-foreground mt-0.5">{decision.context}</div>}
                  <div className="text-xs text-muted-foreground mt-1">
                    {decision.note_title && decision.note_id ? (
                      <button onClick={() => navigate(`/note/${decision.note_id}`)} className="text-[10px] text-primary underline cursor-pointer hover:text-primary/80">From: {decision.note_title}</button>
                    ) : decision.note_title ? (
                      <span>From: {decision.note_title}</span>
                    ) : null}
                    {decision.participant_names && <span className="ml-2">· {decision.participant_names}</span>}
                  </div>
                </div>
              ))}
            </Section>
          ) : null}

          {/* People */}
          {timeline?.people.length ? (
            <Section title="PEOPLE INVOLVED" count={timeline.people.length}>
              {timeline.people.map(person => (
                <div key={person.id} className="flex items-center gap-3 px-3 py-2">
                  <div className="h-7 w-7 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
                    {person.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{person.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {[person.role, person.company].filter(Boolean).join(" · ") || `${person.meetingCount} meetings`}
                    </div>
                  </div>
                </div>
              ))}
            </Section>
          ) : null}

          {/* Commitments */}
          {timeline?.commitments.length ? (
            <Section title="ACTION ITEMS" count={timeline.commitments.length}>
              {timeline.commitments.map(c => (
                <div key={c.id} className="flex items-start gap-2 px-3 py-2">
                  <CheckSquare className={cn("h-3.5 w-3.5 mt-0.5 shrink-0", c.status === "completed" ? "text-green-500" : "text-muted-foreground")} />
                  <div className="flex-1">
                    <div className={cn("text-sm", c.status === "completed" && "line-through text-muted-foreground")}>{c.text}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {c.owner === "you" ? "You" : c.assignee_name || c.owner}
                      {c.due_date && <span className={cn("ml-2", c.status === "open" && new Date(c.due_date) < new Date() ? "text-amber-600 dark:text-amber-400 font-medium" : "")}>Due {c.due_date}</span>}
                      {c.note_id && (
                        <button onClick={(e) => { e.stopPropagation(); navigate(`/note/${c.note_id}`); }} className="ml-2 text-[10px] text-primary underline cursor-pointer hover:text-primary/80">Source note</button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </Section>
          ) : null}

          {/* Empty state */}
          {!timeline?.meetings.length && !timeline?.decisions.length && (
            <div className="text-center py-16 text-muted-foreground">
              <FolderKanban className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No meetings linked to this project yet.</p>
              <p className="text-xs mt-1">Record a meeting and this project will populate automatically.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-1.5 text-muted-foreground mb-1">{icon}<span className="text-xs uppercase tracking-wider font-medium">{label}</span></div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  )
}

function Section({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="mb-6">
      <div className="text-xs uppercase tracking-wider font-medium text-muted-foreground mb-2">
        {title} <span className="opacity-60">({count})</span>
      </div>
      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {children}
      </div>
    </div>
  )
}
