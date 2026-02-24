import { Clock, Users } from "lucide-react";
import type { Meeting } from "@/data/meetings";
import { cn } from "@/lib/utils";

interface MeetingCardProps {
  meeting: Meeting;
  selected: boolean;
  onClick: () => void;
}

export function MeetingCard({ meeting, selected, onClick }: MeetingCardProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full rounded-lg px-3 py-2.5 text-left transition-all",
        selected
          ? "bg-card shadow-sm border border-border"
          : "bg-transparent hover:bg-card/60 border border-transparent"
      )}
    >
      <h3 className="text-[15px] font-normal text-foreground font-body leading-snug">
        {meeting.title}
      </h3>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span>{meeting.time}</span>
        <span>·</span>
        <span className="flex items-center gap-1">
          <Users className="h-2.5 w-2.5" />
          {meeting.participants.slice(0, 2).join(", ")}{meeting.participants.length > 2 ? ` & ${meeting.participants.length - 2} others` : ""}
        </span>
      </div>
    </button>
  );
}
