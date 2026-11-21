import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AssistantModelCopy } from '@shared/domain/assistant'
import { SettingsDialog } from '../settings-dialog'
import { onWindowGlass } from '@/test-support'

let copies: AssistantModelCopy[] = []
const assistant = {
  models: vi.fn(async () => [...copies]),
  deleteModel: vi.fn(async (path: string) => {
    copies = copies.filter((c) => c.path !== path)
  })
}

beforeEach(() => {
  copies = []
  assistant.models.mockClear()
  assistant.deleteModel.mockClear()
  Object.defineProperty(window, 'api', {
    value: { ...window.api, assistant },
    configurable: true,
    writable: true
  })
})

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

  describe('models', () => {
    const ours: AssistantModelCopy = {
      path: '/hf/gemma.gguf',
      source: 'huggingface',
      sizeBytes: 5.15e9,
      deletable: true
    }
    const ollama: AssistantModelCopy = {
      path: '/ollama/blob',
      source: 'ollama',
      sizeBytes: 9.6e9,
      deletable: false
    }

    it('lists every copy of the model on this computer, with its size and where it is', async () => {
      copies = [ours, ollama]
      renderDialog()
      const section = screen.getByRole('region', { name: 'Models' })
      const rows = await within(section).findAllByRole('listitem')
      expect(rows.map((row) => row.textContent)).toEqual([
        expect.stringContaining('Gemma 4 E4B'),
        expect.stringContaining('Gemma 4 E4B')
      ])
      expect(rows[0].textContent).toContain('5.2 GB · Hugging Face cache')
      expect(rows[1].textContent).toContain('9.6 GB · Ollama')
    })

    it('offers Delete for a copy Newline may remove, and points to Ollama for its own', async () => {
      copies = [ours, ollama]
      renderDialog()
      const rows = await within(screen.getByRole('region', { name: 'Models' })).findAllByRole(
        'listitem'
      )
      expect(within(rows[0]).getByRole('button', { name: 'Delete Gemma 4 E4B' })).toBeTruthy()
      expect(within(rows[1]).queryByRole('button')).toBeNull()
      expect(rows[1].textContent).toContain('Remove it with Ollama')
    })

    it('deletes a copy once confirmed, and lists again', async () => {
      copies = [ours]
      const props = renderDialog()
      await userEvent.click(await screen.findByRole('button', { name: 'Delete Gemma 4 E4B' }))
      const confirm = await screen.findByRole('dialog', { name: 'Delete Model' })
      expect(assistant.deleteModel).not.toHaveBeenCalled()
      await userEvent.click(within(confirm).getByRole('option', { name: /Delete/ }))

      expect(assistant.deleteModel).toHaveBeenCalledWith('/hf/gemma.gguf')
      // Settings stays open behind the question, to show what is left.
      expect(props.onClose).not.toHaveBeenCalled()
      await waitFor(() =>
        expect(screen.getByText(/downloads again when you send it a message/)).toBeTruthy()
      )
    })

    it('says so when none is on this computer', async () => {
      renderDialog()
      expect(
        await screen.findByText(/None yet\. Gemma downloads when you send it your first message\./)
      ).toBeTruthy()
    })

    it('says why a copy could not be deleted', async () => {
      copies = [ours]
      assistant.deleteModel.mockRejectedValueOnce(new Error('Wait for Gemma to finish answering.'))
      renderDialog()
      await userEvent.click(await screen.findByRole('button', { name: 'Delete Gemma 4 E4B' }))
      const confirm = await screen.findByRole('dialog', { name: 'Delete Model' })
      await userEvent.click(within(confirm).getByRole('option', { name: /Delete/ }))
      expect((await screen.findByRole('alert')).textContent).toBe(
        'Wait for Gemma to finish answering.'
      )
    })
  })
})
