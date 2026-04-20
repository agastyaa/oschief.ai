import { describe, it, expect } from "vitest"

/**
 * Mirror of the correction pattern set inside AskBar.tsx so we can lock
 * the "tell the AI to edit/replace text in the summary" behavior with
 * fixture coverage. If these change in AskBar.tsx, change them here too.
 */
const correctionPatterns: Array<{ rx: RegExp; inverted?: boolean }> = [
  { rx: /(?:rename|replace|change|correct|update|fix|edit|swap|substitute|alter)\s+["'`]?(.+?)["'`]?\s+(?:to|with|into|→|-->|->)\s+["'`]?(.+?)["'`]?(?:\s+(?:across|in|everywhere|throughout|please|thanks|thx).*|[.?!]*)?$/i },
  { rx: /["'`]?([^"'`]+?)["'`]?\s+should\s+(?:be|read|say)\s+["'`]?([^"'`]+?)["'`]?(?:\s+(?:across|in|everywhere|throughout|please).*|[.?!]*)?$/i },
  { rx: /it'?s\s+["'`]?([^"'`]+?)["'`]?\s+not\s+["'`]?([^"'`]+?)["'`]?[.?!]*$/i, inverted: true },
  { rx: /["'`]([^"'`]+)["'`]\s*(?:→|-->|->)\s*["'`]([^"'`]+)["'`]/i },
]

function parse(q: string): { find: string; replace: string } | null {
  for (const { rx, inverted } of correctionPatterns) {
    const match = q.match(rx)
    if (match?.[1] && match?.[2]) {
      const find = inverted ? match[2].trim() : match[1].trim()
      const replace = inverted ? match[1].trim() : match[2].trim()
      if (find && replace && find !== replace && find.length < 200 && replace.length < 200) {
        return { find, replace }
      }
    }
  }
  return null
}

describe("AskBar correction intent parser", () => {
  it.each([
    ["replace OCR with optical character recognition", { find: "OCR", replace: "optical character recognition" }],
    ["change Acme to Acme Corp", { find: "Acme", replace: "Acme Corp" }],
    ["rename Sarah to Sarah Chen", { find: "Sarah", replace: "Sarah Chen" }],
    ["correct mobile app to native app", { find: "mobile app", replace: "native app" }],
    ["update q3 to Q3 2026", { find: "q3", replace: "Q3 2026" }],
    ["fix Ajay to Agay", { find: "Ajay", replace: "Agay" }],
    ["edit beta to v2 beta", { find: "beta", replace: "v2 beta" }],
    ["swap vendor A with vendor B", { find: "vendor A", replace: "vendor B" }],
  ])("verb form: %s", (input, expected) => {
    expect(parse(input)).toEqual(expected)
  })

  it.each([
    ["change OCR to OCR technology in the summary", { find: "OCR", replace: "OCR technology" }],
    ["can you change OCR to OCR technology?", { find: "OCR", replace: "OCR technology" }],
    ["please replace foo with bar throughout", { find: "foo", replace: "bar" }],
    ["rename John to John Smith everywhere please", { find: "John", replace: "John Smith" }],
    ["replace mobile with app thanks", { find: "mobile", replace: "app" }],
  ])("tolerates trailing context: %s", (input, expected) => {
    expect(parse(input)).toEqual(expected)
  })

  it.each([
    ["OCR should be optical character recognition", { find: "OCR", replace: "optical character recognition" }],
    ["'mobile app' should be 'native app'", { find: "mobile app", replace: "native app" }],
    ["the title should read Q3 Kickoff", { find: "the title", replace: "Q3 Kickoff" }],
  ])("'should be' form: %s", (input, expected) => {
    expect(parse(input)).toEqual(expected)
  })

  it.each([
    ["it's Ajay not Agay", { find: "Agay", replace: "Ajay" }],
    ["its Sarah not Sarha", { find: "Sarha", replace: "Sarah" }],
    ["it's OCR tech not OCR.", { find: "OCR", replace: "OCR tech" }],
  ])("'it's X not Y' inverted form: %s", (input, expected) => {
    expect(parse(input)).toEqual(expected)
  })

  it.each([
    ['"OCR" → "optical character recognition"', { find: "OCR", replace: "optical character recognition" }],
    ['"mobile" -> "native"', { find: "mobile", replace: "native" }],
  ])("quoted arrow form: %s", (input, expected) => {
    expect(parse(input)).toEqual(expected)
  })

  it.each([
    "what did we discuss?",
    "summarize this meeting",
    "who owns the action items",
    "give me a tldr",
    "change",
  ])("unrelated queries do not trigger correction: %s", (input) => {
    expect(parse(input)).toBe(null)
  })

  it("rejects identical find and replace", () => {
    expect(parse("change foo to foo")).toBe(null)
  })
})
