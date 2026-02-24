import { useState, useMemo } from "react";
import { Check, Circle, Pencil, Plus, Trash2 } from "lucide-react";
import { parse, startOfWeek, endOfWeek, isWithinInterval, format, parseISO, isValid } from "date-fns";
import type { SavedNote } from "@/contexts/NotesContext";

type ActionItemWithSource = {
  noteId: string;
  index: number;
  text: string;
  assignee: string;
  done: boolean;
  dueDate?: string;
};

export type ManualActionItem = {
  id: string;
  text: string;
  assignee: string;
  done: boolean;
  dueDate?: string;
};

function parseNoteDate(dateStr: string): Date | null {
  try {
    return parse(dateStr.trim(), "MMM d, yyyy", new Date());
  } catch {
    return null;
  }
}

function getActionsThisWeek(notes: SavedNote[]): ActionItemWithSource[] {
  const now = new Date();
  const start = startOfWeek(now, { weekStartsOn: 1 });
  const end = endOfWeek(now, { weekStartsOn: 1 });
  const out: ActionItemWithSource[] = [];
  for (const note of notes) {
    const d = parseNoteDate(note.date);
    if (!d || !isWithinInterval(d, { start, end })) continue;
    const steps = note.summary?.nextSteps ?? [];
    steps.forEach((s, i) => {
      out.push({ noteId: note.id, index: i, text: s.text, assignee: s.assignee, done: s.done, dueDate: s.dueDate });
    });
  }
  return out;
}

interface ActionItemsThisWeekProps {
  notes: SavedNote[];
  updateNote: (id: string, updates: Partial<SavedNote>) => void;
  manualItems?: ManualActionItem[];
  onAddManual?: () => void;
  onUpdateManual?: (id: string, patch: Partial<ManualActionItem>) => void;
  onRemoveManual?: (id: string) => void;
}

