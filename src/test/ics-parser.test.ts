import { describe, it, expect } from "vitest";
import { parseICS } from "@/lib/ics-parser";

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

describe("ICS Parser", () => {
  it("parses events from ICS content", () => {
    const events = parseICS(SAMPLE_ICS);
    expect(events).toHaveLength(4);
  });

  it("extracts title, location, description", () => {
    const events = parseICS(SAMPLE_ICS);
    const standup = events.find(e => e.id === "evt-001");
    expect(standup).toBeDefined();
    expect(standup!.title).toBe("Team Standup");
    expect(standup!.location).toBe("Conference Room A");
    expect(standup!.description).toBe("Daily standup meeting with the engineering team");
  });

  it("parses dates correctly", () => {
    const events = parseICS(SAMPLE_ICS);
    const standup = events.find(e => e.id === "evt-001");
    expect(standup!.start).toBeInstanceOf(Date);
    expect(standup!.start.getUTCHours()).toBe(9);
  });

  it("sorts events by start time", () => {
    const events = parseICS(SAMPLE_ICS);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].start.getTime()).toBeGreaterThanOrEqual(events[i - 1].start.getTime());
    }
  });

  it("handles events without optional fields", () => {
    const events = parseICS(SAMPLE_ICS);
    const oneOnOne = events.find(e => e.id === "evt-003");
    expect(oneOnOne!.title).toBe("1:1 with Manager");
    expect(oneOnOne!.location).toBeUndefined();
    expect(oneOnOne!.description).toBeUndefined();
  });

  it("returns empty array for invalid content", () => {
    const events = parseICS("not valid ics");
    expect(events).toHaveLength(0);
  });
});
