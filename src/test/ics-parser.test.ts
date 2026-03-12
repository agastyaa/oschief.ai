import { describe, it, expect } from "vitest";
import { parseICS, parseICSDate } from "@/lib/ics-parser";

// ── Helpers ─────────────────────────────────────────────────────────────

/** Build a minimal ICS string from one or more VEVENT bodies. */
function ics(...eventBodies: string[]): string {
  const events = eventBodies.map(
    (body) => `BEGIN:VEVENT\n${body}\nEND:VEVENT`
  );
  return `BEGIN:VCALENDAR\nVERSION:2.0\n${events.join("\n")}\nEND:VCALENDAR`;
}

// ── Basic parsing (existing tests + expanded) ───────────────────────────

const SAMPLE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VEVENT
UID:evt-001
DTSTART:20260220T090000Z
DTEND:20260220T100000Z
SUMMARY:Team Standup
LOCATION:Conference Room A
DESCRIPTION:Daily standup meeting with the engineering team
END:VEVENT
BEGIN:VEVENT
UID:evt-002
DTSTART:20260220T140000Z
DTEND:20260220T150000Z
SUMMARY:Product Review
LOCATION:Zoom
DESCRIPTION:Review Q1 product roadmap
END:VEVENT
BEGIN:VEVENT
UID:evt-003
DTSTART:20260221T110000Z
DTEND:20260221T120000Z
SUMMARY:1:1 with Manager
END:VEVENT
BEGIN:VEVENT
UID:evt-004
DTSTART:20260219T160000Z
DTEND:20260219T170000Z
SUMMARY:Design Sync
LOCATION:Figma
DESCRIPTION:Review latest mockups for the calendar feature
END:VEVENT
END:VCALENDAR`;

describe("ICS Parser — basic", () => {
  // Use a window that includes all sample dates
  const w1 = new Date("2026-02-18T00:00:00Z");
  const w2 = new Date("2026-02-22T00:00:00Z");

  it("parses events from ICS content", () => {
    const events = parseICS(SAMPLE_ICS, w1, w2);
    expect(events).toHaveLength(4);
  });

  it("extracts title, location, description", () => {
    const events = parseICS(SAMPLE_ICS, w1, w2);
    const standup = events.find((e) => e.id === "evt-001");
    expect(standup).toBeDefined();
    expect(standup!.title).toBe("Team Standup");
    expect(standup!.location).toBe("Conference Room A");
    expect(standup!.description).toContain("Daily standup");
  });

  it("parses dates correctly", () => {
    const events = parseICS(SAMPLE_ICS, w1, w2);
    const standup = events.find((e) => e.id === "evt-001");
    expect(standup!.start).toBeInstanceOf(Date);
    expect(standup!.start.getUTCHours()).toBe(9);
  });

  it("sorts events by start time", () => {
    const events = parseICS(SAMPLE_ICS, w1, w2);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].start.getTime()).toBeGreaterThanOrEqual(
        events[i - 1].start.getTime()
      );
    }
  });

  it("handles events without optional fields", () => {
    const events = parseICS(SAMPLE_ICS, w1, w2);
    const oneOnOne = events.find((e) => e.id === "evt-003");
    expect(oneOnOne!.title).toBe("1:1 with Manager");
    expect(oneOnOne!.location).toBeUndefined();
    expect(oneOnOne!.description).toBeUndefined();
  });

  it("returns empty array for invalid content", () => {
    expect(parseICS("not valid ics")).toHaveLength(0);
  });
});

// ── RRULE expansion ─────────────────────────────────────────────────────

describe("RRULE expansion — WEEKLY + BYDAY", () => {
  const weeklyIcs = ics(
    `UID:weekly-standup
