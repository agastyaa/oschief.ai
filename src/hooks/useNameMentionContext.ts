import { useEffect, useRef, useState, useCallback } from "react";
import { getElectronAPI } from "@/lib/electron-api";
import {
  loadAccountFromStorage,
  accountNameAppearsInText,
  formatRecentTranscriptForMention,
} from "@/lib/account-context";

const COOLDOWN_MS = 75_000;

const STATIC_HINT =
  "You were mentioned in the conversation.";

const LLM_SYSTEM =
  "You help someone who was just addressed by name in a live meeting transcript. In one concise sentence (no greeting), state what topic or question they should speak to, or what others seem to expect from them. If unclear, say what the discussion is about right now.";

type Line = { speaker: string; time: string; text: string };

/**
 * Detects when the user's name appears in the live transcript and shows a
 * static "you were mentioned" hint. The LLM context call only fires when
 * the user explicitly triggers it (click).
 */
export function useNameMentionContext(
  transcriptLines: Line[],
  recordingState: "recording" | "paused" | "stopped",
  selectedAIModel: string | null | undefined,
  meetingTitle: string,
  usingRealAudio: boolean,
  noteId: string
) {
  const [mentionHint, setMentionHint] = useState<string | null>(null);
  const [mentionHintLoading, setMentionHintLoading] = useState(false);
  const lastMentionLlmAt = useRef(0);
  const dismissedRef = useRef(false);
  const prevLenForDismissRef = useRef(0);
  const processedLineKeyRef = useRef("");
  const hasSeededRef = useRef(false);
  const lastNoteIdRef = useRef(noteId);
  const linesRef = useRef(transcriptLines);
  linesRef.current = transcriptLines;

  const onDismissMentionHint = useCallback(() => {
    dismissedRef.current = true;
    setMentionHint(null);
    setMentionHintLoading(false);
  }, []);

  const triggerMentionLLM = useCallback(async () => {
    if (!selectedAIModel) return;
    const api = getElectronAPI();
    if (!api?.llm?.chat) return;
    if (Date.now() - lastMentionLlmAt.current < COOLDOWN_MS) return;

    setMentionHintLoading(true);
    try {
      const account = loadAccountFromStorage();
      const name = account.name?.trim() || "User";
      const recent = formatRecentTranscriptForMention(linesRef.current, 14);
      const userContent = `Meeting: ${meetingTitle || "Untitled"}\nUser's name (mentioned): ${name}\n\nRecent transcript:\n${recent}`;

      const response = await api.llm.chat({
        messages: [
          { role: "system", content: LLM_SYSTEM },
          { role: "user", content: userContent },
        ],
        model: selectedAIModel,
      });
      const line = (response || "").trim().split(/\n+/)[0]?.trim() || "";
      setMentionHint(line || STATIC_HINT);
      lastMentionLlmAt.current = Date.now();
    } catch {
      setMentionHint("Couldn\u2019t load a quick summary. Try Ask with \u201CWhat should I say?\u201D");
    } finally {
      setMentionHintLoading(false);
    }
  }, [selectedAIModel, meetingTitle]);

  useEffect(() => {
    if (noteId !== lastNoteIdRef.current) {
      lastNoteIdRef.current = noteId;
      processedLineKeyRef.current = "";
      hasSeededRef.current = false;
      prevLenForDismissRef.current = 0;
      setMentionHint(null);
      setMentionHintLoading(false);
    }
  }, [noteId]);

  useEffect(() => {
    if (!usingRealAudio || recordingState !== "recording") {
      if (recordingState !== "recording") {
        setMentionHint(null);
        setMentionHintLoading(false);
      }
      return;
    }

    const account = loadAccountFromStorage();
    const name = account.name?.trim();
    if (!name || name.length < 2) return;

    const len = transcriptLines.length;
    if (len === 0) return;
    const last = transcriptLines[len - 1];

    if (len > prevLenForDismissRef.current) {
      dismissedRef.current = false;
    }
    prevLenForDismissRef.current = len;

    const lineKey = `${len}|${last.time}|${last.text.slice(0, 400)}`;

    if (!hasSeededRef.current) {
      hasSeededRef.current = true;
      if (len > 1) {
        processedLineKeyRef.current = lineKey;
        return;
      }
    }

    if (lineKey === processedLineKeyRef.current) return;
    if (!accountNameAppearsInText(name, last.text)) return;
    if (dismissedRef.current) return;

    processedLineKeyRef.current = lineKey;
    setMentionHint(STATIC_HINT);
  }, [transcriptLines, recordingState, usingRealAudio, noteId]);

  return { mentionHint, mentionHintLoading, onDismissMentionHint, triggerMentionLLM };
}
