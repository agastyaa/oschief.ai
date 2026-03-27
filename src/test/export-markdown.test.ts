import { describe, it, expect } from "vitest"
import { buildMarkdownBody, noteToMarkdown } from "@/lib/export-markdown"

const mockNote = (overrides: any = {}) => ({
  id: "test-123",
  title: "Weekly Standup",
  date: "2026-03-23",
  time: "10:00 AM",
  duration: "25:30",
  transcript: [],
  summary: {
    overview: "Discussed Q3 planning and timeline.",
    keyPoints: ["Budget approved", "Deadline moved to April"],
    decisions: ["Launch delayed by 2 weeks"],
    actionItems: [{ text: "Send forecast", assignee: "Jane", done: false }],
  },
  ...overrides,
})

describe("buildMarkdownBody", () => {
  it("includes summary sections", () => {
    const parts = buildMarkdownBody(mockNote())
    const body = parts.join("\n")
    expect(body).toContain("## Summary")
    expect(body).toContain("Q3 planning")
    expect(body).toContain("## Key Points")
    expect(body).toContain("Budget approved")
    expect(body).toContain("## Decisions")
    expect(body).toContain("Launch delayed")
    expect(body).toContain("## Action Items")
    expect(body).toContain("Send forecast")
  })

  it("handles note with no summary", () => {
    const parts = buildMarkdownBody(mockNote({ summary: null }))
    expect(parts.length).toBe(0)
  })

  it("includes personal notes", () => {
    const parts = buildMarkdownBody(mockNote({ personalNotes: "My private thoughts" }))
    const body = parts.join("\n")
    expect(body).toContain("## Personal Notes")
    expect(body).toContain("My private thoughts")
  })

  it("excludes transcript by default (too verbose for sharing)", () => {
    const parts = buildMarkdownBody(mockNote({
      transcript: [{ speaker: "Jane", time: "0:01", text: "Hello" }]
    }))
    const body = parts.join("\n")
    // Transcript is excluded from default export — use noteToMarkdownFull() for full export
    expect(body).not.toContain("## Transcript")
  })

  it("marks done action items with [x]", () => {
    const parts = buildMarkdownBody(mockNote({
      summary: { actionItems: [{ text: "Done task", done: true }] }
    }))
    const body = parts.join("\n")
    expect(body).toContain("[x] Done task")
  })
})

describe("noteToMarkdown", () => {
  it("starts with title as h1", () => {
    const md = noteToMarkdown(mockNote())
    expect(md.startsWith("# Weekly Standup")).toBe(true)
  })

  it("includes metadata line", () => {
    const md = noteToMarkdown(mockNote())
    expect(md).toContain("**Date:** 2026-03-23")
    expect(md).toContain("**Duration:** 25:30")
  })

  it("uses Untitled Meeting for empty title", () => {
    const md = noteToMarkdown(mockNote({ title: "" }))
    expect(md).toContain("# Untitled Meeting")
  })
})
