import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { isElectron, getElectronAPI } from "@/lib/electron-api";

export interface Folder {
  id: string;
  name: string;
  color: string;
  icon: "folder" | "users" | "briefcase" | "star" | "archive";
}

interface FolderContextType {
  folders: Folder[];
  createFolder: (name: string) => Folder;
  getOrCreateFolderByName: (name: string) => Folder;
  deleteFolder: (id: string) => void;
  renameFolder: (id: string, name: string) => void;
}

const LS_KEY = "syag-folders";

const colors = [
  "bg-accent/20 text-accent",
  "bg-amber-bg text-amber-text",
  "bg-primary/10 text-primary",
  "bg-destructive/10 text-destructive",
  "bg-green-bg text-green-text",
  "bg-muted text-muted-foreground",
];

function loadFoldersFromLS(): { folders: Folder[]; noteFolders: Record<string, string> } {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { folders: [], noteFolders: {} };
}

const FolderContext = createContext<FolderContextType | null>(null);

export function FolderProvider({ children }: { children: ReactNode }) {
  const api = getElectronAPI();
  const stored = isElectron ? { folders: [], noteFolders: {} } : loadFoldersFromLS();
  const [folders, setFolders] = useState<Folder[]>(stored.folders);

  useEffect(() => {
    if (api) {
      api.db.folders.getAll().then((dbFolders) => setFolders(dbFolders));
    }
  }, []);

  useEffect(() => {
    if (!api) {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify({ folders, noteFolders: {} }));
      } catch {}
    }
  }, [folders]);

  const createFolder = (name: string): Folder => {
    const folder: Folder = {
      id: `folder-${Date.now()}`,
      name,
      color: colors[folders.length % colors.length],
      icon: "folder",
    };
    setFolders((prev) => [...prev, folder]);
    if (api) {
      api.db.folders.add(folder).catch(console.error);
    }
    return folder;
  };

  const getOrCreateFolderByName = (name: string): Folder => {
    const trimmed = (name || "").trim();
    const key = trimmed.toLowerCase();
    const existing = folders.find((f) => f.name.toLowerCase() === key);
    if (existing) return existing;
    return createFolder(trimmed || "Meetings");
  };

  const deleteFolder = (id: string) => {
    setFolders((prev) => prev.filter((f) => f.id !== id));
    if (api) {
      api.db.folders.delete(id).catch(console.error);
    }
  };

  const renameFolder = useCallback((id: string, name: string) => {
    setFolders((prev) => prev.map((f) => (f.id === id ? { ...f, name } : f)));
    if (api) {
      api.db.folders.update(id, { name }).catch(console.error);
    }
  }, [api]);

  return (
    <FolderContext.Provider value={{ folders, createFolder, getOrCreateFolderByName, deleteFolder, renameFolder }}>
      {children}
    </FolderContext.Provider>
  );
}

export function useFolders() {
  const ctx = useContext(FolderContext);
  if (!ctx) throw new Error("useFolders must be used within FolderProvider");
  return ctx;
}
