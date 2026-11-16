import { describe, expect, it, vi } from 'vitest'
import { commandMenuActions } from '../command-menu-actions'

// ---------------------------------------------------------------------------
// The command menu's actions, read from what the window holds. Built in one
// place so the in-page menu and the glass palette, which runs in a window of
// its own, offer the same rows.
// ---------------------------------------------------------------------------

describe('commandMenuActions', () => {
  it('offers a new note, the sidebar and the theme with no note open', () => {
    const actions = commandMenuActions(
      { sidebarCollapsed: false, noteOpen: false, theme: 'light' },
      vi.fn()
    )
    expect(actions.map((a) => a.label)).toEqual(['New note', 'Hide sidebar', 'Dark theme'])
  })

  it('offers what can be done to the open note, keeping the theme last under Settings', () => {
    const actions = commandMenuActions(
      { sidebarCollapsed: true, noteOpen: true, theme: 'dark' },
      vi.fn()
    )
    expect(actions.map((a) => a.id)).toEqual([
      'new-note',
      'sidebar',
      'properties',
      'delete',
      'theme'
    ])
    expect(actions[1].label).toBe('Show sidebar')
    expect(actions[4]).toMatchObject({ label: 'Light theme', group: 'Settings' })
  })

  it('names the keys that do the same', () => {
    const actions = commandMenuActions(
      { sidebarCollapsed: false, noteOpen: false, theme: 'light' },
      vi.fn()
    )
    expect(actions.find((a) => a.id === 'new-note')?.shortcut).toBe('N')
    expect(actions.find((a) => a.id === 'sidebar')?.shortcut).toBe('\\')
  })

  it('runs an action by its id', () => {
    const run = vi.fn()
    const actions = commandMenuActions(
      { sidebarCollapsed: false, noteOpen: true, theme: 'light' },
      run
    )
    actions.find((a) => a.id === 'delete')!.run()
    expect(run).toHaveBeenCalledWith('delete')
  })
})
