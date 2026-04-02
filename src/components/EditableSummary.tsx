import { useState, useEffect, useCallback, memo } from "react";
import {
  CheckCircle2, Circle, Pencil, Users, X, Copy, Check, ExternalLink
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  overviewToMarkdown,
  topicsToMarkdown,
  keyPointsToMarkdown,
  decisionsToMarkdown,
  actionItemsToMarkdown,
  keyQuotesToMarkdown,
} from "@/lib/export-markdown";
import { JiraCreateTicketDialog } from "@/components/JiraCreateTicketDialog";
import { JiraStatusBadge } from "@/components/JiraStatusBadge";
import { AsanaCreateTaskDialog } from "@/components/AsanaCreateTaskDialog";

/** Small copy-to-clipboard button that appears on hover with check feedback */
function CopyButton({ getText }: { getText: () => string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation();
    const text = getText();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard access denied */ }
  }, [getText]);

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center opacity-0 group-hover/section:opacity-100 transition-opacity ml-1.5 p-0.5 rounded hover:bg-secondary/50"
      title="Copy section"
    >
      {copied ? (
        <Check className="h-3 w-3 text-accent" />
      ) : (
        <Copy className="h-3 w-3 text-muted-foreground/50" />
      )}
    </button>
  );
}

type BulletWithSub = { text: string; subBullets?: string[] };

function parseBulletsWithSub(text: string): BulletWithSub[] {
  const lines = text.split("\n").map((l) => l.trimEnd());
  const result: BulletWithSub[] = [];
  for (const line of lines) {
    if (/^\s{2,}-\s+/.test(line) || (line.startsWith("  - ") && !line.startsWith("    "))) {
      const sub = line.replace(/^\s*-\s*/, "").trim();
      if (result.length > 0 && sub) {
        const last = result[result.length - 1];
        last.subBullets = last.subBullets || [];
        last.subBullets.push(sub);
      }
    } else if (/^-\s+/.test(line)) {
      result.push({ text: line.replace(/^-\s*/, "").trim() });
    }
  }
  return result;
}

function serializeBullets(bullets: BulletWithSub[]): string {
  return bullets
    .map((b) => {
      if (b.subBullets?.length) {
        return `- ${b.text}\n${b.subBullets.map((s) => `  - ${s}`).join("\n")}`;
      }
      return `- ${b.text}`;
    })
    .join("\n");
}

/** Strip **bold** markdown so raw asterisks are not shown in the UI. */
function stripBoldMarkdown(s: string): string {
  if (typeof s !== "string") return s;
  return s.replace(/\*\*([^*]*)\*\*/g, "$1");
}

/** Capitalize first character for display (e.g. action item text). */
function capitalizeFirst(s: string): string {
  if (typeof s !== "string" || s.length === 0) return s;
  const first = s[0];
  if (/[a-z]/.test(first)) return first.toUpperCase() + s.slice(1);
  return s;
}

interface DiscussionTopic {
  topic: string;
  summary: string;
  speakers: string[];
}

interface ActionItem {
  text: string;
  assignee: string;
  dueDate?: string;
  priority: "high" | "medium" | "low";
  done: boolean;
  jiraIssueKey?: string;
  jiraIssueUrl?: string;
  asanaTaskGid?: string;
  asanaTaskUrl?: string;
}

interface KeyQuote {
  speaker: string;
  text: string;
}

export interface SummaryData {
  title?: string;
  meetingType?: string;
  attendees?: string[];
  overview: string;
  decisions?: string[];
  discussionTopics?: DiscussionTopic[];
  keyPoints?: string[];
  actionItems?: ActionItem[];
  nextSteps?: { text: string; assignee: string; done: boolean }[];
  questionsAndOpenItems?: string[];
  followUps?: string[];
  keyQuotes?: KeyQuote[];
  attachments?: { type: "image"; url: string }[];
}

