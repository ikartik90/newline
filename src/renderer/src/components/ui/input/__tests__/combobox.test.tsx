import { render, screen, fireEvent, within, act, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { Combobox, type ComboboxProps } from '../combobox'
import { Field } from '../field'
import type { OptionItem } from '@/utils/option-filter'

const OPTIONS: OptionItem[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'avocado', label: 'Avocado' },
  { value: 'banana', label: 'Banana' },
  { value: 'grapes', label: 'Grapes' },
  { value: 'mango', label: 'Mango' }
]

function renderCombobox(props: Partial<Omit<ComboboxProps, 'children'>> = {}) {
  return render(
    <Field>
      <Field.Label>Fruit</Field.Label>
      <Combobox {...props}>
        {OPTIONS.map((o) => (
          <Combobox.Option key={o.value} value={o.value}>
            {o.label}
          </Combobox.Option>
        ))}
      </Combobox>
      <Field.Hint>Pick one</Field.Hint>
    </Field>
  )
}

/**
 * The frame's button — the one control that opens the popup. Base UI names a
 * trigger whose popup holds the search `role="combobox"` (the popup is what it
 * expands), so the tag is what tells it from the search box inside.
 */
function trigger(): HTMLButtonElement {
  const el = screen.getAllByRole('combobox').find((b) => b.tagName === 'BUTTON')
  if (!el) throw new Error('trigger not found')
  return el as HTMLButtonElement
}

/** Base UI moves focus on the frame after the popup lands, not on the click. */
const frame = () =>
  act(async () => {
    await new Promise(requestAnimationFrame)
  })

const open = async () => {
  fireEvent.click(trigger())
  await frame()
}

/** The popup's search box — the only <input> inside the dialog. */
const search = () => within(screen.getByRole('dialog')).getByRole('combobox')

describe('field composition', () => {
  it('throws when used outside <Field>', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() =>
      render(
        <Combobox>
          <Combobox.Option value="apple">Apple</Combobox.Option>
        </Combobox>
      )
    ).toThrow(/must be used within <Field>/)
    spy.mockRestore()
  })

  it('associates the field label with the trigger', () => {
    renderCombobox({ defaultValue: 'grapes' })
    const label = screen.getByText('Fruit') as HTMLLabelElement
    expect(label.htmlFor).toBe(trigger().id)
  })
})

describe('collapsed trigger', () => {
  it("shows the selected option's label and no popover", () => {
    renderCombobox({ defaultValue: 'grapes' })
    // The label comes from the authored children even though the popup (and
    // its list) is closed and unmounted.
    expect(trigger().textContent).toBe('Grapes')
    expect(trigger().getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByRole('listbox')).toBeNull()
  })

  // See Button: WebKit's default tab order skips a bare <button>.
  it('states its own place in the tab order', () => {
    renderCombobox({})
    expect(trigger().getAttribute('tabindex')).toBe('0')
  })

  it('shows the placeholder when nothing is selected', () => {
    renderCombobox({ placeholder: 'Pick a fruit' })
    expect(trigger().textContent).toBe('Pick a fruit')
    expect(trigger().hasAttribute('data-placeholder')).toBe(true)
  })

  it('shows the placeholder when the value has no matching option', () => {
    renderCombobox({ value: 'durian', placeholder: 'Pick a fruit' })
    expect(trigger().textContent).toBe('Pick a fruit')
  })
})

