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

  it('rules the footer off from the list always, scrolled or not', () => {
    renderSidebar()
    const foot = screen.getByRole('button', { name: 'Account' }).parentElement!
    expect(foot.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['border-t-[0.5px]', 'border-divider'])
    )
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

  describe('the line under its head', () => {
    const edge = () => document.querySelector('[data-list-edge]') as HTMLElement
    const shown = () => edge().className.split(/\s+/).includes('opacity-100')
    const scrollList = (top: number) => {
      const scroller = document.querySelector('.\\[scrollbar-gutter\\:stable\\]') as HTMLElement
      scroller.scrollTop = top
      fireEvent.scroll(scroller)
    }

    it('rules the head off once the notes scroll under it, and not before', () => {
      renderSidebar()
      expect(edge().className.split(/\s+/)).toEqual(
        expect.arrayContaining(['top-0', 'border-divider', 'opacity-0'])
      )
      scrollList(30)
      expect(shown()).toBe(true)
      scrollList(0)
      expect(shown()).toBe(false)
    })

    it('does the same for a list long enough to be virtualised', () => {
      const many = Array.from({ length: 150 }, (_, i) => makeNote(`n${i}`, `Note ${i}`))
      render(
        <Sidebar
          notes={many}
          activeId={null}
          onSelect={vi.fn()}
          onDelete={vi.fn()}
          onNewNote={vi.fn()}
          onSearch={vi.fn()}
          footer={null}
          collapsed={false}
        />
      )
      scrollList(400)
      expect(shown()).toBe(true)
    })

    it('starts clear again when the rail is reopened', () => {
      const { props, rerender } = renderSidebar()
      scrollList(30)
      rerender(<Sidebar {...props} collapsed />)
      rerender(<Sidebar {...props} collapsed={false} />)
      expect(shown()).toBe(false)
    })
  })

  describe('its fill', () => {
    const classes = (selector: string) =>
      (document.querySelector(selector) as HTMLElement).className.split(/\s+/)
    const scrollList = (top: number) => {
      const scroller = document.querySelector('.\\[scrollbar-gutter\\:stable\\]') as HTMLElement
      scroller.scrollTop = top
      fireEvent.scroll(scroller)
    }

    it('stands its menu and the Notes heading on the glass, however many items the menu has', () => {
      renderSidebar()
      const sidebar = screen.getByRole('complementary', { name: 'Notes' })
      expect(sidebar.className.split(/\s+/)).toContain('isolate')
      // The glass is drawn behind the box that holds the menu and the heading,
      // so an item added to the menu grows it, and the glass with it.
      const fill = document.querySelector('[data-rail-fill]') as HTMLElement
      const top = fill.parentElement!
      expect(top.contains(screen.getByRole('button', { name: 'New note' }))).toBe(true)
      expect(top.contains(screen.getByRole('button', { name: 'Search' }))).toBe(true)
      expect(top.contains(screen.getByText('Notes', { selector: 'div' }))).toBe(true)
      expect(top.contains(row('Apples'))).toBe(false)
      // It reaches up through the top bar's 48px, behind what it holds.
      expect(classes('[data-rail-fill]')).toEqual(
        expect.arrayContaining(['absolute', '-top-12', 'bottom-0', '-z-10', 'bg-sidebar'])
      )
      expect(classes('[data-rail-fill]')).toContain('mask-rail-glass')
    })

    it('measures the dome from the Notes heading, not from the window’s top', () => {
      const mask = css
        .match(/@utility mask-rail-glass \{([^}]*)\}/)![1]
        .replace(/\s+/g, ' ')
        .replace(/\( /g, '(')
        .replace(/ \)/g, ')')
      // A wide, flat ellipse centred 106px below the heading's foot: whole
      // 24px above the foot mid-rail, where the heading's text starts, and
      // only 10px lower at the sides. From about 100px above the foot it
      // thins to a 40% tint of the fill, never clear, so text over the glass
      // reads. It is solid all the way down to the foot by itself.
      expect(mask).toMatch(
        /radial-gradient\(ellipse 200% 200px at 50% calc\(100% \+ 106px\), black 65%, rgb\(0 0 0 \/ 40%\) 103%\)/
      )
      // Nothing in it is placed from the top.
      expect(mask).not.toMatch(/at 50% \d|to bottom/)
    })

    it('is a colour of its own, apart from the surfaces popovers and dialogs use', () => {
      const block = (selector: string) => css.match(new RegExp(`\n${selector} \\{([^}]*)\\}`))![1]
      expect(block('\\.dark')).toMatch(/--bg-sidebar: #262626;/)
      expect(block(':root')).toMatch(/--bg-sidebar: #e8e8e8;/)
      expect(css).toMatch(/--color-sidebar: var\(--bg-sidebar\);/)
    })

    it('fills the list and the footer solid', () => {
      renderSidebar()
      const body = document.querySelector('[data-rail-body-fill]') as HTMLElement
      expect(body.className.split(/\s+/)).toEqual(
        expect.arrayContaining(['absolute', '-z-10', 'bg-sidebar'])
      )
      expect(body.className).not.toMatch(/mask/)
      expect(body.parentElement!.contains(row('Apples'))).toBe(true)
      expect(body.parentElement!.contains(screen.getByRole('button', { name: 'Account' }))).toBe(
        true
      )
    })

    it('fills in over the glass once the notes scroll, and clears again at the top', () => {
      renderSidebar()
      expect(classes('[data-rail-fill-top]')).toEqual(
        expect.arrayContaining(['bg-sidebar', '-top-12', 'bottom-0', 'opacity-0'])
      )
      scrollList(30)
      expect(classes('[data-rail-fill-top]')).toContain('opacity-100')
      scrollList(0)
      expect(classes('[data-rail-fill-top]')).toContain('opacity-0')
    })
  })
})
