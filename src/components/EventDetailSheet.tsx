import { CalendarEvent } from "@/lib/ics-parser";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Calendar, Clock, MapPin, FileText, Mic } from "lucide-react";
import { format } from "date-fns";
import { useNavigate } from "react-router-dom";

interface EventDetailSheetProps {
  event: CalendarEvent | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function EventDetailSheet({ event, open, onOpenChange }: EventDetailSheetProps) {
  const navigate = useNavigate();

  if (!event) return null;

  const isSameDay =
    format(new Date(event.start), "yyyy-MM-dd") === format(new Date(event.end), "yyyy-MM-dd");

  const handleStartNotes = () => {
    onOpenChange(false);
    // Navigate to new-note with event context
    navigate("/new-note", { state: { eventTitle: event.title, eventId: event.id } });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader className="text-left pb-4">
          <SheetTitle className="text-xl font-medium font-body leading-snug pr-6">
            {event.title}
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4">
          {/* Date & time */}
          <div className="flex items-start gap-3">
            <Calendar className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-foreground">
                {format(new Date(event.start), "EEEE, MMMM d, yyyy")}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                <Clock className="inline h-3 w-3 mr-1 -mt-0.5" />
                {format(new Date(event.start), "h:mm a")}
                {" — "}
                {isSameDay
                  ? format(new Date(event.end), "h:mm a")
                  : format(new Date(event.end), "MMM d, h:mm a")}
              </p>
            </div>
          </div>

          {/* Location */}
          {event.location && (
            <div className="flex items-start gap-3">
              <MapPin className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-sm text-foreground">{event.location}</p>
            </div>
          )}

          {/* Description */}
          {event.description && (
            <div className="flex items-start gap-3">
              <FileText className="h-4 w-4 text-muted-foreground mt-0.5 flex-shrink-0" />
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed max-h-48 overflow-y-auto">
                {event.description}
              </p>
            </div>
          )}

          {/* Start Notes CTA */}
          <div className="pt-4 border-t border-border">
            <Button onClick={handleStartNotes} className="w-full gap-2" size="sm">
              <Mic className="h-4 w-4" />
              Start Notes for this Meeting
            </Button>
            <p className="text-[11px] text-muted-foreground text-center mt-2">
              Record and transcribe this meeting
            </p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
