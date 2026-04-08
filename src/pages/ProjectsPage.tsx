import { useState, useEffect } from "react"
import { Sidebar, SidebarCollapseButton } from "@/components/Sidebar"

import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext"
import { isElectron, getElectronAPI } from "@/lib/electron-api"
import { useNavigate } from "react-router-dom"
import { FolderKanban, Search, Check, Archive, Trash2, X, Plus, Gavel, ChevronDown, GitMerge } from "lucide-react"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface Project {
  id: string
  name: string
  description?: string
  status: string
  meetingCount: number
  decisionCount: number
  created_at: string
  updated_at: string
}

type Tab = "active" | "suggested" | "archived"

const decisionStatusStyles: Record<string, string> = {
  MADE: 'bg-muted text-muted-foreground',
  ASSIGNED: 'bg-primary/10 text-primary',
  IN_PROGRESS: 'bg-green-500/10 text-green-600 dark:text-green-400',
  DONE: 'bg-green-500/10 text-green-600 dark:text-green-400',
  ABANDONED: 'bg-muted text-muted-foreground line-through',
  REVISITED: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
}
const decisionStatusLabels: Record<string, string> = {
  MADE: 'Made', ASSIGNED: 'Assigned', IN_PROGRESS: 'In Progress',
  DONE: 'Done', ABANDONED: 'Abandoned', REVISITED: 'Revisited',
}

