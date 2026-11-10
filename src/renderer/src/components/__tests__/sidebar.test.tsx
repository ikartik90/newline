import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Sidebar from '../Sidebar'
import css from '@/assets/main.css?raw'

// ---------------------------------------------------------------------------
// The sidebar's rows slide aside to uncover what can be done to a note. One
// row at a time: opening another, pressing elsewhere or choosing a note puts
// the open one back.
// ---------------------------------------------------------------------------

function makeNote(id: string, title: string): Note {
  return {
    id,
    title,
    body: '{"type":"doc","content":[]}',
    plainText: '',
    tags: [],
    createdAt: 1,
    updatedAt: Date.now(),
    lastSyncedAt: null,
    isDeleted: false
  }
}

const notes = [makeNote('a', 'Apples'), makeNote('b', 'Bread')]

function renderSidebar() {
  const props = {
    notes,
    activeId: null,
    onSelect: vi.fn(),
    onDelete: vi.fn(),
    onNewNote: vi.fn(),
    onSearch: vi.fn(),
    footer: <button type="button">Account</button>,
    collapsed: false
  }
  const view = render(<Sidebar {...props} />)
  return { ...view, props }
}

const row = (title: string) => screen.getByRole('button', { name: new RegExp(`^${title}`) })

/** A finger dragged across the row, from `from` to `to`, then lifted. */
function swipe(element: HTMLElement, from: number, to: number) {
  fireEvent.pointerDown(element, { clientX: from, clientY: 10, pointerId: 1, button: 0 })
  fireEvent.pointerMove(element, { clientX: to, clientY: 12, pointerId: 1 })
  fireEvent.pointerUp(element, { clientX: to, clientY: 12, pointerId: 1 })
}

const deleteButtons = () => screen.queryAllByRole('button', { name: 'Delete' })

