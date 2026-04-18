import { describe, it, expect, vi, beforeEach } from 'vitest'

const mocks = vi.hoisted(() => {
  const notificationShow = vi.fn()
  const notificationOn = vi.fn()
  const NotificationMock: any = vi.fn().mockImplementation(() => ({
    show: notificationShow,
    on: notificationOn,
  }))
  NotificationMock.isSupported = () => true
  return { NotificationMock, notificationShow }
})

vi.mock('electron', () => ({
  Notification: mocks.NotificationMock,
  BrowserWindow: { getAllWindows: () => [] },
  ipcMain: { on: vi.fn(), removeAllListeners: vi.fn() },
}))

vi.mock('../storage/database', () => ({
  getSetting: vi.fn().mockReturnValue('true'),
}))

import {
  isRecordingActive,
  getRecordingDurationMs,
  startRecordingWatch,
  stopRecordingWatch,
} from './recording-watch'

// The module uses module-level state — reset between tests via stop/start
beforeEach(() => {
  mocks.notificationShow.mockClear()
  mocks.NotificationMock.mockClear()
  stopRecordingWatch()
  startRecordingWatch()
})

// Pull the ipcMain handler that the module registered so we can invoke it
import { ipcMain } from 'electron'

function fireStateEvent(payload: { active: boolean; noteId?: string | null; startedAt?: number }) {
  const mock = (ipcMain.on as any).mock
  // Find the most recent 'recording:state' registration
  const regs = mock.calls.filter((c: any[]) => c[0] === 'recording:state')
  const handler = regs[regs.length - 1]?.[1]
  if (!handler) throw new Error('recording:state handler not registered')
  handler({}, payload)
}

describe('recording-watch probe', () => {
  it('isRecordingActive() returns false by default', () => {
    expect(isRecordingActive()).toBe(false)
  })

  it('flips to true when recording starts', () => {
    fireStateEvent({ active: true, noteId: 'n1', startedAt: Date.now() })
    expect(isRecordingActive()).toBe(true)
  })

  it('flips back to false when recording stops', () => {
    fireStateEvent({ active: true, startedAt: Date.now() })
    fireStateEvent({ active: false })
    expect(isRecordingActive()).toBe(false)
  })

  it('reports duration in ms while active', () => {
    const now = Date.now() - 30_000
    fireStateEvent({ active: true, startedAt: now })
    const d = getRecordingDurationMs()
    expect(d).toBeGreaterThanOrEqual(29_000)
    expect(d).toBeLessThan(35_000)
  })

  it('duration is null when not recording', () => {
    fireStateEvent({ active: false })
    expect(getRecordingDurationMs()).toBe(null)
  })
})
