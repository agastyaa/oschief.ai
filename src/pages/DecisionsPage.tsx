import { useState, useEffect } from "react"
import { Sidebar, SidebarCollapseButton } from "@/components/Sidebar"
import { SectionTabs, WORK_TABS } from "@/components/SectionTabs"
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext"
import { isElectron, getElectronAPI } from "@/lib/electron-api"
import { useNavigate } from "react-router-dom"
import { Gavel, Search, FolderKanban, FileText, Users } from "lucide-react"
import { cn } from "@/lib/utils"

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
}

type FilterMode = "all" | "by-project" | "by-person"

export default function DecisionsPage() {
  const { sidebarOpen } = useSidebarVisibility()
  const navigate = useNavigate()
  const api = isElectron ? getElectronAPI() : null

  const [decisions, setDecisions] = useState<Decision[]>([])
  const [search, setSearch] = useState("")
  const [filter, setFilter] = useState<FilterMode>("all")
  const [projects, setProjects] = useState<any[]>([])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)

  useEffect(() => {
    if (!api?.memory?.decisions) return
    api.memory.decisions.getAll().then(setDecisions)
    api.memory?.projects?.getAll().then((p: any[]) => setProjects(p || []))
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
        <div className="w-56 flex-shrink-0 overflow-hidden">
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
          </div>
          <p className="text-xs text-muted-foreground mb-5">
            Every decision made across your meetings — searchable by project, person, or keyword.
          </p>

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
          {filtered.length === 0 ? (
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
                      <div key={d.id} className="px-4 py-3 space-y-1">
                        <div className="text-sm">{d.text}</div>
                        {d.context && (
                          <div className="text-xs text-muted-foreground italic">{d.context}</div>
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