export default function ProjectsPage() {
  const { sidebarOpen } = useSidebarVisibility()
  const navigate = useNavigate()
  const api = isElectron ? getElectronAPI() : null

  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<Tab>("active")
  const [search, setSearch] = useState("")
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")
  const [mergingId, setMergingId] = useState<string | null>(null)
  const [mergeTargetId, setMergeTargetId] = useState<string | null>(null)
  const [expandedProjectId, setExpandedProjectId] = useState<string | null>(null)
  const [projectDecisions, setProjectDecisions] = useState<Record<string, any[]>>({})
  const [unassignedDecisions, setUnassignedDecisions] = useState<any[]>([])

  const loadProjects = async () => {
    if (!api?.memory?.projects) return
    const all = await api.memory.projects.getAll()
    setProjects(all)
    setLoading(false)
  }

  useEffect(() => {
    loadProjects()
    if (api?.memory?.decisions?.getUnassigned) {
      api.memory.decisions.getUnassigned().then(setUnassignedDecisions).catch(() => {})
    }
  }, [api])

  const toggleDecisions = async (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (expandedProjectId === projectId) {
      setExpandedProjectId(null)
      return
    }
    setExpandedProjectId(projectId)
    if (!projectDecisions[projectId] && api?.memory?.decisions?.forProject) {
      const decisions = await api.memory.decisions.forProject(projectId)
      setProjectDecisions(prev => ({ ...prev, [projectId]: decisions }))
    }
  }

  const handleCreateProject = async () => {
    if (!newName.trim() || !api?.memory?.projects) return
    await api?.memory?.projects?.create?.(newName.trim())
    toast.success(`Project "${newName.trim()}" created`)
    setNewName("")
    setCreating(false)
    setTab("active")
    loadProjects()
  }

  const filtered = projects
    .filter(p => {
      if (tab === "active") return p.status === "active"
      if (tab === "suggested") return p.status === "suggested"
      if (tab === "archived") return p.status === "archived" || p.status === "completed"
      return true
    })
    .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))

  const handleConfirm = async (id: string) => {
    if (!api?.memory?.projects) return
    await api.memory.projects.confirm(id)
    toast.success("Project confirmed")
    loadProjects()
  }

  const handleArchive = async (id: string) => {
    if (!api?.memory?.projects) return
    await api.memory.projects.archive(id)
    toast.success("Project archived")
    loadProjects()
  }

  const handleDelete = async (id: string) => {
    if (!api?.memory?.projects) return
    await api.memory.projects.delete(id)
    toast.success("Project deleted")
    loadProjects()
  }

  const handleMerge = async () => {
    if (!mergingId || !mergeTargetId || !api?.memory?.projects?.merge) return
    const sourceName = projects.find(p => p.id === mergingId)?.name
    const targetName = projects.find(p => p.id === mergeTargetId)?.name
    await api.memory.projects.merge(mergeTargetId, mergingId)
    toast.success(`Merged "${sourceName}" into "${targetName}"`)
    setMergingId(null)
    setMergeTargetId(null)
    loadProjects()
  }

  const tabCounts = {
    active: projects.filter(p => p.status === "active").length,
    suggested: projects.filter(p => p.status === "suggested").length,
    archived: projects.filter(p => p.status === "archived" || p.status === "completed").length,
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      {sidebarOpen && <Sidebar />}
      <main className={cn("flex-1 overflow-y-auto", !sidebarOpen && isElectron && "pl-20")}>
        <div className={cn("flex items-center px-4 pb-0", isElectron ? "pt-10" : "pt-3")}>
          <SidebarCollapseButton />
        </div>
        <div className="max-w-3xl mx-auto px-6 py-6">
          <div className="flex items-center gap-2 mb-1">
            <FolderKanban className="h-4.5 w-4.5 text-muted-foreground" />
            <h1 className="font-display text-2xl text-foreground">Projects</h1>
            <div className="flex-1" />
            {!creating && (
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition-opacity"
              >
                <Plus className="h-3.5 w-3.5" />
                New Project
              </button>
            )}
          </div>
          {creating && (
            <div className="flex items-center gap-2 mb-4 mt-2">
              <input
                autoFocus
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreateProject(); if (e.key === 'Escape') { setCreating(false); setNewName("") } }}
                placeholder="Project name..."
                className="flex-1 px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
              />
              <button onClick={handleCreateProject} className="p-2 rounded-md bg-primary text-primary-foreground hover:opacity-90"><Check className="h-3.5 w-3.5" /></button>
              <button onClick={() => { setCreating(false); setNewName("") }} className="p-2 rounded-md hover:bg-secondary text-muted-foreground"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}
          <p className="text-xs text-muted-foreground mb-6">
            Work streams detected from your meetings. Confirm suggested projects to track them.
          </p>

          {/* Tabs */}
          <div className="flex items-center gap-4 mb-4 border-b border-border">
            {(["active", "suggested", "archived"] as Tab[]).map(t => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "pb-2 text-sm font-medium capitalize transition-colors",
                  tab === t
                    ? "border-b-2 border-primary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {t} {tabCounts[t] > 0 && <span className="ml-1 text-xs text-muted-foreground">({tabCounts[t]})</span>}
              </button>
            ))}
          </div>

          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search projects..."
              className="w-full pl-9 pr-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
            />
          </div>

          {/* Project list */}
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">
              <FolderKanban className="h-10 w-10 mx-auto mb-3 opacity-30 animate-pulse" />
              <p className="text-sm">Loading projects...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FolderKanban className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">
                {tab === "suggested" ? "No suggested projects — they'll appear as you record meetings" :
                 tab === "archived" ? "No archived projects" :
                 "No active projects yet. Confirm suggested projects to start tracking them."}
              </p>
              {tab === "active" && (
                <div className="flex items-center justify-center gap-3 mt-4">
                  <button
                    onClick={() => setCreating(true)}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Create a project
                  </button>
                  <span className="text-xs opacity-40">or</span>
                  <button
                    onClick={() => navigate("/new-note?startFresh=1")}
                    className="text-xs font-medium text-primary hover:underline"
                  >
                    Record a meeting
                  </button>
                </div>
              )}
              {tab === "suggested" && (
                <button
                  onClick={() => navigate("/new-note?startFresh=1")}
                  className="mt-4 text-xs font-medium text-primary hover:underline"
                >
                  Record a meeting to get started
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-[10px] border border-border bg-card overflow-hidden">
              {filtered.map((project, i) => (
                <div key={project.id}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 hover:bg-secondary/50 cursor-pointer transition-colors",
                    i > 0 && "border-t border-border"
                  )}
                  onClick={() => navigate(`/project/${project.id}`)}
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{project.name}</div>
                    {project.description && (
                      <div className="text-xs text-muted-foreground truncate mt-0.5">{project.description}</div>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground shrink-0">
                    <span>{project.meetingCount} meetings</span>
                    {project.decisionCount > 0 ? (
                      <button
                        onClick={(e) => toggleDecisions(project.id, e)}
                        className={cn(
                          "flex items-center gap-1 hover:text-foreground transition-colors",
                          expandedProjectId === project.id && "text-foreground"
                        )}
                      >
                        <Gavel className="h-3 w-3" />
                        {project.decisionCount}
                        <ChevronDown className={cn(
                          "h-3 w-3 transition-transform duration-200",
                          expandedProjectId === project.id && "rotate-180"
                        )} />
                      </button>
                    ) : (
                      <span>{project.decisionCount} decisions</span>
                    )}
                  </div>
                  <StatusPill status={project.status} />
                  {project.status === "suggested" && (
                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => handleConfirm(project.id)}
                        className="p-1 rounded hover:bg-green-100 dark:hover:bg-green-900/30 text-green-600 dark:text-green-400"
                        title="Confirm project"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleDelete(project.id)}
                        className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                        title="Dismiss"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  {project.status === "active" && (
                    <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => { setMergingId(project.id); setMergeTargetId(null) }}
                        className="p-1 rounded hover:bg-secondary text-muted-foreground"
                        title="Merge into another project"
                      >
                        <GitMerge className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => handleArchive(project.id)}
                        className="p-1 rounded hover:bg-secondary text-muted-foreground"
                        title="Archive"
                      >
                        <Archive className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => { if (confirm(`Delete "${project.name}"? This cannot be undone.`)) handleDelete(project.id) }}
                        className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                        title="Delete" aria-label="Delete"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  {(project.status === "archived" || project.status === "completed") && (
                    <button
                      onClick={e => { e.stopPropagation(); if (confirm(`Delete "${project.name}"?`)) handleDelete(project.id) }}
                      className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-600 dark:hover:text-red-400"
                      title="Delete" aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {expandedProjectId === project.id && (
                  <div className="px-4 py-2 bg-secondary/30 border-t border-border">
                    {(projectDecisions[project.id] || []).length === 0 ? (
                      <div className="text-xs text-muted-foreground py-1">No decisions yet</div>
                    ) : (
                      <>
                        {(projectDecisions[project.id] || []).slice(0, 5).map((d: any) => (
                          <div key={d.id} className="flex items-center gap-2 py-1.5">
                            <span className="text-[13px] text-foreground flex-1 truncate">{d.text}</span>
                            <span className={cn(
                              "text-[11px] rounded-full px-2 py-0.5 shrink-0",
                              decisionStatusStyles[d.status || 'MADE']
                            )}>
                              {decisionStatusLabels[d.status || 'MADE']}
                            </span>
                          </div>
                        ))}
                        {(projectDecisions[project.id]?.length || 0) > 5 && (
                          <button
                            onClick={() => navigate(`/project/${project.id}`)}
                            className="text-xs text-primary hover:underline mt-1"
                          >
                            View all {projectDecisions[project.id]?.length} decisions
                          </button>
                        )}
                      </>
                    )}
                  </div>
                )}
                </div>
              ))}
            </div>
          )}

          {/* Merge picker */}
          {mergingId && (
            <div className="mt-4 rounded-[10px] border border-primary/30 bg-card p-3 space-y-2">
              <p className="text-xs text-foreground font-medium">
                Merge "{projects.find(p => p.id === mergingId)?.name}" into:
              </p>
              <select
                autoFocus
                value={mergeTargetId || ""}
                onChange={e => setMergeTargetId(e.target.value || null)}
                className="w-full px-3 py-2 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="">Select target project...</option>
                {projects.filter(p => p.id !== mergingId && p.status === "active").map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={handleMerge}
                  disabled={!mergeTargetId}
                  className="px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  Merge
                </button>
                <button onClick={() => { setMergingId(null); setMergeTargetId(null) }} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
              </div>
            </div>
          )}

          {/* Unassigned decisions — not linked to any project */}
          {unassignedDecisions.length > 0 && (
            <div className="mt-8">
              <div className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground mb-2">
                Unassigned Decisions
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Decisions not linked to any project.
              </p>
              <div className="rounded-[10px] border border-border bg-card divide-y divide-border">
                {unassignedDecisions.map((d: any) => (
                  <div key={d.id} className="flex items-center gap-2 px-4 py-2.5">
                    <span className="text-sm flex-1 truncate">{d.text}</span>
                    <span className={cn(
                      "text-[11px] rounded-full px-2 py-0.5 shrink-0",
                      decisionStatusStyles[d.status || 'MADE']
                    )}>
                      {decisionStatusLabels[d.status || 'MADE']}
                    </span>
                    {d.date && <span className="text-[11px] text-muted-foreground shrink-0">{d.date}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    suggested: "bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    active: "bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    archived: "bg-muted text-muted-foreground",
    completed: "bg-muted text-muted-foreground",
  }
  return (
    <span className={cn("px-2.5 py-0.5 rounded-full text-[11px] font-medium", styles[status] || styles.archived)}>
      {status}
    </span>
  )
}
