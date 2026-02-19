import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { CalendarEvent, parseICS } from "@/lib/ics-parser";

interface CalendarContextValue {
  events: CalendarEvent[];
  icsSource: string | null;
  isLoading: boolean;
  error: string | null;
  lastRefresh: Date | null;
  importFromFile: (content: string, name?: string) => void;
  importFromUrl: (url: string) => Promise<void>;
  clearCalendar: () => void;
}

const CalendarContext = createContext<CalendarContextValue | null>(null);

const STORAGE_KEY = "syag_calendar_events";
const SOURCE_KEY = "syag_calendar_source";
const URL_KEY = "syag_calendar_url";
const AUTO_REFRESH_INTERVAL = 15 * 60 * 1000; // 15 minutes

export function CalendarProvider({ children }: { children: React.ReactNode }) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [icsSource, setIcsSource] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const refreshTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  const persist = useCallback((evts: CalendarEvent[], source: string, feedUrl?: string) => {
    setEvents(evts);
    setIcsSource(source);
    setError(null);
    setLastRefresh(new Date());
    localStorage.setItem(STORAGE_KEY, JSON.stringify(evts));
    localStorage.setItem(SOURCE_KEY, source);
    if (feedUrl) localStorage.setItem(URL_KEY, feedUrl);
  }, []);

  const fetchAndParse = useCallback(async (url: string, silent = false) => {
    if (!silent) { setIsLoading(true); setError(null); }
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch");
      const text = await res.text();
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

  // Load from localStorage on mount + start auto-refresh if URL source
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      const source = localStorage.getItem(SOURCE_KEY);
      const feedUrl = localStorage.getItem(URL_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as CalendarEvent[];
        setEvents(parsed.map(e => ({ ...e, start: new Date(e.start), end: new Date(e.end) })));
      }
      if (source) setIcsSource(source);
      // Auto-refresh URL feeds on mount
      if (feedUrl) {
        fetchAndParse(feedUrl, true);
      }
    } catch { /* ignore corrupt data */ }
  }, [fetchAndParse]);

  // Set up auto-refresh interval for URL-based feeds
  useEffect(() => {
    const feedUrl = localStorage.getItem(URL_KEY);
    if (feedUrl) {
      refreshTimer.current = setInterval(() => {
        fetchAndParse(feedUrl, true);
      }, AUTO_REFRESH_INTERVAL);
    }
    return () => {
      if (refreshTimer.current) clearInterval(refreshTimer.current);
    };
  }, [icsSource, fetchAndParse]);

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

  const importFromUrl = useCallback(async (url: string) => {
    setIsLoading(true);
    setError(null);
    await fetchAndParse(url);
    setIsLoading(false);
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
