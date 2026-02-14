import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { meetings } from "@/data/meetings";
import { useNavigate } from "react-router-dom";

const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Generate a simple Feb 2026 calendar
const feb2026 = Array.from({ length: 28 }, (_, i) => i + 1);
const startDayOffset = 6; // Feb 1, 2026 is a Sunday → index 6

export default function CalendarPage() {
  const navigate = useNavigate();

  const getMeetingsForDay = (day: number) => {
    return meetings.filter((m) => {
      const match = m.date.match(/Feb (\d+)/);
      return match && parseInt(match[1]) === day;
    });
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-8 py-10">
          <div className="mb-8 flex items-center justify-between">
            <h1 className="font-display text-3xl font-bold text-foreground">February 2026</h1>
            <div className="flex items-center gap-2">
              <button className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <button className="rounded-lg border border-border px-3 py-1.5 text-sm font-medium text-foreground">
                Today
              </button>
              <button className="rounded-lg border border-border p-2 text-muted-foreground hover:bg-secondary hover:text-foreground">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Grid Header */}
          <div className="grid grid-cols-7 border-b border-border">
            {daysOfWeek.map((d) => (
              <div key={d} className="px-2 py-3 text-center text-xs font-medium text-muted-foreground">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7">
            {/* empty cells for offset */}
            {Array.from({ length: startDayOffset }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[120px] border-b border-r border-border p-2" />
            ))}
            {feb2026.map((day) => {
              const dayMeetings = getMeetingsForDay(day);
              const isToday = day === 14;
              return (
                <div
                  key={day}
                  className="min-h-[120px] border-b border-r border-border p-2 transition-colors hover:bg-card/60"
                >
                  <span
                    className={`inline-flex h-7 w-7 items-center justify-center rounded-full text-sm ${
                      isToday
                        ? "bg-primary text-primary-foreground font-semibold"
                        : "text-foreground"
                    }`}
                  >
                    {day}
                  </span>
                  <div className="mt-1 space-y-1">
                    {dayMeetings.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => navigate(`/meeting/${m.id}`)}
                        className="block w-full truncate rounded-md bg-sage-light px-2 py-1 text-left text-[11px] font-medium text-accent transition-all hover:bg-accent hover:text-accent-foreground"
                      >
                        {m.time} {m.title}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}
