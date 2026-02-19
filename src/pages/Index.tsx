import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { Plus, FolderOpen, ArrowLeft } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AskBar } from "@/components/AskBar";
import { useFolders } from "@/contexts/FolderContext";

const Index = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { folders } = useFolders();

  const activeFolderId = searchParams.get("folder");
  const activeFolder = activeFolderId ? folders.find((f) => f.id === activeFolderId) : null;

  // Folder view
  if (activeFolder) {
    return (
      <div className="flex h-screen overflow-hidden bg-background">
        <Sidebar />
        <main className="flex flex-1 flex-col min-w-0 relative">
          <div className="flex-1 overflow-y-auto pb-24">
            <div className="mx-auto max-w-2xl px-6 py-8">
              <div className="flex items-center gap-3 mb-6">
                <button
                  onClick={() => navigate("/")}
                  className="rounded-md p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-accent" />
                  <h1 className="font-display text-xl text-foreground">{activeFolder.name}</h1>
                </div>
              </div>

              <div className="text-center py-16">
                <FolderOpen className="h-10 w-10 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No notes in this folder yet</p>
                <p className="text-xs text-muted-foreground mt-1">Record a note and add it to this folder</p>
              </div>
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0">
            <AskBar context="home" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex flex-1 flex-col min-w-0 relative">
        <div className="flex-1 overflow-y-auto pb-24">
          <div className="mx-auto max-w-2xl px-6 py-8">
            {/* Quick Note top-right */}
            <div className="flex items-center justify-end mb-6">
              <button
                onClick={() => navigate("/new-note")}
                className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-all hover:opacity-90"
              >
                <Plus className="h-3.5 w-3.5" />
                Quick Note
              </button>
            </div>

            {/* Empty state */}
            <div className="text-center py-20">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-accent/10 text-accent mx-auto mb-4">
                <Plus className="h-6 w-6" />
              </div>
              <h2 className="font-display text-lg text-foreground mb-2">No notes yet</h2>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                Start a quick recording to capture your first meeting notes.
              </p>
              <button
                onClick={() => navigate("/new-note")}
                className="mt-5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground transition-all hover:opacity-90"
              >
                Start Recording
              </button>
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0">
          <AskBar context="home" />
        </div>
      </main>
    </div>
  );
};

export default Index;