describe('Sidebar', () => {
  it('insets the rows 6.5px from either edge, with the scrollbar in the right margin', () => {
    renderSidebar()
    // The list's inset stops 6px short on the right and the gutter, held open
    // whether or not the list scrolls, is the rest of the 6.5px.
    const scroll = row('Apples').closest('.overflow-y-auto')!
    expect(scroll.className.split(/\s+/)).toContain('[scrollbar-gutter:stable]')
    const listInset = scroll.parentElement!.className.split(/\s+/)
    expect(listInset).toContain('pl-[6.5px]')
    expect(listInset).toContain('pr-[0.5px]')
  })

  it('pads every row as the rail is padded, so a 20px glyph centres under the red light', () => {
    renderSidebar()
    // 6.5 + 6.5 + 20 / 2 = 23, the centre of macOS's first window button.
    const classes = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/)
    const newNote = screen.getByRole('button', { name: 'New note' })
    const footer = screen.getByRole('button', { name: 'Account' }).parentElement!
    for (const el of [newNote.parentElement!, footer]) {
      expect(classes(el)).toContain('px-[6.5px]')
    }
    for (const el of [newNote, screen.getByRole('button', { name: 'Search' }), row('Apples')]) {
      expect(classes(el)).toContain('px-[6.5px]')
    }
    expect(classes(newNote.querySelector('svg')!)).toContain('size-5')
  })

  it('sets its labels at 13px on body small’s line', () => {
    const rule = (name: string) => css.match(new RegExp(`@utility ${name} \\{([^}]*)\\}`))![1]
    expect(rule('text-style-sidebar')).toContain('font-size: 0.8125rem;')
    expect(rule('text-style-sidebar')).toContain('line-height: calc(0.875rem * 1.72);')
    expect(rule('text-style-body-sm')).toContain('line-height: 1.72;')
    renderSidebar()
    const classes = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/)
    for (const el of [
      screen.getByRole('button', { name: 'New note' }),
      screen.getByRole('button', { name: 'Search' }),
      row('Apples').querySelector('span')!
    ]) {
      expect(classes(el)).toContain('text-style-sidebar')
      expect(classes(el)).not.toContain('text-style-body-sm')
    }
  })

  it('inks the head glyphs as their labels are inked', () => {
    renderSidebar()
    const classes = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/)
    for (const name of ['New note', 'Search']) {
      const row = screen.getByRole('button', { name })
      expect(classes(row)).toContain('text-fg')
      expect(classes(row.querySelector('svg')!)).toContain('text-fg')
      expect(classes(row.querySelector('svg')!)).not.toContain('text-fg-body')
    }
  })

  it('gives every row the height of New note and Search, at regular weight', () => {
    renderSidebar()
    const height = (el: HTMLElement) => el.className.split(/\s+/).filter((c) => /^h-/.test(c))
    const head = height(screen.getByRole('button', { name: 'New note' }))
    expect(head).toEqual(['h-8'])
    expect(height(screen.getByRole('button', { name: 'Search' }))).toEqual(head)
    expect(height(row('Apples'))).toEqual(head)
    expect(row('Apples').querySelector('.font-medium')).toBeNull()
  })

  it('shows no tags, even on a tagged note', () => {
    render(
      <Sidebar
        notes={[{ ...makeNote('t', 'Tagged'), tags: ['home', 'work'] }]}
        activeId={null}
        onSelect={vi.fn()}
        onDelete={vi.fn()}
        onNewNote={vi.fn()}
        onSearch={vi.fn()}
        footer={null}
        collapsed={false}
      />
    )
    expect(row('Tagged').textContent).toBe('Tagged')
  })

  it('rounds every row as a 12px squircle, the swipe frame included', () => {
    renderSidebar()
    const rows = [
      screen.getByRole('button', { name: 'New note' }),
      screen.getByRole('button', { name: 'Search' }),
      row('Apples'),
      row('Apples').closest('[class*="overflow-hidden"]') as HTMLElement
    ]
    for (const el of rows) {
      const classes = el.className.split(/\s+/)
      expect(classes).toContain('rounded-lg')
      expect(classes).toContain('squircle')
      expect(classes).not.toContain('rounded-sm')
    }
  })

  it('shows a note by its title alone, with no time', () => {
    renderSidebar()
    expect(row('Apples').textContent).toBe('Apples')
  })

  it('heads the list with New note and Search, and ends it with the footer', () => {
    renderSidebar()
    const sidebar = screen.getByRole('complementary', { name: 'Notes' })
    const buttons = within(sidebar).getAllByRole('button')
    const names = buttons.map((b) => b.getAttribute('aria-label') ?? b.textContent)
    expect(names[0]).toBe('New note')
    expect(names[1]).toBe('Search')
    expect(names.at(-1)).toBe('Account')
  })

  it('creates a note and opens the search from its head', () => {
    const { props } = renderSidebar()
    fireEvent.click(screen.getByRole('button', { name: 'New note' }))
    expect(props.onNewNote).toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Search' }))
    expect(props.onSearch).toHaveBeenCalled()
  })

  it('pads its contents rather than being inset from the window', () => {
    renderSidebar()
    const sidebar = screen.getByRole('complementary', { name: 'Notes' })
    const classes = sidebar.className.split(/\s+/)
    expect(classes.some((c) => /^-?m[trblxy]?-/.test(c))).toBe(false)
    // Its first 48px are the top bar's, which stands over it.
    expect(classes).toContain('pt-12')
    expect(classes).toContain('pb-2')
  })

  it('keeps the actions out of reach until a row is swiped', () => {
    renderSidebar()
    expect(deleteButtons()).toHaveLength(0)
  })

  it('uncovers Delete behind a row swiped to the left, and asks for the note on press', () => {
    const { props } = renderSidebar()
    swipe(row('Apples'), 200, 100)
    const [remove] = deleteButtons()
    expect(remove).toBeTruthy()
    fireEvent.click(remove)
    expect(props.onDelete).toHaveBeenCalledWith('a')
    expect(deleteButtons()).toHaveLength(0)
  })

  it('does not choose the note the swipe ended on', () => {
    const { props } = renderSidebar()
    const apples = row('Apples')
    swipe(apples, 200, 100)
    fireEvent.click(apples)
    expect(props.onSelect).not.toHaveBeenCalled()
  })

  it('opens one row at a time', () => {
    renderSidebar()
    swipe(row('Apples'), 200, 100)
    swipe(row('Bread'), 200, 100)
    const open = deleteButtons()
    expect(open).toHaveLength(1)
    expect(open[0].closest('[data-swipe-open]')?.textContent).toContain('Bread')
  })

  it('puts an open row back when something else is pressed', () => {
    renderSidebar()
    swipe(row('Apples'), 200, 100)
    expect(deleteButtons()).toHaveLength(1)
    fireEvent.pointerDown(document.body, { pointerId: 2, button: 0 })
    expect(deleteButtons()).toHaveLength(0)
  })

  it('puts an open row back when a note is chosen', () => {
    const { props } = renderSidebar()
    swipe(row('Apples'), 200, 100)
    fireEvent.click(row('Bread'))
    expect(props.onSelect).toHaveBeenCalledWith('b')
    expect(deleteButtons()).toHaveLength(0)
  })

  it('still asks for the note on Backspace from the keyboard', () => {
    const { props } = renderSidebar()
    fireEvent.keyDown(row('Apples'), { key: 'Backspace' })
    expect(props.onDelete).toHaveBeenCalledWith('a')
  })

  it('names the actions layer as belonging to its note', () => {
    renderSidebar()
    swipe(row('Apples'), 200, 100)
    const open = document.querySelector('[data-swipe-open]') as HTMLElement
    expect(within(open).getByRole('button', { name: 'Delete' })).toBeTruthy()
    expect(within(open).getByText('Apples')).toBeTruthy()
  })
})
