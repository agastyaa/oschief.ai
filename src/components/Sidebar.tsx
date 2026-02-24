import { useState } from "react";
import { FileText, Search, Settings, Sparkles, FolderOpen, Users, Briefcase, Star, Archive, Plus, X, Check, Home, Trash2, Pencil } from "lucide-react";
import { SyagLogo } from "@/components/SyagLogo";
import { cn } from "@/lib/utils";
import { isElectron } from "@/lib/electron-api";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useFolders, type Folder } from "@/contexts/FolderContext";

const iconMap = {
  folder: FolderOpen,
  users: Users,
  briefcase: Briefcase,
  star: Star,
  archive: Archive,
};

export function Sidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { folders, createFolder, deleteFolder, renameFolder } = useFolders();
  const searchQuery = searchParams.get("q") ?? "";
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [editingFolderId, setEditingFolderId] = useState<string | null>(null);
  const [editingFolderName, setEditingFolderName] = useState("");

  const isActive = (path: string) =>
    path === "/" ? location.pathname === "/" : location.pathname.startsWith(path);

  const handleCreateFolder = () => {
    if (newFolderName.trim()) {
      createFolder(newFolderName.trim());
      setNewFolderName("");
      setCreatingFolder(false);
    }
  };

  const handleRenameFolder = (folderId: string) => {
    const name = editingFolderName.trim();
    if (name) {
      renameFolder(folderId, name);
    }
    setEditingFolderId(null);
    setEditingFolderName("");
  };

  return (
    <aside className="flex h-screen w-56 flex-shrink-0 flex-col bg-sidebar">
      {/* Logo — single image, large enough to be visible */}
      <div className={cn("flex items-center px-4 pb-2", isElectron ? "pt-10" : "pt-4")}>
        <SyagLogo size={140} className="max-w-[180px]" />
      </div>

      {/* Search notes — drives home list filter via ?q= */}
      <div className="px-3 py-2">
        <div className="flex items-center gap-2 rounded-md border border-border bg-background/50 px-2 py-1.5">
          <Search className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => {
              const q = e.target.value;
              const next = new URLSearchParams(location.search);
              if (q.trim()) next.set("q", q); else next.delete("q");
              setSearchParams(next, { replace: true });
            }}
            onFocus={() => location.pathname !== "/" && navigate("/")}
            placeholder="Search notes..."
            id="sidebar-search-input"
            className="flex-1 min-w-0 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
            aria-label="Search notes"
          />
        </div>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5 px-3 mt-1">
        <button
          onClick={() => navigate("/")}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
            isActive("/") && !isActive("/notes") && !isActive("/ask") && !isActive("/calendar") && !isActive("/settings") && !location.search.includes("folder")
              ? "bg-secondary text-foreground font-medium"
              : "text-sidebar-foreground hover:bg-secondary/60 hover:text-foreground"
          )}
        >
          <Home className="h-3.5 w-3.5" />
          Home
        </button>
      </nav>

      {/* Folders */}
      <div className="mt-4 px-3">
        <div className="flex items-center justify-between px-2 mb-1">
          <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Folders</span>
          <button
            onClick={() => setCreatingFolder(true)}
            className="rounded p-0.5 text-muted-foreground hover:text-foreground"
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
        <div className="flex flex-col gap-0.5">
          {folders.map((f) => {
            const Icon = iconMap[f.icon] || FolderOpen;
            const isEditing = editingFolderId === f.id;
            return (
              <div
                key={f.id}
                className={cn(
                  "group/folder flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
                  !isEditing && new URLSearchParams(location.search).get("folder") === f.id
                    ? "bg-secondary text-foreground font-medium"
                    : "text-sidebar-foreground hover:bg-secondary/60 hover:text-foreground"
                )}
              >
                {isEditing ? (
                  <>
                    <div className={cn("flex h-4 w-4 items-center justify-center rounded flex-shrink-0", f.color)}>
                      <Icon className="h-2.5 w-2.5" />
                    </div>
                    <input
                      autoFocus
                      value={editingFolderName}
                      onChange={(e) => setEditingFolderName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRenameFolder(f.id);
                        if (e.key === "Escape") { setEditingFolderId(null); setEditingFolderName(""); }
                      }}
                      onBlur={() => handleRenameFolder(f.id)}
                      placeholder="Folder name"
                      className="flex-1 min-w-0 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
                    />
                    <button onClick={() => handleRenameFolder(f.id)} className="rounded p-0.5 text-accent hover:text-accent/80 flex-shrink-0">
                      <Check className="h-3 w-3" />
                    </button>
                    <button onClick={() => { setEditingFolderId(null); setEditingFolderName(""); }} className="rounded p-0.5 text-muted-foreground hover:text-foreground flex-shrink-0">
                      <X className="h-3 w-3" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => navigate(`/?folder=${f.id}`)}
                      className="flex flex-1 items-center gap-2.5 min-w-0"
                    >
                      <div className={cn("flex h-4 w-4 items-center justify-center rounded flex-shrink-0", f.color)}>
                        <Icon className="h-2.5 w-2.5" />
                      </div>
                      <span className="truncate">{f.name}</span>
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingFolderId(f.id);
                        setEditingFolderName(f.name);
                      }}
                      className="hidden group-hover/folder:block rounded p-0.5 text-muted-foreground hover:text-foreground flex-shrink-0"
                      aria-label="Rename folder"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteFolder(f.id);
                        if (new URLSearchParams(location.search).get("folder") === f.id) {
                          navigate("/");
                        }
                      }}
                      className="hidden group-hover/folder:block rounded p-0.5 text-muted-foreground hover:text-destructive flex-shrink-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </>
                )}
              </div>
            );
          })}

          {/* Inline create folder */}
          {creatingFolder && (
            <div className="flex items-center gap-1 px-2 py-1">
              <div className="flex h-4 w-4 items-center justify-center rounded bg-accent/20 text-accent flex-shrink-0">
                <FolderOpen className="h-2.5 w-2.5" />
              </div>
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreateFolder();
                  if (e.key === "Escape") { setCreatingFolder(false); setNewFolderName(""); }
                }}
                placeholder="Folder name"
                className="flex-1 min-w-0 bg-transparent text-[13px] text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button onClick={handleCreateFolder} className="rounded p-0.5 text-accent hover:text-accent/80">
                <Check className="h-3 w-3" />
              </button>
              <button onClick={() => { setCreatingFolder(false); setNewFolderName(""); }} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

        </div>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom controls */}
      <div className="flex flex-col gap-0.5 px-3 pb-2">
        <button
          onClick={() => navigate("/ask")}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
            isActive("/ask")
              ? "bg-secondary text-foreground font-medium"
              : "text-sidebar-foreground hover:bg-secondary/60 hover:text-foreground"
          )}
        >
          <Sparkles className="h-3.5 w-3.5" />
          Syag Chat
        </button>
        <button
          onClick={() => navigate("/calendar")}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
            isActive("/calendar")
              ? "bg-secondary text-foreground font-medium"
              : "text-sidebar-foreground hover:bg-secondary/60 hover:text-foreground"
          )}
        >
          <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="3" width="12" height="11" rx="1.5" />
            <path d="M2 6.5h12M5.5 2v2M10.5 2v2" />
          </svg>
          Calendar
        </button>
        <button
          onClick={() => navigate("/settings")}
          className={cn(
            "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] transition-colors",
            isActive("/settings")
              ? "bg-secondary text-foreground font-medium"
              : "text-sidebar-foreground hover:bg-secondary/60 hover:text-foreground"
          )}
        >
          <Settings className="h-3.5 w-3.5" />
          Settings
        </button>
      </div>

      <div className="h-2" />
    </aside>
  );
}
