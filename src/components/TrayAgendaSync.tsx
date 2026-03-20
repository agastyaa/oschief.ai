import { useEffect, useCallback } from "react";
import { addDays, endOfDay, format, startOfDay } from "date-fns";
import { getElectronAPI, isElectron } from "@/lib/electron-api";
import { useCalendar } from "@/contexts/CalendarContext";
import { useNotes } from "@/contexts/NotesContext";
import type { CalendarEvent } from "@/lib/ics-parser";

/** Upcoming events beyond the today/tomorrow window so the tray can show the next meeting. */
const TRAY_AGENDA_EXTRA_UPCOMING = 5;

/**
 * Pushes a filtered snapshot of calendar events to the main process for the tray popover.
 */
export function TrayAgendaSync() {
  const api = getElectronAPI();
  const { events } = useCalendar();
  const { notes } = useNotes();

  const findNote = useCallback(
    (evt: CalendarEvent) => {
      const eventDate = format(new Date(evt.start), "MMM d, yyyy");
      if (evt.noteId) return notes.find((n) => n.id === evt.noteId) ?? null;
      return (
        notes.find(
          (n) => n.calendarEventId === evt.id || (n.title === evt.title && n.date === eventDate)
        ) ?? null
      );
    },
    [notes]
  );

  useEffect(() => {
    if (!isElectron || !api?.trayAgenda?.setCache) return;

    let cancelled = false;

    const run = async () => {
      let range: "today" | "today_tomorrow" = "today_tomorrow";
      try {
        const r = await api.db.settings.get("tray-calendar-range");
        if (r === "today" || r === "today_tomorrow") range = r;
      } catch {
        /* default */
      }

      const now = new Date();
      const sod = startOfDay(now);
      const eodToday = endOfDay(now);
      const windowEnd = range === "today" ? eodToday : endOfDay(addDays(now, 1));

      const filtered = events.filter((e) => {
        const t = new Date(e.start).getTime();
        return t >= sod.getTime() && t <= windowEnd.getTime();
      });

      const nowMs = now.getTime();
      const seen = new Set(filtered.map((e) => e.id));
      const upcomingSorted = [...events]
        .filter((e) => new Date(e.end).getTime() > nowMs)
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

      const merged: CalendarEvent[] = [...filtered];
      for (const e of upcomingSorted) {
        if (seen.has(e.id)) continue;
        merged.push(e);
        seen.add(e.id);
        if (merged.length - filtered.length >= TRAY_AGENDA_EXTRA_UPCOMING) break;
      }
      merged.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

      const note = findNote;
      const payload = merged.map((e) => {
        const linked = note(e);
        return {
          id: e.id,
          title: e.title,
          start: new Date(e.start).toISOString(),
          end: new Date(e.end).toISOString(),
          joinLink: e.joinLink,
          hasNote: !!(linked || e.noteId),
          noteId: linked?.id ?? e.noteId ?? null,
          source: e.source ?? "synced",
        };
      });

      if (!cancelled) await api.trayAgenda.setCache(payload);
    };

    void run();
    return () => {
      cancelled = true;
    };
  }, [api, events, findNote]);

  return null;
}