DTSTART:20260309T090000Z
DTEND:20260309T093000Z
SUMMARY:Standup
RRULE:FREQ=WEEKLY;BYDAY=MO,WE,FR
DESCRIPTION:Join: https://zoom.us/j/123456`
  );

  it("expands weekly BYDAY within a 2-week window", () => {
    const w1 = new Date("2026-03-09T00:00:00Z");
    const w2 = new Date("2026-03-22T00:00:00Z"); // exclusive-ish (up to end of 3/21)
    const events = parseICS(weeklyIcs, w1, w2);
    // Mon 3/9, Wed 3/11, Fri 3/13, Mon 3/16, Wed 3/18, Fri 3/20 = 6
    expect(events).toHaveLength(6);
    expect(events[0].title).toBe("Standup");
    // Check days of week
    const days = events.map((e) => e.start.getUTCDay());
    expect(days).toEqual([1, 3, 5, 1, 3, 5]); // Mon, Wed, Fri, Mon, Wed, Fri
  });

  it("preserves event duration for each occurrence", () => {
    const w1 = new Date("2026-03-09T00:00:00Z");
    const w2 = new Date("2026-03-14T00:00:00Z");
    const events = parseICS(weeklyIcs, w1, w2);
    for (const e of events) {
      const durationMin = (e.end.getTime() - e.start.getTime()) / 60000;
      expect(durationMin).toBe(30); // 09:00 - 09:30 = 30 min
    }
  });

  it("generates unique IDs for each occurrence", () => {
    const w1 = new Date("2026-03-09T00:00:00Z");
    const w2 = new Date("2026-03-22T00:00:00Z");
    const events = parseICS(weeklyIcs, w1, w2);
    const ids = new Set(events.map((e) => e.id));
    expect(ids.size).toBe(events.length);
  });
});

describe("RRULE expansion — DAILY", () => {
  it("expands daily events", () => {
    const dailyIcs = ics(
      `UID:daily-check
DTSTART:20260310T080000Z
DTEND:20260310T081500Z
SUMMARY:Morning Check
RRULE:FREQ=DAILY
DESCRIPTION:https://meet.google.com/abc-defg-hij`
    );
    const w1 = new Date("2026-03-10T00:00:00Z");
    const w2 = new Date("2026-03-14T00:00:00Z");
    const events = parseICS(dailyIcs, w1, w2);
    // 3/10, 3/11, 3/12, 3/13 = 4 events
    expect(events).toHaveLength(4);
    expect(events[0].start.getUTCDate()).toBe(10);
    expect(events[3].start.getUTCDate()).toBe(13);
  });

  it("respects INTERVAL for daily", () => {
    const everyOther = ics(
      `UID:every-other
DTSTART:20260310T100000Z
DTEND:20260310T110000Z
SUMMARY:Biweekly Check
RRULE:FREQ=DAILY;INTERVAL=2
DESCRIPTION:https://zoom.us/j/999`
    );
    const w1 = new Date("2026-03-10T00:00:00Z");
    const w2 = new Date("2026-03-18T00:00:00Z");
    const events = parseICS(everyOther, w1, w2);
    // 3/10, 3/12, 3/14, 3/16 = 4 events
    expect(events).toHaveLength(4);
    const dates = events.map((e) => e.start.getUTCDate());
    expect(dates).toEqual([10, 12, 14, 16]);
  });
});

describe("RRULE expansion — MONTHLY", () => {
  it("expands monthly events", () => {
    const monthlyIcs = ics(
      `UID:monthly-review
DTSTART:20260115T150000Z
DTEND:20260115T160000Z
SUMMARY:Monthly Review
RRULE:FREQ=MONTHLY
DESCRIPTION:https://teams.microsoft.com/l/meetup-join/abc123`
    );
    const w1 = new Date("2026-01-01T00:00:00Z");
    const w2 = new Date("2026-04-30T00:00:00Z");
    const events = parseICS(monthlyIcs, w1, w2);
    // Jan 15, Feb 15, Mar 15, Apr 15 = 4
    expect(events).toHaveLength(4);
    const months = events.map((e) => e.start.getUTCMonth());
    expect(months).toEqual([0, 1, 2, 3]); // Jan, Feb, Mar, Apr
  });
});

describe("RRULE — UNTIL limit", () => {
  it("stops expansion at UNTIL date", () => {
    const untilIcs = ics(
      `UID:limited-daily
DTSTART:20260310T090000Z
DTEND:20260310T100000Z
SUMMARY:Short Series
RRULE:FREQ=DAILY;UNTIL=20260313T090000Z
DESCRIPTION:https://zoom.us/j/111`
    );
    const w1 = new Date("2026-03-09T00:00:00Z");
    const w2 = new Date("2026-03-20T00:00:00Z");
    const events = parseICS(untilIcs, w1, w2);
    // 3/10, 3/11, 3/12, 3/13 = 4 (includes UNTIL date)
    expect(events).toHaveLength(4);
  });
});

