import { describe, it, expect } from "vitest"
import { buildAnonymizationMap, anonymize, deanonymize } from "../../electron/main/memory/anonymizer"

// Mock getSetting since it depends on DB
import { vi } from "vitest"
vi.mock("../../electron/main/storage/database", () => ({
  getSetting: vi.fn(() => null),
  setSetting: vi.fn(),
}))

describe("buildAnonymizationMap", () => {
  it("maps names to Person A, B, C labels", () => {
    const map = buildAnonymizationMap(["Jane Doe", "Bob Smith"])
    expect(map.forward.get("Jane Doe")).toBe("Person A")
    expect(map.forward.get("Bob Smith")).toBe("Person B")
    expect(map.reverse.get("Person A")).toBe("Jane Doe")
    expect(map.reverse.get("Person B")).toBe("Bob Smith")
  })

  it("also maps lowercase and first-name variants", () => {
    const map = buildAnonymizationMap(["Jane Doe"])
    expect(map.forward.get("jane doe")).toBe("Person A")
    expect(map.forward.get("Jane")).toBe("Person A")
    expect(map.forward.get("jane")).toBe("Person A")
  })

  it("handles empty input", () => {
    const map = buildAnonymizationMap([])
    expect(map.forward.size).toBe(0)
    expect(map.reverse.size).toBe(0)
  })

  it("deduplicates names", () => {
    const map = buildAnonymizationMap(["Jane", "Jane", "Bob"])
    expect(map.reverse.size).toBe(2) // only 2 unique names
  })
})

describe("anonymize", () => {
  it("replaces names in text", () => {
    const map = buildAnonymizationMap(["Jane Doe", "Bob Smith"])
    const text = "Jane Doe discussed the budget with Bob Smith."
    const result = anonymize(text, map)
    expect(result).toBe("Person A discussed the budget with Person B.")
  })

  it("handles case-insensitive replacement", () => {
    const map = buildAnonymizationMap(["Jane Doe"])
    expect(anonymize("jane doe said hello", map)).toContain("Person A")
  })

  it("returns unchanged text when no names match", () => {
    const map = buildAnonymizationMap(["Jane Doe"])
    expect(anonymize("The meeting was productive.", map)).toBe("The meeting was productive.")
  })

  it("returns unchanged text with empty map", () => {
    const map = buildAnonymizationMap([])
    expect(anonymize("Hello world", map)).toBe("Hello world")
  })
})

describe("deanonymize", () => {
  it("restores real names from labels", () => {
    const map = buildAnonymizationMap(["Jane Doe", "Bob Smith"])
    const text = "Person A will send the report to Person B."
    expect(deanonymize(text, map)).toBe("Jane Doe will send the report to Bob Smith.")
  })

  it("returns unchanged text with empty map", () => {
    const map = buildAnonymizationMap([])
    expect(deanonymize("Person A said something", map)).toBe("Person A said something")
  })
})
