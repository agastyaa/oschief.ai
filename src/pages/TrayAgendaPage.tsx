import { useCallback, useEffect, useState } from "react";
import { format, formatDistanceToNow, startOfDay } from "date-fns";
import { getElectronAPI } from "@/lib/electron-api";
import { AppWindow, FilePenLine, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";

type TrayEvt = {
  id: string;
  title: string;
  start: string;
  end: string;
  joinLink?: string;
  hasNote?: boolean;
  noteId?: string | null;
  source?: "synced" | "local";
};

function accentFromId(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360} 42% 44%)`;
}

export default function TrayAgendaPage() {
  const api = getElectronAPI();
  const [events, setEvents] = useState<TrayEvt[]>([]);

  const refresh = useCallback(async () => {
    const list = await api?.trayAgenda?.getCache();
    setEvents(Array.isArray(list) ? list : []);
  }, [api]);

  useEffect(() => {
    void refresh();
    const off = api?.trayAgenda?.onCacheUpdated?.(() => void refresh());
    return () => off?.();
  }, [api, refresh]);

  const now = Date.now();
  const sorted = [...events].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const todayStart = startOfDay(new Date()).getTime();
  const tomorrowStart = todayStart + 86400000;
  const dayAfterTomorrow = tomorrowStart + 86400000;

  /** Today’s calendar day, still ongoing or upcoming (hide meetings that already ended). */
  const nextRows = sorted.filter((e) => {
    const startT = new Date(e.start).getTime();
    const endT = new Date(e.end).getTime();
    return startT >= todayStart && startT < tomorrowStart && endT > now;
  });

  const tomorrowList = sorted.filter((e) => {
    const t = new Date(e.start).getTime();
    return t >= tomorrowStart && t < dayAfterTomorrow;
  });

  /** Future events not shown under Next or Tomorrow (e.g. day after tomorrow or later). */
  const laterList = sorted.filter((e) => {
    const startT = new Date(e.start).getTime();
    const endT = new Date(e.end).getTime();
    if (endT <= now) return false;
    const inNext = startT >= todayStart && startT < tomorrowStart && endT > now;
    const inTomorrow = startT >= tomorrowStart && startT < dayAfterTomorrow;
    return !inNext && !inTomorrow;
  });

  const handleRowClick = async (evt: TrayEvt) => {
    let openMode: "note" | "calendar" = "note";
    try {
      const c = await api?.db.settings.get("tray-calendar-click");
      if (c === "calendar" || c === "note") openMode = c;
    } catch {
      /* default note */
    }
    await api?.trayAgenda?.activateEvent({
      noteId: evt.noteId ?? null,
      eventId: evt.id,
      title: evt.title,
      openMode,
    });
  };

  const Row = ({ evt, headlineOverride }: { evt: TrayEvt; headlineOverride?: string }) => {
    const start = new Date(evt.start);
    const relative =
      headlineOverride ??
      (start.getTime() > now
        ? formatDistanceToNow(start, { addSuffix: true })
        : start.getTime() <= now && new Date(evt.end).getTime() > now
          ? "Now"
          : format(start, "h:mm a"));
    return (
      <button
        type="button"
        onClick={() => void handleRowClick(evt)}
        className="flex w-full items-stretch gap-2 rounded-md px-1 py-1.5 text-left transition-colors hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
      >
        <span
          className="w-1 shrink-0 rounded-full self-stretch min-h-[2rem]"
          style={{ backgroundColor: accentFromId(evt.id) }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] tabular-nums text-muted-foreground">{relative}</span>
            {evt.hasNote && <span className="text-[9px] text-accent font-medium">Note</span>}
            {evt.source === "local" && (
              <span className="text-[9px] text-muted-foreground border border-border rounded px-0.5">OSChief</span>
            )}
          </div>
          <p className="text-body-sm font-medium text-foreground truncate leading-tight">{evt.title}</p>
          <p className="text-[10px] text-muted-foreground">
            {format(start, "h:mm a")} – {format(new Date(evt.end), "h:mm a")}
          </p>
        </div>
      </button>
    );
  };

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <div className="mb-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5 px-1">{title}</p>
      <div className="space-y-0.5">{children}</div>
    </div>
  );

  return (
    <div
      className={cn(
        "h-screen w-full flex flex-col text-foreground overflow-hidden",
        "bg-[#FAF8F5] dark:bg-background"
      )}
      style={{ WebkitAppRegion: "drag" } as React.CSSProperties}
    >
      <header className="shrink-0 px-3 pt-3 pb-2 border-b border-border/40">
        <h1 className="text-[15px] font-semibold">Agenda</h1>
        <p className="text-[11px] text-muted-foreground">{format(new Date(), "EEEE, MMM d")}</p>
      </header>

      <div className="flex-1 overflow-y-auto px-2 py-2" style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}>
        {sorted.length === 0 ? (
          <p className="text-[12px] text-muted-foreground text-center py-8 px-2">No events in this range</p>
        ) : (
          <>
            {nextRows.length > 0 && (
              <Section title="Next">
                {nextRows.map((e) => (
                  <Row key={e.id} evt={e} />
                ))}
              </Section>
            )}
            {tomorrowList.length > 0 && (
              <Section title="Tomorrow">
                {tomorrowList.map((e) => (
                  <Row key={e.id} evt={e} />
                ))}
              </Section>
            )}
            {laterList.length > 0 && (
              <Section title="Later">
                {laterList.map((e) => {
                  const s = new Date(e.start);
                  const headline =
                    s.getTime() > now
                      ? `${format(s, "EEE, MMM d")} · ${formatDistanceToNow(s, { addSuffix: true })}`
                      : format(s, "EEE, MMM d");
                  return <Row key={e.id} evt={e} headlineOverride={headline} />;
                })}
              </Section>
            )}
            {nextRows.length === 0 && tomorrowList.length === 0 && laterList.length === 0 && (
              <p className="text-[12px] text-muted-foreground text-center py-8 px-2">No upcoming events</p>
            )}
          </>
        )}
      </div>

      <footer
        className="shrink-0 border-t border-border/40 px-2 py-2 space-y-0.5"
        style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
      >
        <button
          type="button"
          onClick={() => void api?.trayAgenda?.newNote()}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[12px] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
        >
          <FilePenLine className="h-3.5 w-3.5 text-muted-foreground" />
          New Note
        </button>
        <button
          type="button"
          onClick={() => void api?.trayAgenda?.goToApp()}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[12px] hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
        >
          <AppWindow className="h-3.5 w-3.5 text-muted-foreground" />
          Go to app
        </button>
        <button
          type="button"
          onClick={() => void api?.trayAgenda?.quit()}
          className="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-[12px] text-destructive hover:bg-black/[0.04] dark:hover:bg-white/[0.06]"
        >
          <LogOut className="h-3.5 w-3.5" />
          Quit app
        </button>
      </footer>
    </div>
  );
}