describe('opening', () => {
  it('opens the popup with the listbox and moves focus into the search', async () => {
    renderCombobox({ defaultValue: 'grapes' })
    await open()

    const dialog = screen.getByRole('dialog')
    expect(trigger().getAttribute('aria-expanded')).toBe('true')
    expect(within(dialog).getByRole('listbox')).toBeTruthy()
    expect(within(dialog).getAllByRole('option')).toHaveLength(OPTIONS.length)
    expect(document.activeElement).toBe(search())
  })

  it('opens from the chevron / frame padding, not only the value text', async () => {
    renderCombobox({ defaultValue: 'grapes' })
    // The decorative chevron icon is pointer-events:none; the whole frame must
    // be the open target.
    const icon = trigger().parentElement!.querySelector('[aria-hidden]')
    fireEvent.click(icon!)
    await frame()
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('marks the selected option in the open list', async () => {
    renderCombobox({ defaultValue: 'grapes' })
    await open()
    expect(screen.getByRole('option', { name: 'Grapes' }).getAttribute('aria-selected')).toBe(
      'true'
    )
  })
})

describe('selecting an option', () => {
  it('fires onValueChange, closes, restores focus, and updates the trigger', async () => {
    const onValueChange = vi.fn()
    renderCombobox({ defaultValue: 'grapes', onValueChange })
    await open()
    fireEvent.click(screen.getByRole('option', { name: 'Mango' }))

    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('mango')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(trigger().textContent).toBe('Mango')
    await waitFor(() => expect(document.activeElement).toBe(trigger()))
  })

  it('respects a controlled value (parent owns state)', async () => {
    const onValueChange = vi.fn()
    renderCombobox({ value: 'grapes', onValueChange })
    await open()
    fireEvent.click(screen.getByRole('option', { name: 'Mango' }))

    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('mango')
    // Parent didn't update `value`, so the trigger still shows the old label.
    expect(trigger().textContent).toBe('Grapes')
  })
})

describe('dismissing', () => {
  it('closes on Escape and restores focus to the trigger', async () => {
    renderCombobox({ defaultValue: 'grapes' })
    await open()
    expect(screen.getByRole('dialog')).toBeTruthy()

    fireEvent.keyDown(search(), { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger()))
  })
})

describe('search', () => {
  // An `input` event, as a keystroke raises: Base UI reads the reason off the
  // native event to decide that typing should highlight the first match.
  const openAndType = async (value: string) => {
    await open()
    fireEvent.input(search(), { target: { value } })
    await frame()
  }

  it('filters the options in the open popup', async () => {
    renderCombobox()
    await openAndType('man')
    expect(screen.getAllByRole('option')).toHaveLength(1)
    expect(screen.getByRole('option').textContent).toBe('Mango')
  })

  it('shows the empty row when nothing matches', async () => {
    renderCombobox({ emptyLabel: 'No fruit' })
    await openAndType('zzz')
    expect(screen.queryAllByRole('option')).toHaveLength(0)
    expect(screen.getByText('No fruit')).toBeTruthy()
  })

  it('commits the highlighted option on Enter, closing and restoring focus', async () => {
    const onValueChange = vi.fn()
    renderCombobox({ onValueChange })
    await openAndType('man')
    // Base UI highlights the first match as you type in a browser; jsdom
    // needs the arrow to land it. Either way Enter commits the highlight.
    fireEvent.keyDown(search(), { key: 'ArrowDown' })
    await frame()
    fireEvent.keyDown(search(), { key: 'Enter' })

    expect(onValueChange).toHaveBeenCalledExactlyOnceWith('mango')
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(trigger().textContent).toBe('Mango')
    await waitFor(() => expect(document.activeElement).toBe(trigger()))
  })

  it('routes the query through a custom filter', async () => {
    const filter = vi.fn((options: OptionItem[], query: string) =>
      options.filter((o) => o.value.startsWith(query))
    )
    renderCombobox({ filter })
    await openAndType('a')
    expect(filter).toHaveBeenCalledWith(expect.any(Array), 'a')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Apple', 'Avocado'])
  })
})

describe('search={false}', () => {
  it('opens the listbox with no search box, for a menu too short to filter', async () => {
    renderCombobox({ search: false })
    await open()
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByRole('listbox')).toBeTruthy()
    expect(dialog.querySelector('input')).toBeNull()
  })

  it('moves focus into the list instead, so the keyboard still has somewhere to land', async () => {
    renderCombobox({ search: false, defaultValue: 'grapes' })
    await open()
    expect(document.activeElement).toBe(screen.getByRole('listbox'))
  })

  it('walks the list with the arrows and commits on Enter', async () => {
    const onValueChange = vi.fn()
    renderCombobox({ search: false, onValueChange })
    await open()
    fireEvent.keyDown(document.activeElement!, { key: 'ArrowDown' })
    await frame()
    fireEvent.keyDown(document.activeElement!, { key: 'Enter' })
    expect(onValueChange).toHaveBeenCalledOnce()
    expect(onValueChange.mock.calls[0][0]).toBe('apple')
  })

  it('still selects on click, closes, and restores focus to the trigger', async () => {
    const onValueChange = vi.fn()
    renderCombobox({ search: false, onValueChange })
    await open()
    fireEvent.click(within(screen.getByRole('listbox')).getByText('Banana'))
    expect(onValueChange).toHaveBeenCalledWith('banana')
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull())
    await waitFor(() => expect(document.activeElement).toBe(trigger()))
  })
})

describe('size', () => {
  it('opens a small list for a small field, so the menu keeps the field pitch', async () => {
    render(
      <Field size="sm">
        <Field.Label>Fruit</Field.Label>
        <Combobox>
          {OPTIONS.map((o) => (
            <Combobox.Option key={o.value} value={o.value}>
              {o.label}
            </Combobox.Option>
          ))}
        </Combobox>
      </Field>
    )
    await open()
    expect(screen.getByRole('listbox').getAttribute('data-size')).toBe('sm')
    expect(search().getAttribute('data-size')).toBe('sm')
  })

  it('keeps the base list for the field sizes that have no small counterpart', async () => {
    renderCombobox()
    await open()
    expect(screen.getByRole('listbox').getAttribute('data-size')).toBe('md')
  })
})
