import React, { createContext, useContext, useState, useEffect, useCallback, useRef, useMemo } from "react";
import { CalendarEvent, parseICS } from "@/lib/ics-parser";
import { isElectron, getElectronAPI } from "@/lib/electron-api";
import type { CalendarProviderId } from "@/components/ICSDialog";

const FETCH_RANGE = { daysPast: 30, daysAhead: 30 } as const;

export const GOOGLE_CALENDAR_FEED_ID = "google";
/** Same id used for Microsoft Graph calendar merge */
export const MICROSOFT_CALENDAR_FEED_ID = "microsoft";

const STORAGE_KEY = "syag_calendar_events";
const SOURCE_KEY = "syag_calendar_source";
const URL_KEY = "syag_calendar_url";
const FEEDS_REGISTRY_KEY = "syag_calendar_ics_feeds";
const VIEW_FILTER_KEY = "syag_calendar_view_filter";
const MIGRATION_FLAG_KEY = "syag_calendar_migrated_v2";

const AUTO_REFRESH_INTERVAL = 15 * 60 * 1000;

export type IcsFeedRegistryEntry = {
  id: string;
  kind: "ics-url" | "ics-file";
  label: string;
  url?: string;
  /** Which Settings "Connect" card this came from, if any */
  providerHint?: CalendarProviderId;
};

type FeedsRegistryFile = { feeds: IcsFeedRegistryEntry[] };

function feedIdForUrl(url: string): string {
  let h = 0;
  for (let i = 0; i < url.length; i++) h = (Math.imul(31, h) + url.charCodeAt(i)) | 0;
  return `ics-${Math.abs(h).toString(36)}`;
}

function loadRegistry(): IcsFeedRegistryEntry[] {
  try {
    const raw = localStorage.getItem(FEEDS_REGISTRY_KEY);
    if (!raw) return [];
    const p = JSON.parse(raw) as FeedsRegistryFile;
    return Array.isArray(p.feeds) ? p.feeds : [];
  } catch {
    return [];
  }
}

function saveRegistry(feeds: IcsFeedRegistryEntry[]): void {
  localStorage.setItem(FEEDS_REGISTRY_KEY, JSON.stringify({ feeds }));
}

/** Derive a short label from calendar URL for display */
function getSyncLabel(urlOrSource: string): string {
  if (!urlOrSource) return "Calendar";
  try {
    const url = urlOrSource.startsWith("http") ? urlOrSource : `https://${urlOrSource}`;
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    const pathAndHash = u.pathname + u.search;
    if (host.includes("outlook.office365.com") || host.includes("outlook.office.com")) {
      const emailMatch = pathAndHash.match(/@([a-zA-Z0-9.-]+)/);
      const domain = emailMatch ? emailMatch[1] : "";
      return domain ? `Outlook — ${domain}` : "Outlook";
    }
    if (host.includes("google") || host.includes("gmail")) return "Google (ICS)";
    if (host.includes("icloud")) return "iCloud";
    return u.hostname.replace(/^www\./, "");
  } catch {
    return urlOrSource.length > 40 ? urlOrSource.slice(0, 37) + "…" : urlOrSource;
  }
}

function migrateLegacyIfNeeded(): void {
  if (localStorage.getItem(MIGRATION_FLAG_KEY)) return;
  const oldEvents = localStorage.getItem(STORAGE_KEY);
  const oldSource = localStorage.getItem(SOURCE_KEY);
  const oldUrl = localStorage.getItem(URL_KEY);
  if (!oldEvents) {
    if (oldUrl || oldSource) localStorage.setItem(MIGRATION_FLAG_KEY, "1");
    return;
  }
  try {
    const parsed = JSON.parse(oldEvents) as CalendarEvent[];
    const feedId = oldUrl ? feedIdForUrl(oldUrl) : "legacy-upload";
    const label = oldUrl ? getSyncLabel(oldUrl) : oldSource || "Imported calendar";
    const tagged = parsed.map((e) => ({
      ...e,
      calendarFeedId: (e as CalendarEvent).calendarFeedId ?? feedId,
      calendarName: (e as CalendarEvent).calendarName ?? label,
    }));
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tagged));
    const feeds = loadRegistry();
    const exists = feeds.some((f) => f.id === feedId);
    if (!exists) {
      feeds.push(
        oldUrl
          ? { id: feedId, kind: "ics-url", label, url: oldUrl }
          : { id: feedId, kind: "ics-file", label }
      );
      saveRegistry(feeds);
    }
    localStorage.setItem(MIGRATION_FLAG_KEY, "1");
  } catch {
    localStorage.setItem(MIGRATION_FLAG_KEY, "1");
  }
}

