import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { SelectionToolbar, type MarkName } from '../selection-toolbar'
import { POPOVER_TOOLBAR } from '@/components/ui/popover'

// The Popover shell a toolbar floats in.
const shellOf = (el: HTMLElement) => el.closest<HTMLElement>('.bg-bg-sheet')!

function noopHandlers() {
  return {
    rect: { left: 0, top: 0, width: 0, height: 0 },
    onToggleMark: vi.fn(),
    onStartLink: vi.fn(),
    onApplyLink: vi.fn(),
    onRemoveLink: vi.fn(),
    onGotoLink: vi.fn(),
    onEditLink: vi.fn(),
    onAddSidenote: vi.fn(),
    onEditSidenote: vi.fn(),
    onDeleteSidenote: vi.fn(),
    onDismiss: vi.fn()
  }
}

const empty: ReadonlySet<MarkName> = new Set()

describe('SelectionToolbar — format mode', () => {
  it('floats every mode at one height, a button and the 2px round it', () => {
    for (const mode of ['format', 'link-view', 'sidenote-view'] as const) {
      const { unmount } = render(
        <SelectionToolbar mode={mode} activeMarks={empty} {...noopHandlers()} />
      )
      const shell = shellOf(screen.getAllByRole('toolbar')[0])
      for (const c of POPOVER_TOOLBAR.split(' ')) expect(shell.classList).toContain(c)
      unmount()
    }
    render(<SelectionToolbar mode="link-edit" activeMarks={empty} {...noopHandlers()} />)
    const edit = screen.getByRole('toolbar', { name: 'Edit link' }).classList
    expect([...edit].filter((c) => /^h-/.test(c))).toEqual(['h-(--size-toolbar)'])
  })

  it('renders the formatting buttons', () => {
    render(<SelectionToolbar mode="format" activeMarks={empty} {...noopHandlers()} />)
    expect(screen.getByRole('toolbar', { name: 'Format selection' })).toBeDefined()
    for (const label of [
      'Add link',
      'Add sidenote',
      'Bold',
      'Italic',
      'Underline',
      'Strikethrough',
      'Highlight',
      'Code'
    ]) {
      expect(screen.getByLabelText(label)).toBeDefined()
    }
  })

  it('calls onToggleMark with the mark type when a button is clicked', () => {
    const h = noopHandlers()
    render(<SelectionToolbar mode="format" activeMarks={empty} {...h} />)
    fireEvent.click(screen.getByLabelText('Strikethrough'))
    expect(h.onToggleMark).toHaveBeenCalledWith('strikethrough')
  })

  it('marks active buttons via aria-pressed', () => {
    render(
      <SelectionToolbar
        mode="format"
        activeMarks={new Set<MarkName>(['italic', 'sidenote'])}
        {...noopHandlers()}
      />
    )
    expect(screen.getByLabelText('Italic').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText('Add sidenote').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText('Bold').getAttribute('aria-pressed')).toBe('false')
  })

  // A link carries no style, so over one the toolbar offers none.
  it('offers only the link and the sidenote over a link', () => {
    render(
      <SelectionToolbar
        mode="format"
        activeMarks={new Set<MarkName>(['link'])}
        {...noopHandlers()}
      />
    )
    expect(screen.getByLabelText('Add link').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText('Add sidenote')).toBeTruthy()
    for (const label of ['Bold', 'Italic', 'Underline', 'Strikethrough', 'Highlight', 'Code'])
      expect(screen.queryByLabelText(label)).toBeNull()
    // Its two buttons alone, with no divider after them.
    expect(screen.getByRole('toolbar').children).toHaveLength(2)
  })

  it('starts link editing and adds a sidenote from their buttons', () => {
    const h = noopHandlers()
    render(<SelectionToolbar mode="format" activeMarks={empty} {...h} />)
    fireEvent.click(screen.getByLabelText('Add link'))
    expect(h.onStartLink).toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('Add sidenote'))
    expect(h.onAddSidenote).toHaveBeenCalled()
  })

  it('keeps the editor selection alive: a press on a button is default-prevented', () => {
    render(<SelectionToolbar mode="format" activeMarks={empty} {...noopHandlers()} />)
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    screen.getByLabelText('Bold').dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
  })

  it('dismisses on Escape', () => {
    const h = noopHandlers()
    render(<SelectionToolbar mode="format" activeMarks={empty} {...h} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(h.onDismiss).toHaveBeenCalled()
  })

  // Whatever stands in the note beside its words, a block's grip say, is no way out of it.
  it('dismisses on a press outside it, but not on one it is told to take no notice of', () => {
    const modes = [
      'format',
      'link-view',
      'sidenote-view',
      'link-edit',
      'color',
      'size',
      'align'
    ] as const
    for (const mode of modes) {
      const h = noopHandlers()
      const { container, unmount } = render(
        <>
          <button data-furniture="">Beside the words</button>
          <button>Elsewhere</button>
          <SelectionToolbar
            mode={mode}
            activeMarks={empty}
            {...h}
            onPickColor={vi.fn()}
            onPickSize={vi.fn()}
            onPickAlign={vi.fn()}
            ignoreSelector="[data-furniture]"
          />
        </>
      )
      const [beside, elsewhere] = container.querySelectorAll('button')
      fireEvent.pointerDown(beside)
      expect(h.onDismiss).not.toHaveBeenCalled()
      fireEvent.pointerDown(elsewhere)
      expect(h.onDismiss).toHaveBeenCalledTimes(1)
      unmount()
    }
  })

  it('anchors to the article-relative rect it is given', () => {
    render(
      <article style={{ position: 'relative' }}>
        <SelectionToolbar
          mode="format"
          activeMarks={empty}
          {...noopHandlers()}
          rect={{ left: 12, top: 34, width: 56, height: 78 }}
        />
      </article>
    )
    const anchor = document.querySelector<HTMLElement>('[data-popover-anchor]')
    expect(anchor?.style.left).toBe('12px')
    expect(anchor?.style.top).toBe('34px')
  })
})

