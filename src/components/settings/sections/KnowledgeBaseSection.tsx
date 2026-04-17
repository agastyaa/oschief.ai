import { useState, useEffect } from 'react'
import { FolderOpen, RefreshCw, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { getElectronAPI } from '@/lib/electron-api'
import { SectionHeader } from '../shared/primitives'

export function KnowledgeBaseSection({ api }: { api: ReturnType<typeof getElectronAPI> }) {
  const [folderPath, setFolderPath] = useState<string>("");
  const [chunkCount, setChunkCount] = useState(0);
  const [scanning, setScanning] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    api?.db.settings.get("kb-folder-path").then((p) => { if (p) setFolderPath(p) });
    api?.kb?.getChunkCount().then(setChunkCount);
  }, [api]);

  const handlePickFolder = async () => {
    if (!api?.kb) return;
    setScanning(true);
    setStatus(null);
    try {
      const result = await api.kb.pickFolder();
      if (result.ok && result.path) {
        setFolderPath(result.path);
        setChunkCount(result.total ?? 0);
        setStatus(`Indexed ${result.added ?? 0} new files, ${result.total ?? 0} chunks total`);
      }
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    }
    setScanning(false);
  };

  const handleRescan = async () => {
    if (!api?.kb) return;
    setScanning(true);
    setStatus(null);
    try {
      const result = await api.kb.scan();
      if (result.ok) {
        setChunkCount(result.total ?? 0);
        setStatus(`Scan complete: +${result.added ?? 0} added, ${result.updated ?? 0} updated, ${result.removed ?? 0} removed — ${result.total ?? 0} chunks`);
      } else {
        setStatus(result.error || "Scan failed");
      }
    } catch (err: any) {
      setStatus(`Error: ${err.message}`);
    }
    setScanning(false);
  };

  const handleClear = async () => {
    if (!api?.kb) return;
    await api.kb.clear();
    setFolderPath("");
    setChunkCount(0);
    setStatus("Knowledge base cleared");
  };

  return (
    <div className="space-y-5">
      <SectionHeader title="Knowledge Base" description="Point OSChief at a folder of notes — it will search them during live meetings and suggest relevant talking points" />
      <div className="space-y-4">
        <div className="rounded-[10px] border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-body-sm font-medium text-foreground flex items-center gap-2">
                <FolderOpen className="h-3.5 w-3.5 text-accent" />
                Notes folder
              </p>
              {folderPath ? (
                <p className="text-[11px] text-muted-foreground mt-1 font-mono truncate max-w-[320px]">{folderPath}</p>
              ) : (
                <p className="text-[11px] text-muted-foreground mt-1">No folder selected</p>
              )}
            </div>
            <button
              onClick={handlePickFolder}
              disabled={scanning}
              className="rounded-md border border-border bg-secondary/50 px-3 py-1.5 text-[12px] font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
            >
              {folderPath ? "Change" : "Select folder"}
            </button>
          </div>

          {folderPath && (
            <div className="flex items-center justify-between border-t border-border pt-3">
              <p className="text-[12px] text-muted-foreground">
                <span className="font-medium text-foreground">{chunkCount}</span> chunks indexed
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleRescan}
                  disabled={scanning}
                  className="flex items-center gap-1.5 rounded-md border border-border bg-secondary/50 px-2.5 py-1 text-[11px] font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                >
                  <RefreshCw className={cn("h-3 w-3", scanning && "animate-spin")} />
                  Rescan
                </button>
                <button
                  onClick={handleClear}
                  className="flex items-center gap-1.5 rounded-md border border-destructive/30 px-2.5 py-1 text-[11px] font-medium text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="h-3 w-3" />
                  Clear
                </button>
              </div>
            </div>
          )}

          {status && (
            <p className="text-[11px] text-muted-foreground border-t border-border pt-2">{status}</p>
          )}
        </div>

        <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
          <p className="text-[11px] text-primary leading-relaxed">
            <strong>How it works:</strong> OSChief reads .md and .txt files from this folder, chunks and indexes them locally. During live meetings, it searches your notes for context relevant to the conversation and suggests talking points — powered by your selected AI model. Everything stays on your machine.
          </p>
        </div>
      </div>
    </div>
  );
}