interface EditableSummaryProps {
  summary: SummaryData;
  onUpdate?: (summary: SummaryData) => void;
  meetingTitle?: string;
  meetingDate?: string;
}

export const EditableSummary = memo(function EditableSummary({ summary, onUpdate, meetingTitle, meetingDate }: EditableSummaryProps) {
  const [editingField, setEditingField] = useState<string | null>(null);
  const [localSummary, setLocalSummary] = useState<SummaryData>(summary);
  const [jiraDialogItem, setJiraDialogItem] = useState<{ index: number; item: ActionItem } | null>(null);
  const [asanaDialogItem, setAsanaDialogItem] = useState<{ index: number; item: ActionItem } | null>(null);
  useEffect(() => {
    setLocalSummary(summary);
  }, [summary]);

  const commit = (updated: SummaryData) => {
    setLocalSummary(updated);
    onUpdate?.(updated);
    setEditingField(null);
  };

  const handleOverviewChange = (value: string) => {
    commit({ ...localSummary, overview: value });
  };

  const handleTopicTitleChange = (topicIndex: number, value: string) => {
    const next = [...(localSummary.discussionTopics || [])];
    if (next[topicIndex]) next[topicIndex] = { ...next[topicIndex], topic: value };
    commit({ ...localSummary, discussionTopics: next });
  };

  const handleTopicSummaryChange = (topicIndex: number, bullets: BulletWithSub[]) => {
    const next = [...(localSummary.discussionTopics || [])];
    if (next[topicIndex]) next[topicIndex] = { ...next[topicIndex], summary: serializeBullets(bullets) };
    commit({ ...localSummary, discussionTopics: next });
  };

  const handleKeyPointChange = (index: number, value: string) => {
    const next = [...(localSummary.keyPoints || [])];
    next[index] = value;
    commit({ ...localSummary, keyPoints: next });
  };

  const handleDecisionChange = (index: number, value: string) => {
    const next = [...(localSummary.decisions || [])];
    next[index] = value;
    commit({ ...localSummary, decisions: next });
  };

  const handleActionTextChange = (rawIndex: number, value: string) => {
    const items = [...(localSummary.actionItems || localSummary.nextSteps || [])];
    if (items[rawIndex]) items[rawIndex] = { ...items[rawIndex], text: value };
    const updated = localSummary.actionItems
      ? { ...localSummary, actionItems: items as ActionItem[] }
      : { ...localSummary, nextSteps: items };
    setLocalSummary(updated);
    onUpdate?.(updated);
    setEditingField(null);
  };

  const handleActionAssigneeChange = (rawIndex: number, value: string) => {
    const items = [...(localSummary.actionItems || localSummary.nextSteps || [])];
    if (items[rawIndex]) items[rawIndex] = { ...items[rawIndex], assignee: value.trim() || "Unassigned" };
    const updated = localSummary.actionItems
      ? { ...localSummary, actionItems: items as ActionItem[] }
      : { ...localSummary, nextSteps: items };
    setLocalSummary(updated);
    onUpdate?.(updated);
    setEditingField(null);
  };

  const handleToggleActionDone = (rawIndex: number) => {
    const items = [...(localSummary.actionItems || localSummary.nextSteps || [])];
    items[rawIndex] = { ...items[rawIndex], done: !items[rawIndex].done };
    const updated = localSummary.actionItems
      ? { ...localSummary, actionItems: items as ActionItem[] }
      : { ...localSummary, nextSteps: items };
    setLocalSummary(updated);
    onUpdate?.(updated);
  };

  const handleAddAttachment = (url: string) => {
    const next = [...(localSummary.attachments || []), { type: "image" as const, url }];
    commit({ ...localSummary, attachments: next });
  };

  const handleRemoveAttachment = (index: number) => {
    const next = (localSummary.attachments || []).filter((_, i) => i !== index);
    commit({ ...localSummary, attachments: next.length ? next : undefined });
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type.startsWith("image/")) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = () => {
          const url = reader.result as string;
          if (url) handleAddAttachment(url);
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  };

  const rawActions = localSummary.actionItems || localSummary.nextSteps?.map((s) => ({
    ...s,
    priority: "medium" as const,
    dueDate: undefined,
  })) || [];
  const actionsWithIndices = rawActions.map((a, i) => ({ item: a, rawIndex: i }));
  const actions = actionsWithIndices.map((x) => x.item);
  const topics = localSummary.discussionTopics || [];
  const keyPoints = localSummary.keyPoints || [];
  const decisions = localSummary.decisions || [];
  const quotes = localSummary.keyQuotes || [];
  const attendees = localSummary.attendees || [];
  const attachments = localSummary.attachments || [];

  return (
    <div className="animate-fade-in space-y-2.5 font-body" onPaste={handlePaste}>
      {attendees.length > 0 && (
        <div className="flex items-center gap-1.5 flex-wrap">
          <Users className="h-3 w-3 text-muted-foreground/40" />
          {attendees.map((a, i) => (
            <span key={i} className="text-[13px] font-medium text-foreground/80">{a}{i < attendees.length - 1 ? "," : ""}</span>
          ))}
        </div>
      )}

      {localSummary.overview && (
        <div className="group/section">
          {editingField === "overview" ? (
            <textarea
              autoFocus
              defaultValue={localSummary.overview}
              onBlur={(e) => handleOverviewChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleOverviewChange((e.target as HTMLTextAreaElement).value);
                }
                if (e.key === "Escape") setEditingField(null);
              }}
              className="w-full resize-none bg-transparent text-[14px] leading-snug font-medium text-foreground focus:outline-none"
              rows={2}
            />
          ) : (
            <p
              onClick={() => setEditingField("overview")}
              className="text-[14px] leading-snug font-medium text-foreground cursor-text hover:bg-secondary/30 rounded px-1 -mx-1 transition-colors"
            >
              {stripBoldMarkdown(localSummary.overview)}
              <Pencil className="inline-block ml-1 h-2.5 w-2.5 text-muted-foreground/0 group-hover/section:text-muted-foreground/30 transition-colors" />
              <CopyButton getText={() => overviewToMarkdown(localSummary)} />
            </p>
          )}
        </div>
      )}

      {topics.map((topic, i) => {
        const bullets = parseBulletsWithSub(topic.summary);
        if (bullets.length === 0) return null;
        return (
          <div key={i} className="group/section">
            {editingField === `topic-title-${i}` ? (
              <input
                autoFocus
                defaultValue={topic.topic}
                onBlur={(e) => {
                  handleTopicTitleChange(i, e.target.value);
                  setEditingField(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleTopicTitleChange(i, (e.target as HTMLInputElement).value);
                    setEditingField(null);
                  }
                  if (e.key === "Escape") setEditingField(null);
                }}
                className="text-[14px] font-semibold text-foreground bg-transparent border-none outline-none focus:ring-0 w-full mb-0.5"
              />
            ) : (
              <h3
                onClick={() => setEditingField(`topic-title-${i}`)}
                className="text-[14px] font-semibold text-foreground mb-0.5 cursor-text hover:bg-secondary/30 rounded px-1 -mx-1 transition-colors"
              >
                {stripBoldMarkdown(topic.topic)}
                <Pencil className="inline-block ml-1 h-2.5 w-2.5 text-muted-foreground/0 group-hover/section:text-muted-foreground/30" />
              </h3>
            )}
            <ul className="space-y-0.5">
              {bullets.map((bullet, j) => (
                <li key={j} className="text-[14px] leading-snug">
                  <div className="flex gap-1.5">
                    <span className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-foreground/15" />
                    {editingField === `topic-${i}-bullet-${j}` ? (
                      <input
                        autoFocus
                        defaultValue={bullet.text}
                        onBlur={(e) => {
                          const next = [...bullets];
                          next[j] = { ...next[j], text: e.target.value };
                          handleTopicSummaryChange(i, next);
                          setEditingField(null);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const next = [...bullets];
                            next[j] = { ...next[j], text: (e.target as HTMLInputElement).value };
                            handleTopicSummaryChange(i, next);
                            setEditingField(null);
                          }
                          if (e.key === "Escape") setEditingField(null);
                        }}
                        className="flex-1 bg-transparent border-none outline-none focus:ring-0 font-medium text-foreground/90"
                      />
                    ) : (
                      <span
                        onClick={() => setEditingField(`topic-${i}-bullet-${j}`)}
                        className="font-medium text-foreground/90 cursor-text hover:bg-secondary/30 rounded px-1 -mx-1"
                      >
                        {stripBoldMarkdown(bullet.text)}
                      </span>
                    )}
                  </div>
                  {bullet.subBullets && bullet.subBullets.length > 0 && (
                    <ul className="pl-6 mt-0.5 space-y-0.5">
                      {bullet.subBullets.map((sub, k) => (
                        <li key={k} className="flex gap-1.5">
                          <span className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-foreground/10" />
                          {editingField === `topic-${i}-bullet-${j}-sub-${k}` ? (
                            <input
                              autoFocus
                              defaultValue={sub}
                              onBlur={(e) => {
                                const next = [...bullets];
                                next[j] = {
                                  ...next[j],
                                  subBullets: [...(next[j].subBullets || [])],
                                };
                                next[j].subBullets![k] = e.target.value;
                                handleTopicSummaryChange(i, next);
                                setEditingField(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  const next = [...bullets];
                                  next[j] = {
                                    ...next[j],
                                    subBullets: [...(next[j].subBullets || [])],
                                  };
                                  next[j].subBullets![k] = (e.target as HTMLInputElement).value;
                                  handleTopicSummaryChange(i, next);
                                  setEditingField(null);
                                }
                                if (e.key === "Escape") setEditingField(null);
                              }}
                              className="flex-1 bg-transparent border-none outline-none focus:ring-0 text-[14px] text-foreground/80"
                            />
                          ) : (
                            <span
                              onClick={() => setEditingField(`topic-${i}-bullet-${j}-sub-${k}`)}
                              className="text-[14px] text-foreground/80 cursor-text hover:bg-secondary/30 rounded px-1 -mx-1"
                            >
                              {stripBoldMarkdown(sub)}
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {decisions.length > 0 && (
        <div className="group/section">
          <h3 className="text-[14px] font-semibold text-foreground mb-0.5 flex items-center">Decisions<CopyButton getText={() => decisionsToMarkdown(localSummary)} /></h3>
          <ul className="space-y-0.5">
            {decisions.map((d, i) => (
              <li key={i} className="flex gap-1.5 text-[14px] font-medium text-foreground/90 leading-snug">
                <span className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-accent" />
                {editingField === `decision-${i}` ? (
                  <input
                    autoFocus
                    defaultValue={d}
                    onBlur={(e) => {
                      handleDecisionChange(i, e.target.value);
                      setEditingField(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleDecisionChange(i, (e.target as HTMLInputElement).value);
                        setEditingField(null);
                      }
                      if (e.key === "Escape") setEditingField(null);
                    }}
                    className="flex-1 bg-transparent border-none outline-none focus:ring-0"
                  />
                ) : (
                  <span
                    onClick={() => setEditingField(`decision-${i}`)}
                    className="cursor-text hover:bg-secondary/30 rounded px-1 -mx-1"
                  >
                    {stripBoldMarkdown(d)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {keyPoints.length > 0 && topics.length === 0 && (
        <div className="group/section">
          <h3 className="text-[14px] font-semibold text-foreground mb-0.5 flex items-center">Key Points<CopyButton getText={() => keyPointsToMarkdown(localSummary)} /></h3>
          <ul className="space-y-0.5">
            {keyPoints.map((point, i) => (
              <li key={i} className="flex gap-1.5 text-[14px] font-medium text-foreground/90 leading-snug">
                <span className="mt-[7px] h-1 w-1 flex-shrink-0 rounded-full bg-foreground/15" />
                {editingField === `keypoint-${i}` ? (
                  <input
                    autoFocus
                    defaultValue={point}
                    onBlur={(e) => {
                      handleKeyPointChange(i, e.target.value);
                      setEditingField(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleKeyPointChange(i, (e.target as HTMLInputElement).value);
                        setEditingField(null);
                      }
                      if (e.key === "Escape") setEditingField(null);
                    }}
                    className="flex-1 bg-transparent border-none outline-none focus:ring-0"
                  />
                ) : (
                  <span
                    onClick={() => setEditingField(`keypoint-${i}`)}
                    className="cursor-text hover:bg-secondary/30 rounded px-1 -mx-1"
                  >
                    {stripBoldMarkdown(point)}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {actions.length > 0 && (
        <div className="group/section">
          <h3 className="text-[14px] font-semibold text-foreground mb-1 flex items-center">Action items<CopyButton getText={() => actionItemsToMarkdown(localSummary)} /></h3>
          <div className="rounded-md border border-border overflow-hidden">
            <table className="w-full border-collapse text-[14px]">
              <thead>
                <tr className="border-b border-border bg-muted/30 text-left text-[12px] text-muted-foreground font-medium">
                  <th className="w-8 p-1.5" aria-label="Done" />
                  <th className="w-7 p-1.5">#</th>
                  <th className="p-1.5 min-w-0">Task</th>
                  <th className="w-28 p-1.5">Assignee</th>
                  <th className="w-24 p-1.5">Due</th>
                  <th className="w-16 p-1.5" aria-label="Integrations" />
                </tr>
              </thead>
              <tbody>
                {actionsWithIndices.map(({ item, rawIndex }, i) => {
                  const assigneeTrim = (item.assignee || "").trim();
                  const isUnassigned = !assigneeTrim || ["You", "Unassigned", "[Unassigned]", "TBD"].includes(assigneeTrim);
                  const isMe = assigneeTrim === "Me";
                  const assigneeDisplay = isUnassigned ? "Unassigned" : stripBoldMarkdown(item.assignee || "");
                  const dueStr = "dueDate" in item && item.dueDate ? item.dueDate : null;
                  return (
                    <tr key={i} className="group/action border-b border-border/50 last:border-b-0 hover:bg-muted/20 transition-colors">
                      <td className="p-1.5 align-top">
                        <button onClick={() => handleToggleActionDone(rawIndex)} className="flex-shrink-0">
                          {item.done ? (
                            <CheckCircle2 className="h-4 w-4 text-accent" />
                          ) : (
                            <Circle className="h-4 w-4 text-foreground/25 hover:text-foreground/50 transition-colors" />
                          )}
                        </button>
                      </td>
                      <td className="p-1.5 align-top text-muted-foreground">{i + 1}.</td>
                      <td className="p-1.5 align-top min-w-0 break-words">
                        {editingField === `action-${i}` ? (
                          <input
                            autoFocus
                            defaultValue={item.text}
                            onBlur={(e) => {
                              handleActionTextChange(rawIndex, e.target.value);
                              setEditingField(null);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                handleActionTextChange(rawIndex, (e.target as HTMLInputElement).value);
                                setEditingField(null);
                              }
                              if (e.key === "Escape") setEditingField(null);
                            }}
                            className={cn(
                              "w-full text-[14px] bg-transparent border border-border rounded px-1.5 py-0.5 outline-none focus:ring-1 focus:ring-ring text-foreground",
                              item.done && "text-muted-foreground/60 line-through"
                            )}
                          />
                        ) : (
                          <span
                            onClick={() => setEditingField(`action-${i}`)}
                            className={cn(
                              "block text-[14px] leading-snug cursor-text hover:bg-secondary/20 rounded px-1 -mx-1 py-0.5 break-words",
                              item.done ? "text-muted-foreground/60 line-through" : "text-foreground/95"
                            )}
                          >
                            {capitalizeFirst(stripBoldMarkdown(item.text))}
                          </span>
                        )}
                        {/* Due date shown in its own column */}
                      </td>
                      <td className="p-1.5 align-top text-[12px] text-muted-foreground whitespace-nowrap">
                        {editingField === `action-assignee-${i}` ? (
                          <div className="flex items-center gap-0.5">
                            <input
                              data-action-assignee-input={i}
                              autoFocus
                              defaultValue={item.assignee || ""}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  handleActionAssigneeChange(rawIndex, (e.target as HTMLInputElement).value);
                                  setEditingField(null);
                                }
                                if (e.key === "Escape") setEditingField(null);
                              }}
                              className="min-w-[4rem] flex-1 text-[12px] bg-transparent border border-border rounded px-1 py-0.5 outline-none focus:ring-1 focus:ring-ring text-foreground"
                              placeholder="Assignee"
                            />
                            <button
                              onClick={() => {
                                const input = document.querySelector(`[data-action-assignee-input="${i}"]`) as HTMLInputElement;
                                if (input) handleActionAssigneeChange(rawIndex, input.value);
                                setEditingField(null);
                              }}
                              className="p-0.5 rounded hover:bg-secondary text-accent"
                              title="Save"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => setEditingField(null)}
                              className="p-0.5 rounded hover:bg-secondary text-muted-foreground"
                              title="Cancel"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : isUnassigned ? (
                          <span className="inline-flex items-center gap-1">
                            <span>Unassigned</span>
                            <button
                              onClick={() => handleActionAssigneeChange(rawIndex, "Me")}
                              className="text-[11px] font-medium text-accent hover:underline"
                            >
                              Me
                            </button>
                            <span className="text-muted-foreground/30">|</span>
                            <button
                              onClick={() => setEditingField(`action-assignee-${i}`)}
                              className="text-[11px] font-medium text-accent hover:underline"
                            >
                              Other
                            </button>
                          </span>
                        ) : isMe ? (
                          <span
                            onClick={() => setEditingField(`action-assignee-${i}`)}
                            className="cursor-text hover:bg-secondary/30 rounded px-0.5 -mx-0.5 inline-flex items-center gap-0.5"
                            title="Click to edit assignee"
                          >
                            Me
                            <Pencil className="h-2.5 w-2.5 text-muted-foreground/0 group-hover/action:text-muted-foreground/50 transition-colors" />
                          </span>
                        ) : (
                          <span
                            onClick={() => setEditingField(`action-assignee-${i}`)}
                            className="cursor-text hover:bg-secondary/30 rounded px-0.5 -mx-0.5 inline-flex items-center gap-0.5"
                            title="Click to edit assignee"
                          >
                            {assigneeDisplay}
                            <Pencil className="h-2.5 w-2.5 text-muted-foreground/0 group-hover/action:text-muted-foreground/50 transition-colors" />
                          </span>
                        )}
                      </td>
                      <td className="p-1.5 align-top text-[12px] text-muted-foreground whitespace-nowrap">
                        {dueStr || <span className="text-muted-foreground/30">—</span>}
                      </td>
                      <td className="p-1.5 align-top">
                        <div className="flex items-center gap-0.5">
                          {item.asanaTaskGid && item.asanaTaskUrl ? (
                            <a href={item.asanaTaskUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 text-[10px] text-pink-600 hover:text-pink-700" title="Open in Asana">
                              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="7.5" r="2.5"/><circle cx="6" cy="16.5" r="2.5"/><circle cx="18" cy="16.5" r="2.5"/></svg>
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          ) : item.jiraIssueKey && item.jiraIssueUrl ? (
                            <JiraStatusBadge issueKey={item.jiraIssueKey} issueUrl={item.jiraIssueUrl} />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setAsanaDialogItem({ index: rawIndex, item })}
                              className="opacity-0 group-hover/action:opacity-100 transition-opacity inline-flex items-center justify-center rounded p-1 text-muted-foreground/60 hover:text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-950/30"
                              title="Create Asana task"
                              aria-label="Create Asana task"
                            >
                              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                                <circle cx="12" cy="7.5" r="2.5"/><circle cx="6" cy="16.5" r="2.5"/><circle cx="18" cy="16.5" r="2.5"/>
                              </svg>
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Jira Create Ticket Dialog */}
      {jiraDialogItem && (
        <JiraCreateTicketDialog
          open
          onClose={() => setJiraDialogItem(null)}
          actionItemText={jiraDialogItem.item.text}
          assignee={jiraDialogItem.item.assignee}
          priority={jiraDialogItem.item.priority}
          dueDate={jiraDialogItem.item.dueDate}
          meetingTitle={meetingTitle}
          meetingDate={meetingDate}
          onCreated={(issueKey, issueUrl) => {
            // Update the action item with Jira info
            const items = [...(localSummary.actionItems || localSummary.nextSteps || [])] as ActionItem[];
            if (items[jiraDialogItem.index]) {
              items[jiraDialogItem.index] = {
                ...items[jiraDialogItem.index],
                jiraIssueKey: issueKey,
                jiraIssueUrl: issueUrl,
              };
            }
            const updated = localSummary.actionItems
              ? { ...localSummary, actionItems: items }
              : { ...localSummary, nextSteps: items };
            commit(updated);
            setJiraDialogItem(null);
          }}
        />
      )}

      {/* Asana Create Task Dialog */}
      {asanaDialogItem && (
        <AsanaCreateTaskDialog
          open
          onClose={() => setAsanaDialogItem(null)}
          actionItemText={asanaDialogItem.item.text}
          assignee={asanaDialogItem.item.assignee}
          dueDate={asanaDialogItem.item.dueDate}
          meetingTitle={meetingTitle}
          meetingDate={meetingDate}
          onCreated={(taskGid, taskUrl) => {
            const items = [...(localSummary.actionItems || localSummary.nextSteps || [])] as ActionItem[];
            if (items[asanaDialogItem.index]) {
              items[asanaDialogItem.index] = {
                ...items[asanaDialogItem.index],
                asanaTaskGid: taskGid,
                asanaTaskUrl: taskUrl,
              };
            }
            const updated = localSummary.actionItems
              ? { ...localSummary, actionItems: items }
              : { ...localSummary, nextSteps: items };
            commit(updated);
            setAsanaDialogItem(null);
          }}
        />
      )}

      {quotes.length > 0 && (
        <div className="pt-1 group/section">
          {quotes.map((q, i) => (
            <blockquote key={i} className="border-l-2 border-accent/20 pl-2.5 py-0.5">
              <p className="text-[14px] italic font-medium text-foreground/80">"{stripBoldMarkdown(q.text)}"</p>
              <p className="text-[12px] text-muted-foreground/70">— {stripBoldMarkdown(q.speaker)}</p>
            </blockquote>
          ))}
        </div>
      )}

      {attachments.length > 0 && (
        <div className="pt-2">
          <h3 className="text-[14px] font-semibold text-foreground mb-1">Attachments</h3>
          <div className="flex flex-wrap gap-2">
            {attachments.map((att, i) => (
              <div key={i} className="relative group/thumb rounded-[10px] border border-border overflow-hidden bg-muted/30">
                <a
                  href={att.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block max-h-[120px] max-w-[180px]"
                >
                  <img
                    src={att.url}
                    alt=""
                    className="h-[120px] w-auto object-contain"
                  />
                </a>
                <button
                  type="button"
                  onClick={() => handleRemoveAttachment(i)}
                  className="absolute top-1 right-1 p-1 rounded bg-background/80 border border-border opacity-0 group-hover/thumb:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
                  aria-label="Remove image"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
});
