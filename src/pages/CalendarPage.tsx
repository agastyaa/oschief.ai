import { useState } from "react";
import { ChevronLeft, ChevronRight, Calendar, Link2 } from "lucide-react";
import { Sidebar } from "@/components/Sidebar";
import { PanelLeftClose, PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const daysOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getStartDayOffset(year: number, month: number) {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // Monday = 0
}

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export default function CalendarPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const daysInMonth = getDaysInMonth(year, month);
  const startOffset = getStartDayOffset(year, month);
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const isToday = (day: number) =>
    day === today.getDate() && month === today.getMonth() && year === today.getFullYear();

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  };

  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  };

  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <div className={cn(
        "transition-all duration-300 ease-in-out overflow-hidden flex-shrink-0",
        sidebarOpen ? "w-56" : "w-0"
      )}>
        <Sidebar />
      </div>
      <main className="flex-1 overflow-y-auto">
        <div className="flex items-center gap-2 px-6 pt-4 pb-2">
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {sidebarOpen ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeft className="h-4 w-4" />}
          </button>
        </div>

        <div className="mx-auto max-w-4xl px-6 pb-8">
          {/* Connect prompt */}
          <div className="mb-6 rounded-xl border border-border bg-card p-6 text-center">
            <Calendar className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <h2 className="text-[15px] font-medium text-foreground mb-1">No calendar linked</h2>
            <p className="text-[13px] text-muted-foreground mb-4">Connect your calendar to see upcoming meetings and auto-record</p>
            <div className="flex items-center justify-center gap-2">
              <button className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors">
                <Link2 className="h-3.5 w-3.5" />
                Connect Google Calendar
              </button>
              <button className="flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-xs font-medium text-foreground hover:bg-secondary transition-colors">
                <Link2 className="h-3.5 w-3.5" />
                Connect Outlook
              </button>
            </div>
          </div>

          {/* Calendar header */}
          <div className="mb-6 flex items-center justify-between">
            <h1 className="font-display text-2xl text-foreground">{monthNames[month]} {year}</h1>
            <div className="flex items-center gap-1.5">
              <button onClick={prevMonth} className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <button onClick={goToday} className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground">
                Today
              </button>
              <button onClick={nextMonth} className="rounded-md border border-border p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground">
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Day headers */}
          <div className="grid grid-cols-7 border-b border-border">
            {daysOfWeek.map((d) => (
              <div key={d} className="px-2 py-2 text-center text-[11px] font-medium text-muted-foreground">
                {d}
              </div>
            ))}
          </div>

          {/* Calendar grid */}
          <div className="grid grid-cols-7">
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[100px] border-b border-r border-border p-1.5" />
            ))}
            {days.map((day) => (
              <div key={day} className="min-h-[100px] border-b border-r border-border p-1.5 transition-colors hover:bg-card/60">
                <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-xs ${
                  isToday(day) ? "bg-accent text-accent-foreground font-semibold" : "text-foreground"
                }`}>
                  {day}
                </span>
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