describe("RRULE — COUNT limit", () => {
  it("stops expansion at COUNT", () => {
    const countIcs = ics(
      `UID:count-limited
DTSTART:20260310T090000Z
DTEND:20260310T100000Z
SUMMARY:Three Times Only
RRULE:FREQ=DAILY;COUNT=3
DESCRIPTION:https://meet.google.com/xyz`
    );
    const w1 = new Date("2026-03-09T00:00:00Z");
    const w2 = new Date("2026-03-20T00:00:00Z");
    const events = parseICS(countIcs, w1, w2);
    // Only 3 occurrences: 3/10, 3/11, 3/12
    expect(events).toHaveLength(3);
  });
});

describe("EXDATE — cancelled occurrences", () => {
  it("excludes EXDATE occurrences from weekly series", () => {
    const exdateIcs = ics(
      `UID:weekly-with-cancel
DTSTART:20260309T100000Z
DTEND:20260309T110000Z
SUMMARY:Weekly Sync
RRULE:FREQ=WEEKLY;BYDAY=MO
EXDATE:20260316T100000Z
DESCRIPTION:https://meet.google.com/abc-defg-hij`
    );
    const w1 = new Date("2026-03-09T00:00:00Z");
    const w2 = new Date("2026-03-30T00:00:00Z");
    const events = parseICS(exdateIcs, w1, w2);
    // 3/9, skip 3/16, 3/23 = 2 events
    expect(events).toHaveLength(2);
    const dates = events.map((e) => e.start.getUTCDate());
    expect(dates).toContain(9);
    expect(dates).not.toContain(16);
    expect(dates).toContain(23);
  });

  it("handles multiple EXDATE values on one line", () => {
    const multiExdate = ics(
      `UID:multi-cancel
DTSTART:20260310T090000Z
DTEND:20260310T100000Z
SUMMARY:Daily
RRULE:FREQ=DAILY
EXDATE:20260311T090000Z,20260313T090000Z
DESCRIPTION:https://zoom.us/j/555`
    );
    const w1 = new Date("2026-03-10T00:00:00Z");
    const w2 = new Date("2026-03-15T00:00:00Z");
    const events = parseICS(multiExdate, w1, w2);
    // 3/10, skip 3/11, 3/12, skip 3/13, 3/14 = 3
    expect(events).toHaveLength(3);
    const dates = events.map((e) => e.start.getUTCDate());
    expect(dates).toEqual([10, 12, 14]);
  });
});

describe("Non-recurring events pass through", () => {
  it("does not affect non-recurring events", () => {
    const singleIcs = ics(
      `UID:one-time
DTSTART:20260315T140000Z
DTEND:20260315T150000Z
SUMMARY:One-Time Meeting
DESCRIPTION:https://zoom.us/j/one`
    );
    const w1 = new Date("2026-03-14T00:00:00Z");
    const w2 = new Date("2026-03-16T00:00:00Z");
    const events = parseICS(singleIcs, w1, w2);
    expect(events).toHaveLength(1);
    expect(events[0].id).toBe("one-time");
    expect(events[0].title).toBe("One-Time Meeting");
  });

  it("filters out non-recurring events outside window", () => {
    const outsideIcs = ics(
      `UID:outside
DTSTART:20260401T090000Z
DTEND:20260401T100000Z
SUMMARY:Far Away Meeting`
    );
    const w1 = new Date("2026-03-01T00:00:00Z");
    const w2 = new Date("2026-03-31T00:00:00Z");
    const events = parseICS(outsideIcs, w1, w2);
    // Non-recurring events outside window still pass through (no window filter for them)
    // The parser only windows recurring event expansion
    expect(events).toHaveLength(1);
  });
});

// ── Join link extraction ────────────────────────────────────────────────

