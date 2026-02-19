import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export interface Folder {
  id: string;
  name: string;
  color: string;
  icon: "folder" | "users" | "briefcase" | "star" | "archive";
}

interface FolderContextType {
  folders: Folder[];
  createFolder: (name: string) => Folder;
  deleteFolder: (id: string) => void;
  renameFolder: (id: string, name: string) => void;
  noteFolders: Record<string, string>; // meetingId -> folderId
  addNoteToFolder: (noteId: string, folderId: string) => void;
  removeNoteFromFolder: (noteId: string) => void;
  getNotesInFolder: (folderId: string) => string[];
}

const LS_KEY = "syag-folders";

const defaultFolders: Folder[] = [
  { id: "team-meetings", name: "Team meetings", color: "bg-accent/20 text-accent", icon: "users" },
  { id: "sales-calls", name: "Sales calls", color: "bg-amber-100 text-amber-700", icon: "briefcase" },
];

const colors = [
  "bg-accent/20 text-accent",
  "bg-amber-100 text-amber-700",
  "bg-blue-100 text-blue-700",
  "bg-rose-100 text-rose-700",
  "bg-purple-100 text-purple-700",
  "bg-emerald-100 text-emerald-700",
];

function loadFolders(): { folders: Folder[]; noteFolders: Record<string, string> } {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { folders: defaultFolders, noteFolders: {} };
}

const FolderContext = createContext<FolderContextType | null>(null);

export function FolderProvider({ children }: { children: ReactNode }) {
  const stored = loadFolders();
  const [folders, setFolders] = useState<Folder[]>(stored.folders);
  const [noteFolders, setNoteFolders] = useState<Record<string, string>>(stored.noteFolders);

  useEffect(() => {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ folders, noteFolders }));
    } catch {}
  }, [folders, noteFolders]);

  const createFolder = (name: string): Folder => {
    const folder: Folder = {
      id: `folder-${Date.now()}`,
      name,
      color: colors[folders.length % colors.length],
      icon: "folder",
    };
    setFolders((prev) => [...prev, folder]);
    return folder;
  };

  const deleteFolder = (id: string) => {
    setFolders((prev) => prev.filter((f) => f.id !== id));
    setNoteFolders((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => { if (next[k] === id) delete next[k]; });
      return next;
    });
  };

  const renameFolder = (id: string, name: string) => {
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
  };

  const addNoteToFolder = (noteId: string, folderId: string) => {
    setNoteFolders((prev) => ({ ...prev, [noteId]: folderId }));
  };

  const removeNoteFromFolder = (noteId: string) => {
    setNoteFolders((prev) => {
      const next = { ...prev };
      delete next[noteId];
      return next;
    });
  };

  const getNotesInFolder = (folderId: string) => {
    return Object.entries(noteFolders).filter(([_, fId]) => fId === folderId).map(([nId]) => nId);
  };

  return (
    <FolderContext.Provider value={{ folders, createFolder, deleteFolder, renameFolder, noteFolders, addNoteToFolder, removeNoteFromFolder, getNotesInFolder }}>
      {children}
    </FolderContext.Provider>
  );
}

export function useFolders() {
  const ctx = useContext(FolderContext);
  if (!ctx) throw new Error("useFolders must be used within FolderProvider");
  return ctx;
}