function dedupeCalendarEvents(evts: CalendarEvent[]): CalendarEvent[] {
  const seen = new Set<string>();
  return evts.filter((e) => {
    const startMs = e.start instanceof Date ? e.start.getTime() : new Date(e.start).getTime();
    const key = `${startMs}-${(e.title || "").trim().toLowerCase()}-${e.calendarFeedId ?? "na"}-${e.source ?? "synced"}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function mapRowsToLocalEvents(
  rows: { id: string; title: string; startIso: string; endIso: string; noteId: string | null }[]
): CalendarEvent[] {
  return rows.map((r) => ({
    id: `local-${r.id}`,
    title: r.title,
    start: new Date(r.startIso),
    end: new Date(r.endIso),
    source: "local" as const,
    noteId: r.noteId ?? undefined,
    isAllDay: false,
  }));
}

export type CalendarSourceOption = { id: string; label: string };

interface CalendarContextValue {
  /** All events from every connected calendar + local blocks (meeting detection, tray). */
  events: CalendarEvent[];
  /** Filtered by calendar view switcher (All vs one calendar). Local blocks always included. */
  displayEvents: CalendarEvent[];
  /** @deprecated Use `connectedCalendarSummary` or `calendarSources.length`; kept for string compatibility */
  icsSource: string | null;
  connectedCalendarSummary: string | null;
  calendarSources: CalendarSourceOption[];
  calendarViewId: string;
  setCalendarViewId: (id: string) => void;
  isLoading: boolean;
  error: string | null;
  lastRefresh: Date | null;
  icsFeeds: IcsFeedRegistryEntry[];
  importFromFile: (content: string, name?: string, providerHint?: CalendarProviderId) => void;
  importFromUrl: (url: string, providerHint?: CalendarProviderId) => Promise<boolean>;
  /** Remove one calendar's events (and ICS registry entry when applicable). OAuth: also clear keychain from Settings. */
  removeCalendarFeed: (feedId: string) => void;
  /** Clear every synced calendar, registry, and legacy keys */
  clearCalendar: () => void;
  refreshLocalBlocks: () => Promise<void>;
  refreshCalendarConnections: () => Promise<void>;
  refetchAllCalendars: () => Promise<void>;
  addLocalBlock: (input: {
    title: string;
    start: Date;
    end: Date;
    noteId?: string | null;
  }) => Promise<string | undefined>;
  deleteLocalBlock: (id: string) => Promise<void>;
}

const CalendarContext = createContext<CalendarContextValue | null>(null);

export function CalendarProvider({ children }: { children: React.ReactNode }) {
  const [syncedEvents, setSyncedEvents] = useState<CalendarEvent[]>([]);
  const [localBlockEvents, setLocalBlockEvents] = useState<CalendarEvent[]>([]);
  const [icsFeeds, setIcsFeeds] = useState<IcsFeedRegistryEntry[]>(() => {
    migrateLegacyIfNeeded();
    return loadRegistry();
  });
  const [hasGoogleCalendar, setHasGoogleCalendar] = useState(false);
  const [hasMicrosoftCalendar, setHasMicrosoftCalendar] = useState(false);
  const [calendarViewId, setCalendarViewIdState] = useState<string>(() => {
    try {
      return localStorage.getItem(VIEW_FILTER_KEY) || "all";
    } catch {
      return "all";
    }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const persistSyncedToDisk = useCallback((evts: CalendarEvent[]) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(evts));
  }, []);

  const setCalendarViewId = useCallback((id: string) => {
    setCalendarViewIdState(id);
    try {
      localStorage.setItem(VIEW_FILTER_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  const refreshCalendarConnections = useCallback(async () => {
    const api = getElectronAPI();
    if (!api?.keychain) {
      setHasGoogleCalendar(false);
      setHasMicrosoftCalendar(false);
      return;
    }
    try {
      const g = await api.keychain.get("google-calendar-config");
      setHasGoogleCalendar(!!g);
    } catch {
      setHasGoogleCalendar(false);
    }
    try {
      const m = await api.keychain.get("microsoft-calendar-config");
      setHasMicrosoftCalendar(!!m);
    } catch {
      setHasMicrosoftCalendar(false);
    }
  }, []);

  const events = useMemo(() => {
    const merged = dedupeCalendarEvents([...localBlockEvents, ...syncedEvents]);
    return merged.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [localBlockEvents, syncedEvents]);

  const calendarSources = useMemo((): CalendarSourceOption[] => {
    const out: CalendarSourceOption[] = [];
    if (hasGoogleCalendar) out.push({ id: GOOGLE_CALENDAR_FEED_ID, label: "Google Calendar" });
    if (hasMicrosoftCalendar) out.push({ id: MICROSOFT_CALENDAR_FEED_ID, label: "Microsoft Outlook" });
    for (const f of icsFeeds) {
      out.push({ id: f.id, label: f.label });
    }
    return out;
  }, [hasGoogleCalendar, hasMicrosoftCalendar, icsFeeds]);

  const connectedCalendarSummary = useMemo(() => {
    if (calendarSources.length === 0) return null;
    return calendarSources.map((s) => s.label).join(" · ");
  }, [calendarSources]);

  const icsSource = connectedCalendarSummary;

  const displayEvents = useMemo(() => {
    if (calendarViewId === "all") return events;
    return events.filter((e) => e.source === "local" || e.calendarFeedId === calendarViewId);
  }, [events, calendarViewId]);

  useEffect(() => {
    if (calendarViewId === "all") return;
    if (!calendarSources.some((s) => s.id === calendarViewId)) {
      setCalendarViewId("all");
    }
  }, [calendarViewId, calendarSources, setCalendarViewId]);

  // Send calendar events to main process for event-driven meeting reminders
  useEffect(() => {
    const serialized = events.map(e => ({
      id: e.id, title: e.title, start: e.start, end: e.end,
      attendees: e.attendees, joinLink: e.joinLink,
    }));
    // Keep window global for backward compat (meeting-detector reads it)
    (window as any).__syagCalendarEvents = serialized;
    // Send to main process via preload bridge — schedules exact timers (no polling)
    try {
      (window as any).electronAPI?.calendarReminders?.sendEvents(serialized);
    } catch {
      // Not in Electron — skip
    }
  }, [events]);

  const mergeFeedEvents = useCallback(
    (
      feedId: string,
      calendarName: string,
      rawEvents: CalendarEvent[],
      registryUpdate?: IcsFeedRegistryEntry
    ) => {
      const filtered = rawEvents.filter((e) => !e.isAllDay);
      const tagged = filtered.map((e) => ({
        ...e,
        source: "synced" as const,
        calendarFeedId: feedId,
        calendarName,
      }));
      setSyncedEvents((prev) => {
        const rest = prev.filter((e) => e.calendarFeedId !== feedId);
        const merged = dedupeCalendarEvents([...rest, ...tagged]);
        persistSyncedToDisk(merged);
        return merged;
      });
      if (registryUpdate) {
        setIcsFeeds((prev) => {
          const next = prev.filter((f) => f.id !== registryUpdate.id);
          next.push(registryUpdate);
          saveRegistry(next);
          return next;
        });
      }
      setLastRefresh(new Date());
      setError(null);
    },
    [persistSyncedToDisk]
  );

  const refreshLocalBlocks = useCallback(async () => {
    const api = getElectronAPI();
    if (!api?.calendarLocalBlocks?.list) {
      setLocalBlockEvents([]);
      return;
    }
    try {
      const rows = await api.calendarLocalBlocks.list();
      setLocalBlockEvents(mapRowsToLocalEvents(rows as any));
    } catch {
      setLocalBlockEvents([]);
    }
  }, []);

  const addLocalBlock = useCallback(
    async (input: { title: string; start: Date; end: Date; noteId?: string | null }) => {
      const api = getElectronAPI();
      if (!api?.calendarLocalBlocks?.add) return undefined;
      const id = crypto.randomUUID();
      await api.calendarLocalBlocks.add({
        id,
        title: input.title.trim(),
        startIso: input.start.toISOString(),
        endIso: input.end.toISOString(),
        noteId: input.noteId ?? null,
      });
      await refreshLocalBlocks();
      return `local-${id}`;
    },
    [refreshLocalBlocks]
  );

  const deleteLocalBlock = useCallback(
    async (id: string) => {
      const api = getElectronAPI();
      if (!api?.calendarLocalBlocks?.delete) return;
      const raw = id.startsWith("local-") ? id.slice(6) : id;
      await api.calendarLocalBlocks.delete(raw);
      await refreshLocalBlocks();
    },
    [refreshLocalBlocks]
  );

  const fetchAndParse = useCallback(
    async (url: string, silent = false, providerHint?: CalendarProviderId) => {
      if (!silent) {
        setIsLoading(true);
        setError(null);
      }
      try {
        let text: string;
        if (isElectron && getElectronAPI()?.app?.fetchUrl) {
          const { ok, body } = await getElectronAPI()!.app!.fetchUrl(url);
          if (!ok) throw new Error("Failed to fetch");
          text = body;
        } else {
          const res = await fetch(url);
          if (!res.ok) throw new Error("Failed to fetch");
          text = await res.text();
        }
        const parsed = parseICS(text);
        if (parsed.length === 0 && !silent) {
          setError("No events found at this URL");
          setIsLoading(false);
          return false;
        }
        const id = feedIdForUrl(url);
        const label = getSyncLabel(url);
        mergeFeedEvents(id, label, parsed, {
          id,
          kind: "ics-url",
          label,
          url,
          providerHint,
        });
        return true;
      } catch {
        if (!silent) setError("Could not fetch the URL. Try downloading the .ics file and uploading it instead.");
        return false;
      } finally {
        if (!silent) setIsLoading(false);
      }
    },
    [mergeFeedEvents]
  );

  const fetchGoogleCalendar = useCallback(
    async (silent = false) => {
      const api = getElectronAPI();
      if (!api?.google || !api?.keychain) return;
      try {
        const raw = await api.keychain.get("google-calendar-config");
        if (!raw) return;
        const config = JSON.parse(raw);
        let accessToken = config.accessToken;

        if (config.expiresAt && Date.now() > config.expiresAt - 60_000) {
          const refreshResult = await api.google.calendarRefresh(config.clientId, config.refreshToken);
          if (refreshResult.ok && refreshResult.accessToken) {
            accessToken = refreshResult.accessToken;
            config.accessToken = accessToken;
            config.expiresAt = Date.now() + (refreshResult.expiresIn || 3600) * 1000;
            await api.keychain.set("google-calendar-config", JSON.stringify(config));
          } else {
            if (!silent) setError("Google Calendar token expired — please reconnect in Settings");
            return;
          }
        }

        const result = await api.google.calendarFetch(accessToken, FETCH_RANGE);
        if (result.ok) {
          const mapped: CalendarEvent[] = (result.events || []).map((e: any) => ({
            id: e.id,
            title: e.title,
            start: new Date(e.start),
            end: new Date(e.end),
            joinLink: e.joinLink,
            location: e.location,
            isAllDay: e.isAllDay,
            attendees: e.attendees?.map((a: any) => ({ email: a.email, name: a.name || a.displayName })),
          }));
          mergeFeedEvents(GOOGLE_CALENDAR_FEED_ID, "Google Calendar", mapped);
        }
      } catch {
        if (!silent) setError("Failed to fetch Google Calendar events");
      }
    },
    [mergeFeedEvents]
  );

  const fetchMicrosoftCalendar = useCallback(
    async (silent = false) => {
      const api = getElectronAPI();
      if (!api?.microsoft || !api?.keychain) return;
      try {
        const raw = await api.keychain.get("microsoft-calendar-config");
        if (!raw) return;
        const config = JSON.parse(raw);
        let accessToken = config.accessToken;

        if (config.expiresAt && Date.now() > config.expiresAt - 60_000) {
          const refreshResult = await api.microsoft.calendarRefresh(config.clientId, config.refreshToken);
          if (refreshResult.ok && refreshResult.accessToken) {
            accessToken = refreshResult.accessToken;
            config.accessToken = accessToken;
            config.expiresAt = Date.now() + (refreshResult.expiresIn || 3600) * 1000;
            await api.keychain.set("microsoft-calendar-config", JSON.stringify(config));
          } else {
            if (!silent) setError("Microsoft Calendar token expired — please reconnect in Settings");
            return;
          }
        }

        const result = await api.microsoft.calendarFetch(accessToken, FETCH_RANGE);
        if (result.ok) {
          const mapped: CalendarEvent[] = (result.events || []).map((e: any) => ({
            id: `ms-${e.id}`,
            title: e.title,
            start: new Date(e.start),
            end: new Date(e.end),
            joinLink: e.joinLink,
            location: e.location,
            isAllDay: e.isAllDay,
            attendees: e.attendees?.map((a: any) => ({ email: a.email, name: a.name })),
          }));
          mergeFeedEvents(MICROSOFT_CALENDAR_FEED_ID, "Microsoft Outlook", mapped);
        }
      } catch {
        if (!silent) setError("Failed to fetch Microsoft Calendar events");
      }
    },
    [mergeFeedEvents]
  );

  const refetchAllCalendars = useCallback(async () => {
    await refreshCalendarConnections();
    const reg = loadRegistry();
    reg.forEach((f) => {
      if (f.url) void fetchAndParse(f.url, true, f.providerHint);
    });
    await fetchGoogleCalendar(true);
    await fetchMicrosoftCalendar(true);
  }, [refreshCalendarConnections, fetchAndParse, fetchGoogleCalendar, fetchMicrosoftCalendar]);

  const removeCalendarFeed = useCallback(
    (feedId: string) => {
      if (feedId === GOOGLE_CALENDAR_FEED_ID) setHasGoogleCalendar(false);
      if (feedId === MICROSOFT_CALENDAR_FEED_ID) setHasMicrosoftCalendar(false);
      setSyncedEvents((prev) => {
        const next = prev.filter((e) => e.calendarFeedId !== feedId);
        persistSyncedToDisk(next);
        return next;
      });
      setIcsFeeds((prev) => {
        if (!prev.some((f) => f.id === feedId)) return prev;
        const next = prev.filter((f) => f.id !== feedId);
        saveRegistry(next);
        return next;
      });
      try {
        localStorage.removeItem(URL_KEY);
        localStorage.removeItem(SOURCE_KEY);
      } catch {
        /* ignore */
      }
      if (calendarViewId === feedId) setCalendarViewId("all");
    },
    [calendarViewId, persistSyncedToDisk, setCalendarViewId]
  );

  useEffect(() => {
    void refreshCalendarConnections();
  }, [refreshCalendarConnections]);

  useEffect(() => {
    void (async () => {
      await refreshCalendarConnections();
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored) as CalendarEvent[];
          const withDates = parsed.map((e) => ({
            ...e,
            start: new Date(e.start),
            end: new Date(e.end),
            source: (e as CalendarEvent).source ?? ("synced" as const),
          }));
          const filtered = withDates.filter((e) => !e.isAllDay);
          setSyncedEvents(dedupeCalendarEvents(filtered));
        }
        const reg = loadRegistry();
        setIcsFeeds(reg);
        reg.forEach((f) => {
          if (f.url) void fetchAndParse(f.url, true, f.providerHint);
        });
        await fetchGoogleCalendar(true);
        await fetchMicrosoftCalendar(true);
        await refreshLocalBlocks();
      } catch {
        /* ignore */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount bootstrap only
  }, []);

  useEffect(() => {
    if (refreshTimer.current) clearInterval(refreshTimer.current);
    refreshTimer.current = setInterval(() => {
      const feeds = loadRegistry();
      feeds.forEach((f) => {
        if (f.url) fetchAndParse(f.url, true, f.providerHint);
      });
      fetchGoogleCalendar(true);
      fetchMicrosoftCalendar(true);
    }, AUTO_REFRESH_INTERVAL);
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [fetchAndParse, fetchGoogleCalendar, fetchMicrosoftCalendar]);

  const importFromFile = useCallback(
    (content: string, name?: string, providerHint?: CalendarProviderId) => {
      try {
        const parsed = parseICS(content);
        if (parsed.length === 0) {
          setError("No events found in the file");
          return;
        }
        const id = `ics-file-${Date.now().toString(36)}`;
        const label = name || "Imported calendar";
        mergeFeedEvents(id, label, parsed, {
          id,
          kind: "ics-file",
          label,
          providerHint,
        });
      } catch {
        setError("Failed to parse ICS file");
      }
    },
    [mergeFeedEvents]
  );

  const importFromUrl = useCallback(
    async (url: string, providerHint?: CalendarProviderId): Promise<boolean> => {
      setIsLoading(true);
      setError(null);
      const ok = await fetchAndParse(url.trim(), false, providerHint);
      setIsLoading(false);
      return ok;
    },
    [fetchAndParse]
  );

  const clearCalendar = useCallback(() => {
    setSyncedEvents([]);
    setIcsFeeds([]);
    saveRegistry([]);
    setError(null);
    setLastRefresh(null);
    setCalendarViewId("all");
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SOURCE_KEY);
    localStorage.removeItem(URL_KEY);
    localStorage.removeItem(FEEDS_REGISTRY_KEY);
    persistSyncedToDisk([]);
    // OAuth tokens are unchanged; periodic refresh can repopulate from Google/Microsoft.
  }, [setCalendarViewId, persistSyncedToDisk]);

  return (
    <CalendarContext.Provider
      value={{
        events,
        displayEvents,
        icsSource,
        connectedCalendarSummary,
        calendarSources,
        calendarViewId,
        setCalendarViewId,
        isLoading,
        error,
        lastRefresh,
        icsFeeds,
        importFromFile,
        importFromUrl,
        removeCalendarFeed,
        clearCalendar,
        refreshLocalBlocks,
        refreshCalendarConnections,
        refetchAllCalendars,
        addLocalBlock,
        deleteLocalBlock,
      }}
    >
      {children}
    </CalendarContext.Provider>
  );
}

export function useCalendar() {
  const ctx = useContext(CalendarContext);
  if (!ctx) throw new Error("useCalendar must be used within CalendarProvider");
  return ctx;
}
