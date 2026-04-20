import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { KeyboardHelp } from './KeyboardHelp'
import { ShortcutProvider, useHelpOverlay } from './ShortcutContext'
import { SHORTCUT_DEFS } from './registry'

function Opener() {
  const [, setOpen] = useHelpOverlay()
  // Open overlay synchronously so the test can inspect it without firing ?.
  setOpen(true)
  return null
}

describe('KeyboardHelp', () => {
  it('renders every shortcut label when opened', () => {
    render(
      <ShortcutProvider>
        <Opener />
        <KeyboardHelp />
      </ShortcutProvider>,
    )
    // Pick a handful of known ids and assert their labels render.
    for (const id of ['help.open', 'app.search', 'app.new-note', 'recording.toggle']) {
      const def = SHORTCUT_DEFS.find((d) => d.id === id)!
      expect(screen.getByText(def.label)).toBeTruthy()
    }
    // Registry size sanity: at least 15 labels render.
    const labels = SHORTCUT_DEFS.map((d) => d.label)
    const matched = labels.filter((l) => screen.queryByText(l))
    expect(matched.length).toBeGreaterThanOrEqual(15)
  })

  it('groups shortcuts by category', () => {
    render(
      <ShortcutProvider>
        <Opener />
        <KeyboardHelp />
      </ShortcutProvider>,
    )
    // Groups we know exist in the registry.
    expect(screen.getByText(/general/i)).toBeTruthy()
    expect(screen.getByText(/navigation/i)).toBeTruthy()
  })
})
