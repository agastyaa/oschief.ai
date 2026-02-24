import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Normalize LLM chat response for display (Syag-style: trim excess newlines, consistent spacing). */
export function normalizeChatResponse(text: string): string {
  if (!text || typeof text !== "string") return "";
  return text.replace(/\n{3,}/g, "\n\n").trim();
}
