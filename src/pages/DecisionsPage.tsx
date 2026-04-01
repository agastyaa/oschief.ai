import { useState, useEffect } from "react"
import { Sidebar, SidebarCollapseButton } from "@/components/Sidebar"
import { SectionTabs, WORK_TABS } from "@/components/SectionTabs"
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext"
import { isElectron, getElectronAPI } from "@/lib/electron-api"
import { useNavigate } from "react-router-dom"
import { Gavel, Search, FolderKanban, FileText, Users, Trash2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface Decision {
  id: string
  text: string
  context?: string
  date: string
  note_id?: string
  note_title?: string
  project_id?: string
  project_name?: string
  participant_names?: string
  created_at: string
  status?: string
}

const statusStyles: Record<string, string> = {
  MADE: 'bg-muted text-muted-foreground',
  ASSIGNED: 'bg-primary/10 text-primary',
  IN_PROGRESS: 'bg-green-500/10 text-green-600 dark:text-green-400',
  DONE: 'bg-green-500/10 text-green-600 dark:text-green-400',
  ABANDONED: 'bg-muted text-muted-foreground line-through',
  REVISITED: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
}

const statusLabels: Record<string, string> = {
  MADE: 'Made',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In Progress',
  DONE: 'Done',
  ABANDONED: 'Abandoned',
  REVISITED: 'Revisited',
}

type FilterMode = "all" | "by-project" | "by-person"

export default function DecisionsPage() {
  const { sidebarOpen } = useSidebarVisibility()
  const navigate = useNavigate()
  const api = isElectron ? getElectronAPI() : null

  const [decisions, setDecisions] = useState<Decision[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<FilterMode>("all")
  const [projects, setProjects] = useState<any[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newText, setNewText] = useState("")
  const [newContext, setNewContext] = useState("")
  const [newProjectId, setNewProjectId] = useState<string | null>(null)
  const [editingTextId, setEditingTextId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const [editingContextId, setEditingContextId] = useState<string | null>(null)
  const [editContext, setEditContext] = useState("")

  const refreshDecisions = () => {
    if (filter === "by-project" && selectedProjectId) {
      api?.memory?.decisions?.forProject(selectedProjectId).then(setDecisions)
    } else {
      api?.memory?.decisions?.getAll().then(setDecisions)
    }
  }

  const handleStatusChange = async (id: string, status: string) => {
    await api?.memory?.decisions?.updateStatus(id, status)
    // Refresh
    if (filter === "by-project" && selectedProjectId) {
      api?.memory?.decisions?.forProject(selectedProjectId).then(setDecisions)
    } else {
      api?.memory?.decisions?.getAll().then(setDecisions)
    }
  }

  useEffect(() => {
    if (!api?.memory?.decisions) return
    api.memory.decisions.getAll().then(d => { setDecisions(d); setLoading(false) })
    api.memory?.projects?.getAll({ status: 'active' }).then((p: any[]) => setProjects(p || []))
  }, [api])

  useEffect(() => {
    if (!api?.memory?.decisions) return
    if (filter === "by-project" && selectedProjectId) {
      api.memory.decisions.forProject(selectedProjectId).then(setDecisions)
    } else {
      api.memory.decisions.getAll().then(setDecisions)
    }
  }, [filter, selectedProjectId, api])

  const filtered = decisions.filter(d =>
    !search || d.text.toLowerCase().includes(search.toLowerCase()) ||
    (d.project_name || '').toLowerCase().includes(search.toLowerCase()) ||
    (d.note_title || '').toLowerCase().includes(search.toLowerCase())
  )

  // Group by month
  const grouped = new Map<string, Decision[]>()
  for (const d of filtered) {
    const month = d.date?.slice(0, 7) || d.created_at?.slice(0, 7) || 'Unknown'
    if (!grouped.has(month)) grouped.set(month, [])
    grouped.get(month)!.push(d)
  }

  const formatMonth = (ym: string) => {
    if (ym === 'Unknown') return 'Unknown'
    const [y, m] = ym.split('-')
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    return `${months[parseInt(m) - 1] || m} ${y}`
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      {sidebarOpen && (
        <div className="w-48 flex-shrink-0 overflow-hidden">
          <Sidebar />
        </div>
      )}
      <main className={cn("flex-1 overflow-y-auto", !sidebarOpen && isElectron && "pl-20")}>
        <div className={cn("flex items-center px-4 pb-0", isElectron ? "pt-10" : "pt-3")}>
          <SidebarCollapseButton />
        </div>
        <div className="px-6 pt-2">
          <SectionTabs tabs={WORK_TABS} />
        </div>
        <div className="max-w-3xl mx-auto px-6 py-6">
          <div className="flex items-center gap-2 mb-1">
            <Gavel className="h-4.5 w-4.5 text-muted-foreground" />
            <h1 className="font-display text-2xl text-foreground">Decisions</h1>
            <span className="text-xs text-muted-foreground ml-2">{decisions.length} total</span>
            <div className="flex-1" />
            {!creating && (
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <span className="text-sm">+</span>
                Add Decision
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-5">
            Every decision made across your meetings — searchable by project, person, or keyword.
          </p>

          {creating && (
            <div className="rounded-lg border border-primary/30 bg-card p-4 mb-4 space-y-3">
              <input
                value={newText}
                onChange={e => setNewText(e.target.value)}
                placeholder="What was decided?"
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
                autoFocus
              />
              <input
                value={newContext}
                onChange={e => setNewContext(e.target.value)}
                placeholder="Context (optional — why, who was involved)"
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              {projects.length > 0 && (
                <select
                  value={newProjectId || ""}
                  onChange={e => setNewProjectId(e.target.value || null)}
                  className="px-3 py-2 text-sm bg-background border border-border rounded-md"
                >
                  <option value="">No project</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    if (!newText.trim() || !api?.memory?.decisions?.create) return
                    await api.memory.decisions.create({
                      text: newText.trim(),
                      context: newContext.trim() || undefined,
                      projectId: newProjectId || undefined,
                      date: new Date().toISOString().slice(0, 10),
                    })
                    setNewText("")
                    setNewContext("")
                    setNewProjectId(null)
                    setCreating(false)
                    api.memory.decisions.getAll().then(setDecisions)
                  }}
                  disabled={!newText.trim()}
                  className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity disabled:opacity-40"
                >
                  Save
                </button>
                <button
                  onClick={() => { setCreating(false); setNewText(""); setNewContext(""); setNewProjectId(null) }}
                  className="rounded-md px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search decisions..."
                className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
            </div>
            {projects.length > 0 && (
              <select
                value={selectedProjectId || ""}
                onChange={e => {
                  setSelectedProjectId(e.target.value || null)
                  setFilter(e.target.value ? "by-project" : "all")
                }}
                className="px-3 py-2 text-sm bg-background border border-border rounded-md"
              >
                <option value="">All projects</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            )}
          </div>

          {/* Timeline */}
          {loading ? (
            <div className="text-center py-16 text-muted-foreground">
              <Gavel className="h-8 w-8 mx-auto mb-3 opacity-40 animate-pulse" />
              <p className="text-sm">Loading decisions...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Gavel className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No decisions recorded yet.</p>
              <p className="text-xs mt-1">Decisions are extracted automatically from your meeting summaries.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {[...grouped.entries()].map(([month, items]) => (
                <div key={month}>
                  <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-2">
                    {formatMonth(month)}
                  </div>
                  <div className="rounded-lg border border-border bg-card divide-y divide-border">
                    {items.map(d => (
                      <div key={d.id} className="group px-4 py-3 space-y-1 relative">
                        <div className="flex items-center gap-2">
                          {editingTextId === d.id ? (
                            <input
                              autoFocus
                              value={editText}
                              onChange={e => setEditText(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === 'Enter' && editText.trim()) {
                                  api?.memory?.decisions?.update?.(d.id, { text: editText.trim() })
                                    .then(() => { refreshDecisions(); setEditingTextId(null) })
                                }
                                if (e.key === 'Escape') setEditingTextId(null)
                              }}
                              onBlur={() => {
                                if (editText.trim() && editText !== d.text) {
                                  api?.memory?.decisions?.update?.(d.id, { text: editText.trim() })
                                    .then(() => refreshDecisions())
                                }
                                setEditingTextId(null)
                              }}
                              className="text-sm flex-1 bg-transparent border-b border-primary focus:outline-none"
                            />
                          ) : (
                            <div
                              className="text-sm flex-1 cursor-pointer hover:text-primary/80 transition-colors"
                              onClick={() => { setEditingTextId(d.id); setEditText(d.text) }}
                              title="Click to edit"
                            >{d.text}</div>
                          )}
                          <select
                            value={d.status || 'MADE'}
                            onChange={(e) => { e.stopPropagation(); handleStatusChange(d.id, e.target.value) }}
                            className={cn(
                              "text-[11px] rounded-full px-2 py-0.5 border-0 cursor-pointer shrink-0 focus:outline-none focus:ring-1 focus:ring-primary/30",
                              statusStyles[d.status || 'MADE']
                            )}
                          >
                            {Object.entries(statusLabels).map(([val, label]) => (
                              <option key={val} value={val}>{label}</option>
                            ))}
                          </select>
                          <button
                            onClick={async () => {
                              if (!confirm("Delete this decision?")) return
                              await api?.memory?.decisions?.delete?.(d.id)
                              api?.memory?.decisions?.getAll?.().then(setDecisions)
                            }}
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-600 dark:hover:text-red-400 transition-opacity shrink-0"
                            title="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        {editingContextId === d.id ? (
                          <input
                            autoFocus
                            value={editContext}
                            onChange={e => setEditContext(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                api?.memory?.decisions?.update?.(d.id, { context: editContext.trim() })
                                  .then(() => { refreshDecisions(); setEditingContextId(null) })
                              }
                              if (e.key === 'Escape') setEditingContextId(null)
                            }}
                            onBlur={() => {
                              api?.memory?.decisions?.update?.(d.id, { context: editContext.trim() })
                                .then(() => refreshDecisions())
                              setEditingContextId(null)
                            }}
                            placeholder="Add context..."
                            className="text-xs text-muted-foreground italic bg-transparent border-b border-primary/40 focus:outline-none w-full"
                          />
                        ) : d.context ? (
                          <div
                            className="text-xs text-muted-foreground italic cursor-pointer hover:text-foreground/70 transition-colors"
                            onClick={() => { setEditingContextId(d.id); setEditContext(d.context || "") }}
                            title="Click to edit context"
                          >{d.context}</div>
                        ) : (
                          <button
                            onClick={() => { setEditingContextId(d.id); setEditContext("") }}
                            className="text-xs text-muted-foreground/40 hover:text-muted-foreground italic opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            Add context...
                          </button>
                        )}
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                          {d.note_title && (
                            <button
                              onClick={() => d.note_id && navigate(`/note/${d.note_id}`)}
                              className="flex items-center gap-1 hover:text-foreground transition-colors"
                            >
                              <FileText className="h-3 w-3" />
                              {d.note_title}
                            </button>
                          )}
                          {d.project_name && (
                            <button
                              onClick={() => d.project_id && navigate(`/project/${d.project_id}`)}
                              className="flex items-center gap-1 hover:text-foreground transition-colors"
                            >
                              <FolderKanban className="h-3 w-3" />
                              {d.project_name}
                            </button>
                          )}
                          {d.participant_names && (
                            <span className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              {d.participant_names}
                            </span>
                          )}
                          <span>{d.date}</span>
                        </div>
                      </div>
                    ))}
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
