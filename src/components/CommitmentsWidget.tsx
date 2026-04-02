/**
 * "You said you would..." widget for the Home page.
 * Shows open commitments sorted by urgency (overdue first, then due soon).
 */

import { useState, useEffect, useCallback } from "react"
import { getElectronAPI } from "@/lib/electron-api"
import { loadAccountFromStorage, normalizeForNameCompare } from "@/lib/account-context"
import { useNavigate } from "react-router-dom"
import { CheckCircle2, Circle, Clock, AlertTriangle, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { isPast, parseISO, isValid, formatDistanceToNow } from "date-fns"

interface Commitment {
  id: string
  note_id?: string | null
  text: string
  owner: string
  assignee_name?: string
  due_date?: string
  status: string
  note_title?: string
}

export function CommitmentsWidget() {
  const navigate = useNavigate()
  const [commitments, setCommitments] = useState<Commitment[]>([])
  const api = getElectronAPI()

  const loadCommitments = useCallback(async () => {
    if (!api?.memory) return
    try {
      const accountName = loadAccountFromStorage().name?.trim() || ""
      const accountNorm = normalizeForNameCompare(accountName)
      const result = await api.memory.commitments.getOpen()
      const myOnly = (result || []).filter((c: Commitment) => {
        const ownerNorm = normalizeForNameCompare(c.owner || "")
        const assigneeNorm = normalizeForNameCompare(c.assignee_name || "")
        const ownerIsMe = ownerNorm === "you" || ownerNorm === "me"
        const assigneeIsMe = assigneeNorm === "me" || assigneeNorm === "you" || (!!accountNorm && assigneeNorm === accountNorm)
        return ownerIsMe || assigneeIsMe
      })
      setCommitments(myOnly.slice(0, 5))
    } catch {
      // Silent fail — widget is non-critical
    }
  }, [api])

  useEffect(() => {
    loadCommitments()
  }, [loadCommitments])

  const handleToggle = useCallback(async (id: string) => {
    if (!api?.memory) return
    try {
      await api.memory.commitments.updateStatus(id, "completed")
      loadCommitments()
    } catch {}
  }, [api, loadCommitments])

  if (commitments.length === 0) return null

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] uppercase tracking-wider font-medium text-muted-foreground">My open to-dos</span>
        <button
          onClick={() => navigate("/commitments")}
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          View all
          <ArrowRight className="h-3 w-3" />
        </button>
      </div>

      <div className="rounded-[10px] border border-border bg-card overflow-hidden" style={{ borderLeftWidth: '3px', borderLeftColor: 'hsl(var(--amber, 30 55% 64%))' }}>
        {commitments.map((c, i) => {
          const isOverdue = c.due_date && (() => {
            try {
              const d = parseISO(c.due_date!)
              return isValid(d) && isPast(d)
            } catch { return false }
          })()

          return (
            <div
              key={c.id}
              className={cn(
                "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-secondary/30",
                i < commitments.length - 1 && "border-b border-border/50"
              )}
            >
              <button
                onClick={() => handleToggle(c.id)}
                className={cn(
                  "mt-0.5 flex-shrink-0 transition-colors",
                  isOverdue ? "text-red-500" : "text-muted-foreground/50 hover:text-accent"
                )}
                title="Mark as done"
              >
                {isOverdue ? (
                  <AlertTriangle className="h-4 w-4" />
                ) : (
                  <Circle className="h-4 w-4" />
                )}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground leading-snug">{c.text}</p>
                <div className="flex items-center gap-2 mt-1">
                  {c.due_date && (
                    <span className={cn(
                      "text-[10px] flex items-center gap-1",
                      isOverdue ? "text-red-500 font-medium" : "text-muted-foreground"
                    )}>
                      <Clock className="h-2.5 w-2.5" />
                      {isOverdue ? "Overdue" : c.due_date}
                    </span>
                  )}
                  {c.note_title && (
                    <button
                      onClick={() => navigate(`/note/${c.note_id}`)}
                      className="text-[10px] text-muted-foreground/60 hover:text-muted-foreground truncate max-w-[150px]"
                    >
                      from: {c.note_title}
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
