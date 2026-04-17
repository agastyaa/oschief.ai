import { useState, useEffect } from 'react'
import { Trash2, ChevronUp, ChevronDown, Plus } from 'lucide-react'
import { getElectronAPI } from '@/lib/electron-api'
import { BUILTIN_TEMPLATES } from '@/data/templates'
import { SectionHeader } from '../shared/primitives'

export function TemplatesSection() {
  const api = getElectronAPI();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [customTemplates, setCustomTemplates] = useState<Array<{ id: string; name: string; prompt: string }>>([]);
  const [newName, setNewName] = useState("");

  useEffect(() => {
    if (!api) return;
    api.db.settings.get("custom-templates").then((val: string | null) => {
      if (val) {
        try { setCustomTemplates(JSON.parse(val)); } catch {}
      }
    });
  }, []);

  const addCustomTemplate = () => {
    if (!newName.trim()) return;
    const id = `custom-${Date.now()}`;
    const updated = [...customTemplates, { id, name: newName.trim(), prompt: "" }];
    setCustomTemplates(updated);
    setNewName("");
    setExpandedId(id);
    if (api) api.db.settings.set("custom-templates", JSON.stringify(updated));
  };

  const updateCustomTemplate = (id: string, field: "name" | "prompt", value: string) => {
    const updated = customTemplates.map((t) => (t.id === id ? { ...t, [field]: value } : t));
    setCustomTemplates(updated);
    if (api) {
      api.db.settings.set("custom-templates", JSON.stringify(updated));
      if (field === "prompt") {
        api.db.settings.set(`template-prompt-${id}`, value);
      }
    }
  };

  const deleteCustomTemplate = (id: string) => {
    const updated = customTemplates.filter((t) => t.id !== id);
    setCustomTemplates(updated);
    if (api) api.db.settings.set("custom-templates", JSON.stringify(updated));
  };

  return (
    <div className="space-y-5">
      <SectionHeader title="Note Templates" description="Customize the prompts used to generate meeting notes for each template type" />

      <div className="space-y-2">
        <h3 className="text-body-sm font-medium text-foreground">Built-in Templates</h3>
        <p className="text-[11px] text-muted-foreground mb-2">Industry-standard templates. Locked; use as-is. Default is General.</p>
        {BUILTIN_TEMPLATES.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span>{t.icon}</span>
              <span className="text-body-sm font-medium text-foreground">{t.name}</span>
            </div>
            <span className="text-[10px] text-muted-foreground px-2 py-0.5 rounded-full border border-border">Locked</span>
          </div>
        ))}
      </div>

      <div className="space-y-2">
        <h3 className="text-body-sm font-medium text-foreground">Custom Templates</h3>
        {customTemplates.map((ct) => {
          const isExpanded = expandedId === ct.id;
          return (
            <div key={ct.id} className="rounded-md border border-border bg-card overflow-hidden">
              <button
                onClick={() => setExpandedId(isExpanded ? null : ct.id)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left hover:bg-secondary/50 transition-colors"
              >
                <span className="text-body-sm font-medium text-foreground">{ct.name}</span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteCustomTemplate(ct.id); }}
                    className="rounded p-1 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                  {isExpanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                </div>
              </button>
              {isExpanded && (
                <div className="px-3 pb-3 border-t border-border space-y-2">
                  <div className="mt-2">
                    <label className="text-[11px] text-muted-foreground">Template name</label>
                    <input
                      value={ct.name}
                      onChange={(e) => updateCustomTemplate(ct.id, "name", e.target.value)}
                      className="w-full rounded-md border border-border bg-background px-3 py-1.5 text-body-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 mt-1"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] text-muted-foreground">Custom prompt</label>
                    <textarea
                      value={ct.prompt}
                      onChange={(e) => updateCustomTemplate(ct.id, "prompt", e.target.value)}
                      placeholder="Describe how notes should be structured for this type of meeting..."
                      className="w-full rounded-md border border-border bg-background px-3 py-2 text-body-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 resize-none mt-1"
                      rows={5}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
        <div className="flex gap-2 mt-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addCustomTemplate()}
            placeholder="New template name..."
            className="flex-1 rounded-md border border-border bg-card px-3 py-1.5 text-body-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20"
          />
          <button
            onClick={addCustomTemplate}
            disabled={!newName.trim()}
            className="flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-[12px] text-foreground hover:bg-secondary transition-colors disabled:opacity-40"
          >
            <Plus className="h-3 w-3" />
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
