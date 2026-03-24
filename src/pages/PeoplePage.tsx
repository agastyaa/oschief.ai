import { useState, useEffect, useCallback, useRef } from "react"
import { Sidebar, SidebarCollapseButton } from "@/components/Sidebar"
import { useSidebarVisibility } from "@/contexts/SidebarVisibilityContext"
import { isElectron, getElectronAPI } from "@/lib/electron-api"
import { useNavigate } from "react-router-dom"
import {
  Users, Search, FileText, Mail, Building2, Briefcase, ArrowRight,
  Trash2, Merge, X, Check, ChevronDown, StickyNote
} from "lucide-react"
import { cn } from "@/lib/utils"
import { format } from "date-fns"
import { toast } from "sonner"

interface Person {
  id: string
  name: string
  email?: string
  company?: string
  role?: string
  relationship?: string
  first_seen?: string
  last_seen?: string
  notes?: string
  meetingCount?: number
}

const RELATIONSHIP_OPTIONS = [
  "colleague", "client", "vendor", "manager", "report", "skip-level", "external"
]

// ── Inline editable field ─────────────────────────────────────────────

function EditableField({
  value,
  onSave,
  label,
  placeholder,
  icon,
  multiline,
}: {
  value: string
  onSave: (val: string) => void
  label: string
  placeholder?: string
  icon?: React.ReactNode
  multiline?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  useEffect(() => { setDraft(value) }, [value])
  useEffect(() => { if (editing) inputRef.current?.focus() }, [editing])

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed !== value) onSave(trimmed)
    setEditing(false)
  }

  const cancel = () => { setDraft(value); setEditing(false) }

  if (editing) {
    const commonProps = {
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
      onBlur: commit,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !multiline) commit()
        if (e.key === "Escape") cancel()
      },
      className: "w-full rounded-md border border-accent/40 bg-background px-2 py-1 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-accent/40",
      placeholder: placeholder || label,
    }

    return (
      <div className="flex items-start gap-2">
        {icon && <span className="text-muted-foreground mt-1.5 flex-shrink-0">{icon}</span>}
        <div className="flex-1">
          <div className="text-[10px] text-muted-foreground mb-0.5">{label}</div>
          {multiline ? (
            <textarea ref={inputRef as React.RefObject<HTMLTextAreaElement>} rows={3} {...commonProps} />
          ) : (
            <input ref={inputRef as React.RefObject<HTMLInputElement>} type="text" {...commonProps} />
          )}
        </div>
      </div>
    )
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="flex items-center gap-2 w-full text-left group rounded-md px-1 py-0.5 -mx-1 hover:bg-secondary/60 transition-colors"
      title={`Click to edit ${label}`}
    >
      {icon && <span className="text-muted-foreground flex-shrink-0">{icon}</span>}
      <div className="min-w-0 flex-1">
        <div className="text-[10px] text-muted-foreground">{label}</div>
        <div className={cn("text-sm truncate", value ? "text-foreground" : "text-muted-foreground/50 italic")}>
          {value || placeholder || `Add ${label.toLowerCase()}`}
        </div>
      </div>
    </button>
  )
}

// ── Relationship dropdown ─────────────────────────────────────────────

