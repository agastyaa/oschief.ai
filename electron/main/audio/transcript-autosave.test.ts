import { describe, it, expect } from 'vitest'
import { computeRecovery, TranscriptDraft } from './transcript-autosave'

function draft(overrides: Partial<TranscriptDraft> = {}): TranscriptDraft {
  return {
    noteId: 'n1',
    transcript: [{ speaker: 'me', text: 'hi', time: '00:01' }],
    startedAt: '2026-04-17T10:00:00.000Z',
    updatedAt: '2026-04-17T10:00:10.000Z',
    lastChunkAt: '2026-04-17T10:00:10.000Z',
    flushedAt: '2026-04-17T10:00:10.000Z',
    ...overrides,
  }
}

describe('computeRecovery', () => {
  it('zero loss when flushedAt equals lastChunkAt', () => {
    const r = computeRecovery(draft())
    expect(r.lossSeconds).toBe(0)
    expect(r.shouldSurface).toBe(false)
  })

  it('computes positive loss in seconds', () => {
    const r = computeRecovery(
      draft({
        lastChunkAt: '2026-04-17T10:00:10.000Z',
        flushedAt: '2026-04-17T10:00:06.500Z',
      }),
    )
    expect(r.lossSeconds).toBe(3.5)
    expect(r.shouldSurface).toBe(false) // under 5s
  })

  it('surfaces recovery modal when loss > 5s', () => {
    const r = computeRecovery(
      draft({
        lastChunkAt: '2026-04-17T10:00:10.000Z',
        flushedAt: '2026-04-17T10:00:04.000Z',
      }),
    )
    expect(r.lossSeconds).toBe(6)
    expect(r.shouldSurface).toBe(true)
  })

  it('does not surface at exactly 5s (strict >)', () => {
    const r = computeRecovery(
      draft({
        lastChunkAt: '2026-04-17T10:00:10.000Z',
        flushedAt: '2026-04-17T10:00:05.000Z',
      }),
    )
    expect(r.lossSeconds).toBe(5)
    expect(r.shouldSurface).toBe(false)
  })

  it('returns 0 loss for legacy drafts missing lastChunkAt', () => {
    const r = computeRecovery(draft({ lastChunkAt: undefined as any }))
    expect(r.lossSeconds).toBe(0)
    expect(r.shouldSurface).toBe(false)
  })

  it('returns 0 loss for legacy drafts missing flushedAt', () => {
    const r = computeRecovery(draft({ flushedAt: undefined as any }))
    expect(r.lossSeconds).toBe(0)
    expect(r.shouldSurface).toBe(false)
  })

  it('clamps negative loss (clock skew) to 0', () => {
    const r = computeRecovery(
      draft({
        lastChunkAt: '2026-04-17T10:00:04.000Z',
        flushedAt: '2026-04-17T10:00:10.000Z',
      }),
    )
    expect(r.lossSeconds).toBe(0)
    expect(r.shouldSurface).toBe(false)
  })

  it('rounds loss to 1 decimal place', () => {
    const r = computeRecovery(
      draft({
        lastChunkAt: '2026-04-17T10:00:10.000Z',
        flushedAt: '2026-04-17T10:00:09.234Z',
      }),
    )
    expect(r.lossSeconds).toBe(0.8)
  })
})
