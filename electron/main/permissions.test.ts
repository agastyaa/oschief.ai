import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('electron', () => ({
  systemPreferences: {
    getMediaAccessStatus: vi.fn(),
    askForMediaAccess: vi.fn(),
    isTrustedAccessibilityClient: vi.fn(),
  },
  shell: {
    openExternal: vi.fn().mockResolvedValue(undefined),
  },
}))

import {
  checkPermission,
  requestPermission,
  assertPermission,
  getRecoveryLink,
  getPermissionLabel,
  openRecoveryPane,
  PermissionKind,
} from './permissions'
import { PermissionDenied } from './errors'
import { systemPreferences, shell } from 'electron'

const origPlatform = process.platform

function setPlatform(p: NodeJS.Platform) {
  Object.defineProperty(process, 'platform', { value: p, configurable: true })
}

beforeEach(() => {
  vi.clearAllMocks()
  setPlatform('darwin')
})

describe('getRecoveryLink', () => {
  const kinds: PermissionKind[] = [
    'microphone',
    'screen',
    'calendar',
    'contacts',
    'speech-recognition',
    'accessibility',
  ]
  it.each(kinds)('%s returns an x-apple.systempreferences URL', (k) => {
    const link = getRecoveryLink(k)
    expect(link).toMatch(/^x-apple\.systempreferences:/)
    expect(link.length).toBeGreaterThan(40)
  })
  it('links are unique per kind (no wrong-pane drift)', () => {
    const links = new Set(kinds.map(getRecoveryLink))
    expect(links.size).toBe(kinds.length)
  })
})

describe('getPermissionLabel', () => {
  it('returns user-facing labels', () => {
    expect(getPermissionLabel('microphone')).toBe('Microphone')
    expect(getPermissionLabel('screen')).toBe('Screen Recording')
    expect(getPermissionLabel('speech-recognition')).toBe('Speech Recognition')
  })
})

describe('checkPermission', () => {
  it('returns "granted" on non-darwin without probing', () => {
    setPlatform('linux')
    expect(checkPermission('microphone')).toBe('granted')
    expect(systemPreferences.getMediaAccessStatus).not.toHaveBeenCalled()
  })

  it('maps microphone to getMediaAccessStatus("microphone")', () => {
    vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValue('granted')
    expect(checkPermission('microphone')).toBe('granted')
    expect(systemPreferences.getMediaAccessStatus).toHaveBeenCalledWith('microphone')
  })

  it('maps screen to getMediaAccessStatus("screen")', () => {
    vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValue('denied')
    expect(checkPermission('screen')).toBe('denied')
    expect(systemPreferences.getMediaAccessStatus).toHaveBeenCalledWith('screen')
  })

  it('maps calendar to getMediaAccessStatus("calendar")', () => {
    vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValue('not-determined')
    expect(checkPermission('calendar')).toBe('not-determined')
    expect(systemPreferences.getMediaAccessStatus).toHaveBeenCalledWith('calendar')
  })

  it('accessibility uses isTrustedAccessibilityClient(false)', () => {
    vi.mocked(systemPreferences.isTrustedAccessibilityClient).mockReturnValue(true)
    expect(checkPermission('accessibility')).toBe('granted')
    expect(systemPreferences.isTrustedAccessibilityClient).toHaveBeenCalledWith(false)

    vi.mocked(systemPreferences.isTrustedAccessibilityClient).mockReturnValue(false)
    expect(checkPermission('accessibility')).toBe('denied')
  })

  it('speech-recognition returns "unknown" (no native probe)', () => {
    expect(checkPermission('speech-recognition')).toBe('unknown')
  })

  it('normalizes unexpected status strings to "unknown"', () => {
    vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValue('weird' as any)
    expect(checkPermission('microphone')).toBe('unknown')
  })
})

describe('requestPermission', () => {
  it('microphone calls askForMediaAccess and maps result', async () => {
    vi.mocked(systemPreferences.askForMediaAccess).mockResolvedValue(true)
    await expect(requestPermission('microphone')).resolves.toBe('granted')
    vi.mocked(systemPreferences.askForMediaAccess).mockResolvedValue(false)
    await expect(requestPermission('microphone')).resolves.toBe('denied')
  })

  it('screen opens the pane (no programmatic prompt) then returns current status', async () => {
    vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValue('denied')
    const result = await requestPermission('screen')
    expect(shell.openExternal).toHaveBeenCalledWith(expect.stringContaining('Privacy_ScreenCapture'))
    expect(result).toBe('denied')
  })

  it('calendar opens the pane and returns current status', async () => {
    vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValue('granted')
    await requestPermission('calendar')
    expect(shell.openExternal).toHaveBeenCalledWith(expect.stringContaining('Privacy_Calendars'))
  })

  it('no-op on non-darwin', async () => {
    setPlatform('win32')
    await expect(requestPermission('microphone')).resolves.toBe('granted')
    expect(systemPreferences.askForMediaAccess).not.toHaveBeenCalled()
  })
})

describe('assertPermission', () => {
  it('throws PermissionDenied on denied status', () => {
    vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValue('denied')
    expect(() => assertPermission('microphone')).toThrow(PermissionDenied)
  })

  it('throws PermissionDenied on not-determined status', () => {
    vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValue('not-determined')
    try {
      assertPermission('microphone')
      expect.fail('should have thrown')
    } catch (e) {
      expect(e).toBeInstanceOf(PermissionDenied)
      expect((e as any).meta.kind).toBe('microphone')
      expect((e as any).meta.recoveryLink).toMatch(/Privacy_Microphone/)
    }
  })

  it('does not throw on granted', () => {
    vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValue('granted')
    expect(() => assertPermission('microphone')).not.toThrow()
  })

  it('does not throw on "unknown" (callers should attempt and catch)', () => {
    // speech-recognition always returns 'unknown'
    expect(() => assertPermission('speech-recognition')).not.toThrow()
  })
})

describe('openRecoveryPane', () => {
  it('dispatches the deep-link via shell.openExternal', async () => {
    vi.mocked(shell.openExternal).mockResolvedValue(undefined)
    const ok = await openRecoveryPane('microphone')
    expect(ok).toBe(true)
    expect(shell.openExternal).toHaveBeenCalledWith(
      expect.stringContaining('Privacy_Microphone'),
    )
  })

  it('returns false on failure', async () => {
    vi.mocked(shell.openExternal).mockRejectedValue(new Error('nope'))
    await expect(openRecoveryPane('microphone')).resolves.toBe(false)
  })
})

afterAll()
function afterAll() {
  setPlatform(origPlatform)
}