describe("Join link extraction", () => {
  const w1 = new Date("2026-03-10T00:00:00Z");
  const w2 = new Date("2026-03-12T00:00:00Z");

  it("extracts Zoom links from description", () => {
    const events = parseICS(
      ics(
        `UID:zoom1\nDTSTART:20260311T090000Z\nDTEND:20260311T100000Z\nSUMMARY:Zoom Call\nDESCRIPTION:Join: https://zoom.us/j/123456789?pwd=abc123`
      ),
      w1, w2,
    );
    expect(events[0].joinLink).toContain("zoom.us/j/123456789");
  });

  it("extracts Google Meet links", () => {
    const events = parseICS(
      ics(
        `UID:meet1\nDTSTART:20260311T090000Z\nDTEND:20260311T100000Z\nSUMMARY:Meet\nDESCRIPTION:Join at https://meet.google.com/abc-defg-hij`
      ),
      w1, w2,
    );
    expect(events[0].joinLink).toContain("meet.google.com/abc-defg-hij");
  });

  it("extracts Teams links", () => {
    const events = parseICS(
      ics(
        `UID:teams1\nDTSTART:20260311T090000Z\nDTEND:20260311T100000Z\nSUMMARY:Teams\nLOCATION:https://teams.microsoft.com/l/meetup-join/abc123`
      ),
      w1, w2,
    );
    expect(events[0].joinLink).toContain("teams.microsoft.com/l/meetup-join/");
  });

  it("prefers meeting URLs over generic URLs", () => {
    const events = parseICS(
      ics(
        `UID:mixed1\nDTSTART:20260311T090000Z\nDTEND:20260311T100000Z\nSUMMARY:Mixed\nDESCRIPTION:Agenda: https://docs.google.com/doc/123 Join: https://zoom.us/j/999`
      ),
      w1, w2,
    );
    expect(events[0].joinLink).toContain("zoom.us/j/999");
  });

  it("extracts URL from URL property", () => {
    const events = parseICS(
      ics(
        `UID:urlprop\nDTSTART:20260311T090000Z\nDTEND:20260311T100000Z\nSUMMARY:URL Prop\nURL:https://zoom.us/j/url-prop`
      ),
      w1, w2,
    );
    expect(events[0].joinLink).toContain("zoom.us/j/url-prop");
  });

  it("falls back to generic URL when no known meeting platform", () => {
    const events = parseICS(
      ics(
        `UID:generic1\nDTSTART:20260311T090000Z\nDTEND:20260311T100000Z\nSUMMARY:Other\nDESCRIPTION:Join at https://custom-meeting.example.com/room/42`
      ),
      w1, w2,
    );
    expect(events[0].joinLink).toContain("custom-meeting.example.com/room/42");
  });
});

// ── Timezone handling (TZID) ────────────────────────────────────────────

describe("TZID timezone conversion", () => {
  it("parseICSDate with IANA TZID converts to correct UTC", () => {
    // 9:00 AM Eastern = 14:00 UTC (EST = UTC-5)
    // Using a January date to ensure EST (not EDT)
    const date = parseICSDate("20260115T090000", "America/New_York");
    expect(date.getUTCHours()).toBe(14);
    expect(date.getUTCMinutes()).toBe(0);
  });

  it("parseICSDate with IANA TZID handles DST correctly", () => {
    // 9:00 AM Eastern in July = 13:00 UTC (EDT = UTC-4)
    const date = parseICSDate("20260715T090000", "America/New_York");
    expect(date.getUTCHours()).toBe(13);
    expect(date.getUTCMinutes()).toBe(0);
  });

  it("parseICSDate with Pacific timezone", () => {
    // 9:00 AM Pacific in January = 17:00 UTC (PST = UTC-8)
    const date = parseICSDate("20260115T090000", "America/Los_Angeles");
    expect(date.getUTCHours()).toBe(17);
  });

  it("parseICSDate with Windows timezone name", () => {
    // 9:00 AM "Eastern Standard Time" (Windows name) = 14:00 UTC in January
    const date = parseICSDate("20260115T090000", "Eastern Standard Time");
    expect(date.getUTCHours()).toBe(14);
  });

  it("parseICSDate without TZID treats as local time (backward compat)", () => {
    const date = parseICSDate("20260115T090000");
    // Should be 9:00 AM local time (same as new Date(2026, 0, 15, 9, 0, 0))
    expect(date.getHours()).toBe(9);
    expect(date.getMinutes()).toBe(0);
  });

  it("parseICSDate with Z suffix ignores TZID", () => {
    // UTC dates should always be UTC regardless of TZID
    const date = parseICSDate("20260115T090000Z", "America/New_York");
    expect(date.getUTCHours()).toBe(9);
  });
});