export function ActionItemsThisWeek({
  notes,
  updateNote,
  manualItems = [],
  onAddManual,
  onUpdateManual,
  onRemoveManual,
}: ActionItemsThisWeekProps) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  const actions = useMemo(() => getActionsThisWeek(notes), [notes]);
  const allItems = useMemo(() => {
    const fromNotes: { key: string; source: "note"; item: ActionItemWithSource }[] = actions.map((item) => ({
      key: `${item.noteId}-${item.index}`,
      source: "note",
      item,
    }));
    const fromManual: { key: string; source: "manual"; item: ManualActionItem }[] = manualItems.map((m) => ({
      key: `manual-${m.id}`,
      source: "manual",
      item: m,
    }));
    return [...fromNotes, ...fromManual];
  }, [actions, manualItems]);

  const handleToggle = (item: ActionItemWithSource) => {
    const note = notes.find((n) => n.id === item.noteId);
    if (!note?.summary) return;
    const nextSteps = [...(note.summary.nextSteps ?? [])];
    if (nextSteps[item.index] == null) return;
    nextSteps[item.index] = { ...nextSteps[item.index], done: !nextSteps[item.index].done };
    updateNote(note.id, { summary: { ...note.summary, nextSteps } });
  };

  const handleStartEdit = (item: ActionItemWithSource) => {
    setEditingKey(`${item.noteId}-${item.index}`);
    setEditText(item.text);
  };

  const handleSaveEdit = (item: ActionItemWithSource) => {
    const note = notes.find((n) => n.id === item.noteId);
    if (!note?.summary || editText.trim() === item.text) {
      setEditingKey(null);
      return;
    }
    const nextSteps = [...(note.summary.nextSteps ?? [])];
    if (nextSteps[item.index] == null) {
      setEditingKey(null);
      return;
    }
    nextSteps[item.index] = { ...nextSteps[item.index], text: editText.trim() };
    updateNote(note.id, { summary: { ...note.summary, nextSteps } });
    setEditingKey(null);
  };

  const handleDueDateChange = (item: ActionItemWithSource, value: string) => {
    const note = notes.find((n) => n.id === item.noteId);
    if (!note?.summary) return;
    const nextSteps = [...(note.summary.nextSteps ?? [])];
    if (nextSteps[item.index] == null) return;
    nextSteps[item.index] = { ...nextSteps[item.index], dueDate: value || undefined };
    updateNote(note.id, { summary: { ...note.summary, nextSteps } });
  };

  const handleToggleManual = (item: ManualActionItem) => {
    onUpdateManual?.(item.id, { done: !item.done });
  };

  const handleStartEditManual = (item: ManualActionItem) => {
    setEditingKey(`manual-${item.id}`);
    setEditText(item.text);
  };

  const handleSaveEditManual = (item: ManualActionItem) => {
    if (editText.trim() !== item.text) onUpdateManual?.(item.id, { text: editText.trim() });
    setEditingKey(null);
  };

  const handleDueDateChangeManual = (item: ManualActionItem, value: string) => {
    onUpdateManual?.(item.id, { dueDate: value || undefined });
  };

  const emptyState = allItems.length === 0;

  const formatDueDate = (dueDate?: string) => {
    if (!dueDate) return null;
    try {
      const d = dueDate.includes("-") ? parseISO(dueDate) : parse(dueDate.trim(), "MMM d, yyyy", new Date());
      return isValid(d) ? format(d, "MMM d, yyyy") : null;
    } catch {
      return null;
    }
  };

  return (
    <div className="mb-8">
      <h2 className="text-sm font-medium text-foreground mb-3">Action items</h2>
      <div className="rounded-xl border border-border bg-card/50 overflow-hidden">
        {emptyState ? (
          <div className="px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">No action items</p>
            <p className="text-xs text-muted-foreground mt-1">They’ll appear here from your meeting notes, or add your own</p>
            {onAddManual && (
              <button
                type="button"
                onClick={onAddManual}
                className="mt-4 inline-flex items-center gap-1.5 rounded-md bg-accent/10 text-accent px-3 py-1.5 text-sm font-medium hover:bg-accent/20 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Add action item
              </button>
            )}
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 px-4 py-2 bg-muted/30 border-b border-border text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
              <span className="w-8" aria-hidden />
              <span>Tasks</span>
              <span className="min-w-[6rem]">Deadline</span>
              <span className="w-8" aria-hidden />
              <span className="w-8" aria-hidden />
            </div>
            <div className="divide-y divide-border">
              {allItems.map(({ key, source, item }) => {
                const isNote = source === "note";
                const noteItem = isNote ? (item as ActionItemWithSource) : null;
                const manualItem = !isNote ? (item as ManualActionItem) : null;
                const isEditing = editingKey === key;
                const text = isNote ? noteItem!.text : manualItem!.text;
                const assignee = isNote ? noteItem!.assignee : manualItem!.assignee;
                const done = isNote ? noteItem!.done : manualItem!.done;
                const dueDate = isNote ? noteItem!.dueDate : manualItem!.dueDate;
                const displayDue = dueDate && (dueDate.includes("-") ? dueDate : formatDueDate(dueDate));

                return (
                  <div
                    key={key}
                    className="grid grid-cols-[auto_1fr_auto_auto_auto] gap-2 items-center px-4 py-2.5 group"
                  >
                    <button
                      type="button"
                      onClick={() => (isNote ? handleToggle(noteItem!) : handleToggleManual(manualItem!))}
                      className="flex-shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label={done ? "Mark undone" : "Mark done"}
                      title={done ? "Done" : "Pending"}
                    >
                      {done ? (
                        <Check className="h-4 w-4 text-accent" />
                      ) : (
                        <Circle className="h-4 w-4" />
                      )}
                    </button>
                    <div className="min-w-0 flex flex-col gap-0.5">
                      {isEditing ? (
                        <input
                          autoFocus
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          onBlur={() => (isNote ? handleSaveEdit(noteItem!) : handleSaveEditManual(manualItem!))}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") isNote ? handleSaveEdit(noteItem!) : handleSaveEditManual(manualItem!);
                            if (e.key === "Escape") setEditingKey(null);
                          }}
                          className="w-full text-sm text-foreground bg-transparent border border-border rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-ring"
                        />
                      ) : (
                        <span
                          className={`text-sm ${done ? "line-through text-muted-foreground" : "text-foreground"}`}
                        >
                          {text}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1 min-w-0">
                      <input
                        type="date"
                        value={dueDate && dueDate.includes("-") ? dueDate : ""}
                        onChange={(e) =>
                          isNote ? handleDueDateChange(noteItem!, e.target.value) : handleDueDateChangeManual(manualItem!, e.target.value)
                        }
                        className="text-[12px] bg-transparent border border-border rounded px-2 py-1 max-w-[8rem] text-foreground focus:ring-1 focus:ring-ring outline-none"
                        title="Deadline"
                      />
                      {displayDue && (!dueDate || !dueDate.includes("-")) && (
                        <span className="text-[11px] text-muted-foreground truncate">{displayDue}</span>
                      )}
                    </div>
                    {!isEditing && (
                      <button
                        type="button"
                        onClick={() => (isNote ? handleStartEdit(noteItem!) : handleStartEditManual(manualItem!))}
                        className="flex-shrink-0 p-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-foreground transition-opacity"
                        aria-label="Edit"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {!isNote && onRemoveManual && (
                      <button
                        type="button"
                        onClick={() => onRemoveManual(manualItem!.id)}
                        className="flex-shrink-0 p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
                        aria-label="Remove"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {isNote && <span className="w-8" />}
                  </div>
                );
              })}
            </div>
            {onAddManual && (
              <div className="border-t border-border px-4 py-2 bg-muted/20">
                <button
                  type="button"
                  onClick={onAddManual}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add action item
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
