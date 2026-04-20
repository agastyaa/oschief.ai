import { describe, it, expect, vi } from 'vitest'

// desktopCapturer returns source shapes that include .name (window title).
// We only need to test the pattern-matching logic, so stub out Electron.
const mockSources: Array<{ name: string }> = []

vi.mock('electron', () => ({
  desktopCapturer: {
    getSources: vi.fn(async () => mockSources),
  },
  systemPreferences: {
    getMediaAccessStatus: vi.fn(() => 'granted'),
  },
}))

import { detectMeetingWindow, hasScreenRecordingPermission } from './meeting-windows'
import { systemPreferences } from 'electron'

function setSources(titles: string[]) {
  mockSources.length = 0
  for (const t of titles) mockSources.push({ name: t })
}

describe('detectMeetingWindow', () => {
  it('returns null when no windows match', async () => {
    setSources(['Finder', 'Terminal', 'Safari — Apple Developer'])
    expect(await detectMeetingWindow()).toBe(null)
  })

  it('matches Google Meet browser tab', async () => {
    setSources(['Meet — Team standup - Google Chrome'])
    const r = await detectMeetingWindow()
    expect(r?.app).toBe('Google Meet')
  })

  it('matches meet.google.com URL in title', async () => {
    setSources(['meet.google.com/abc-defg-hij - Safari'])
    const r = await detectMeetingWindow()
    expect(r?.app).toBe('Google Meet')
  })

  it('skips Meet homepage / new meeting lobby', async () => {
    setSources(['Meet – New meeting - Google Chrome'])
    expect(await detectMeetingWindow()).toBe(null)
  })

  it('matches native Teams in-call window', async () => {
    setSources(['Meeting | Microsoft Teams'])
    const r = await detectMeetingWindow()
    expect(r?.app).toBe('Microsoft Teams')
  })

  it('matches Teams web client', async () => {
    setSources(['teams.microsoft.com/v2/meetup-join/abc - Chrome'])
    const r = await detectMeetingWindow()
    expect(r?.app).toBe('Microsoft Teams')
  })

  it('matches Zoom', async () => {
    setSources(['Zoom Meeting'])
    expect((await detectMeetingWindow())?.app).toBe('Zoom')
  })

  it('matches Webex', async () => {
    setSources(['Webex Meeting - Room 42'])
    expect((await detectMeetingWindow())?.app).toBe('Webex')
  })

  it('returns null when Screen Recording permission is missing', async () => {
    vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValueOnce('denied')
    setSources(['Meeting | Microsoft Teams'])
    expect(await detectMeetingWindow()).toBe(null)
  })

  it('hasScreenRecordingPermission reflects the media access status', () => {
    vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValueOnce('granted')
    expect(hasScreenRecordingPermission()).toBe(true)
    vi.mocked(systemPreferences.getMediaAccessStatus).mockReturnValueOnce('denied')
    expect(hasScreenRecordingPermission()).toBe(false)
  })

  it('ignores untitled windows', async () => {
    setSources(['', 'Meeting | Microsoft Teams'])
    const r = await detectMeetingWindow()
    expect(r?.app).toBe('Microsoft Teams')
  })
})