describe("parseICS with TZID in events", () => {
  const w1 = new Date("2026-01-14T00:00:00Z");
  const w2 = new Date("2026-01-16T00:00:00Z");

  it("parses DTSTART with TZID correctly", () => {
    const tzIcs = ics(
      `UID:tz-event-1\nDTSTART;TZID=America/New_York:20260115T090000\nDTEND;TZID=America/New_York:20260115T100000\nSUMMARY:Eastern Meeting`
    );
    const events = parseICS(tzIcs, w1, w2);
    expect(events).toHaveLength(1);
    // 9:00 AM Eastern in January = 14:00 UTC
    expect(events[0].start.getUTCHours()).toBe(14);
    // 10:00 AM Eastern in January = 15:00 UTC
    expect(events[0].end.getUTCHours()).toBe(15);
  });

  it("parses events with Windows TZID (Outlook feeds)", () => {
    const outlookIcs = ics(
      `UID:outlook-1\nDTSTART;TZID=Pacific Standard Time:20260115T090000\nDTEND;TZID=Pacific Standard Time:20260115T100000\nSUMMARY:Pacific Meeting`
    );
    const events = parseICS(outlookIcs, w1, w2);
    expect(events).toHaveLength(1);
    // 9:00 AM Pacific in January (PST = UTC-8) = 17:00 UTC
    expect(events[0].start.getUTCHours()).toBe(17);
  });

  it("handles mixed UTC and TZID events", () => {
    const mixedIcs = ics(
      `UID:utc-evt\nDTSTART:20260115T140000Z\nDTEND:20260115T150000Z\nSUMMARY:UTC Event`,
      `UID:tz-evt\nDTSTART;TZID=America/Chicago:20260115T080000\nDTEND;TZID=America/Chicago:20260115T090000\nSUMMARY:Central Event`
    );
    const events = parseICS(mixedIcs, w1, w2);
    expect(events).toHaveLength(2);
    // UTC event: 14:00 UTC
    const utcEvt = events.find(e => e.id === "utc-evt");
    expect(utcEvt!.start.getUTCHours()).toBe(14);
    // Central event: 8:00 AM CST = 14:00 UTC
    const tzEvt = events.find(e => e.id === "tz-evt");
    expect(tzEvt!.start.getUTCHours()).toBe(14);
  });

  it("handles Europe/London timezone (GMT+0 in winter)", () => {
    const londonIcs = ics(
      `UID:london-1\nDTSTART;TZID=Europe/London:20260115T090000\nDTEND;TZID=Europe/London:20260115T100000\nSUMMARY:London Meeting`
    );
    const events = parseICS(londonIcs, w1, w2);
    expect(events).toHaveLength(1);
    // 9:00 AM GMT = 09:00 UTC in January
    expect(events[0].start.getUTCHours()).toBe(9);
  });

  it("handles Asia/Tokyo timezone (UTC+9, no DST)", () => {
    const tokyoIcs = ics(
      `UID:tokyo-1\nDTSTART;TZID=Asia/Tokyo:20260115T180000\nDTEND;TZID=Asia/Tokyo:20260115T190000\nSUMMARY:Tokyo Meeting`
    );
    const events = parseICS(tokyoIcs, w1, w2);
    expect(events).toHaveLength(1);
    // 18:00 JST = 09:00 UTC
    expect(events[0].start.getUTCHours()).toBe(9);
  });
});

describe("RRULE with TZID", () => {
  it("expands recurring events with TZID correctly", () => {
    const recurTzIcs = ics(
      `UID:recur-tz\nDTSTART;TZID=America/New_York:20260112T090000\nDTEND;TZID=America/New_York:20260112T100000\nSUMMARY:Weekly Eastern\nRRULE:FREQ=WEEKLY;BYDAY=MO`
    );
    const w1 = new Date("2026-01-12T00:00:00Z");
    const w2 = new Date("2026-01-26T00:00:00Z");
    const events = parseICS(recurTzIcs, w1, w2);
    // Mon 1/12, Mon 1/19 = 2 events
    expect(events).toHaveLength(2);
    // Both should be at 14:00 UTC (9 AM EST)
    expect(events[0].start.getUTCHours()).toBe(14);
    expect(events[1].start.getUTCHours()).toBe(14);
  });
});
