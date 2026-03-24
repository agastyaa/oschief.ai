import { describe, it, expect } from "vitest"
import { vi } from "vitest"

// Mock database, fs, os
vi.mock("../../electron/main/storage/database", () => ({
  getSetting: vi.fn(() => null),
  setSetting: vi.fn(),
}))
vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal() as any
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    statSync: vi.fn(() => ({ isDirectory: () => true })),
  }
})
vi.mock("os", async (importOriginal) => {
  const actual = await importOriginal() as any
  return { ...actual, homedir: vi.fn(() => "/Users/testuser") }
})

import { sanitizeFilename, buildVaultNotePath } from "../../electron/main/vault/vault-config"

describe("sanitizeFilename", () => {
  it("replaces invalid characters", () => {
    expect(sanitizeFilename('Hello/World:Test?')).toBe("Hello-World-Test-")
  })

  it("handles normal names unchanged", () => {
    expect(sanitizeFilename("Customer call - ACME")).toBe("Customer call - ACME")
  })

  it("trims whitespace", () => {
    expect(sanitizeFilename("  spaced  ")).toBe("spaced")
  })

  it("collapses multiple spaces", () => {
    expect(sanitizeFilename("too   many   spaces")).toBe("too many spaces")
  })
})

describe("buildVaultNotePath", () => {
  it("builds path with date, title, and short ID", () => {
    const result = buildVaultNotePath("2026-03-23", "Customer Call", "abc12345-long-uuid")
    expect(result).toContain("meetings")
    expect(result).toContain("2026-03-23")
    expect(result).toContain("Customer Call")
    expect(result).toContain("abc12345")
    expect(result.endsWith(".md")).toBe(true)
  })

  it("sanitizes title in path", () => {
    const result = buildVaultNotePath("2026-03-23", "Call: Q&A?", "abc12345")
    expect(result).not.toContain(":")
    expect(result).not.toContain("?")
  })

  it("handles empty title", () => {
    const result = buildVaultNotePath("2026-03-23", "", "abc12345")
    expect(result).toContain("Untitled Meeting")
  })
})
