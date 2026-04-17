import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { getElectronAPI } from '@/lib/electron-api'
import { SectionHeader } from '../shared/primitives'

export function VaultSection({ api }: { api: ReturnType<typeof getElectronAPI> }) {
  const [vaultPath, setVaultPath] = useState<string | null>(null);
  const [vaultName, setVaultName] = useState<string | null>(null);
  const [configured, setConfigured] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  useEffect(() => {
    api?.vault?.getConfig().then((config) => {
      setVaultPath(config.path);
      setVaultName(config.vaultName);
      setConfigured(config.configured);
      if (config.validation?.warning) setWarning(config.validation.warning);
    });
  }, [api]);

  const handlePickFolder = async () => {
    if (!api?.vault) return;
    const result = await api.vault.pickFolder?.();
    if (result?.ok) {
      setVaultPath(result.path);
      setVaultName(result.vaultName);
      setConfigured(true);
      setWarning(result.warning || null);
      toast.success(`Vault connected: ${result.vaultName || result.path}`);
    } else if (result?.error && result.error !== 'Cancelled') {
      toast.error(result.error);
    }
  };

  return (
    <div className="space-y-5">
      <SectionHeader title="Obsidian Vault" description="Connect your Obsidian vault to export meeting notes with rich metadata, people links, and project connections" />
      <div className="space-y-4">
        <div className="rounded-[10px] border border-border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">Vault Location</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {configured ? (
                  <span className="font-mono">{vaultPath}</span>
                ) : (
                  "No vault configured — export a note to set it up"
                )}
              </div>
            </div>
            {configured && vaultName && (
              <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-green-bg text-green">
                {vaultName}
              </span>
            )}
          </div>
          {warning && (
            <div className="text-xs text-amber flex items-center gap-1.5">
              <span>⚠</span> {warning}
            </div>
          )}
          <button
            onClick={handlePickFolder}
            className="w-full flex items-center justify-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary transition-colors"
          >
            {configured ? "Change Vault Folder" : "Connect Obsidian Vault"}
          </button>
          <div className="text-xs text-muted-foreground">
            When you export a note, OSChief writes structured markdown with YAML frontmatter, [[wikilinks]] to people and projects, and updates people files automatically.
          </div>
        </div>
      </div>
    </div>
  );
}