// A note's words can be given a colour by name and its paragraphs a size. The
// two are offered only by an editor that can set them, each opening its
// choices in the toolbar's own row, as Add link opens its field.
describe('SelectionToolbar — colour and size', () => {
  function pickers() {
    return {
      onStartColor: vi.fn(),
      onPickColor: vi.fn(),
      onStartSize: vi.fn(),
      onPickSize: vi.fn()
    }
  }

  it('offers neither where the editor cannot set them', () => {
    render(<SelectionToolbar mode="format" activeMarks={empty} {...noopHandlers()} />)
    expect(screen.queryByLabelText('Colour')).toBeNull()
    expect(screen.queryByLabelText('Size')).toBeNull()
  })

  it('offers a colour and a size after the marks, behind a divider of their own', () => {
    const p = pickers()
    render(<SelectionToolbar mode="format" activeMarks={empty} {...noopHandlers()} {...p} />)
    const row = [...screen.getByRole('toolbar', { name: 'Format selection' }).children]
    expect(row.slice(-3).map((el) => el.getAttribute('aria-label'))).toEqual([
      null,
      'Colour',
      'Size'
    ])
    fireEvent.click(screen.getByLabelText('Colour'))
    expect(p.onStartColor).toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('Size'))
    expect(p.onStartSize).toHaveBeenCalled()
  })

  it('offers the colour alone where there is no paragraph to size', () => {
    const { onStartColor, onPickColor } = pickers()
    render(
      <SelectionToolbar
        mode="format"
        activeMarks={empty}
        {...noopHandlers()}
        onStartColor={onStartColor}
        onPickColor={onPickColor}
      />
    )
    expect(screen.getByLabelText('Colour')).toBeTruthy()
    expect(screen.queryByLabelText('Size')).toBeNull()
  })

  it('offers neither over a link, which carries no style', () => {
    render(
      <SelectionToolbar
        mode="format"
        activeMarks={new Set<MarkName>(['link'])}
        {...noopHandlers()}
        {...pickers()}
      />
    )
    expect(screen.queryByLabelText('Colour')).toBeNull()
    expect(screen.queryByLabelText('Size')).toBeNull()
  })

  it('presses the colour while the words wear one, and the size while it is not the paragraph’s own', () => {
    const { rerender } = render(
      <SelectionToolbar
        mode="format"
        activeMarks={empty}
        color="danger"
        size="lg"
        {...noopHandlers()}
        {...pickers()}
      />
    )
    expect(screen.getByLabelText('Colour').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByLabelText('Size').getAttribute('aria-pressed')).toBe('true')
    rerender(
      <SelectionToolbar
        mode="format"
        activeMarks={empty}
        color="default"
        size="md"
        {...noopHandlers()}
        {...pickers()}
      />
    )
    expect(screen.getByLabelText('Colour').getAttribute('aria-pressed')).toBe('false')
    expect(screen.getByLabelText('Size').getAttribute('aria-pressed')).toBe('false')
  })

  it('lists the colours by name, each letter in its own ink, the one worn pressed', () => {
    const p = pickers()
    render(
      <SelectionToolbar
        mode="color"
        activeMarks={empty}
        color="warning"
        {...noopHandlers()}
        {...p}
      />
    )
    const row = screen.getByRole('toolbar', { name: 'Text colour' })
    for (const c of POPOVER_TOOLBAR.split(' ')) expect(shellOf(row).classList).toContain(c)
    const options = [...row.querySelectorAll('button')]
    expect(options.map((option) => option.getAttribute('aria-label'))).toEqual([
      'Default',
      'Highlight',
      'Muted',
      'Danger',
      'Warning',
      'Success'
    ])
    expect(
      options.map((option) => option.querySelector('span')?.className.split(' ').at(-1))
    ).toEqual([
      'text-ink-body',
      'text-ink-style-highlight',
      'text-ink-style-muted',
      'text-ink-style-danger',
      'text-ink-style-warning',
      'text-ink-style-success'
    ])
    expect(options.map((option) => option.getAttribute('aria-pressed'))).toEqual([
      'false',
      'false',
      'false',
      'false',
      'true',
      'false'
    ])
    fireEvent.click(screen.getByLabelText('Success'))
    expect(p.onPickColor).toHaveBeenLastCalledWith('success')
    fireEvent.click(screen.getByLabelText('Default'))
    expect(p.onPickColor).toHaveBeenLastCalledWith(null)
  })

  it('presses Default for words in no colour, and nothing for words in several', () => {
    const pressed = () =>
      [...screen.getByRole('toolbar').querySelectorAll('button[aria-pressed=true]')].map((el) =>
        el.getAttribute('aria-label')
      )
    const { rerender } = render(
      <SelectionToolbar
        mode="color"
        activeMarks={empty}
        color="default"
        {...noopHandlers()}
        {...pickers()}
      />
    )
    expect(pressed()).toEqual(['Default'])
    rerender(
      <SelectionToolbar
        mode="color"
        activeMarks={empty}
        color={null}
        {...noopHandlers()}
        {...pickers()}
      />
    )
    expect(pressed()).toEqual([])
  })

  it('lists the sizes by name, the one worn pressed', () => {
    const p = pickers()
    render(
      <SelectionToolbar mode="size" activeMarks={empty} size="sm" {...noopHandlers()} {...p} />
    )
    const row = screen.getByRole('toolbar', { name: 'Text size' })
    for (const c of POPOVER_TOOLBAR.split(' ')) expect(shellOf(row).classList).toContain(c)
    const options = [...row.querySelectorAll('button')]
    expect(options.map((option) => option.textContent)).toEqual(['Small', 'Medium', 'Large'])
    expect(options.map((option) => option.getAttribute('aria-pressed'))).toEqual([
      'true',
      'false',
      'false'
    ])
    fireEvent.click(screen.getByText('Large'))
    expect(p.onPickSize).toHaveBeenLastCalledWith('lg')
    fireEvent.click(screen.getByText('Medium'))
    expect(p.onPickSize).toHaveBeenLastCalledWith('md')
  })

  // A word's line is taller than a glyph: left to it, a size would fill the toolbar from top to
  // bottom, over the 2px the shell keeps clear.
  it('stands a size as tall as a button, as the icons beside it are', () => {
    render(
      <SelectionToolbar
        mode="size"
        activeMarks={empty}
        size="md"
        {...noopHandlers()}
        {...pickers()}
      />
    )
    const row = screen.getByRole('toolbar', { name: 'Text size' })
    for (const option of row.querySelectorAll('button')) {
      expect(option.className.split(/\s+/).filter((c) => /^h-/.test(c))).toEqual([
        'h-(--size-toolbar-button)'
      ])
    }
  })

  it('keeps the selection alive through a pick, and dismisses on Escape', () => {
    const h = noopHandlers()
    render(<SelectionToolbar mode="color" activeMarks={empty} {...h} {...pickers()} />)
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
    screen.getByLabelText('Danger').dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(h.onDismiss).toHaveBeenCalled()
  })
})

