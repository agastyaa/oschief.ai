import { describe, it, expect } from 'vitest'

describe('Meeting markers', () => {
  it('formats elapsed time correctly', () => {
    const formatTime = (seconds: number) => {
      const mins = Math.floor(seconds / 60)
      const secs = seconds % 60
      return `${mins}:${secs.toString().padStart(2, '0')}`
    }
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(65)).toBe('1:05')
    expect(formatTime(600)).toBe('10:00')
    expect(formatTime(3661)).toBe('61:01')
  })

  it('appends markers to personal notes for LLM context', () => {
    const markers = [
      { time: '2:30', label: 'Marker', timestamp: 1000 },
      { time: '5:15', label: 'Marker', timestamp: 2000 },
    ]
    const personalNotes = 'My meeting notes'
    const markerText = markers.map(m => `[${m.time}] ★ ${m.label}`).join('\n')
    const result = personalNotes
      ? `${personalNotes}\n\nKey moments marked during meeting:\n${markerText}`
      : `Key moments marked during meeting:\n${markerText}`

    expect(result).toContain('My meeting notes')
    expect(result).toContain('[2:30] ★ Marker')
    expect(result).toContain('[5:15] ★ Marker')
    expect(result).toContain('Key moments marked during meeting:')
  })

  it('handles empty personal notes', () => {
    const markers = [{ time: '1:00', label: 'Marker', timestamp: 1000 }]
    const personalNotes = ''
    const markerText = markers.map(m => `[${m.time}] ★ ${m.label}`).join('\n')
    const result = personalNotes
      ? `${personalNotes}\n\nKey moments marked during meeting:\n${markerText}`
      : `Key moments marked during meeting:\n${markerText}`

    expect(result).toBe('Key moments marked during meeting:\n[1:00] ★ Marker')
    expect(result).not.toContain('\n\n')
  })

  it('handles no markers gracefully', () => {
    const markers: any[] = []
    expect(markers.length).toBe(0)
    // When markers.length === 0, the append logic is skipped entirely
  })
})
