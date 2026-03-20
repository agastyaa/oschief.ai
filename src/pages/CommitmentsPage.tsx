import { useState, useEffect, useCallback, useMemo } from "react"
import { Sidebar, SidebarCollapseButton } from "@/components/Sidebar"
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext"
import { isElectron, getElectronAPI } from "@/lib/electron-api"
import { loadAccountFromStorage, normalizeForNameCompare } from "@/lib/account-context"
import { useNavigate } from "react-router-dom"
import { CheckCircle2, Circle, Clock, AlertTriangle, FileText, Filter, ArrowRight, XCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { format, isPast, parseISO, isValid } from "date-fns"

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

type FilterStatus = "all" | "open" | "completed" | "overdue" | "my"

const STATUS_CONFIG = {
  open: { label: "Open", icon: Circle, color: "text-blue-500", bg: "bg-blue-500/10" },
  completed: { label: "Done", icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-500/10" },
  overdue: { label: "Overdue", icon: AlertTriangle, color: "text-red-500", bg: "bg-red-500/10" },
  cancelled: { label: "Cancelled", icon: XCircle, color: "text-muted-foreground", bg: "bg-muted/50" },
}

const CommitmentsPage = () => {
  const navigate = useNavigate()
  const { sidebarOpen } = useSidebarVisibility()
  const [commitments, setCommitments] = useState<Commitment[]>([])
  const [filter, setFilter] = useState<FilterStatus>("open")
  const [loading, setLoading] = useState(true)
  const [newTodoText, setNewTodoText] = useState("")
  const [addingTodo, setAddingTodo] = useState(false)

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

  const counts = {
    open: commitments.filter(c => c.status === "open").length,
    completed: commitments.filter(c => c.status === "completed").length,
    overdue: commitments.filter(c => c.status === "overdue").length,
    my: commitments.filter(c => isMyCommitment(c) && (c.status === "open" || c.status === "overdue")).length,
  }

  const totalOpen = commitments.filter(c => c.status === "open" || c.status === "overdue").length

  const filteredCommitments = useMemo(() => {
    if (filter === "all") return commitments
    if (filter === "my") {
      return commitments.filter((c) => isMyCommitment(c) && (c.status === "open" || c.status === "overdue"))
    }
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
      })
      setNewTodoText("")
      await loadCommitments()
    } catch (err) {
      console.error("Failed to add to-do:", err)
    } finally {
      setAddingTodo(false)
    }
  }, [newTodoText, api, addingTodo, loadCommitments])

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
        <div className="w-56 flex-shrink-0 overflow-hidden">
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
            <div className="mb-5 rounded-lg border border-border bg-card/40 p-3">
              <p className="text-xs text-muted-foreground mb-2">Add a personal to-do</p>
              <div className="flex items-center gap-2">
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
                  className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <button
                  onClick={() => void handleAddTodo()}
                  disabled={addingTodo || !newTodoText.trim()}
                  className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {addingTodo ? "Adding..." : "Add"}
                </button>
              </div>
            </div>

            {/* Filter tabs */}
            <div className="flex items-center gap-1 mb-6 border-b border-border pb-2">
              {(["my", "open", "completed", "overdue", "all"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={cn(
                    "px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                    filter === f
                      ? "bg-accent/10 text-accent"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >
                  {f === "all" ? "All" : f === "my" ? "My" : STATUS_CONFIG[f].label}
                  {f !== "all" && f === "open" && counts.open > 0 && (
                    <span className="ml-1.5 text-[10px] opacity-60">{counts.open}</span>
                  )}
                  {f === "overdue" && counts.overdue > 0 && (
                    <span className="ml-1.5 text-[10px] opacity-60">{counts.overdue}</span>
                  )}
                  {f === "my" && counts.my > 0 && (
                    <span className="ml-1.5 text-[10px] opacity-60">{counts.my}</span>
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
                              <p className={cn(
                                "text-sm text-foreground",
                                c.status === "completed" && "line-through opacity-60"
                              )}>
                                {c.text}
                              </p>
                              <div className="flex items-center gap-3 mt-1">
                                {c.owner && c.owner !== "you" && (
                                  <span className="text-[11px] text-muted-foreground">
                                    Owner: {c.owner}
                                  </span>
                                )}
                                {c.assignee_name && (
                                  <span className="text-[11px] text-muted-foreground">
                                    → {c.assignee_name}
                                  </span>
                                )}
                                {!c.note_id && (
                                  <span className="text-[11px] text-muted-foreground">
                                    Personal
                                  </span>
                                )}
                                {c.due_date && (
                                  <span className={cn(
                                    "text-[11px] flex items-center gap-1",
                                    isOverdue ? "text-red-500" : "text-muted-foreground"
                                  )}>
                                    <Clock className="h-2.5 w-2.5" />
                                    {c.due_date}
                                  </span>
                                )}
                                {c.jira_issue_key && (
                                  <span className="text-[11px] text-blue-500 font-mono">
                                    {c.jira_issue_key}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Source meeting link */}
                            {c.note_id && (
                              <button
                                onClick={() => navigate(`/note/${c.note_id}`)}
                                className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                                title={c.note_title || "View meeting"}
                              >
                                <FileText className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground" />
                              </button>
                            )}
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