describe('SelectionToolbar — link-edit mode', () => {
  // As the command palette's search field is: a bare input on the row, with no
  // field frame, fill, border or ring of its own.
  it("sets the link field straight on the toolbar, as the palette's search field is", () => {
    render(<SelectionToolbar mode="link-edit" activeMarks={empty} {...noopHandlers()} />)
    const input = screen.getByLabelText('Link URL')
    expect(input.closest('[data-field]')).toBeNull()
    expect(input.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['bg-transparent', 'border-none', 'outline-none'])
    )
    expect(input.parentElement!.getAttribute('role')).toBe('toolbar')
  })

  it('prefills the href and applies on Enter', () => {
    const h = noopHandlers()
    render(
      <SelectionToolbar
        mode="link-edit"
        activeMarks={empty}
        linkHref="https://old.example"
        {...h}
      />
    )
    const input = screen.getByLabelText('Link URL') as HTMLInputElement
    expect(input.value).toBe('https://old.example')
    fireEvent.change(input, { target: { value: 'https://new.example' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(h.onApplyLink).toHaveBeenCalledWith('https://new.example')
  })

  it('does not apply an empty href', () => {
    const h = noopHandlers()
    render(<SelectionToolbar mode="link-edit" activeMarks={empty} {...h} />)
    const input = screen.getByLabelText('Link URL')
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(h.onApplyLink).not.toHaveBeenCalled()
  })

  it('dismisses on Escape from the input', () => {
    const h = noopHandlers()
    render(<SelectionToolbar mode="link-edit" activeMarks={empty} {...h} />)
    fireEvent.keyDown(screen.getByLabelText('Link URL'), { key: 'Escape' })
    expect(h.onDismiss).toHaveBeenCalled()
  })

  it('focuses the input on entry and re-seeds it when the link changes', () => {
    const h = noopHandlers()
    const { rerender } = render(
      <SelectionToolbar mode="format" activeMarks={empty} linkHref="https://a.example" {...h} />
    )
    rerender(
      <SelectionToolbar mode="link-edit" activeMarks={empty} linkHref="https://b.example" {...h} />
    )
    const input = screen.getByLabelText('Link URL') as HTMLInputElement
    expect(input.value).toBe('https://b.example')
    expect(document.activeElement).toBe(input)
  })
})

describe('SelectionToolbar — link-view mode', () => {
  it('renders edit / open / remove actions and wires them', () => {
    const h = noopHandlers()
    render(
      <SelectionToolbar
        mode="link-view"
        activeMarks={empty}
        linkHref="https://example.com"
        {...h}
      />
    )
    expect(screen.getByRole('toolbar', { name: 'Link actions' })).toBeDefined()
    fireEvent.click(screen.getByLabelText('Edit link'))
    fireEvent.click(screen.getByLabelText('Open link'))
    fireEvent.click(screen.getByLabelText('Remove link'))
    expect(h.onEditLink).toHaveBeenCalled()
    expect(h.onGotoLink).toHaveBeenCalled()
    expect(h.onRemoveLink).toHaveBeenCalled()
  })
})

describe('SelectionToolbar — sidenote-view mode', () => {
  it('renders only Edit and Delete actions and wires them', () => {
    const h = noopHandlers()
    render(<SelectionToolbar mode="sidenote-view" activeMarks={empty} {...h} />)
    expect(screen.getByRole('toolbar', { name: 'Sidenote actions' })).toBeDefined()
    // Exactly two actions — no Open, no formatting buttons.
    expect(screen.getByLabelText('Edit sidenote')).toBeDefined()
    expect(screen.getByLabelText('Delete sidenote')).toBeDefined()
    expect(screen.queryByLabelText('Bold')).toBeNull()
    expect(screen.queryByLabelText('Open link')).toBeNull()

    fireEvent.click(screen.getByLabelText('Edit sidenote'))
    fireEvent.click(screen.getByLabelText('Delete sidenote'))
    expect(h.onEditSidenote).toHaveBeenCalled()
    expect(h.onDeleteSidenote).toHaveBeenCalled()
  })
})

// A block can be set to the left, the centre or the right. The toolbar offers it
// after the colour and the size, its sides in a row of their own, as theirs are.
describe('SelectionToolbar — alignment', () => {
  function aligning() {
    return { onStartAlign: vi.fn(), onPickAlign: vi.fn() }
  }
  const drawing = (name: string): string =>
    screen.getByRole('button', { name }).querySelector('svg')!.innerHTML

  it('offers no alignment where the editor cannot set one', () => {
    render(<SelectionToolbar mode="format" activeMarks={empty} {...noopHandlers()} />)
    expect(screen.queryByLabelText('Alignment')).toBeNull()
  })

  it('offers the alignment last, after the colour and the size', () => {
    const a = aligning()
    render(
      <SelectionToolbar
        mode="format"
        activeMarks={empty}
        align="left"
        {...noopHandlers()}
        onStartColor={vi.fn()}
        onStartSize={vi.fn()}
        {...a}
      />
    )
    const row = [...screen.getByRole('toolbar', { name: 'Format selection' }).children]
    expect(row.slice(-4).map((el) => el.getAttribute('aria-label'))).toEqual([
      null,
      'Colour',
      'Size',
      'Alignment'
    ])
    fireEvent.click(screen.getByLabelText('Alignment'))
    expect(a.onStartAlign).toHaveBeenCalled()
  })

  it('offers none over a link, as it offers no other style there', () => {
    render(
      <SelectionToolbar
        mode="format"
        activeMarks={new Set<MarkName>(['link'])}
        align="left"
        {...noopHandlers()}
        {...aligning()}
      />
    )
    expect(screen.queryByLabelText('Alignment')).toBeNull()
  })

  it('lists the three sides, the one the blocks are set to pressed', () => {
    const a = aligning()
    render(
      <SelectionToolbar
        mode="align"
        activeMarks={empty}
        align="center"
        {...noopHandlers()}
        {...a}
      />
    )
    const row = screen.getByRole('toolbar', { name: 'Text alignment' })
    for (const c of POPOVER_TOOLBAR.split(' ')) expect(shellOf(row).classList).toContain(c)
    const options = [...row.querySelectorAll('button')]
    expect(options.map((option) => option.getAttribute('aria-label'))).toEqual([
      'Left',
      'Centre',
      'Right'
    ])
    expect(options.map((option) => option.getAttribute('aria-pressed'))).toEqual([
      'false',
      'true',
      'false'
    ])
    fireEvent.click(screen.getByLabelText('Right'))
    expect(a.onPickAlign).toHaveBeenLastCalledWith('right')
    fireEvent.click(screen.getByLabelText('Left'))
    expect(a.onPickAlign).toHaveBeenLastCalledWith('left')
  })

  it('presses no side for blocks set to more than one', () => {
    render(
      <SelectionToolbar
        mode="align"
        activeMarks={empty}
        align={null}
        {...noopHandlers()}
        {...aligning()}
      />
    )
    expect(document.querySelectorAll('[role=toolbar] button[aria-pressed=true]')).toHaveLength(0)
  })

  // The button says where the words stand before it is pressed.
  it('draws the side the blocks are set to, pressed while that is not the left', () => {
    const sides = { left: 'Left', center: 'Centre', right: 'Right' } as const
    const drawn = {} as Record<keyof typeof sides, string>
    const row = render(
      <SelectionToolbar mode="align" activeMarks={empty} {...noopHandlers()} {...aligning()} />
    )
    for (const side of ['left', 'center', 'right'] as const) drawn[side] = drawing(sides[side])
    row.unmount()
    expect(new Set(Object.values(drawn)).size).toBe(3)

    for (const side of ['left', 'center', 'right'] as const) {
      const { unmount } = render(
        <SelectionToolbar
          mode="format"
          activeMarks={empty}
          align={side}
          {...noopHandlers()}
          {...aligning()}
        />
      )
      expect(drawing('Alignment')).toBe(drawn[side])
      expect(screen.getByLabelText('Alignment').getAttribute('aria-pressed')).toBe(
        String(side !== 'left')
      )
      unmount()
    }
    // Set to more than one side: the left's drawing, pressed.
    render(
      <SelectionToolbar
        mode="format"
        activeMarks={empty}
        align={null}
        {...noopHandlers()}
        {...aligning()}
      />
    )
    expect(drawing('Alignment')).toBe(drawn.left)
    expect(screen.getByLabelText('Alignment').getAttribute('aria-pressed')).toBe('true')
  })
})
