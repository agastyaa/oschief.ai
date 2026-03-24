import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

/**
 * Renders assistant chat message content as markdown with standard AI-chat styling
 * (ChatGPT, Granola, Claude style: headings, lists, code, bold, etc.).
 */
export function ChatMessageContent({
  text,
  className,
  prose = true,
}: {
  text: string;
  className?: string;
  prose?: boolean;
}) {
  if (!text?.trim()) return null;

  return (
    <div
      className={cn(
        "text-[14px] leading-relaxed text-foreground",
        prose && "prose prose-sm dark:prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-headings:font-semibold prose-headings:text-foreground prose-headings:mt-3 prose-headings:mb-1.5 prose-pre:my-2 prose-pre:border prose-pre:border-border/50 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:bg-muted/80 prose-code:text-foreground prose-code:before:content-none prose-code:after:content-none",
        className
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
