import { useState, useEffect, useRef } from "react"
import { isElectron, getElectronAPI } from "@/lib/electron-api"
import { useNavigate } from "react-router-dom"
import { Gavel, Search, FolderKanban, FileText, Users, Trash2, X, Plus } from "lucide-react"
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
  MADE: 'bg-green-bg text-green',
  IN_PROGRESS: 'bg-amber-bg text-amber',
  TBD: 'bg-muted text-muted-foreground',
  REJECTED: 'bg-destructive/10 text-destructive',
}

const statusLabels: Record<string, string> = {
  MADE: 'Made',
  IN_PROGRESS: 'In Progress',
  TBD: 'TBD',
  REJECTED: 'Rejected',
}

type FilterMode = "all" | "by-project" | "by-person"

export default function DecisionsPage() {
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
  const [editingPeopleId, setEditingPeopleId] = useState<string | null>(null)
  const [linkedPeople, setLinkedPeople] = useState<Array<{ id: string; name: string }>>([])
  const [allPeople, setAllPeople] = useState<Array<{ id: string; name: string }>>([])
  const [peopleSearch, setPeopleSearch] = useState("")
  const peopleRef = useRef<HTMLDivElement>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const refreshDecisions = () => {
    if (filter === "by-project" && selectedProjectId) {
      api?.memory?.decisions?.forProject(selectedProjectId).then(setDecisions)
    } else {
      api?.memory?.decisions?.getAll().then(setDecisions)
    }
  }

  const openPeopleEditor = async (decisionId: string) => {
    setEditingPeopleId(decisionId)
    setPeopleSearch("")
    const [linked, all] = await Promise.all([
      api?.memory?.decisions?.getPeople?.(decisionId) ?? [],
      api?.memory?.people?.getAll?.() ?? [],
    ])
    setLinkedPeople(linked || [])
    setAllPeople((all || []).map((p: any) => ({ id: p.id, name: p.name })))
  }

  const addPersonToDecision = async (decisionId: string, personId: string) => {
    await api?.memory?.decisions?.linkPerson?.(decisionId, personId)
    const updated = await api?.memory?.decisions?.getPeople?.(decisionId)
    setLinkedPeople(updated || [])
    refreshDecisions()
  }

  const removePersonFromDecision = async (decisionId: string, personId: string) => {
    await api?.memory?.decisions?.unlinkPerson?.(decisionId, personId)
    const updated = await api?.memory?.decisions?.getPeople?.(decisionId)
    setLinkedPeople(updated || [])
    refreshDecisions()
  }

  useEffect(() => {
    if (!editingPeopleId) return
    const handler = (e: MouseEvent) => {
      if (peopleRef.current && !peopleRef.current.contains(e.target as Node)) {
        setEditingPeopleId(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [editingPeopleId])

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
        <div className="max-w-3xl mx-auto px-6 py-6">
          <div className="flex items-center gap-2 mb-1">
            <Gavel className="h-4.5 w-4.5 text-muted-foreground" />
            <h1 className="font-display text-2xl text-foreground">Decisions</h1>
            <span className="text-xs text-muted-foreground ml-2">{decisions.length} total</span>
          </div>
          <p className="text-xs text-muted-foreground mb-5">
            Every decision made across your meetings — searchable by project, person, or keyword.
          </p>

          {creating && (
            <div className="rounded-[10px] border border-primary/30 bg-card p-4 mb-4 space-y-3">
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

          {/* Action bar: select all + bulk actions + add */}
          <div className="flex items-center gap-2 mb-4">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors select-none">
              <input
                type="checkbox"
                checked={filtered.length > 0 && selectedIds.size === filtered.length}
                onChange={(e) => {
                  if (e.target.checked) {
                    setSelectedIds(new Set(filtered.map(d => d.id)))
                  } else {
                    setSelectedIds(new Set())
                  }
                }}
                className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary/20"
              />
              {selectedIds.size > 0 ? `${selectedIds.size} selected` : "Select all"}
            </label>
            <div className="flex-1" />
            {selectedIds.size > 0 && (
              <>
                <select
                  defaultValue=""
                  onChange={async (e) => {
                    if (!e.target.value) return
                    for (const id of selectedIds) {
                      await api?.memory?.decisions?.updateStatus(id, e.target.value)
                    }
                    refreshDecisions()
                    e.target.value = ""
                  }}
                  aria-label="Set status for selected decisions"
                  className="text-xs rounded-md border border-border bg-background px-2 py-1.5 text-muted-foreground focus:outline-none"
                >
                  <option value="">Set status...</option>
                  {Object.entries(statusLabels).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
                <button
                  onClick={async () => {
                    if (!confirm(`Delete ${selectedIds.size} decision${selectedIds.size > 1 ? 's' : ''}?`)) return
                    for (const id of selectedIds) {
                      await api?.memory?.decisions?.delete?.(id)
                    }
                    setSelectedIds(new Set())
                    refreshDecisions()
                  }}
                  className="flex items-center gap-1.5 rounded-md bg-destructive px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 transition-opacity"
                >
                  <Trash2 className="h-3 w-3" />
                  Delete {selectedIds.size}
                </button>
              </>
            )}
            {!creating && selectedIds.size === 0 && (
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Plus className="h-3 w-3" />
                Add Decision
              </button>
            )}
          </div>

          {/* Timeline */}
          {loading ? (
            <div className="text-center py-16 text-muted-foreground">
              <Gavel className="h-10 w-10 mx-auto mb-3 opacity-30 animate-pulse" />
              <p className="text-sm">Loading decisions...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <Gavel className="h-10 w-10 mx-auto mb-3 opacity-30" />
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
                  <div className="rounded-[10px] border border-border bg-card divide-y divide-border">
                    {items.map(d => (
                      <div key={d.id} className="group px-4 py-3 space-y-1 relative">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(d.id)}
                            onChange={(e) => {
                              const next = new Set(selectedIds)
                              if (e.target.checked) next.add(d.id); else next.delete(d.id)
                              setSelectedIds(next)
                            }}
                            aria-label={`Select decision: ${d.text.slice(0, 50)}`}
                            className="h-3.5 w-3.5 rounded border-border text-primary focus:ring-primary/20 flex-shrink-0"
                          />
                          <div className="flex-1" aria-live="polite">
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
                              className="text-sm w-full bg-transparent border-b border-primary focus:outline-none"
                            />
                          ) : (
                            <div
                              className="text-sm cursor-pointer hover:text-primary/80 transition-colors"
                              onClick={() => { setEditingTextId(d.id); setEditText(d.text) }}
                              title="Click to edit" aria-label="Edit"
                            >{d.text}</div>
                          )}
                          </div>
                          <select
                            value={d.status || 'MADE'}
                            onChange={(e) => { e.stopPropagation(); handleStatusChange(d.id, e.target.value) }}
                            aria-label="Decision status"
                            className={cn(
                              "text-[11px] rounded-full px-2 py-0.5 border-0 cursor-pointer shrink-0 focus:outline-none focus:ring-2 focus:ring-primary/40",
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
                            className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-opacity shrink-0"
                            title="Delete" aria-label="Delete"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                        <div aria-live="polite">
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
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                          {d.note_title && (
                            <button
                              onClick={() => d.note_id && navigate(`/note/${d.note_id}`)}
                              className="flex items-center gap-1 hover:text-foreground transition-colors truncate max-w-[200px]"
                            >
                              <FileText className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{d.note_title}</span>
                            </button>
                          )}
                          {d.project_name && (
                            <button
                              onClick={() => d.project_id && navigate(`/project/${d.project_id}`)}
                              className="flex items-center gap-1 hover:text-foreground transition-colors truncate max-w-[200px]"
                            >
                              <FolderKanban className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{d.project_name}</span>
                            </button>
                          )}
                          <div className="relative">
                            <button
                              onClick={() => editingPeopleId === d.id ? setEditingPeopleId(null) : openPeopleEditor(d.id)}
                              className="flex items-center gap-1 hover:text-foreground transition-colors truncate max-w-[200px]"
                            >
                              <Users className="h-3 w-3 flex-shrink-0" />
                              <span className="truncate">{d.participant_names || <span className="text-muted-foreground/40 italic">Add people</span>}</span>
                            </button>
                            {editingPeopleId === d.id && (
                              <div ref={peopleRef} className="absolute left-0 top-full mt-1 z-50 w-56 rounded-[10px] border border-border bg-card shadow-lg p-2 space-y-2">
                                {linkedPeople.length > 0 && (
                                  <div className="flex flex-wrap gap-1">
                                    {linkedPeople.map(p => (
                                      <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-[11px]">
                                        {p.name}
                                        <button onClick={() => removePersonFromDecision(d.id, p.id)} aria-label={`Remove ${p.name}`} className="hover:text-destructive">
                                          <X className="h-2.5 w-2.5" />
                                        </button>
                                      </span>
                                    ))}
                                  </div>
                                )}
                                <input
                                  autoFocus
                                  value={peopleSearch}
                                  onChange={e => setPeopleSearch(e.target.value)}
                                  placeholder="Search people..."
                                  className="w-full text-xs bg-transparent border-b border-border pb-1 focus:outline-none focus:border-primary"
                                />
                                <div className="max-h-32 overflow-y-auto space-y-0.5">
                                  {allPeople
                                    .filter(p => !linkedPeople.some(lp => lp.id === p.id))
                                    .filter(p => !peopleSearch || p.name.toLowerCase().includes(peopleSearch.toLowerCase()))
                                    .slice(0, 10)
                                    .map(p => (
                                      <button
                                        key={p.id}
                                        onClick={() => addPersonToDecision(d.id, p.id)}
                                        className="w-full text-left text-xs px-2 py-1 rounded hover:bg-secondary transition-colors flex items-center gap-1.5"
                                      >
                                        <Plus className="h-3 w-3 text-muted-foreground" />
                                        {p.name}
                                      </button>
                                    ))
                                  }
                                  {allPeople.filter(p => !linkedPeople.some(lp => lp.id === p.id)).filter(p => !peopleSearch || p.name.toLowerCase().includes(peopleSearch.toLowerCase())).length === 0 && (
                                    <p className="text-[11px] text-muted-foreground px-2 py-1">No people found</p>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
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
  )
}
