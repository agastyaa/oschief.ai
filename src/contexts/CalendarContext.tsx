import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { CalendarEvent, parseICS } from "@/lib/ics-parser";
import { isElectron, getElectronAPI } from "@/lib/electron-api";

interface CalendarContextValue {
  events: CalendarEvent[];
  icsSource: string | null;
  isLoading: boolean;
  error: string | null;
  lastRefresh: Date | null;
  importFromFile: (content: string, name?: string) => void;
  importFromUrl: (url: string) => Promise<boolean>;
  clearCalendar: () => void;
}

const CalendarContext = createContext<CalendarContextValue | null>(null);

const STORAGE_KEY = "syag_calendar_events";
const SOURCE_KEY = "syag_calendar_source";
const URL_KEY = "syag_calendar_url";
const AUTO_REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes

/** Remove duplicates: same start time + same title (e.g. duplicate 11am tomorrow). Keep first. */
function dedupeCalendarEvents(evts: CalendarEvent[]): CalendarEvent[] {
  const seen = new Set<string>();
  return evts.filter((e) => {
    const key = `${e.start instanceof Date ? e.start.getTime() : new Date(e.start).getTime()}-${(e.title || "").trim().toLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function CalendarProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [icsSource, setIcsSource] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const persist = useCallback((evts: CalendarEvent[], source: string, feedUrl?: string) => {
    // Only show events with a meeting link and exclude full-day blocks (focus blocks, etc.)
    const filtered = evts.filter((e) => e.joinLink && !e.isAllDay);
    const deduped = dedupeCalendarEvents(filtered);
    setEvents(deduped);
    setIcsSource(source);
    setError(null);
    setLastRefresh(new Date());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(deduped));
    localStorage.setItem(SOURCE_KEY, source);
    if (feedUrl) localStorage.setItem(URL_KEY, feedUrl);
  }, []);

  const fetchAndParse = useCallback(async (url: string, silent = false) => {
    if (!silent) { setIsLoading(true); setError(null); }
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
      persist(parsed, url, url);
      return true;
    } catch {
      if (!silent) setError("Could not fetch the URL. Try downloading the .ics file and uploading it instead.");
      return false;
    } finally {
      if (!silent) setIsLoading(false);
    }
  }, [persist]);

  // Fetch events from Google Calendar OAuth (if connected)
  const fetchGoogleCalendar = useCallback(async (silent = false) => {
    const api = getElectronAPI();
    if (!api?.google || !api?.keychain) return;
    try {
      const raw = await api.keychain.get("google-calendar-config");
      if (!raw) return;
      const config = JSON.parse(raw);
      let accessToken = config.accessToken;

      // Refresh token if expired
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

      const result = await api.google.calendarFetch(accessToken);
      if (result.ok && result.events?.length) {
        const mapped: CalendarEvent[] = result.events.map((e: any) => ({
          id: e.id,
          title: e.title,
          start: new Date(e.start),
          end: new Date(e.end),
          joinLink: e.joinLink,
          location: e.location,
          isAllDay: e.isAllDay,
        }));
        persist(mapped, "Google Calendar");
      }
    } catch {
      if (!silent) setError("Failed to fetch Google Calendar events");
    }
  }, [persist]);

  // Load from localStorage on mount + start auto-refresh if URL source
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const source = localStorage.getItem(SOURCE_KEY);
      const feedUrl = localStorage.getItem(URL_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as CalendarEvent[];
        const withDates = parsed.map((e) => ({ ...e, start: new Date(e.start), end: new Date(e.end) }));
        const filtered = withDates.filter((e) => e.joinLink && !e.isAllDay);
        setEvents(dedupeCalendarEvents(filtered));
      }
      if (source) setIcsSource(source);
      // Auto-refresh URL feeds on mount
      if (feedUrl) {
        fetchAndParse(feedUrl, true);
      }
      // Also try Google Calendar if connected
      fetchGoogleCalendar(true);
    } catch { /* ignore corrupt data */ }
  }, [fetchAndParse, fetchGoogleCalendar]);

  // Set up auto-refresh interval for URL-based feeds and Google Calendar
  useEffect(() => {
    const feedUrl = localStorage.getItem(URL_KEY);
    if (feedUrl) {
      refreshTimer.current = setInterval(() => {
        fetchAndParse(feedUrl, true);
      }, AUTO_REFRESH_INTERVAL);
    } else {
      // If no ICS URL, still auto-refresh Google Calendar
      refreshTimer.current = setInterval(() => {
        fetchGoogleCalendar(true);
      }, AUTO_REFRESH_INTERVAL);
    }
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [icsSource, fetchAndParse, fetchGoogleCalendar]);

  const importFromFile = useCallback((content: string, name?: string) => {
    try {
      const parsed = parseICS(content);
      if (parsed.length === 0) {
        setError("No events found in the file");
        return;
      }
      localStorage.removeItem(URL_KEY); // no auto-refresh for file imports
      persist(parsed, name || "Uploaded file");
    } catch {
      setError("Failed to parse ICS file");
    }
  }, [persist]);

  const importFromUrl = useCallback(async (url: string): Promise<boolean> => {
    setIsLoading(true);
    setError(null);
    const ok = await fetchAndParse(url);
    setIsLoading(false);
    return ok;
  }, [fetchAndParse]);

  const clearCalendar = useCallback(() => {
    setEvents([]);
    setIcsSource(null);
    setError(null);
    setLastRefresh(null);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SOURCE_KEY);
    localStorage.removeItem(URL_KEY);
    if (refreshTimer.current) clearInterval(refreshTimer.current);
  }, []);

  return (
    <CalendarContext.Provider value={{ events, icsSource, isLoading, error, lastRefresh, importFromFile, importFromUrl, clearCalendar }}>
      {children}
    </CalendarContext.Provider>
  );
}

export function useCalendar() {
  const ctx = useContext(CalendarContext);
  if (!ctx) throw new Error("useCalendar must be used within CalendarProvider");
  return ctx;
}
