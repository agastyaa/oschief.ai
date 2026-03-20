import { describe, it, expect } from "vitest";
import {
  accountNameAppearsInText,
  formatRecentTranscriptForMention,
} from "@/lib/account-context";

describe("accountNameAppearsInText", () => {
  it("matches case-insensitive whole word", () => {
    expect(accountNameAppearsInText("Sagar", "Yes, Sagar has his hand up.")).toBe(true);
    expect(accountNameAppearsInText("Sagar", "sagar please go ahead")).toBe(true);
  });

  it("rejects fuzzy/STT mishearings (strict mode)", () => {
    expect(accountNameAppearsInText("Sagar", "Yes, cigar has his hand raised.")).toBe(false);
    expect(accountNameAppearsInText("Sagar", "Saagar, go ahead please.")).toBe(false);
    expect(accountNameAppearsInText("Sagar", "Thanks, Saagar.")).toBe(false);
  });

  it("does not match substring", () => {
    expect(accountNameAppearsInText("Ann", "Planning session")).toBe(false);
  });

  it("does not match short names embedded in other words", () => {
    expect(accountNameAppearsInText("Ann", "We need to look at this and that.")).toBe(false);
  });

  it("matches multi-word name as phrase", () => {
    expect(accountNameAppearsInText("Mary Jane", "I think Mary Jane should comment.")).toBe(true);
    expect(accountNameAppearsInText("Mary Jane", "Mary Smith only")).toBe(false);
  });
});

describe("formatRecentTranscriptForMention", () => {
  it("formats last lines with speaker tags", () => {
    const lines = [
      { speaker: "Others", time: "0:01", text: "Hi" },
      { speaker: "You", time: "0:02", text: "Hello" },
    ];
    expect(formatRecentTranscriptForMention(lines, 10)).toContain("[You] Hello");
    expect(formatRecentTranscriptForMention(lines, 10)).toContain("[Others] Hi");
  });
});
