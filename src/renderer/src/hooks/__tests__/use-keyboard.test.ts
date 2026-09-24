import { renderHook } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useKeyboard } from '../useKeyboard'

function mount() {
  const actions = {
    onNewNote: vi.fn(),
    onSearch: vi.fn(),
    onToggleSidebar: vi.fn(),
    onCommandMenu: vi.fn()
  }
  renderHook(() => useKeyboard(actions))
  return actions
}

describe('useKeyboard', () => {
  it('opens the command menu on the modifier and K', () => {
    const actions = mount()
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(actions.onCommandMenu).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(actions.onCommandMenu).toHaveBeenCalledTimes(2)
  })

  it('does nothing on a bare K', () => {
    const actions = mount()
    fireEvent.keyDown(window, { key: 'k' })
    expect(actions.onCommandMenu).not.toHaveBeenCalled()
  })

  it('keeps the other shortcuts', () => {
    const actions = mount()
    fireEvent.keyDown(window, { key: 'n', metaKey: true })
    fireEvent.keyDown(window, { key: 'f', metaKey: true })
    fireEvent.keyDown(window, { key: '\\', metaKey: true })
    expect(actions.onNewNote).toHaveBeenCalledTimes(1)
    expect(actions.onSearch).toHaveBeenCalledTimes(1)
    expect(actions.onToggleSidebar).toHaveBeenCalledTimes(1)
  })
})
