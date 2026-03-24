import { describe, it, expect } from "vitest"
import { levenshteinDistance, similarity, findBestMatch } from "../../electron/main/memory/fuzzy-match"

describe("levenshteinDistance", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshteinDistance("hello", "hello")).toBe(0)
  })

  it("returns string length for empty vs non-empty", () => {
    expect(levenshteinDistance("", "abc")).toBe(3)
    expect(levenshteinDistance("xyz", "")).toBe(3)
  })

  it("counts single character substitutions", () => {
    expect(levenshteinDistance("cat", "car")).toBe(1)
  })

  it("counts insertions and deletions", () => {
    expect(levenshteinDistance("abc", "abcd")).toBe(1)
    expect(levenshteinDistance("abcd", "abc")).toBe(1)
  })

  it("handles completely different strings", () => {
    expect(levenshteinDistance("abc", "xyz")).toBe(3)
  })
})

describe("similarity", () => {
  it("returns 1 for identical strings", () => {
    expect(similarity("hello", "hello")).toBe(1)
  })

  it("returns 1 for case-insensitive match", () => {
    expect(similarity("Hello", "hello")).toBe(1)
  })

  it("returns 0 for completely different equal-length strings", () => {
    expect(similarity("abc", "xyz")).toBe(0)
  })

  it("returns value between 0 and 1 for partial matches", () => {
    const s = similarity("ACME Revamp", "ACME redesign")
    expect(s).toBeGreaterThan(0.3)
    expect(s).toBeLessThan(0.9)
  })
})

describe("findBestMatch", () => {
  const items = [
    { id: 1, name: "ACME Revamp" },
    { id: 2, name: "Project Phoenix" },
    { id: 3, name: "Budget Review" },
  ]

  it("finds exact match", () => {
    const result = findBestMatch("ACME Revamp", items, i => i.name)
    expect(result).not.toBeNull()
    expect(result!.item.id).toBe(1)
    expect(result!.score).toBe(1)
  })

  it("finds case-insensitive match", () => {
    const result = findBestMatch("acme revamp", items, i => i.name)
    expect(result).not.toBeNull()
    expect(result!.item.id).toBe(1)
  })

  it("returns null when no match above threshold", () => {
    const result = findBestMatch("Completely Unrelated", items, i => i.name, 0.7)
    expect(result).toBeNull()
  })

  it("returns null for empty candidates", () => {
    const result = findBestMatch("anything", [], (i: any) => i.name)
    expect(result).toBeNull()
  })
})
