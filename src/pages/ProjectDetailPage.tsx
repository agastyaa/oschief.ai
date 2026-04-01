import { useState, useEffect, useRef } from "react"
import { Sidebar, SidebarCollapseButton } from "@/components/Sidebar"
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext"
import { isElectron, getElectronAPI } from "@/lib/electron-api"
import { useNavigate, useParams } from "react-router-dom"
import {
  FolderKanban, ArrowLeft, FileText, Users, Gavel, CheckSquare,
  Calendar, ChevronDown, Archive, Trash2, Unlink, Pencil
} from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

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
  const [addingActionItem, setAddingActionItem] = useState(false)
  const [actionItemText, setActionItemText] = useState("")
  const [actionItemOwner, setActionItemOwner] = useState("you")
  const [addingDecision, setAddingDecision] = useState(false)
  const [decisionText, setDecisionText] = useState("")
  const [decisionContext, setDecisionContext] = useState("")

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

  useEffect(() => {
    if (editingName && nameRef.current) {
      nameRef.current.focus()
      nameRef.current.select()
    }
  }, [editingName])

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

  const refreshTimeline = () => { if (id) api?.memory?.projects?.timeline(id).then(setTimeline) }

  return (
    <div className="flex h-screen bg-background text-foreground">
      {sidebarOpen && <Sidebar />}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-4">
          {/* Header row */}
          <div className="flex items-center gap-2 mb-3">
            {!sidebarOpen && <SidebarCollapseButton />}
            <button onClick={() => navigate("/projects")} className="p-1 rounded hover:bg-secondary text-muted-foreground">
              <ArrowLeft className="h-4 w-4" />
            </button>
            <FolderKanban className="h-4.5 w-4.5 text-muted-foreground" />
            {editingName ? (
              <input
                ref={nameRef}
                value={draftName}
                onChange={e => setDraftName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    if (draftName.trim()) saveField("name", draftName.trim())
                    setEditingName(false)
                  }
                  if (e.key === 'Escape') setEditingName(false)
                }}
                onBlur={() => {
                  if (draftName.trim() && draftName.trim() !== project.name) {
                    saveField("name", draftName.trim())
                  }
                  setEditingName(false)
                }}
                className="flex-1 text-xl font-semibold bg-transparent border-b-2 border-primary/40 outline-none px-0.5"
              />
            ) : (
              <button
                className="flex items-center gap-1.5 group text-left"
                onClick={() => { setDraftName(project.name); setEditingName(true) }}
              >
                <h1 className="text-xl font-semibold group-hover:text-primary/80 transition-colors">
                  {project.name}
                </h1>
                <Pencil className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
            )}
            <span className={cn("px-2.5 py-0.5 rounded-full text-[11px] font-medium ml-1 shrink-0", statusStyles[project.status] || statusStyles.archived)}>
              {project.status}
            </span>
            {/* Inline stats */}
            <div className="flex items-center gap-3 ml-3 text-[11px] text-muted-foreground tabular-nums">
              <span>{timeline?.meetings.length ?? 0} meetings</span>
              <span>{timeline?.decisions.length ?? 0} decisions</span>
              <span>{timeline?.commitments.length ?? 0} items</span>
            </div>
            <div className="flex-1" />
            {project.status === "active" && (
              <button
                onClick={async () => {
                  await api?.memory?.projects?.archive(id!)
                  toast.success("Project archived")
                  navigate("/projects")
                }}
                className="p-1.5 rounded hover:bg-secondary text-muted-foreground"
                title="Archive project"
              >
                <Archive className="h-4 w-4" />
              </button>
            )}
            <button
              onClick={async () => {
                if (!confirm(`Delete "${project.name}"? This cannot be undone.`)) return
                await api?.memory?.projects?.delete(id!)
                toast.success("Project deleted")
                navigate("/projects")
              }}
              className="p-1.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
              title="Delete project"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>

          {/* Summary — compact single line, expands on edit */}
          <div className="mb-3 ml-8">
            {editingDesc ? (
              <textarea
                autoFocus
                value={draftDesc}
                onChange={e => setDraftDesc(e.target.value)}
                onKeyDown={e => { if (e.key === 'Escape') setEditingDesc(false) }}
                onBlur={() => { saveField("description", draftDesc.trim()); setEditingDesc(false) }}
                placeholder="Add a project summary..."
                rows={3}
                className="w-full px-3 py-2 text-sm bg-card border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 resize-y"
              />
            ) : (
              <p
                onClick={() => { setDraftDesc(project.description || ""); setEditingDesc(true) }}
                className="text-sm text-muted-foreground cursor-pointer hover:text-foreground/70 transition-colors"
              >
                {project.description || <span className="italic opacity-40">Add a project summary...</span>}
              </p>
            )}
          </div>

          {/* Quick Actions + People in one row */}
          <div className="flex items-center gap-2 mb-4">
            <button
              onClick={async () => {
                if (!api) return
                const notes = await api.db.notes.getAll()
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
            <button
              onClick={() => setAddingActionItem(true)}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              <CheckSquare className="h-3 w-3" /> Add Action Item
            </button>
            <button
              onClick={() => setAddingDecision(true)}
              className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              <Gavel className="h-3 w-3" /> Add Decision
            </button>
            {/* People avatars inline */}
            {(timeline?.people.length ?? 0) > 0 && (
              <div className="flex items-center ml-auto -space-x-1.5">
                {timeline!.people.slice(0, 6).map(p => (
                  <div
                    key={p.id}
                    className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-semibold border-2 border-background"
                    title={`${p.name}${p.role ? ` · ${p.role}` : ''}${p.company ? ` · ${p.company}` : ''}`}
                  >
                    {p.name.charAt(0).toUpperCase()}
                  </div>
                ))}
                {(timeline?.people.length ?? 0) > 6 && (
                  <div className="h-6 w-6 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[9px] font-semibold border-2 border-background">
                    +{timeline!.people.length - 6}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Inline pickers / forms */}
          {linkingMeeting && (
            <InlinePicker
              search={meetingSearch}
              onSearchChange={setMeetingSearch}
              placeholder="Search meetings to link..."
              items={allNotes.filter(n => !meetingSearch || (n.title || '').toLowerCase().includes(meetingSearch.toLowerCase())).slice(0, 10)}
              renderItem={n => <>{n.title || "Untitled"} <span className="text-xs text-muted-foreground ml-2">{n.date}</span></>}
              onSelect={async (n) => {
                if (!id || !api?.memory?.projects) return
                await api.memory.projects.linkToNote(n.id, id)
                setLinkingMeeting(false); setMeetingSearch("")
                refreshTimeline()
                toast.success("Meeting linked")
              }}
              onCancel={() => { setLinkingMeeting(false); setMeetingSearch("") }}
            />
          )}
          {linkingPerson && (
            <InlinePicker
              search={personSearch}
              onSearchChange={setPersonSearch}
              placeholder="Search people to add..."
              items={allPeople.filter(p => !personSearch || (p.name || '').toLowerCase().includes(personSearch.toLowerCase())).slice(0, 10)}
              renderItem={p => <>{p.name} <span className="text-xs text-muted-foreground ml-2">{p.company || p.role || ''}</span></>}
              onSelect={async (p) => {
                if (!id || !api?.memory?.projects) return
                await api.memory.projects.linkPerson(id, p.id)
                setLinkingPerson(false); setPersonSearch("")
                refreshTimeline()
                toast.success(`Added ${p.name}`)
              }}
              onCancel={() => { setLinkingPerson(false); setPersonSearch("") }}
            />
          )}
          {addingActionItem && (
            <div className="rounded-lg border border-primary/30 bg-card p-3 mb-4 space-y-2">
              <input value={actionItemText} onChange={e => setActionItemText(e.target.value)}
                placeholder="What needs to be done?" autoFocus
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
                onKeyDown={e => {
                  if (e.key === 'Enter' && actionItemText.trim()) {
                    api?.memory?.commitments?.add({ text: actionItemText.trim(), owner: actionItemOwner, projectId: id })
                      .then(() => { toast.success("Action item added"); setActionItemText(""); setActionItemOwner("you"); setAddingActionItem(false); refreshTimeline() })
                      .catch(() => toast.error("Failed to add action item"))
                  }
                  if (e.key === 'Escape') { setAddingActionItem(false); setActionItemText("") }
                }}
              />
              <div className="flex items-center gap-2">
                <select value={actionItemOwner} onChange={e => setActionItemOwner(e.target.value)} className="px-2 py-1 text-xs bg-background border border-border rounded-md">
                  <option value="you">You</option><option value="others">Others</option>
                </select>
                <div className="flex-1" />
                <button onClick={() => {
                  if (!actionItemText.trim()) return
                  api?.memory?.commitments?.add({ text: actionItemText.trim(), owner: actionItemOwner, projectId: id })
                    .then(() => { toast.success("Action item added"); setActionItemText(""); setActionItemOwner("you"); setAddingActionItem(false); refreshTimeline() })
                    .catch(() => toast.error("Failed to add action item"))
                }} className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90">Add</button>
                <button onClick={() => { setAddingActionItem(false); setActionItemText("") }} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
              </div>
            </div>
          )}
          {addingDecision && (
            <div className="rounded-lg border border-primary/30 bg-card p-3 mb-4 space-y-2">
              <input value={decisionText} onChange={e => setDecisionText(e.target.value)}
                placeholder="What was decided?" autoFocus
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
                onKeyDown={e => {
                  if (e.key === 'Enter' && decisionText.trim()) {
                    api?.memory?.decisions?.create({ text: decisionText.trim(), context: decisionContext.trim() || undefined, projectId: id, date: new Date().toISOString().slice(0, 10) })
                      .then(() => { toast.success("Decision added"); setDecisionText(""); setDecisionContext(""); setAddingDecision(false); refreshTimeline() })
                      .catch(() => toast.error("Failed to add decision"))
                  }
                  if (e.key === 'Escape') { setAddingDecision(false); setDecisionText(""); setDecisionContext("") }
                }}
              />
              <input value={decisionContext} onChange={e => setDecisionContext(e.target.value)} placeholder="Context (optional)"
                className="w-full px-3 py-2 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20" />
              <div className="flex items-center gap-2 justify-end">
                <button onClick={() => {
                  if (!decisionText.trim()) return
                  api?.memory?.decisions?.create({ text: decisionText.trim(), context: decisionContext.trim() || undefined, projectId: id, date: new Date().toISOString().slice(0, 10) })
                    .then(() => { toast.success("Decision added"); setDecisionText(""); setDecisionContext(""); setAddingDecision(false); refreshTimeline() })
                    .catch(() => toast.error("Failed to add decision"))
                }} className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90">Add</button>
                <button onClick={() => { setAddingDecision(false); setDecisionText(""); setDecisionContext("") }} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
              </div>
            </div>
          )}

          {/* Two-column layout: timeline left, people right */}
          <div className="flex gap-5">
            {/* Timeline sections */}
            <div className="flex-1 min-w-0">
              {timeline?.meetings.length ? (
                <CollapsibleSection title="MEETINGS" count={timeline.meetings.length} defaultExpanded>
                  {timeline.meetings.map(meeting => (
                    <div key={meeting.id} onClick={() => navigate(`/note/${meeting.id}`)}
                      className="group flex items-center gap-3 px-3 py-2 rounded-md hover:bg-secondary/50 cursor-pointer transition-colors">
                      <Calendar className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{meeting.title || "Untitled Meeting"}</div>
                        <div className="text-xs text-muted-foreground">{meeting.date}{meeting.duration ? ` · ${meeting.duration}` : ""}</div>
                      </div>
                      <button onClick={async (e) => {
                        e.stopPropagation()
                        if (!confirm(`Unlink "${meeting.title || 'this meeting'}"?`)) return
                        try { await api?.memory?.projects?.unlinkFromNote(meeting.id, id!); refreshTimeline(); toast.success("Unlinked") } catch { toast.error("Failed") }
                      }} className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 shrink-0" title="Unlink">
                        <Unlink className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                </CollapsibleSection>
              ) : null}

              {timeline?.decisions.length ? (
                <CollapsibleSection title="DECISIONS" count={timeline.decisions.length} defaultExpanded={(timeline.decisions.length) <= 5}>
                  {timeline.decisions.map(d => (
                    <div key={d.id} className="group flex items-start gap-2 px-3 py-2">
                      <Gavel className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0">
                        <div className="text-sm">{d.text}</div>
                        {d.context && <div className="text-xs text-muted-foreground mt-0.5">{d.context}</div>}
                        {d.note_title && <div className="text-[11px] text-muted-foreground mt-0.5">From: {d.note_title}</div>}
                      </div>
                      <button onClick={async () => {
                        if (!confirm("Delete this decision?")) return
                        try { await api?.memory?.decisions?.delete(d.id); refreshTimeline(); toast.success("Deleted") } catch { toast.error("Failed") }
                      }} className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" title="Delete">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </CollapsibleSection>
              ) : null}

              {timeline?.commitments.length ? (
                <CollapsibleSection title="ACTION ITEMS" count={timeline.commitments.length} defaultExpanded={(timeline.commitments.length) <= 5}>
                  {timeline.commitments.map(c => (
                    <div key={c.id} className="group flex items-start gap-2 px-3 py-2">
                      <button onClick={async () => {
                        try { await api?.memory?.commitments?.updateStatus(c.id, c.status === "completed" ? "open" : "completed"); refreshTimeline() } catch { toast.error("Failed") }
                      }} className="mt-0.5 shrink-0 hover:scale-110 transition-transform" title={c.status === "completed" ? "Reopen" : "Done"}>
                        <CheckSquare className={cn("h-3.5 w-3.5", c.status === "completed" ? "text-green-500" : "text-muted-foreground hover:text-primary")} />
                      </button>
                      <div className="flex-1">
                        <div className={cn("text-sm", c.status === "completed" && "line-through text-muted-foreground")}>{c.text}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {c.owner === "you" ? "You" : c.assignee_name || c.owner}
                          {c.due_date && <span className={cn("ml-2", c.status === "open" && new Date(c.due_date) < new Date() ? "text-amber-600 dark:text-amber-400 font-medium" : "")}>Due {c.due_date}</span>}
                        </div>
                      </div>
                      <button onClick={async () => {
                        if (!confirm("Delete?")) return
                        try { await api?.memory?.commitments?.delete(c.id); refreshTimeline(); toast.success("Deleted") } catch { toast.error("Failed") }
                      }} className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" title="Delete">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </CollapsibleSection>
              ) : null}

              {!timeline?.meetings.length && !timeline?.decisions.length && !timeline?.commitments.length && (
                <div className="text-center py-16 text-muted-foreground">
                  <FolderKanban className="h-8 w-8 mx-auto mb-3 opacity-40" />
                  <p className="text-sm">No meetings linked yet.</p>
                  <p className="text-xs mt-1">Record a meeting to start populating this project.</p>
                </div>
              )}
            </div>

            {/* People sidebar */}
            {(timeline?.people.length ?? 0) > 0 && (
              <div className="w-44 shrink-0">
                <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-2">
                  People ({timeline?.people.length})
                </div>
                <div className="space-y-2">
                  {timeline?.people.map(person => (
                    <div key={person.id} className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[10px] font-medium shrink-0">
                        {person.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-medium truncate">{person.name}</div>
                        <div className="text-[10px] text-muted-foreground truncate leading-tight">
                          {[person.role, person.company].filter(Boolean).join(" · ") || `${person.meetingCount} mtgs`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

function InlinePicker({ search, onSearchChange, placeholder, items, renderItem, onSelect, onCancel }: {
  search: string; onSearchChange: (v: string) => void; placeholder: string
  items: any[]; renderItem: (item: any) => React.ReactNode
  onSelect: (item: any) => void; onCancel: () => void
}) {
  return (
    <div className="rounded-lg border border-primary/30 bg-card p-3 mb-4 space-y-2">
      <input value={search} onChange={e => onSearchChange(e.target.value)} placeholder={placeholder} autoFocus
        className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20" />
      <div className="max-h-48 overflow-y-auto space-y-1">
        {items.map(item => (
          <button key={item.id} onMouseDown={(e) => { e.preventDefault(); onSelect(item) }}
            className="w-full text-left px-3 py-2 text-sm rounded-md hover:bg-secondary/50 cursor-pointer transition-colors">
            {renderItem(item)}
          </button>
        ))}
      </div>
      <button onClick={onCancel} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
    </div>
  )
}

function CollapsibleSection({ title, count, defaultExpanded = true, children }: { title: string; count: number; defaultExpanded?: boolean; children: React.ReactNode }) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  return (
    <div className="mb-4">
      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-1.5 w-full text-left mb-1.5 group">
        <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", !expanded && "-rotate-90")} />
        <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground group-hover:text-foreground transition-colors">
          {title} <span className="opacity-60">({count})</span>
        </span>
      </button>
      {expanded && (
        <div className="rounded-lg border border-border bg-card divide-y divide-border">
          {children}
        </div>
      )}
    </div>
  )
}
