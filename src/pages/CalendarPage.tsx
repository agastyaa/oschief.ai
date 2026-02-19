import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { meetings } from "@/data/meetings";
import { useNavigate } from "react-router-dom";

const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const feb2026 = Array.from({ length: 28 }, (_, i) => i + 1);
const startDayOffset = 6;

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
        <div className="mx-auto max-w-4xl px-6 py-8">
          <div className="mb-6 flex items-center justify-between">
            <h1 className="font-display text-2xl text-foreground">February 2026</h1>
            <div className="flex items-center gap-1.5">
              <button className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground">
                Today
              </button>
              <button className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-7 border-b border-border">
            {daysOfWeek.map((d) => (
              <div key={d} className="px-2 py-2 text-center text-[11px] font-medium text-muted-foreground">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {Array.from({ length: startDayOffset }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[100px] border-b border-r border-border p-1.5" />
            ))}
            {feb2026.map((day) => {
              const dayMeetings = getMeetingsForDay(day);
              const isToday = day === 14;
              return (
                <div key={day} className="min-h-[100px] border-b border-r border-border p-1.5 transition-colors hover:bg-card/60">
                  <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                    isToday ? "bg-accent text-accent-foreground font-semibold" : "text-foreground"
                  }`}>
                    {day}
                  </span>
                  <div className="mt-0.5 space-y-0.5">
                    {dayMeetings.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => navigate(`/meeting/${m.id}`)}
                        className="block w-full truncate rounded bg-sage-light px-1.5 py-0.5 text-left text-[10px] font-medium text-accent transition-all hover:bg-accent hover:text-accent-foreground"
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
