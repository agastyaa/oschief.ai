import { useState, useEffect } from "react"
import { Sidebar, SidebarCollapseButton } from "@/components/Sidebar"
import { SectionTabs, INTELLIGENCE_TABS } from "@/components/SectionTabs"
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext"
import { isElectron, getElectronAPI } from "@/lib/electron-api"
import { Zap, Play, Plus, Clock, Check, X, ChevronDown, ChevronRight, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface Routine {
  id: string
  name: string
  prompt: string
  schedule_type: string
  schedule_hour: number
  schedule_minute: number
  schedule_day: number | null
  delivery: string
  enabled: number
  builtin_type: string | null
}

const ROUTINE_DESCRIPTIONS: Record<string, string> = {
  'morning-briefing': "Your day at a glance: today's meetings with prep notes, overdue commitments, and who you're meeting for the first time.",
  'weekly-recap': "What happened this week: meetings attended, decisions made, commitments kept vs. broken, and people you met.",
  'overdue-commitments': "Things you promised but haven't delivered. Grouped by person so you can batch your follow-ups.",
}

interface RoutineRun {
  id: string
  output: string
  status: string
  error_message: string | null
  started_at: string
  duration_ms: number
}

function scheduleLabel(r: Routine): string {
  const time = `${r.schedule_hour}:${String(r.schedule_minute).padStart(2, '0')} ${r.schedule_hour >= 12 ? 'PM' : 'AM'}`
  const h12 = r.schedule_hour > 12 ? r.schedule_hour - 12 : r.schedule_hour || 12
  const timeStr = `${h12}:${String(r.schedule_minute).padStart(2, '0')} ${r.schedule_hour >= 12 ? 'PM' : 'AM'}`
  if (r.schedule_type === 'daily') return `Daily at ${timeStr}`
  if (r.schedule_type === 'weekly') {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return `${days[r.schedule_day ?? 0]}s at ${timeStr}`
  }
  if (r.schedule_type === 'monthly') return `Monthly on the ${r.schedule_day ?? 1}${ordinal(r.schedule_day ?? 1)} at ${timeStr}`
  return r.schedule_type
}

function ordinal(n: number): string {
  if (n > 3 && n < 21) return 'th'
  switch (n % 10) { case 1: return 'st'; case 2: return 'nd'; case 3: return 'rd'; default: return 'th' }
}

export default function RoutinesPage() {
  const { sidebarOpen } = useSidebarVisibility()
  const api = isElectron ? getElectronAPI() : null

  const [routines, setRoutines] = useState<Routine[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [runs, setRuns] = useState<Record<string, RoutineRun[]>>({})
  const [running, setRunning] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [newPrompt, setNewPrompt] = useState("")
  const [newSchedule, setNewSchedule] = useState<"daily" | "weekly" | "monthly">("daily")
  const [newHour, setNewHour] = useState(9)

  const loadRoutines = async () => {
    const all = await api?.routines?.getAll?.()
    if (all) setRoutines(all)
  }

  useEffect(() => { loadRoutines() }, [api])

  const handleRunNow = async (id: string) => {
    setRunning(id)
    try {
      const result = await api?.routines?.runNow?.(id)
      if (result?.ok) {
        toast.success("Routine completed")
        loadRuns(id)
      } else {
        toast.error(result?.error || "Routine failed")
      }
    } catch { toast.error("Failed to run routine") }
    setRunning(null)
  }

  const handleToggle = async (id: string, enabled: boolean) => {
    await api?.routines?.toggle?.(id, !enabled)
    loadRoutines()
  }

  const handleCreate = async () => {
    if (!newName.trim() || !newPrompt.trim()) return
    await api?.routines?.create?.({
      name: newName.trim(),
      prompt: newPrompt.trim(),
      schedule_type: newSchedule,
      schedule_hour: newHour,
      schedule_minute: 0,
    })
    toast.success(`Routine "${newName}" created`)
    setNewName(""); setNewPrompt(""); setCreating(false)
    loadRoutines()
  }

  const handleDelete = async (id: string) => {
    await api?.routines?.delete?.(id)
    toast.success("Routine deleted")
    loadRoutines()
  }

  const loadRuns = async (routineId: string) => {
    const r = await api?.routines?.getRuns?.(routineId, 5)
    if (r) setRuns(prev => ({ ...prev, [routineId]: r }))
  }

  const toggleExpand = (id: string) => {
    if (expandedId === id) { setExpandedId(null); return }
    setExpandedId(id)
    loadRuns(id)
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
          <SectionTabs tabs={INTELLIGENCE_TABS} />
        </div>
        <div className="max-w-3xl mx-auto px-6 py-6">
          <div className="flex items-center gap-2 mb-1">
            <Zap className="h-4.5 w-4.5 text-muted-foreground" />
            <h1 className="font-display text-2xl text-foreground">Routines</h1>
            <div className="flex-1" />
            {!creating && (
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Plus className="h-3.5 w-3.5" />
                New Routine
              </button>
            )}
          </div>
          <p className="text-xs text-muted-foreground mb-6">
            Scheduled prompts that run automatically against your meeting history.
          </p>

          {/* Create form */}
          {creating && (
            <div className="rounded-lg border border-border bg-card p-4 mb-4 space-y-3">
              <input
                autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                placeholder="Routine name..." className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
              <textarea
                value={newPrompt} onChange={e => setNewPrompt(e.target.value)}
                placeholder="What should OSChief tell you? e.g. 'Summarize all decisions about ACME this month'"
                rows={3} className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
              />
              <div className="flex items-center gap-3">
                <select value={newSchedule} onChange={e => setNewSchedule(e.target.value as any)} className="px-2 py-1.5 text-xs border border-border rounded-md bg-background">
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
                <span className="text-xs text-muted-foreground">at</span>
                <select value={newHour} onChange={e => setNewHour(Number(e.target.value))} className="px-2 py-1.5 text-xs border border-border rounded-md bg-background">
                  {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{i > 12 ? i - 12 : i || 12}:00 {i >= 12 ? 'PM' : 'AM'}</option>)}
                </select>
                <div className="flex-1" />
                <button onClick={handleCreate} className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90">Create</button>
                <button onClick={() => { setCreating(false); setNewName(""); setNewPrompt("") }} className="px-3 py-1.5 text-xs rounded-md hover:bg-secondary text-muted-foreground">Cancel</button>
              </div>
            </div>
          )}

          {/* Routines list */}
          {routines.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Zap className="h-8 w-8 mx-auto mb-3 opacity-40" />
              <p className="text-sm">No routines yet.</p>
              <p className="text-xs mt-1">OSChief can brief you every morning, recap your week, and nudge you about overdue commitments.</p>
              <button onClick={() => setCreating(true)} className="mt-4 text-xs font-medium text-primary hover:underline">Create your first routine</button>
            </div>
          ) : (
            <div className="space-y-3">
              {routines.map(r => (
                <div key={r.id} className="rounded-lg border border-border bg-card overflow-hidden">
                  {/* Routine header */}
                  <div className="flex items-center gap-3 px-4 py-3">
                    <button onClick={() => toggleExpand(r.id)} className="p-0.5 text-muted-foreground">
                      {expandedId === r.id ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{r.name}</div>
                      {r.builtin_type && ROUTINE_DESCRIPTIONS[r.builtin_type] && (
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{ROUTINE_DESCRIPTIONS[r.builtin_type]}</p>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <Clock className="h-3 w-3" />
                        {scheduleLabel(r)}
                        {r.builtin_type && <span className="px-2 py-0.5 rounded-full bg-secondary text-[11px] font-medium">built-in</span>}
                      </div>
                    </div>
                    <button
                      onClick={() => handleRunNow(r.id)}
                      disabled={running === r.id}
                      className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium border border-border hover:bg-secondary transition-colors disabled:opacity-50"
                    >
                      {running === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                      Run Now
                    </button>
                    <button
                      onClick={() => handleToggle(r.id, !!r.enabled)}
                      className={cn("relative w-9 h-5 rounded-full transition-colors", r.enabled ? "bg-primary" : "bg-muted")}
                    >
                      <span className={cn("absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform", r.enabled && "translate-x-4")} />
                    </button>
                  </div>

                  {/* Expanded: prompt + history */}
                  {expandedId === r.id && (
                    <div className="border-t border-border px-4 py-3 space-y-3">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-1">PROMPT</div>
                        <p className="text-xs text-foreground/80 leading-relaxed">{r.prompt}</p>
                      </div>

                      {/* Run history */}
                      <div>
                        <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-1">RECENT RUNS</div>
                        {(runs[r.id] || []).length === 0 ? (
                          <p className="text-xs text-muted-foreground italic">No runs yet — click "Run Now" to test</p>
                        ) : (
                          <div className="space-y-2">
                            {(runs[r.id] || []).map(run => (
                              <div key={run.id} className="rounded-md border border-border/50 p-2.5">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className={cn("w-1.5 h-1.5 rounded-full", run.status === 'success' ? "bg-green-500" : "bg-red-500")} />
                                  <span className="text-[10px] text-muted-foreground">{new Date(run.started_at).toLocaleString()}</span>
                                  <span className="text-[10px] text-muted-foreground">{run.duration_ms}ms</span>
                                </div>
                                <p className="text-xs leading-relaxed whitespace-pre-wrap">{run.status === 'success' ? run.output : run.error_message || 'Failed'}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Delete (custom only) */}
                      {!r.builtin_type && (
                        <button onClick={() => handleDelete(r.id)} className="text-xs text-destructive hover:underline">Delete routine</button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
