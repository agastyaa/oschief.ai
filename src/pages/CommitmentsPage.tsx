import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import { Sidebar, SidebarCollapseButton } from "@/components/Sidebar"
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext"
import { isElectron, getElectronAPI } from "@/lib/electron-api"
import { loadAccountFromStorage, normalizeForNameCompare } from "@/lib/account-context"
import { useNavigate } from "react-router-dom"
import { CheckCircle2, Circle, Clock, AlertTriangle, FileText, XCircle, Trash2, UserPlus, FolderKanban, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { format, isPast, parseISO, isValid } from "date-fns"
import { toast } from "sonner"

interface Commitment {
  id: string
  note_id?: string | null
  text: string
  owner: string
  assignee_name?: string
  due_date?: string
  status: "open" | "completed" | "overdue" | "cancelled"
  completed_at?: string
  jira_issue_key?: string
  jira_issue_url?: string
  created_at: string
  note_title?: string
  note_date?: string
}

type FilterStatus = "all" | "open" | "completed" | "overdue" | "my" | "upcoming"

const STATUS_CONFIG = {
  open: { label: "Open", icon: Circle, color: "text-blue-500", bg: "bg-blue-500/10" },
  completed: { label: "Done", icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  overdue: { label: "Overdue", icon: AlertTriangle, color: "text-amber-600 dark:text-amber-400", bg: "bg-amber-500/10" },
  cancelled: { label: "Cancelled", icon: XCircle, color: "text-muted-foreground", bg: "bg-muted/50" },
}

const CommitmentsPage = () => {
  const navigate = useNavigate()
  const { sidebarOpen } = useSidebarVisibility()
  const [commitments, setCommitments] = useState<Commitment[]>([])
  const [filter, setFilter] = useState<FilterStatus>("open")
  const [loading, setLoading] = useState(true)
  const [newTodoText, setNewTodoText] = useState("")
  const [newTodoDueDate, setNewTodoDueDate] = useState("")
  const [addingTodo, setAddingTodo] = useState(false)
  const [projects, setProjects] = useState<any[]>([])
  const [newTodoProjectId, setNewTodoProjectId] = useState<string | null>(null)
  const [editingDueDateId, setEditingDueDateId] = useState<string | null>(null)
  const [editingAssigneeId, setEditingAssigneeId] = useState<string | null>(null)
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null)
  const [people, setPeople] = useState<any[]>([])

  const api = getElectronAPI()
  const accountName = useMemo(() => loadAccountFromStorage().name?.trim() || "", [])

  const isMyCommitment = useCallback((c: Commitment) => {
    const ownerNorm = normalizeForNameCompare(c.owner || "")
    const assigneeNorm = normalizeForNameCompare(c.assignee_name || "")
    const accountNorm = normalizeForNameCompare(accountName)
    const ownerIsMe = ownerNorm === "you" || ownerNorm === "me"
    const assigneeIsMe = assigneeNorm === "me" || assigneeNorm === "you" || (!!accountNorm && assigneeNorm === accountNorm)
    return ownerIsMe || assigneeIsMe
  }, [accountName])

  const loadCommitments = useCallback(async () => {
    if (!api?.memory) {
      setLoading(false)
      return
    }
    try {
      const result = await api.memory.commitments.getAll()
      setCommitments(result || [])
    } catch (err) {
      console.error("Failed to load commitments:", err)
    }
    setLoading(false)
  }, [api])

  useEffect(() => {
    loadCommitments()
    api?.memory?.projects?.getAll({ status: 'active' }).then((p: any[]) => setProjects(p || []))
    api?.memory?.people?.getAll().then((p: any[]) => setPeople(p || []))
  }, [loadCommitments])

  const handleToggleStatus = useCallback(async (commitment: Commitment) => {
    if (!api?.memory) return
    const newStatus = commitment.status === "completed" ? "open" : "completed"
    try {
      await api.memory.commitments.updateStatus(commitment.id, newStatus)
      loadCommitments()
    } catch (err) {
      console.error("Failed to update commitment:", err)
    }
  }, [api, loadCommitments])

  const handleDelete = useCallback(async (id: string) => {
    if (!api?.memory?.commitments?.delete) return
    try {
      await api.memory.commitments.delete(id)
      loadCommitments()
      toast.success("Deleted")
    } catch (err) {
      toast.error("Failed to delete")
    }
  }, [api, loadCommitments])

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState("")
  const editInputRef = useRef<HTMLInputElement>(null)

  const startEditing = useCallback((c: Commitment) => {
    setEditingId(c.id)
    setEditText(c.text)
    setTimeout(() => editInputRef.current?.focus(), 50)
  }, [])

  const handleSaveEdit = useCallback(async () => {
    if (!api?.memory || !editingId || !editText.trim()) {
      setEditingId(null)
      return
    }
    try {
      await api.memory.commitments.update(editingId, { text: editText.trim() })
      loadCommitments()
      toast.success("Commitment updated")
    } catch (err) {
      console.error("Failed to update commitment:", err)
      toast.error("Failed to update")
    }
    setEditingId(null)
  }, [api, editingId, editText, loadCommitments])

  const sevenDaysFromNow = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10)
  const isUpcoming = (c: Commitment) =>
    (c.status === "open" || c.status === "overdue") && c.due_date && c.due_date <= sevenDaysFromNow

  const counts = {
    open: commitments.filter(c => c.status === "open").length,
    completed: commitments.filter(c => c.status === "completed").length,
    overdue: commitments.filter(c => c.status === "overdue").length,
    my: commitments.filter(c => isMyCommitment(c) && (c.status === "open" || c.status === "overdue")).length,
    upcoming: commitments.filter(isUpcoming).length,
  }

  const totalOpen = commitments.filter(c => c.status === "open" || c.status === "overdue").length

  const filteredCommitments = useMemo(() => {
    if (filter === "all") return commitments
    if (filter === "my") {
      return commitments.filter((c) => isMyCommitment(c) && (c.status === "open" || c.status === "overdue"))
    }
    if (filter === "upcoming") return commitments.filter(isUpcoming)
    return commitments.filter((c) => c.status === filter)
  }, [commitments, filter, isMyCommitment])

  const handleAddTodo = useCallback(async () => {
    const text = newTodoText.trim()
    if (!text || !api?.memory?.commitments?.add || addingTodo) return
    setAddingTodo(true)
    try {
      await api.memory.commitments.add({
        text,
        owner: "you",
        projectId: newTodoProjectId || undefined,
        dueDate: newTodoDueDate || undefined,
      })
      setNewTodoText("")
      setNewTodoDueDate("")
      setNewTodoProjectId(null)
      await loadCommitments()
    } catch (err) {
      console.error("Failed to add to-do:", err)
    } finally {
      setAddingTodo(false)
    }
  }, [newTodoText, newTodoDueDate, newTodoProjectId, api, addingTodo, loadCommitments])

  // Group by date for better display
  const grouped = filteredCommitments.reduce<Record<string, Commitment[]>>((acc, c) => {
    const key = c.note_date || c.created_at?.split("T")[0] || "Unknown"
    ;(acc[key] = acc[key] || []).push(c)
    return acc
  }, {})

  const sortedKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a))

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {sidebarOpen && (
        <div className="flex-shrink-0 overflow-hidden">
          <Sidebar />
        </div>
      )}
      <main className={cn("flex flex-1 flex-col min-w-0 relative", !sidebarOpen && isElectron && "pl-20")}>
        <div className={cn("flex items-center justify-between px-4 pb-0", isElectron ? "pt-10" : "pt-3")}>
          <SidebarCollapseButton />
        </div>
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-6 py-8 font-body">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-accent" />
                <h1 className="font-display text-2xl text-foreground">Commitments</h1>
                {totalOpen > 0 && (
                  <span className="flex items-center justify-center rounded-full bg-accent/10 px-2 py-0.5 text-xs font-medium text-accent">
                    {totalOpen} open
                  </span>
                )}
              </div>
            </div>

            {/* Add to-do */}
            <div className="mb-6 rounded-[10px] border border-border bg-card p-4">
              <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground mb-3">Add a personal to-do</p>
              <div className="flex items-center gap-3">
                <input
                  value={newTodoText}
                  onChange={(e) => setNewTodoText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      void handleAddTodo()
                    }
                  }}
                  placeholder="Write a to-do..."
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-[13.5px] text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <input
                  type="date"
                  value={newTodoDueDate}
                  onChange={(e) => setNewTodoDueDate(e.target.value)}
                  className="rounded-md border border-border bg-background px-3 py-2 text-[13px] text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  title="Due date (optional)"
                />
                {projects.length > 0 && (
                  <select
                    value={newTodoProjectId || ""}
                    onChange={(e) => setNewTodoProjectId(e.target.value || null)}
                    className="rounded-md border border-border bg-background px-3 py-2 text-[13px] text-muted-foreground min-w-[120px]"
                  >
                    <option value="">No project</option>
                    {projects.map((p: any) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                )}
                <button
                  onClick={() => void handleAddTodo()}
                  disabled={addingTodo || !newTodoText.trim()}
                  className="rounded-md bg-primary px-4 py-2 text-[13px] font-medium text-white hover:bg-primary-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {addingTodo ? "Adding..." : "Add"}
                </button>
              </div>
            </div>

            {/* Filter tabs */}
            <div className="flex items-center gap-1 mb-6 border-b border-border">
              {(["my", "open", "upcoming", "completed", "overdue", "all"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "px-3 py-2.5 text-[13px] font-medium transition-colors border-b-2 -mb-px",
                    filter === f
                      ? "border-primary text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {f === "all" ? "All" : f === "my" ? "My" : f === "upcoming" ? "Upcoming" : STATUS_CONFIG[f as keyof typeof STATUS_CONFIG].label}
                  {f !== "all" && f === "open" && counts.open > 0 && (
                    <span className="ml-1.5 text-[11px] text-muted-foreground">{counts.open}</span>
                  )}
                  {f === "overdue" && counts.overdue > 0 && (
                    <span className="ml-1.5 text-[11px] text-muted-foreground">{counts.overdue}</span>
                  )}
                  {f === "my" && counts.my > 0 && (
                    <span className="ml-1.5 text-[11px] text-muted-foreground">{counts.my}</span>
                  )}
                  {f === "upcoming" && counts.upcoming > 0 && (
                    <span className="ml-1.5 text-[11px] text-muted-foreground">{counts.upcoming}</span>
                  )}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="text-center py-16">
                <p className="text-sm text-muted-foreground">Loading...</p>
              </div>
            ) : filteredCommitments.length === 0 ? (
              <div className="text-center py-16">
                <CheckCircle2 className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-foreground font-medium mb-1">
                  {filter === "my" ? "No my to-dos" :
                   filter === "open" ? "No open commitments" :
                   filter === "completed" ? "No completed commitments" :
                   filter === "overdue" ? "Nothing overdue" :
                   "No commitments yet"}
                </p>
                <p className="text-xs text-muted-foreground">
                  Commitments are automatically extracted from your meeting summaries.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {sortedKeys.map((dateKey) => (
                  <div key={dateKey}>
                    <h3 className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-1 mb-2">
                      {(() => {
                        try {
                          return format(new Date(dateKey), "EEE, MMM d, yyyy")
                        } catch {
                          return dateKey
                        }
                      })()}
                    </h3>
                    <div className="space-y-1">
                      {grouped[dateKey].map((c) => {
                        const config = STATUS_CONFIG[c.status] || STATUS_CONFIG.open
                        const StatusIcon = config.icon
                        const isOverdue = c.status === "open" && c.due_date && (() => {
                          try {
                            const d = parseISO(c.due_date!)
                            return isValid(d) && isPast(d)
                          } catch { return false }
                        })()
                        return (
                          <div
                            key={c.id}
                            className="group flex items-start gap-3 rounded-lg px-3 py-3 hover:bg-card border border-transparent hover:border-border transition-colors"
                          >
                            {/* Status toggle */}
                            <button
                              onClick={() => handleToggleStatus(c)}
                              className={cn("mt-0.5 flex-shrink-0 transition-colors", config.color, "hover:opacity-70")}
                              title={c.status === "completed" ? "Mark as open" : "Mark as done"}
                            >
                              <StatusIcon className="h-4 w-4" />
                            </button>

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              {editingId === c.id ? (
                                <input
                                  ref={editInputRef}
                                  value={editText}
                                  onChange={(e) => setEditText(e.target.value)}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSaveEdit()
                                    if (e.key === "Escape") setEditingId(null)
                                  }}
                                  onBlur={handleSaveEdit}
                                  className="w-full text-sm text-foreground bg-transparent border-b border-primary focus:outline-none py-0.5"
                                />
                              ) : (
                                <p
                                  className={cn(
                                    "text-sm text-foreground cursor-pointer hover:text-primary transition-colors",
                                    c.status === "completed" && "line-through opacity-60"
                                  )}
                                  onClick={() => startEditing(c)}
                                  title="Click to edit" aria-label="Edit"
                                >
                                  {c.text}
                                </p>
                              )}
                              <div className="flex items-center gap-3 mt-1">
                                {editingAssigneeId === c.id ? (
                                  <select
                                    autoFocus
                                    value={c.owner === 'you' ? '__me__' : (c.assignee_name || c.owner || '')}
                                    onChange={(e) => {
                                      const val = e.target.value
                                      if (val === '__me__') {
                                        api?.memory?.commitments?.update(c.id, { owner: 'you', assigneeId: null })
                                          .then(() => { loadCommitments(); setEditingAssigneeId(null) })
                                      } else if (val === '__none__') {
                                        api?.memory?.commitments?.update(c.id, { owner: 'you', assigneeId: null })
                                          .then(() => { loadCommitments(); setEditingAssigneeId(null) })
                                      } else {
                                        const selected = people.find((p: any) => p.name === val)
                                        api?.memory?.commitments?.update(c.id, { owner: val, assigneeId: selected?.id ?? null })
                                          .then(() => { loadCommitments(); setEditingAssigneeId(null) })
                                      }
                                    }}
                                    onBlur={() => setEditingAssigneeId(null)}
                                    className="text-[11px] rounded border border-border bg-background px-2 py-1 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                                  >
                                    <option value="__me__">Me</option>
                                    <option value="__none__">Unassigned</option>
                                    {people.map((p: any) => (
                                      <option key={p.id} value={p.name}>{p.name}</option>
                                    ))}
                                  </select>
                                ) : c.assignee_name ? (
                                  <button
                                    onClick={() => setEditingAssigneeId(c.id)}
                                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                                    title="Click to change assignee"
                                  >
                                    → {c.assignee_name}
                                  </button>
                                ) : c.owner && c.owner !== 'you' ? (
                                  <button
                                    onClick={() => setEditingAssigneeId(c.id)}
                                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors"
                                    title="Click to change assignee"
                                  >
                                    → {c.owner}
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setEditingAssigneeId(c.id)}
                                    className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                                    title="Assign to someone"
                                  >
                                    <UserPlus className="h-2.5 w-2.5" />
                                    Assign
                                  </button>
                                )}
                                {!c.note_id && (
                                  <span className="text-[11px] text-muted-foreground">
                                    Personal
                                  </span>
                                )}
                                {editingDueDateId === c.id ? (
                                  <input
                                    type="date"
                                    defaultValue={c.due_date || ""}
                                    autoFocus
                                    onBlur={async (e) => {
                                      setEditingDueDateId(null)
                                      const val = e.target.value
                                      if (val !== c.due_date) {
                                        await api?.memory?.commitments?.update(c.id, { dueDate: val || null })
                                        loadCommitments()
                                      }
                                    }}
                                    onKeyDown={(e) => {
                                      if (e.key === "Escape") setEditingDueDateId(null)
                                      if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                                    }}
                                    className="text-[11px] rounded border border-border bg-background px-1 py-0.5 text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                                  />
                                ) : c.due_date ? (
                                  <button
                                    onClick={() => setEditingDueDateId(c.id)}
                                    className={cn(
                                      "text-[11px] flex items-center gap-1 hover:opacity-70 transition-opacity",
                                      isOverdue ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
                                    )}
                                    title="Click to change due date"
                                  >
                                    <Clock className="h-2.5 w-2.5" />
                                    {c.due_date}
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setEditingDueDateId(c.id)}
                                    className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                                    title="Set due date"
                                  >
                                    <Clock className="h-2.5 w-2.5" />
                                    Set deadline
                                  </button>
                                )}
                                {c.jira_issue_key && (
                                  <span className="text-[11px] text-blue-500 font-mono">
                                    {c.jira_issue_key}
                                  </span>
                                )}
                                {editingProjectId === c.id ? (
                                  <select
                                    autoFocus
                                    defaultValue={(c as any).project_id || ""}
                                    onBlur={() => setEditingProjectId(null)}
                                    onChange={(e) => {
                                      api?.memory?.commitments?.update(c.id, { projectId: e.target.value || null })
                                        .then(() => { loadCommitments(); setEditingProjectId(null) })
                                    }}
                                    className="text-[11px] rounded border border-border bg-background px-1 py-0.5 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/40"
                                  >
                                    <option value="">No project</option>
                                    {projects.map(p => (
                                      <option key={p.id} value={p.id}>{p.name}</option>
                                    ))}
                                  </select>
                                ) : (c as any).project_name ? (
                                  <button
                                    onClick={() => setEditingProjectId(c.id)}
                                    className="text-[11px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
                                    title="Click to change project"
                                  >
                                    <FolderKanban className="h-2.5 w-2.5" />
                                    {(c as any).project_name}
                                  </button>
                                ) : (
                                  <button
                                    onClick={() => setEditingProjectId(c.id)}
                                    className="text-[11px] text-muted-foreground/40 hover:text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1"
                                    title="Assign to project"
                                  >
                                    <FolderKanban className="h-2.5 w-2.5" />
                                    Project
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Actions: source meeting + delete */}
                            <div className="flex items-center gap-1 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              {c.note_id && (
                                <button
                                  onClick={() => navigate(`/note/${c.note_id}`)}
                                  title={c.note_title || "View meeting"}
                                >
                                  <FileText className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                                </button>
                              )}
                              <button
                                onClick={() => handleDelete(c.id)}
                                title="Delete" aria-label="Delete"
                                className="p-0.5 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default CommitmentsPage
