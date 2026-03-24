import { describe, it, expect } from "vitest"
import { parseVCF } from "../../electron/main/integrations/contacts-import"

describe("parseVCF", () => {
  it("parses a simple vCard 3.0", () => {
    const vcf = `BEGIN:VCARD
VERSION:3.0
FN:Jane Doe
EMAIL;TYPE=INTERNET:jane@acme.com
ORG:ACME Corp
TITLE:Product Manager
END:VCARD`
    const contacts = parseVCF(vcf)
    expect(contacts).toHaveLength(1)
    expect(contacts[0].name).toBe("Jane Doe")
    expect(contacts[0].email).toBe("jane@acme.com")
    expect(contacts[0].company).toBe("ACME Corp")
    expect(contacts[0].role).toBe("Product Manager")
  })

  it("parses multiple vCards", () => {
    const vcf = `BEGIN:VCARD
VERSION:3.0
FN:Jane Doe
EMAIL:jane@acme.com
END:VCARD
BEGIN:VCARD
VERSION:3.0
FN:Bob Smith
EMAIL:bob@example.com
END:VCARD`
    const contacts = parseVCF(vcf)
    expect(contacts).toHaveLength(2)
    expect(contacts[0].name).toBe("Jane Doe")
    expect(contacts[1].name).toBe("Bob Smith")
  })

  it("falls back to N field if FN is missing", () => {
    const vcf = `BEGIN:VCARD
VERSION:3.0
N:Doe;Jane;;;
EMAIL:jane@acme.com
END:VCARD`
    const contacts = parseVCF(vcf)
    expect(contacts).toHaveLength(1)
    expect(contacts[0].name).toBe("Jane Doe")
  })

  it("handles vCard with no email", () => {
    const vcf = `BEGIN:VCARD
VERSION:3.0
FN:No Email Person
END:VCARD`
    const contacts = parseVCF(vcf)
    expect(contacts).toHaveLength(1)
    expect(contacts[0].email).toBeUndefined()
  })

  it("skips vCards with no name", () => {
    const vcf = `BEGIN:VCARD
VERSION:3.0
EMAIL:orphan@test.com
END:VCARD`
    const contacts = parseVCF(vcf)
    expect(contacts).toHaveLength(0)
  })

  it("lowercases email addresses", () => {
    const vcf = `BEGIN:VCARD
FN:Test
EMAIL:UPPER@CASE.COM
END:VCARD`
    const contacts = parseVCF(vcf)
    expect(contacts[0].email).toBe("upper@case.com")
  })

  it("handles empty input", () => {
    expect(parseVCF("")).toHaveLength(0)
    expect(parseVCF("no vcards here")).toHaveLength(0)
  })

  it("handles ORG with semicolons (department)", () => {
    const vcf = `BEGIN:VCARD
FN:Test
ORG:ACME Corp;Engineering;Platform
END:VCARD`
    const contacts = parseVCF(vcf)
    expect(contacts[0].company).toBe("ACME Corp")
  })
})
