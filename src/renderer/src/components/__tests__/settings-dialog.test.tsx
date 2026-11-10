import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SettingsDialog } from '../settings-dialog'

// ---------------------------------------------------------------------------
// The application's settings — not a note's. For now that is the theme, as
// a choice of three, the one in force marked.
// ---------------------------------------------------------------------------

function renderDialog(theme: 'light' | 'dark' | 'system' = 'system') {
  const props = { open: true, onClose: vi.fn(), theme, onThemeChange: vi.fn() }
  render(<SettingsDialog {...props} />)
  return props
}

describe('SettingsDialog', () => {
  it('is a dialog named Settings', () => {
    renderDialog()
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeTruthy()
  })

  it('offers the theme as System, Light or Dark, marking the one chosen', () => {
    renderDialog('dark')
    const theme = screen.getByRole('listbox', { name: 'Theme' })
    const options = within(theme).getAllByRole('option')
    expect(options.map((option) => option.textContent)).toEqual(['System', 'Light', 'Dark'])
    expect(within(theme).getByRole('option', { name: 'Dark' }).getAttribute('aria-selected')).toBe(
      'true'
    )
  })

  it('reports a new theme as it is picked', async () => {
    const props = renderDialog('system')
    await userEvent.click(screen.getByRole('option', { name: 'Light' }))
    expect(props.onThemeChange).toHaveBeenCalledWith('light')
  })

  it('closes from its close button', async () => {
    const props = renderDialog()
    await userEvent.click(screen.getByRole('button', { name: 'Close settings' }))
    expect(props.onClose).toHaveBeenCalled()
  })
})
