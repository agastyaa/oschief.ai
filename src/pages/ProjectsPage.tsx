import { useState, useEffect } from "react"
import { Sidebar, SidebarCollapseButton } from "@/components/Sidebar"
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext"
import { isElectron, getElectronAPI } from "@/lib/electron-api"
import { useNavigate } from "react-router-dom"
import { FolderKanban, Search, Check, Archive, Trash2, X, Plus } from "lucide-react"
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

export default function ProjectsPage() {
  const { sidebarOpen } = useSidebarVisibility()
  const navigate = useNavigate()
  const api = isElectron ? getElectronAPI() : null

  const [projects, setProjects] = useState<Project[]>([])
  const [tab, setTab] = useState<Tab>("active")
  const [search, setSearch] = useState("")
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState("")

  const loadProjects = async () => {
    if (!api?.memory?.projects) return
    const all = await api.memory.projects.getAll()
    setProjects(all)
  }

  useEffect(() => { loadProjects() }, [api])

  const handleCreateProject = async () => {
    if (!newName.trim() || !api?.memory?.projects) return
    await (api.memory.projects as any).create?.(newName.trim())
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

  const tabCounts = {
    active: projects.filter(p => p.status === "active").length,
    suggested: projects.filter(p => p.status === "suggested").length,
    archived: projects.filter(p => p.status === "archived" || p.status === "completed").length,
  }

  return (
    <div className="flex h-screen bg-background text-foreground">
      {sidebarOpen && <Sidebar />}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-6 py-6">
          <div className="flex items-center gap-2 mb-1">
            {!sidebarOpen && <SidebarCollapseButton />}
            <FolderKanban className="h-4.5 w-4.5 text-muted-foreground" />
            <h1 className="text-xl font-semibold">Projects</h1>
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
                {t} {tabCounts[t] > 0 && <span className="ml-1 text-xs opacity-60">({tabCounts[t]})</span>}
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
          {filtered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FolderKanban className="h-8 w-8 mx-auto mb-3 opacity-40" />
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
            <div className="rounded-lg border border-border bg-card overflow-hidden">
              {filtered.map((project, i) => (
                <div
                  key={project.id}
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
                    <span>{project.decisionCount} decisions</span>
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
                        className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-muted-foreground hover:text-red-600"
                        title="Dismiss"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}
                  {project.status === "active" && (
                    <button
                      onClick={e => { e.stopPropagation(); handleArchive(project.id) }}
                      className="p-1 rounded hover:bg-secondary text-muted-foreground"
                      title="Archive"
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </button>
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
