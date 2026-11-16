import { act, fireEvent, render, screen, within } from '@testing-library/react'
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
  it('hovers a note in the shell hover and stands the open one in the shell selected', () => {
    const { rerender, props } = renderSidebar()
    rerender(<Sidebar {...props} activeId="b" />)
    expect(row('Apples').className.split(/\s+/)).toContain('hover:bg-bg-shell-hover')
    expect(row('Bread').className.split(/\s+/)).toContain('bg-bg-shell-selected')
    expect(row('Apples').className).not.toMatch(/field/)
    expect(row('Bread').className).not.toMatch(/field/)
  })

  it('insets the rows 6.5px from the left, with the scrollbar in the right margin', () => {
    renderSidebar()
    // The list's inset is 0.5px on the right and the gutter, held open
    // whether or not the list scrolls, is the rest of the margin.
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
      expect(classes(row)).toContain('text-ink-body')
      expect(classes(row.querySelector('svg')!)).toContain('text-ink-body')
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

  it('rounds every row as a 16px squircle, the swipe frame included', () => {
    renderSidebar()
    const rows = [
      screen.getByRole('button', { name: 'New note' }),
      screen.getByRole('button', { name: 'Search' }),
      row('Apples'),
      row('Apples').closest('[class*="overflow-hidden"]') as HTMLElement
    ]
    for (const el of rows) {
      const classes = el.className.split(/\s+/)
      expect(classes).toContain('rounded-xl')
      expect(classes).not.toContain('rounded-lg')
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

  it('draws its right edge on its own fill, as it rules off its footer', () => {
    renderSidebar()
    const edge = document.querySelector('[data-rail-edge]') as HTMLElement
    expect(edge.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['absolute', 'inset-y-0', 'right-0', 'w-px', 'bg-border-divider'])
    )
    // Over the fills, which stand behind the rail's contents.
    expect(edge.className).not.toMatch(/-z-/)
  })

  it('rules the footer off from the list always, scrolled or not', () => {
    renderSidebar()
    const foot = screen.getByRole('button', { name: 'Account' }).parentElement!
    const classes = foot.className.split(/\s+/)
    expect(classes).toEqual(
      expect.arrayContaining(['before:top-0', 'before:h-px', 'before:bg-border-divider'])
    )
    // It stops a pixel short of the rail's edge, so the two glass lines never
    // lie over each other where they meet.
    expect(classes).toEqual(expect.arrayContaining(['before:left-0', 'before:right-px']))
    expect(classes.some((c) => /^border(-t)?$/.test(c))).toBe(false)
  })

  it('inks its text in its own grey, base 600 light and base 300 dark, and leaves the rest of the app alone', () => {
    renderSidebar()
    const aside = screen.getByRole('complementary', { name: 'Notes' })
    expect(aside.className.split(/\s+/)).toContain('[--ink-body:var(--ink-sidebar)]')
    // Every block of the theme's, the primitives' and the system tokens'.
    const block = (selector: string) =>
      [...css.matchAll(new RegExp(`\n${selector} \\{([^}]*)\\}`, 'g'))]
        .map(([, body]) => body)
        .join('')
    // Ink 3 and ink 1, which the themes shade.
    expect(block(':root')).toMatch(/--ink-sidebar: var\(--ink-3\);/)
    expect(block(':root')).toMatch(/--ink-body: var\(--ink-1\);/)
    expect(block(':root')).toMatch(/--ink-3: var\(--color-base-600\);/)
    expect(block('\\.dark')).toMatch(/--ink-3: var\(--color-base-300\);/)
    expect(block(':root')).toMatch(/--ink-1: var\(--color-base-800\);/)
    expect(block('\\.dark')).toMatch(/--ink-1: var\(--color-base-100\);/)
    expect(block('\\.dark')).not.toMatch(/--ink-(sidebar|default):/)
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
    const held = sidebar.querySelector('[data-rail-contents]')!.className.split(/\s+/)
    expect(held).toContain('pt-12')
    expect(held).toContain('pb-2')
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

  it('fills the wells at a swiped row’s rounded end in the delete’s fill', () => {
    renderSidebar()
    swipe(row('Apples'), 200, 100)
    const wells = row('Apples')
      .closest('[data-swipe-open]')
      ?.querySelector('[data-swipe-wells] > *') as HTMLElement
    expect(wells.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['rounded-xl', 'shadow-[0_0_0_16px_var(--bg-row-delete)]'])
    )
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
        expect.arrayContaining([
          'top-0',
          'left-0',
          'right-px',
          'border-border-divider',
          'opacity-0'
        ])
      )
      expect(edge().className).not.toMatch(/inset-x-0/)
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
      fireEvent.transitionEnd(document.querySelector('[data-rail-contents]')!, {
        propertyName: 'opacity'
      })
      rerender(<Sidebar {...props} collapsed={false} />)
      expect(shown()).toBe(false)
    })
  })

  describe('as it collapses and opens', () => {
    const rail = () => screen.getByRole('complementary', { name: 'Notes' })
    const contents = () => document.querySelector('[data-rail-contents]') as HTMLElement | null
    const classes = (el: Element) => el.className.split(/\s+/)
    const fadeEnd = (el: Element, propertyName = 'opacity') =>
      fireEvent.transitionEnd(el, { propertyName })

    it('narrows in 150ms, the note pane’s edge gliding alongside', () => {
      const { props, rerender } = renderSidebar()
      expect(classes(rail())).toEqual(
        expect.arrayContaining(['transition-[width,filter]', 'duration-150'])
      )
      rerender(<Sidebar {...props} collapsed />)
      expect(classes(rail())).toEqual(
        expect.arrayContaining(['w-0', 'transition-[width,filter]', 'duration-150'])
      )
    })

    // A toggle goes as a peek does: the narrowing edge never cuts what the
    // rail holds off, so the sidebar reads as sliding 8px and fading, not
    // as sliding the whole of its width.
    it('floats over the note pane as it narrows, so its edge cuts nothing off', () => {
      const { props, rerender } = renderSidebar()
      rerender(<Sidebar {...props} collapsed />)
      expect(classes(rail())).toEqual(
        expect.arrayContaining(['w-0', 'z-[5]', 'overflow-visible', 'transition-[width,filter]'])
      )
      expect(classes(rail())).not.toContain('overflow-hidden')
      // A sheet over the pane, going as a peek let go does.
      expect(classes(contents()!)).toEqual(
        expect.arrayContaining(['bg-bg-sheet', 'opacity-0', '-translate-x-2'])
      )
      fadeEnd(contents()!)
      expect(contents()).toBeNull()
      expect(classes(rail())).toEqual(expect.arrayContaining(['w-0', 'overflow-hidden']))
      expect(classes(rail())).not.toContain('z-[5]')
    })

    it('floats over the note pane as it widens, coming in as a peek does, then turns to glass', () => {
      const { props, rerender } = renderSidebar()
      rerender(<Sidebar {...props} collapsed />)
      fadeEnd(contents()!)
      rerender(<Sidebar {...props} collapsed={false} />)
      expect(classes(rail())).toEqual(
        expect.arrayContaining([
          'w-(--size-sidebar)',
          'z-[5]',
          'overflow-visible',
          'transition-[width,filter]'
        ])
      )
      expect(classes(contents()!)).toEqual(
        expect.arrayContaining([
          'bg-bg-sheet',
          'opacity-100',
          'starting:opacity-0',
          'starting:-translate-x-2'
        ])
      )
      expect(rail().hasAttribute('data-on-glass')).toBe(false)
      fireEvent.transitionEnd(rail(), { propertyName: 'width' })
      expect(contents()!.className).not.toMatch(/bg-bg-/)
      expect(rail().hasAttribute('data-on-glass')).toBe(true)
      expect(classes(rail())).toContain('overflow-hidden')
    })

    // The note pane's edge still glides the rail's whole width. Behind a
    // half-faded sheet, glass (or the sheet) on one side of it and the canvas
    // on the other would read as the sidebar sliding its width; a peek never
    // moves the pane, so it shows none. While a toggle floats the rail, the
    // rail paints the canvas, so the ground behind the fade is one colour.
    it('paints the canvas behind its fade while a toggle floats it, so the pane’s edge never shows', () => {
      const { props, rerender } = renderSidebar()
      expect(classes(rail())).not.toContain('bg-bg-canvas')

      rerender(<Sidebar {...props} collapsed />)
      expect(classes(rail())).toContain('bg-bg-canvas')
      // The sheet stands there at once, not fading up from the glass over the
      // canvas the rail now paints.
      expect(classes(contents()!)).toEqual(
        expect.arrayContaining(['bg-bg-sheet', 'transition-[opacity,translate]'])
      )
      expect(contents()!.className).not.toMatch(/background-color/)
      fadeEnd(contents()!)
      expect(classes(rail())).not.toContain('bg-bg-canvas')

      rerender(<Sidebar {...props} collapsed={false} />)
      expect(classes(rail())).toContain('bg-bg-canvas')
      fireEvent.transitionEnd(rail(), { propertyName: 'width' })
      // Settled, under the sheet's still-solid fill, the canvas goes and the
      // fill fades into the glass.
      expect(classes(rail())).not.toContain('bg-bg-canvas')
      expect(classes(contents()!)).toContain(
        'transition-[opacity,translate,background-color,box-shadow]'
      )
    })

    it('slides its contents 8px left and fades them out in those 150ms, rather than cutting them off', () => {
      const { props, rerender } = renderSidebar()
      rerender(<Sidebar {...props} collapsed />)
      // Held at the open width, so they move as one and never reflow.
      const fading = contents()!
      expect(classes(fading)).toEqual(
        expect.arrayContaining([
          'w-(--size-sidebar)',
          'transition-[opacity,translate]',
          'duration-150',
          'opacity-0',
          '-translate-x-2'
        ])
      )
      // Out of reach while they go.
      expect(fading.hasAttribute('inert')).toBe(true)
      expect(screen.queryByRole('button', { name: 'New note' })).toBeNull()

      // A row's own colour change ending is not the fade ending.
      fadeEnd(within(fading).getByText('Apples'), 'background-color')
      expect(contents()).not.toBeNull()
      fadeEnd(fading)
      expect(contents()).toBeNull()
    })

    it('slides them in from 8px left and fades them up as it opens', () => {
      const { props, rerender } = renderSidebar()
      rerender(<Sidebar {...props} collapsed />)
      fadeEnd(contents()!)
      rerender(<Sidebar {...props} collapsed={false} />)
      const shown = contents()!
      expect(classes(shown)).toEqual(
        expect.arrayContaining([
          'opacity-100',
          'translate-x-0',
          'starting:opacity-0',
          'starting:-translate-x-2'
        ])
      )
      expect(shown.hasAttribute('inert')).toBe(false)
      expect(screen.getByRole('button', { name: 'New note' })).toBeTruthy()
    })
  })

  describe('peeked at while collapsed', () => {
    const rail = () => screen.getByRole('complementary', { name: 'Notes' })
    const contents = () => document.querySelector('[data-rail-contents]') as HTMLElement | null
    const classes = (el: Element) => el.className.split(/\s+/)

    function renderCollapsed() {
      const view = renderSidebar()
      view.rerender(<Sidebar {...view.props} collapsed />)
      fireEvent.transitionEnd(contents()!, { propertyName: 'opacity' })
      return view
    }

    it('floats over the note pane as a solid sheet, the pane keeping its width', () => {
      const { props, rerender } = renderCollapsed()
      rerender(<Sidebar {...props} collapsed peeking />)
      // The rail itself takes no room: the pane does not move.
      expect(classes(rail())).toEqual(expect.arrayContaining(['w-0', 'z-[5]', 'overflow-visible']))
      // Over the pane, not over the glass: solid, edged and shadowed as a sheet.
      expect(rail().hasAttribute('data-on-glass')).toBe(false)
      expect(classes(contents()!)).toEqual(
        expect.arrayContaining([
          'bg-bg-sheet',
          'opacity-100',
          'starting:opacity-0',
          'starting:-translate-x-2'
        ])
      )
      expect(contents()!.className).toMatch(/shadow-\[/)
      // Its edge is the sheet's own 1px divider, not the rail's, which has no width.
      const edges = rail().querySelectorAll('[data-rail-edge]')
      expect(edges).toHaveLength(1)
      expect(edges[0].parentElement).toBe(contents())
      expect(classes(edges[0])).toEqual(expect.arrayContaining(['w-px', 'bg-border-divider']))
      // And in reach.
      expect(contents()!.hasAttribute('inert')).toBe(false)
      expect(screen.getByRole('button', { name: 'New note' })).toBeTruthy()
    })

    it('slides and fades away when let go, still over the pane until it is gone', () => {
      const { props, rerender } = renderCollapsed()
      rerender(<Sidebar {...props} collapsed peeking />)
      rerender(<Sidebar {...props} collapsed />)
      expect(classes(rail())).toEqual(expect.arrayContaining(['z-[5]', 'overflow-visible']))
      expect(classes(contents()!)).toEqual(
        expect.arrayContaining(['bg-bg-sheet', 'opacity-0', '-translate-x-2'])
      )
      expect(contents()!.hasAttribute('inert')).toBe(true)
      fireEvent.transitionEnd(contents()!, { propertyName: 'opacity' })
      expect(contents()).toBeNull()
      expect(classes(rail())).not.toContain('z-[5]')
    })

    it('holds still when pinned while the pane reflows, then turns to glass', () => {
      const { props, rerender } = renderCollapsed()
      rerender(<Sidebar {...props} collapsed peeking />)
      const peeked = contents()!.className
      rerender(<Sidebar {...props} collapsed={false} />)
      expect(classes(rail())).toEqual(
        expect.arrayContaining(['w-(--size-sidebar)', 'transition-[width,filter]', 'duration-150'])
      )
      // The sheet is left exactly as it was, above the pane, while only the
      // pane moves: nothing in it slides or fades in again.
      expect(contents()!.className).toBe(peeked)
      expect(classes(rail())).toEqual(expect.arrayContaining(['z-[5]', 'overflow-visible']))
      expect(rail().hasAttribute('data-on-glass')).toBe(false)
      expect(contents()!.querySelector('[data-rail-edge]')).not.toBeNull()

      // Once the pane has made room, the fill fades off into the glass.
      fireEvent.transitionEnd(rail(), { propertyName: 'width' })
      expect(contents()!.className).not.toMatch(/bg-bg-|shadow-\[/)
      expect(classes(contents()!)).toEqual(
        expect.arrayContaining([
          'transition-[opacity,translate,background-color,box-shadow]',
          'opacity-100',
          'translate-x-0'
        ])
      )
      expect(rail().hasAttribute('data-on-glass')).toBe(true)
      expect(classes(rail())).toContain('overflow-hidden')
      expect(classes(rail())).not.toContain('z-[5]')
      const edges = rail().querySelectorAll('[data-rail-edge]')
      expect(edges).toHaveLength(1)
      expect(edges[0].parentElement).toBe(rail())
    })
  })

  describe('when a transition never reports its end', () => {
    // A transition cut short ends without a transitionend; the rail must not
    // be left floating, or its contents mounted, for want of one.
    const rail = () => screen.getByRole('complementary', { name: 'Notes' })
    const contents = () => document.querySelector('[data-rail-contents]') as HTMLElement | null

    it('settles a pin into the glass all the same, just after its 150ms', () => {
      vi.useFakeTimers()
      try {
        const { props, rerender } = renderSidebar()
        rerender(<Sidebar {...props} collapsed />)
        act(() => vi.advanceTimersByTime(200))
        expect(contents()).toBeNull()
        rerender(<Sidebar {...props} collapsed peeking />)
        rerender(<Sidebar {...props} collapsed={false} />)
        expect(rail().hasAttribute('data-on-glass')).toBe(false)
        act(() => vi.advanceTimersByTime(200))
        expect(rail().hasAttribute('data-on-glass')).toBe(true)
        expect(contents()!.className).not.toMatch(/bg-bg-/)
      } finally {
        vi.useRealTimers()
      }
    })
  })

  describe('its fill', () => {
    const scrollList = (top: number) => {
      const scroller = document.querySelector('.\\[scrollbar-gutter\\:stable\\]') as HTMLElement
      scroller.scrollTop = top
      fireEvent.scroll(scroller)
    }

    // AppKit's own sidebar glass lies under the rail (main/sidebar-glass.ts);
    // the rail paints nothing over it: no fill, no tint, no mask, no blur.
    const painted = () =>
      [
        screen.getByRole('complementary', { name: 'Notes' }),
        ...screen.getByRole('complementary', { name: 'Notes' }).querySelectorAll('*')
      ].filter((el) =>
        (el.getAttribute('class') ?? '')
          .split(/\s+/)
          .some((c) => /^(bg-(sidebar|surface|canvas)|mask-|blur-)/.test(c))
      )

    it('stands wholly on AppKit’s sidebar glass', () => {
      renderSidebar()
      expect(painted()).toEqual([])
      expect(document.querySelector('[data-rail-tint]')).toBeNull()
      expect(css).not.toMatch(/mask-rail-glass/)
    })

    it('stays clear as the notes scroll under its head', () => {
      renderSidebar()
      scrollList(30)
      expect(painted()).toEqual([])
    })

    it('is a sheet: surface 1, the ground popovers, dialogs and toolbars share', () => {
      expect(css).toMatch(/--bg-sheet: var\(--bg-1\);/)
      expect(css).toMatch(/--color-bg-sheet: var\(--bg-sheet\);/)
    })

    it('raises what stands on it a step, to surface 2', () => {
      renderSidebar()
      const rail = screen.getByRole('complementary', { name: 'Notes' })
      expect(rail.className.split(/\s+/)).toContain('bg-level-1')
    })
  })
})