function RelationshipDropdown({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 w-full text-left group rounded-md px-1 py-0.5 -mx-1 hover:bg-secondary/60 transition-colors"
      >
        <Users className="h-3 w-3 text-muted-foreground flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[10px] text-muted-foreground">Relationship</div>
          <div className="text-sm text-foreground flex items-center gap-1">
            {value || <span className="text-muted-foreground/50 italic">Set relationship</span>}
            <ChevronDown className="h-3 w-3 text-muted-foreground" />
          </div>
        </div>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-48 rounded-lg border border-border bg-card shadow-lg py-1">
          {RELATIONSHIP_OPTIONS.map((opt) => (
            <button
              key={opt}
              onClick={() => { onSave(opt); setOpen(false) }}
              className={cn(
                "w-full px-3 py-1.5 text-left text-sm transition-colors",
                opt === value ? "bg-accent/10 text-accent font-medium" : "text-foreground hover:bg-secondary"
              )}
            >
              {opt}
              {opt === value && <Check className="inline h-3 w-3 ml-2" />}
            </button>
          ))}
          {value && (
            <button
              onClick={() => { onSave(""); setOpen(false) }}
              className="w-full px-3 py-1.5 text-left text-sm text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 border-t border-border mt-1 pt-1.5"
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Delete confirmation ───────────────────────────────────────────────

function DeleteConfirmation({ person, onConfirm, onCancel }: { person: Person; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="rounded-xl border border-border bg-card p-6 shadow-xl max-w-sm w-full mx-4">
        <h3 className="text-sm font-semibold text-foreground mb-2">Delete {person.name}?</h3>
        <p className="text-xs text-muted-foreground mb-4">
          This will unlink them from all meetings. This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-secondary transition-colors">
            Cancel
          </button>
          <button onClick={onConfirm} className="px-3 py-1.5 rounded-md text-xs text-white bg-red-500 hover:bg-red-600 transition-colors">
            Delete
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Merge picker ──────────────────────────────────────────────────────

function MergePicker({
  currentPerson,
  allPeople,
  onMerge,
  onClose,
}: {
  currentPerson: Person
  allPeople: Person[]
  onMerge: (mergeId: string) => void
  onClose: () => void
}) {
  const [query, setQuery] = useState("")
  const candidates = allPeople.filter(
    (p) => p.id !== currentPerson.id && p.name.toLowerCase().includes(query.toLowerCase())
  )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="rounded-xl border border-border bg-card p-5 shadow-xl max-w-sm w-full mx-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-foreground">Merge into {currentPerson.name}</h3>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Select a duplicate person to merge. Their meetings and commitments will be linked to {currentPerson.name}.
        </p>
        <div className="relative mb-3">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search people..."
            className="w-full rounded-md border border-border bg-background pl-8 pr-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-accent/40"
            autoFocus
          />
        </div>
        <div className="max-h-48 overflow-y-auto space-y-0.5">
          {candidates.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">No matching people</p>
          ) : (
            candidates.map((p) => (
              <button
                key={p.id}
                onClick={() => onMerge(p.id)}
                className="w-full flex items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-secondary transition-colors"
              >
                <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent/10 text-accent text-[10px] font-medium flex-shrink-0">
                  {p.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">{p.name}</p>
                  {p.email && <p className="text-[10px] text-muted-foreground truncate">{p.email}</p>}
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main PeoplePage ───────────────────────────────────────────────────

const PeoplePage = () => {
  const navigate = useNavigate()
  const { sidebarOpen } = useSidebarVisibility()
  const [people, setPeople] = useState<Person[]>([])
  const [search, setSearch] = useState("")
  const [selectedPerson, setSelectedPerson] = useState<Person | null>(null)
  const [personMeetings, setPersonMeetings] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [deleteTarget, setDeleteTarget] = useState<Person | null>(null)
  const [mergeOpen, setMergeOpen] = useState(false)

  const api = getElectronAPI()

  const loadPeople = useCallback(async () => {
    if (!api?.memory) { setLoading(false); return }
    try {
      const result = await api.memory.people.getAll()
      setPeople(result || [])
    } catch (err) {
      console.error("Failed to load people:", err)
    }
    setLoading(false)
  }, [api])

  useEffect(() => { loadPeople() }, [loadPeople])

  const loadPersonMeetings = useCallback(async (personId: string) => {
    if (!api?.memory) return
    try {
      const meetings = await api.memory.people.getMeetings(personId)
      setPersonMeetings(meetings || [])
    } catch {
      setPersonMeetings([])
    }
  }, [api])

  const handleSelectPerson = useCallback((person: Person) => {
    setSelectedPerson(person)
    loadPersonMeetings(person.id)
  }, [loadPersonMeetings])

  const handleUpdateField = useCallback(async (field: string, value: string) => {
    if (!selectedPerson || !api?.memory) return
    try {
      await api.memory.people.update(selectedPerson.id, { [field]: value })
      const updated = { ...selectedPerson, [field]: value }
      setSelectedPerson(updated)
      setPeople(prev => prev.map(p => p.id === updated.id ? { ...p, [field]: value } : p))
    } catch {
      toast.error("Failed to update")
    }
  }, [selectedPerson, api])

  const handleDelete = useCallback(async () => {
    if (!deleteTarget || !api?.memory) return
    try {
      await api.memory.people.delete(deleteTarget.id)
      setPeople(prev => prev.filter(p => p.id !== deleteTarget.id))
      if (selectedPerson?.id === deleteTarget.id) {
        setSelectedPerson(null)
        setPersonMeetings([])
      }
      toast.success(`${deleteTarget.name} deleted`)
    } catch {
      toast.error("Failed to delete")
    }
    setDeleteTarget(null)
  }, [deleteTarget, api, selectedPerson])

  const handleMerge = useCallback(async (mergeId: string) => {
    if (!selectedPerson || !api?.memory) return
    try {
      await api.memory.people.merge(selectedPerson.id, mergeId)
      toast.success("People merged")
      setMergeOpen(false)
      await loadPeople()
      loadPersonMeetings(selectedPerson.id)
    } catch {
      toast.error("Merge failed")
    }
  }, [selectedPerson, api, loadPeople, loadPersonMeetings])

  const filtered = search
    ? people.filter(p =>
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.email?.toLowerCase().includes(search.toLowerCase()) ||
        p.company?.toLowerCase().includes(search.toLowerCase())
      )
    : people

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
          <div className="mx-auto max-w-4xl px-6 py-8 font-body">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <Users className="h-6 w-6 text-accent" />
                <h1 className="font-display text-2xl text-foreground">People</h1>
                <span className="text-sm text-muted-foreground">
                  {people.length} {people.length === 1 ? "person" : "people"}
                </span>
              </div>
              <button
                onClick={async () => {
                  const result = await api?.contacts?.importVCF?.();
                  if (result?.ok) {
                    toast.success(`Imported ${result.imported} contacts (${result.skipped} already existed)`);
                    loadPeople();
                  } else if (result?.error !== 'Cancelled') {
                    toast.error(result?.error || 'Import failed');
                  }
                }}
                className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
              >
                Import Contacts (.vcf)
              </button>
            </div>

            {/* Search */}
            <div className="relative mb-6">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search people by name, email, or company..."
                className="w-full rounded-lg border border-border bg-card pl-9 pr-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/30"
              />
            </div>

            {loading ? (
              <div className="text-center py-16">
                <p className="text-sm text-muted-foreground">Loading...</p>
              </div>
            ) : people.length === 0 ? (
              <div className="text-center py-16">
                <Users className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-foreground font-medium mb-1">No people yet</p>
                <p className="text-xs text-muted-foreground">
                  Record and summarize meetings — Syag will automatically extract the people you interact with.
                </p>
              </div>
            ) : (
              <div className="flex gap-6">
                {/* People list */}
                <div className={cn("space-y-1", selectedPerson ? "w-1/2" : "w-full")}>
                  {filtered.map((person) => (
                    <button
                      key={person.id}
                      onClick={() => handleSelectPerson(person)}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-lg px-4 py-3 text-left transition-colors",
                        selectedPerson?.id === person.id
                          ? "bg-accent/10 border border-accent/20"
                          : "hover:bg-card border border-transparent hover:border-border"
                      )}
                    >
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-accent/10 text-accent font-medium text-sm flex-shrink-0">
                        {person.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-foreground truncate">{person.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          {person.company && (
                            <span className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                              <Building2 className="h-2.5 w-2.5" />
                              {person.company}
                            </span>
                          )}
                          {person.role && (
                            <span className="text-[11px] text-muted-foreground truncate flex items-center gap-1">
                              <Briefcase className="h-2.5 w-2.5" />
                              {person.role}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
                        {typeof person.meetingCount === "number" && person.meetingCount > 0 && (
                          <span className="text-[10px] text-muted-foreground tabular-nums">
                            {person.meetingCount} {person.meetingCount === 1 ? "meeting" : "meetings"}
                          </span>
                        )}
                        {person.last_seen && (
                          <span className="text-[10px] text-muted-foreground/60">
                            {(() => { try { return format(new Date(person.last_seen), "MMM d") } catch { return "" } })()}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}
                  {filtered.length === 0 && search && (
                    <div className="text-center py-8">
                      <p className="text-sm text-muted-foreground">No people matching "{search}"</p>
                    </div>
                  )}
                </div>

                {/* Person detail panel */}
                {selectedPerson && (
                  <div className="w-1/2 rounded-lg border border-border bg-card p-5 sticky top-4 self-start">
                    {/* Header with actions */}
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-start gap-3 flex-1 min-w-0">
                        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/10 text-accent font-medium text-lg flex-shrink-0">
                          {selectedPerson.name.split(" ").map(n => n[0]).join("").slice(0, 2).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <EditableField
                            value={selectedPerson.name}
                            onSave={(v) => handleUpdateField("name", v)}
                            label="Name"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                        <button
                          onClick={() => setMergeOpen(true)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                          title="Merge with another person"
                        >
                          <Merge className="h-4 w-4" />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(selectedPerson)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
                          title="Delete person"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>

                    {/* Editable fields */}
                    <div className="space-y-2 mb-4">
                      <EditableField
                        value={selectedPerson.email || ""}
                        onSave={(v) => handleUpdateField("email", v)}
                        label="Email"
                        icon={<Mail className="h-3 w-3" />}
                      />
                      <EditableField
                        value={selectedPerson.company || ""}
                        onSave={(v) => handleUpdateField("company", v)}
                        label="Company"
                        icon={<Building2 className="h-3 w-3" />}
                      />
                      <EditableField
                        value={selectedPerson.role || ""}
                        onSave={(v) => handleUpdateField("role", v)}
                        label="Role"
                        icon={<Briefcase className="h-3 w-3" />}
                      />
                      <RelationshipDropdown
                        value={selectedPerson.relationship || ""}
                        onSave={(v) => handleUpdateField("relationship", v)}
                      />
                      <EditableField
                        value={selectedPerson.notes || ""}
                        onSave={(v) => handleUpdateField("notes", v)}
                        label="Personal Notes"
                        placeholder="Add notes about this person..."
                        icon={<StickyNote className="h-3 w-3" />}
                        multiline
                      />
                    </div>

                    {/* Meeting history */}
                    <div className="border-t border-border pt-4">
                      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-3">
                        Meeting History ({personMeetings.length})
                      </h3>
                      {personMeetings.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No meetings found</p>
                      ) : (
                        <div className="space-y-1">
                          {personMeetings.slice(0, 10).map((meeting: any) => (
                            <button
                              key={meeting.id}
                              onClick={() => navigate(`/note/${meeting.id}`)}
                              className="w-full flex items-center gap-2 rounded-md px-2 py-2 text-left hover:bg-secondary transition-colors"
                            >
                              <FileText className="h-3.5 w-3.5 text-muted-foreground/40 flex-shrink-0" />
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-medium text-foreground truncate">{meeting.title}</p>
                                <p className="text-[10px] text-muted-foreground">{meeting.date}</p>
                              </div>
                              <ArrowRight className="h-3 w-3 text-muted-foreground/40" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Modals */}
      {deleteTarget && (
        <DeleteConfirmation
          person={deleteTarget}
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {mergeOpen && selectedPerson && (
        <MergePicker
          currentPerson={selectedPerson}
          allPeople={people}
          onMerge={handleMerge}
          onClose={() => setMergeOpen(false)}
        />
      )}
    </div>
  )
}

export default PeoplePage
