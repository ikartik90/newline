import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { SettingsDialog } from '../settings-dialog'
import { onWindowGlass } from '@/test-support'

// ---------------------------------------------------------------------------
// The application's settings — not a note's. For now that is the theme, as
// a choice of three icons, the one in force pressed.
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

  // Where AppKit glasses the window, it stands on that glass, as the palette does.
  it('stands on the window glass', () => {
    const { restore } = onWindowGlass()
    renderDialog()
    expect(screen.getByRole('dialog', { name: 'Settings' }).hasAttribute('data-on-glass')).toBe(
      true
    )
    restore()
  })

  it('offers the theme as System, Light or Dark icons in a toolbar, pressing the one chosen', () => {
    renderDialog('dark')
    const theme = screen.getByRole('toolbar', { name: 'Theme' })
    const buttons = within(theme).getAllByRole('button')
    expect(buttons.map((button) => button.getAttribute('aria-label'))).toEqual([
      'System',
      'Light',
      'Dark'
    ])
    for (const button of buttons) {
      expect(button.querySelector('svg')).toBeTruthy()
      expect(button.textContent).toBe('')
    }
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'false',
      'false',
      'true'
    ])
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  // The label stands on the toolbar's row, before it, not over it.
  it('labels the theme inline, beside its toolbar', () => {
    renderDialog()
    const toolbar = screen.getByRole('toolbar', { name: 'Theme' })
    const label = screen.getByText('Theme')
    const row = label.parentElement!
    expect(row.contains(toolbar)).toBe(true)
    expect(row.className.split(' ')).toEqual(
      expect.arrayContaining(['flex', 'items-center', 'justify-between'])
    )
    expect(row.className).not.toMatch(/flex-col/)
    expect(label.compareDocumentPosition(toolbar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  // Inline, the label is the dialog's own text, set as its title is.
  it('sets the theme label as the dialog’s other text', () => {
    renderDialog()
    const title = screen.getByRole('heading', { name: 'Settings' })
    const label = screen.getByText('Theme')
    const style = (el: Element) => el.className.split(/\s+/).filter((c) => c.startsWith('text-'))
    expect(style(label)).toEqual(['text-style-body-sm', 'text-ink-body'])
    expect(style(title)).toEqual(expect.arrayContaining(style(label)))
  })

  it('reports a new theme as it is pressed', async () => {
    const props = renderDialog('system')
    await userEvent.click(screen.getByRole('button', { name: 'Light' }))
    expect(props.onThemeChange).toHaveBeenCalledWith('light')
  })

  it('closes from its close button', async () => {
    const props = renderDialog()
    await userEvent.click(screen.getByRole('button', { name: 'Close settings' }))
    expect(props.onClose).toHaveBeenCalled()
  })
})
