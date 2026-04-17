import { describe, it, expect } from 'vitest'
import { homedir } from 'os'
import { join } from 'path'
import {
  isMobileDocumentsPath,
  hasICloudXattr,
  checkDbPathSafety,
  assertSafeDbPath,
  safeUserDataPath,
} from './icloud-gate'
import { ICloudSyncedDBPath } from '../errors'

const HOME = '/Users/alice'

describe('isMobileDocumentsPath', () => {
  it('detects paths under ~/Library/Mobile Documents/', () => {
    expect(isMobileDocumentsPath(`${HOME}/Library/Mobile Documents/com~apple~CloudDocs/OSChief/data`, HOME)).toBe(true)
  })
  it('detects the root itself', () => {
    expect(isMobileDocumentsPath(`${HOME}/Library/Mobile Documents`, HOME)).toBe(true)
  })
  it('rejects safe Application Support path', () => {
    expect(isMobileDocumentsPath(`${HOME}/Library/Application Support/OSChief/data`, HOME)).toBe(false)
  })
  it('rejects lookalike path (Mobile Documents2)', () => {
    expect(isMobileDocumentsPath(`${HOME}/Library/Mobile Documents2/x`, HOME)).toBe(false)
  })
})

describe('hasICloudXattr', () => {
  it('matches com.apple.fileprovider.*', () => {
    expect(hasICloudXattr(['com.apple.fileprovider.fpfs#P'])).toBe('com.apple.fileprovider.fpfs#P')
    expect(hasICloudXattr(['com.apple.fileprovider.something-new'])).toBe('com.apple.fileprovider.something-new')
  })
  it('matches clouddocs uuid', () => {
    expect(hasICloudXattr(['com.apple.clouddocs.security.uuid'])).toBe('com.apple.clouddocs.security.uuid')
  })
  it('returns null on safe xattrs', () => {
    expect(hasICloudXattr(['com.apple.quarantine', 'com.apple.metadata:kMDItemWhereFroms'])).toBe(null)
  })
  it('returns null on empty list', () => {
    expect(hasICloudXattr([])).toBe(null)
  })
})

describe('checkDbPathSafety', () => {
  const exists = (_p: string) => true
  const noXattrs = () => ''
  const iCloudXattrs = () => 'com.apple.fileprovider.fpfs#P\ncom.apple.quarantine'

  it('flags mobile-documents paths without probing xattrs', () => {
    const r = checkDbPathSafety(`${HOME}/Library/Mobile Documents/com~apple~CloudDocs/data`, {
      home: HOME,
      existsFn: exists,
      runner: () => {
        throw new Error('should not probe')
      },
    })
    expect(r.safe).toBe(false)
    expect(r.reason).toBe('mobile-documents')
  })

  it('flags xattr-tagged paths', () => {
    const r = checkDbPathSafety(`${HOME}/Library/Application Support/OSChief/data`, {
      home: HOME,
      existsFn: exists,
      runner: iCloudXattrs,
    })
    expect(r.safe).toBe(false)
    expect(r.reason).toBe('xattr')
    expect(r.xattrFound).toBe('com.apple.fileprovider.fpfs#P')
  })

  it('accepts safe path with clean xattrs', () => {
    const r = checkDbPathSafety(`${HOME}/Library/Application Support/OSChief/data`, {
      home: HOME,
      existsFn: exists,
      runner: noXattrs,
    })
    expect(r.safe).toBe(true)
  })

  it('walks up to existing ancestor when full path missing (fresh install)', () => {
    let seen = ''
    const r = checkDbPathSafety(`${HOME}/Library/Application Support/OSChief/data/syag.db`, {
      home: HOME,
      existsFn: (p) => p === `${HOME}/Library/Application Support`,
      runner: (_cmd, args) => {
        seen = args[0]
        return ''
      },
    })
    expect(r.safe).toBe(true)
    expect(seen).toBe(`${HOME}/Library/Application Support`)
  })
})

describe('assertSafeDbPath', () => {
  it('throws ICloudSyncedDBPath on unsafe path', () => {
    // Use real homedir so the mobile-documents check matches
    const unsafe = join(homedir(), 'Library', 'Mobile Documents', 'com~apple~CloudDocs', 'OSChief')
    expect(() => assertSafeDbPath(unsafe)).toThrow(ICloudSyncedDBPath)
  })
})

describe('safeUserDataPath', () => {
  it('returns Application Support path', () => {
    expect(safeUserDataPath(HOME)).toBe(`${HOME}/Library/Application Support/OSChief`)
  })
})
