import { ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

interface JiraStatusBadgeProps {
  issueKey: string;
  issueUrl: string;
}

export function JiraStatusBadge({ issueKey, issueUrl }: JiraStatusBadgeProps) {
  return (
    <a
      href={issueUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        "bg-blue-50 dark:bg-blue-950/30 text-blue-600 dark:text-blue-400",
        "border border-blue-200 dark:border-blue-800",
        "hover:bg-blue-100 dark:hover:bg-blue-950/50 transition-colors"
      )}
      title={`Open ${issueKey} in Jira`}
    >
      <svg className="h-2.5 w-2.5" viewBox="0 0 24 24" fill="currentColor">
        <path d="M11.53 2L3 10.53V14.47L11.53 22L14.47 22L22 14.47V10.53L11.53 2Z" />
      </svg>
      {issueKey}
      <ExternalLink className="h-2 w-2" />
    </a>
  );
}
