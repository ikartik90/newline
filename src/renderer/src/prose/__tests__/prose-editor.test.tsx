import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { TextSelection } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ProseEditor } from '../prose-editor'

// The dialog reaches the media library over Electron; here it is a stand-in
// that hands back one picture when asked to.
vi.mock('@/components/image-insert-dialog', () => ({
  ImageInsertDialog: ({
    open,
    onInsert
  }: {
    open: boolean
    onInsert: (payload: { src: string; alt?: string; kind: 'image' | 'video' }) => void
  }) =>
    open ? (
      <button
        type="button"
        onClick={() =>
          onInsert({ src: 'https://example.com/picked.png', alt: 'Picked', kind: 'image' })
        }
      >
        Insert the picked picture
      </button>
    ) : null
}))

// jsdom lays nothing out: the editor asks where the caret is when it scrolls to it.
beforeAll(() => {
  const nowhere = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => nowhere as DOMRect
  // jsdom has no clipboard event: the editor makes one to say a paste happened.
  vi.stubGlobal('ClipboardEvent', class extends Event {})
})

afterEach(cleanup)

function mount(mdx = '') {
  const onChange = vi.fn<(mdx: string) => void>()
  let view!: EditorView
  const { container } = render(
    <ProseEditor mdx={mdx} onChange={onChange} onReady={(ready) => (view = ready)} />
  )
  const written = (): string => onChange.mock.calls.at(-1)?.[0] ?? ''
  return { view, container, onChange, written }
}

/** Type as a keyboard does, a letter at a time, so the typing rules see it. */
function type(view: EditorView, text: string): void {
  act(() => typeLetters(view, text))
}

function typeLetters(view: EditorView, text: string): void {
  for (const letter of text) {
    const { from, to } = view.state.selection
    const insert = () => view.state.tr.insertText(letter, from, to)
    const handled = view.someProp('handleTextInput', (handle) =>
      handle(view, from, to, letter, insert)
    )
    if (!handled) view.dispatch(insert())
  }
}

function press(view: EditorView, key: string, modifiers: KeyboardEventInit = {}): void {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...modifiers })
  act(() => {
    view.someProp('handleKeyDown', (handle) => handle(view, event))
  })
}

const lines = (...rows: string[]): string => rows.join('\n') + '\n'

// jsdom is no Mac, so the editor's Mod key is Ctrl there; on a Mac it is Cmd.
const MOD: KeyboardEventInit = { ctrlKey: true }

describe('ProseEditor', () => {
  it('shows the note it is given, each block in its own text style', () => {
    const { container } = mount(lines('## A heading', '', 'Some words', '', '> Quoted'))
    expect(container.querySelector('h2')?.textContent).toBe('A heading')
    expect(container.querySelector('h2')?.className).toContain('text-style-heading-2')
    expect(container.querySelector('p')?.className).toContain('text-style-paragraph-md')
    expect(container.querySelector('blockquote p')?.textContent).toBe('Quoted')
  })

  it("draws a block's size and colour, and a run's colour, in the app's own inks", () => {
    const { container } = mount(
      lines(
        '<BlockStyle size="sm" color="highlight">',
        '  Small and coloured',
        '</BlockStyle>',
        '',
        'Plain with <TextStyle color="danger">red words</TextStyle>.'
      )
    )
    const [small, plain] = [...container.querySelectorAll('p')]
    expect(small.className).toContain('text-style-paragraph-sm')
    expect(small.className).toContain('text-ink-style-highlight')
    expect(small.className).not.toContain('text-ink-paragraph')
    expect(plain.className).toContain('text-ink-paragraph')
    expect(plain.querySelector('span')?.className).toBe('text-ink-style-danger')
  })

  it("sets and inks a list item's line as the paragraph it is", () => {
    const { container } = mount('- An item\n')
    const cls = container.querySelector('li p')!.className.split(/\s+/)
    expect(cls).toContain('text-style-paragraph-md')
    expect(cls).toContain('text-ink-paragraph')
    expect(cls).not.toContain('text-ink-body')
  })

  it("draws every mark in today's own style", () => {
    const { container } = mount(
      '<mark>h</mark> <u>u</u> ~~s~~ `c` [l](https://example.com/) <Sidenote note="n">run</Sidenote>'
    )
    expect(container.querySelector('mark')?.className).toBe('article-highlight')
    expect(container.querySelector('u')?.className).toBe('article-underline')
    expect(container.querySelector('s')?.className).toBe('article-strikethrough')
    expect(container.querySelector('code')?.className).toBe('inline-code')
    expect(container.querySelector('a')?.className).toBe('article-link')
    expect(container.querySelector('[data-sidenote-id] > span')?.className).toBe(
      'article-sidenote-text'
    )
  })

  it('draws a rule as a line with room either side of it', () => {
    const { container } = mount(lines('Above', '', '---', '', 'Below'))
    const rule = container.querySelector('hr')
    expect(rule?.className).toBe('border-none h-px bg-border-divider my-0')
    // Its box is a block like any other, held to the text measure, and no wider.
    expect(rule?.parentElement?.className).toBe('py-8')
  })

  // Today's markers: the number in its own column, zero-padded to the width
  // of the list's largest, its period in a slot of its own.
  it("numbers a list in the editor's own markers, padded to its largest number", () => {
    const ten = Array.from({ length: 10 }, (_, index) => `${index + 1}. Item`)
    const { container } = mount(lines(...ten))
    const labels = [...container.querySelectorAll('li > .list-marker-box')].map(
      (marker) => marker.textContent
    )
    expect(labels[0]).toBe('01.')
    expect(labels[9]).toBe('10.')
    const marker = container.querySelector('li > .list-marker-box')!
    expect(marker.getAttribute('contenteditable')).toBe('false')
    expect(marker.querySelector('.list-marker > .list-marker-period')?.textContent).toBe('.')
    expect(container.querySelector('li')?.className).toBe('flex flex-row items-baseline gap-2')
  })

  it('numbers a list from where it starts, and each list by itself', () => {
    const { container } = mount(lines('3. Three', '4. Four', '', '   1. Under four'))
    const labels = [...container.querySelectorAll('li > .list-marker-box')].map(
      (marker) => marker.textContent
    )
    expect(labels).toEqual(['3.', '4.', '1.'])
  })

  it('dots a bullet, and keeps the number in step as items come and go', () => {
    const bullets = mount(lines('- One', '- Two'))
    expect(bullets.container.querySelectorAll('li > .list-bullet')).toHaveLength(2)
    expect(bullets.container.querySelector('li')?.className).toBe('flex flex-row items-start gap-2')
    const { view, container } = mount('')
    type(view, '1. one')
    press(view, 'Enter')
    type(view, 'two')
    const labels = (): (string | null)[] =>
      [...container.querySelectorAll('li > .list-marker-box')].map((marker) => marker.textContent)
    expect(labels()).toEqual(['1.', '2.'])
    press(view, 'Enter')
    type(view, 'three')
    expect(labels()).toEqual(['1.', '2.', '3.'])
  })

  it('keeps the marker out of what the note is saved as', () => {
    const { view, written } = mount(lines('1. One', '2. Two'))
    type(view, '!')
    expect(written()).toBe(lines('1. !One', '2. Two'))
  })

  // The article is as wide as a picture may run; the body is that wide too, and
  // centres its blocks, which main.css holds to the text measure.
  it("runs the article's whole width and centres its blocks in it", () => {
    const { container } = mount('Words')
    const body = screen.getByRole('textbox', { name: 'Note' })
    expect(body.hasAttribute('data-note-body')).toBe(true)
    for (const name of ['flex', 'flex-col', 'items-center', 'gap-4']) {
      expect(body.classList, name).toContain(name)
    }
    expect(body.parentElement?.classList).toContain('w-full')
    expect(container.firstElementChild).toBe(body.parentElement)
  })

  it('steps an indented quote in by its margin, its rule with it', () => {
    const { container } = mount(lines('<BlockStyle indent>', '  > Quoted', '</BlockStyle>'))
    const quote = container.querySelector('blockquote')!
    expect(quote.hasAttribute('data-indented')).toBe(true)
    expect(quote.classList).toContain('data-indented:ml-8')
  })

  it('is one editable surface, named for what it is', () => {
    const { container } = mount('Words')
    const surface = container.querySelector('[contenteditable="true"]')
    expect(surface?.getAttribute('role')).toBe('textbox')
    expect(surface?.getAttribute('aria-multiline')).toBe('true')
    expect(surface?.getAttribute('aria-label')).toBe('Note')
  })

  it('hands back the note as MDX whenever it changes', () => {
    const { view, onChange, written } = mount('')
    expect(onChange).not.toHaveBeenCalled()
    type(view, 'Hello')
    expect(written()).toBe(lines('Hello'))
  })

  it('starts a heading at the level its hashes say', () => {
    const one = mount('')
    type(one.view, '# Title')
    expect(one.written()).toBe(lines('# Title'))
    const three = mount('')
    type(three.view, '### Title')
    expect(three.written()).toBe(lines('### Title'))
  })

  it('starts a list, a numbered list and a quote from their signs', () => {
    const bullets = mount('')
    type(bullets.view, '- one')
    expect(bullets.written()).toBe(lines('- one'))
    const numbers = mount('')
    type(numbers.view, '3. three')
    expect(numbers.written()).toBe(lines('3. three'))
    const quote = mount('')
    type(quote.view, '> said')
    expect(quote.written()).toBe(lines('> said'))
  })

  it('starts a block of code from three backticks, and a rule from three dashes', () => {
    const code = mount('')
    type(code.view, '``` ')
    type(code.view, 'const a = 1')
    expect(code.written()).toBe(lines('```', 'const a = 1', '```'))
    const rule = mount('')
    type(rule.view, '---')
    // The line under the rule is the editor's, to go on from, and no part of the note yet.
    expect(rule.written()).toBe(lines('---'))
    expect(rule.container.querySelector('[data-note-body]')!.lastElementChild!.tagName).toBe('P')
  })

  it('makes the next item on Enter, and leaves the list from an empty one', () => {
    const { view, written } = mount('')
    type(view, '- one')
    press(view, 'Enter')
    type(view, 'two')
    expect(written()).toBe(lines('- one', '- two'))
    press(view, 'Enter')
    press(view, 'Enter')
    type(view, 'after')
    // As today: the empty item becomes a line of its own, above the one the list was given.
    expect(written()).toBe(lines('- one', '- two', '', 'after', '', '&nbsp;'))
  })

  it('steps an item in under the one before it on Tab, and back out on Shift+Tab', () => {
    const { view, written } = mount('')
    type(view, '- one')
    press(view, 'Enter')
    type(view, 'two')
    press(view, 'Tab')
    expect(written()).toBe(lines('- one', '', '  - two'))
    press(view, 'Tab', { shiftKey: true })
    expect(written()).toBe(lines('- one', '- two'))
  })

  it('marks what is typed after a mark is switched on', () => {
    const { view, written } = mount('')
    type(view, 'a ')
    press(view, 'b', MOD)
    type(view, 'bold')
    press(view, 'b', MOD)
    type(view, ' and ')
    press(view, 'i', MOD)
    type(view, 'italic')
    press(view, 'i', MOD)
    type(view, ' ')
    press(view, 'u', MOD)
    type(view, 'under')
    expect(written()).toBe(lines('a **bold** and *italic* <u>under</u>'))
  })

  // Today's editor marks from the keys in bold, italic and underline alone; the
  // rest are the toolbar's.
  it('has no keys for code, strikethrough or highlight', () => {
    const { view, onChange } = mount('Hello world')
    act(() => {
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 6)))
    })
    press(view, 'e', MOD)
    press(view, 'x', { ...MOD, shiftKey: true })
    press(view, 'h', { ...MOD, shiftKey: true })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('says Start writing… in a note that holds nothing, and not once it holds a word', () => {
    const { view, container } = mount('')
    const line = container.querySelector('p')!
    expect(line.getAttribute('data-placeholder')).toBe('Start writing…')
    expect(line.hasAttribute('data-empty')).toBe(true)
    expect(line.classList).toContain('editor-placeholder')
    type(view, 'A')
    expect(container.querySelector('p')!.hasAttribute('data-placeholder')).toBe(false)
  })

  it('says nothing in an empty line of a note that holds more, or in an empty heading', () => {
    const { container } = mount(lines('One', '', '&nbsp;'))
    expect(container.querySelector('[data-placeholder]')).toBeNull()
    cleanup()
    expect(mount(lines('## ')).container.querySelector('[data-placeholder]')).toBeNull()
  })

  // Today's editor keeps a line after a block there is no typing on from.
  it('keeps a line to go on from after a list, code, a rule or a picture that ends the note', () => {
    for (const ending of [
      '- one',
      '1. one',
      '```\ncode\n```',
      '---',
      '![](https://example.com/a.png)'
    ]) {
      const { container, onChange } = mount(lines('Above', '', ending))
      const last = container.querySelector('[data-note-body]')!.lastElementChild!
      expect(last.tagName, ending).toBe('P')
      expect(last.textContent, ending).toBe('')
      // Opening a note changes nothing in it.
      expect(onChange, ending).not.toHaveBeenCalled()
      cleanup()
    }
  })

  it('keeps no such line after words, a heading or a quote', () => {
    for (const ending of ['Words', '## Heading', '> Quoted']) {
      const { container } = mount(lines('Above', '', ending))
      expect(container.querySelector('[data-note-body]')!.childElementCount, ending).toBe(2)
      cleanup()
    }
  })

  it('gives the line when the note comes to end on such a block, and saves the note without it', () => {
    const { view, container, written } = mount('')
    type(view, '- one')
    expect(container.querySelector('[data-note-body]')!.lastElementChild!.tagName).toBe('P')
    expect(written()).toBe(lines('- one'))
  })

  it("saves the line once it holds a word, and an empty line of the note's own", () => {
    const { view, written } = mount(lines('- one'))
    act(() => {
      const end = view.state.doc.content.size - 1
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)))
    })
    type(view, 'After')
    expect(written()).toBe(lines('- one', '', 'After'))
    cleanup()
    // A line the writer left empty after words is the note's, and stays.
    const kept = mount(lines('Words', '', '&nbsp;'))
    type(kept.view, '!')
    expect(kept.written()).toBe(lines('!Words', '', '&nbsp;'))
  })

  it('breaks the line inside a block on Shift+Enter', () => {
    const { view, written } = mount('')
    type(view, 'one')
    press(view, 'Enter', { shiftKey: true })
    type(view, 'two')
    expect(written()).toBe(lines('one\\', 'two'))
  })

  it('takes back the last change, and puts it back', () => {
    const { view, written } = mount('Kept')
    type(view, '!')
    press(view, 'z', MOD)
    expect(written()).toBe(lines('Kept'))
    press(view, 'z', { ...MOD, shiftKey: true })
    expect(written()).not.toBe(lines('Kept'))
  })

  describe('the block menu', () => {
    const options = (): (string | null)[] =>
      within(screen.getByRole('listbox', { name: 'Insert block' }))
        .getAllByRole('option')
        .map((option) => option.textContent)

    it('opens on a slash, with no eyebrow and no metric in it', () => {
      const { view } = mount('')
      expect(screen.queryByRole('listbox', { name: 'Insert block' })).toBeNull()
      type(view, '/')
      expect(options()).toEqual([
        'Heading 1',
        'Heading 2',
        'Heading 3',
        'Heading 4',
        'Image or video',
        'Quote',
        'Numbered list',
        'Bulleted list',
        'Task list',
        'Code',
        'Divider'
      ])
    })

    it('narrows to what is typed after the slash, and closes when nothing matches', () => {
      const { view } = mount('')
      type(view, '/li')
      expect(options()).toEqual(['Numbered list', 'Bulleted list', 'Task list'])
      type(view, 'zz')
      expect(screen.queryByRole('listbox', { name: 'Insert block' })).toBeNull()
    })

    it('makes the block that is picked, in place of the slash and what followed it', () => {
      const { view, written } = mount('')
      type(view, '/quo')
      fireEvent.click(screen.getByRole('option', { name: 'Quote' }))
      expect(screen.queryByRole('listbox', { name: 'Insert block' })).toBeNull()
      type(view, 'said')
      expect(written()).toBe(lines('> said'))
    })

    it('makes each kind of block', () => {
      const made = (label: string, words: string): string => {
        const { view, written } = mount('')
        type(view, '/')
        fireEvent.click(screen.getByRole('option', { name: label }))
        type(view, words)
        cleanup()
        return written()
      }
      expect(made('Heading 1', 'Title')).toBe(lines('# Title'))
      expect(made('Heading 2', 'Title')).toBe(lines('## Title'))
      expect(made('Heading 3', 'Title')).toBe(lines('### Title'))
      expect(made('Heading 4', 'Title')).toBe(lines('#### Title'))
      expect(made('Numbered list', 'one')).toBe(lines('1. one'))
      expect(made('Bulleted list', 'one')).toBe(lines('- one'))
      expect(made('Code', 'x = 1')).toBe(lines('```', 'x = 1', '```'))
      expect(made('Divider', 'after')).toBe(lines('---', '', 'after'))
    })

    it('offers a heading every level but its own, and moves it to the one picked', () => {
      const { view, written } = mount(lines('## Title'))
      type(view, ' /')
      expect(options().slice(0, 4)).toEqual(['Heading 1', 'Heading 3', 'Heading 4', 'Paragraph'])
      fireEvent.click(screen.getByRole('option', { name: 'Heading 3' }))
      expect(written()).toBe(lines('### Title'))
    })

    it('finds a level by its short name', () => {
      const { view, written } = mount('')
      type(view, '/h4')
      expect(options()).toEqual(['Heading 4'])
      fireEvent.click(screen.getByRole('option', { name: 'Heading 4' }))
      type(view, 'Small')
      expect(written()).toBe(lines('#### Small'))
    })

    it('opens for a slash after words, and a divider then goes under the block', () => {
      const { view, written } = mount('')
      type(view, 'Words /')
      fireEvent.click(screen.getByRole('option', { name: 'Divider' }))
      expect(written()).toBe(lines('Words', '', '---'))
    })

    it('closes on Escape and stays closed while that slash stands', () => {
      const { view } = mount('')
      type(view, '/')
      fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
      expect(screen.queryByRole('listbox', { name: 'Insert block' })).toBeNull()
      type(view, 'q')
      expect(screen.queryByRole('listbox', { name: 'Insert block' })).toBeNull()
    })

    it('leaves a slash in a block of code alone', () => {
      const { view } = mount(lines('```', 'a', '```'))
      type(view, '/')
      expect(screen.queryByRole('listbox', { name: 'Insert block' })).toBeNull()
    })
  })

  describe('the selection toolbar', () => {
    /** Select from one position to another, as a drag across the words does. */
    function select(view: EditorView, from: number, to = from): void {
      act(() => {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)))
      })
    }
    const toolbar = (name: string): HTMLElement | null => screen.queryByRole('toolbar', { name })
    const button = (name: string): HTMLElement => screen.getByRole('button', { name })
    const pressed = (name: string): boolean => button(name).getAttribute('aria-pressed') === 'true'
    /** Where the toolbar is anchored, as the editor placed it. */
    const anchor = (): string => {
      const { left, top, width, height } =
        document.querySelector<HTMLElement>('[data-popover-anchor]')!.style
      return [left, top, width, height].join(' ')
    }
    const box = (left: number, top: number, right: number, bottom: number): DOMRect =>
      ({ left, top, right, bottom, width: right - left, height: bottom - top }) as DOMRect
    /** Lay the selected words out as the boxes given, for as long as `during` runs. */
    function laidOutAs(boxes: () => DOMRect[], during: (ranges: string[]) => void): void {
      const measure = Range.prototype.getClientRects
      const ranges: string[] = []
      Range.prototype.getClientRects = function (this: Range) {
        ranges.push(this.toString())
        return boxes() as unknown as DOMRectList
      }
      try {
        during(ranges)
      } finally {
        Range.prototype.getClientRects = measure
      }
    }

    it('stands over selected words, and not over a caret', () => {
      const { view } = mount('Hello world')
      expect(toolbar('Format selection')).toBeNull()
      select(view, 1, 6)
      expect(toolbar('Format selection')).not.toBeNull()
      select(view, 3)
      expect(toolbar('Format selection')).toBeNull()
    })

    // A press that lets the words go closes the toolbar for that selection only.
    it('stands over the same words selected again, from either end', () => {
      const { view } = mount('Hello world')
      select(view, 1, 6)
      fireEvent.pointerDown(view.dom)
      select(view, 8)
      select(view, 6, 1)
      expect(view.state.selection.anchor).toBe(6)
      expect(toolbar('Format selection')).not.toBeNull()
      fireEvent.pointerDown(view.dom)
      select(view, 8)
      select(view, 1, 6)
      expect(toolbar('Format selection')).not.toBeNull()
    })

    it('stays closed after Escape while the same words are selected, and opens for others', () => {
      const { view } = mount('Hello world')
      select(view, 1, 6)
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(toolbar('Format selection')).toBeNull()
      fireEvent.click(view.dom)
      expect(toolbar('Format selection')).toBeNull()
      select(view, 1, 7)
      expect(toolbar('Format selection')).not.toBeNull()
    })

    // The words of a link are the link's, selected or under the caret alike.
    it("offers a link's own actions for words selected inside it", () => {
      const { view, written } = mount('A [link](https://example.com/) here')
      select(view, 4, 6)
      expect(toolbar('Link actions')).not.toBeNull()
      expect(toolbar('Format selection')).toBeNull()
      select(view, 3, 7)
      expect(toolbar('Link actions')).not.toBeNull()
      fireEvent.click(button('Remove link'))
      expect(written()).toBe(lines('A link here'))
    })

    it("offers a sidenote's own actions for words selected inside it", () => {
      const { view, written } = mount('A <Sidenote note="n">noted</Sidenote> word')
      select(view, 4, 6)
      expect(toolbar('Sidenote actions')).not.toBeNull()
      expect(toolbar('Format selection')).toBeNull()
      fireEvent.click(button('Delete sidenote'))
      expect(written()).toBe(lines('A noted word'))
    })

    it('offers every mark for words that only run through a link or a sidenote', () => {
      const { view } = mount(
        'A [link](https://example.com/) and <Sidenote note="n">noted</Sidenote> here'
      )
      select(view, 1, 22)
      expect(toolbar('Format selection')).not.toBeNull()
      expect(pressed('Add link')).toBe(false)
      expect(pressed('Add sidenote')).toBe(false)
      expect(screen.queryByRole('button', { name: 'Bold' })).not.toBeNull()
      expect(screen.queryByRole('button', { name: 'Colour' })).not.toBeNull()
      expect(screen.queryByRole('button', { name: 'Size' })).not.toBeNull()
    })

    it('presses a mark only when every selected word wears it, and marks them all otherwise', () => {
      const { view, written } = mount('Hello **bold** world')
      select(view, 1, 11)
      expect(pressed('Bold')).toBe(false)
      fireEvent.click(button('Bold'))
      expect(written()).toBe(lines('**Hello bold** world'))
      expect(pressed('Bold')).toBe(true)
      fireEvent.click(button('Bold'))
      expect(written()).toBe(lines('Hello bold world'))
    })

    it('counts a space at either end of the words as marked, as the marking leaves it', () => {
      const { view } = mount('Hello **bold** world')
      // From the space before the mark to the space after it.
      select(view, 6, 12)
      expect(pressed('Bold')).toBe(true)
    })

    it('marks all the selected words from the keys too', () => {
      const { view, written } = mount('Hello **bold** world')
      select(view, 1, 11)
      press(view, 'b', MOD)
      expect(written()).toBe(lines('**Hello bold** world'))
      press(view, 'b', MOD)
      expect(written()).toBe(lines('Hello bold world'))
    })

    it('takes the sidenotes off words that all wear one, from the button that puts one on', () => {
      const { view, written } = mount(
        '<Sidenote note="a">one</Sidenote><Sidenote note="b">two</Sidenote> end'
      )
      select(view, 1, 7)
      expect(pressed('Add sidenote')).toBe(true)
      fireEvent.click(button('Add sidenote'))
      expect(written()).toBe(lines('onetwo end'))
    })

    it('opens on the address of the link the selected words start in', () => {
      const { view } = mount('A [link](https://example.com/) here')
      select(view, 5, 10)
      fireEvent.click(button('Add link'))
      const address = screen.getByRole<HTMLInputElement>('textbox', { name: 'Link URL' })
      expect(address.value).toBe('https://example.com/')
    })

    it('hands the keys back to the note, its words still selected, on Escape from the address', () => {
      const { view } = mount('Hello world')
      select(view, 1, 6)
      fireEvent.click(button('Add link'))
      expect(document.activeElement).toBe(screen.getByRole('textbox', { name: 'Link URL' }))
      fireEvent.keyDown(document, { key: 'Escape' })
      expect(document.activeElement).toBe(view.dom)
      expect(view.state.selection.from).toBe(1)
      expect(view.state.selection.to).toBe(6)
    })

    it('stands over the first line of the words, from the first of them that shows', () => {
      const { view } = mount('Hello world')
      const boxes = [
        // An empty box where a line wraps, two runs on the first line and a sidenote's
        // raised number after them, then the next line.
        box(300, 100, 300, 124),
        box(300, 100, 500, 124),
        box(520, 102, 600, 122),
        box(600, 96, 608, 112),
        box(100, 128, 400, 152)
      ]
      laidOutAs(
        () => boxes,
        (ranges) => {
          select(view, 6, 12)
          expect(anchor()).toBe('300px 100px 300px 24px')
          // Measured from the w, not from the space before it.
          expect(ranges.at(-1)).toBe('world')
        }
      )
    })

    it('stays where it stands as its words are marked, and follows them when the note is laid out anew', () => {
      const watched: { target: Element; laidOut: () => void }[] = []
      const Observer = globalThis.ResizeObserver
      globalThis.ResizeObserver = class {
        private laidOut: () => void
        constructor(callback: ResizeObserverCallback) {
          this.laidOut = () => callback([], this)
        }
        observe(target: Element): void {
          watched.push({ target, laidOut: this.laidOut })
        }
        unobserve(): void {}
        disconnect(): void {}
      }
      let at = box(300, 100, 400, 124)
      try {
        const { view } = mount('Hello world')
        laidOutAs(
          () => [at],
          () => {
            select(view, 1, 6)
            expect(anchor()).toBe('300px 100px 100px 24px')
            // Bold words are wider: the toolbar keeps its place under the pointer.
            at = box(300, 100, 410, 124)
            fireEvent.click(button('Bold'))
            expect(anchor()).toBe('300px 100px 100px 24px')
            // The pane narrows, and the words stand elsewhere.
            at = box(120, 160, 230, 184)
            act(() =>
              watched.filter(({ target }) => target === view.dom).forEach((each) => each.laidOut())
            )
            expect(anchor()).toBe('120px 160px 110px 24px')
          }
        )
      } finally {
        globalThis.ResizeObserver = Observer
      }
    })

    it('marks the selected words from its buttons', () => {
      const { view, written } = mount('Hello world')
      select(view, 1, 6)
      fireEvent.click(screen.getByRole('button', { name: 'Bold' }))
      expect(written()).toBe(lines('**Hello** world'))
      fireEvent.click(screen.getByRole('button', { name: 'Highlight' }))
      expect(written()).toBe(lines('<mark>**Hello**</mark> world'))
      fireEvent.click(screen.getByRole('button', { name: 'Bold' }))
      expect(written()).toBe(lines('<mark>Hello</mark> world'))
    })

    it('links the selected words to the address typed into it', () => {
      const { view, written } = mount('Hello world')
      select(view, 1, 6)
      fireEvent.click(screen.getByRole('button', { name: 'Add link' }))
      const address = screen.getByRole('textbox', { name: 'Link URL' })
      fireEvent.change(address, { target: { value: 'https://example.com/' } })
      fireEvent.keyDown(address, { key: 'Enter' })
      expect(written()).toBe(lines('[Hello](https://example.com/) world'))
    })

    it('takes an address typed without its scheme as https, and leaves the caret in the link', () => {
      const { view, written } = mount('Hello world')
      select(view, 1, 6)
      fireEvent.click(screen.getByRole('button', { name: 'Add link' }))
      const address = screen.getByRole('textbox', { name: 'Link URL' })
      fireEvent.change(address, { target: { value: ' example.com ' } })
      fireEvent.keyDown(address, { key: 'Enter' })
      expect(written()).toBe(lines('[Hello](https://example.com) world'))
      expect(view.state.selection.empty).toBe(true)
      expect(toolbar('Link actions')).not.toBeNull()
    })

    it('keeps an address that says its own scheme', () => {
      const { view, written } = mount('Hello world')
      select(view, 1, 6)
      fireEvent.click(screen.getByRole('button', { name: 'Add link' }))
      const address = screen.getByRole('textbox', { name: 'Link URL' })
      fireEvent.change(address, { target: { value: 'mailto:someone@example.com' } })
      fireEvent.keyDown(address, { key: 'Enter' })
      expect(written()).toBe(lines('[Hello](mailto:someone@example.com) world'))
    })

    it('counts the caret at either end of a link or a sidenote as in it', () => {
      const { view } = mount(
        'A [link](https://example.com/) and <Sidenote note="n">noted</Sidenote> here'
      )
      select(view, 3)
      expect(toolbar('Link actions')).not.toBeNull()
      select(view, 7)
      expect(toolbar('Link actions')).not.toBeNull()
      select(view, 2)
      expect(toolbar('Link actions')).toBeNull()
      select(view, 12)
      expect(toolbar('Sidenote actions')).not.toBeNull()
      select(view, 17)
      expect(toolbar('Sidenote actions')).not.toBeNull()
    })

    it("offers a link's own actions with the caret in it, and removes the link", () => {
      const { view, written } = mount('A [link](https://example.com/) here')
      select(view, 5)
      expect(toolbar('Link actions')).not.toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Remove link' }))
      expect(written()).toBe(lines('A link here'))
      expect(toolbar('Link actions')).toBeNull()
    })

    it('puts a sidenote on the selected words, and takes one off from inside it', () => {
      const { view, written } = mount('Hello world')
      select(view, 1, 6)
      fireEvent.click(screen.getByRole('button', { name: 'Add sidenote' }))
      expect(written()).toBe(lines('<Sidenote note="">Hello</Sidenote> world'))
      select(view, 3)
      expect(toolbar('Sidenote actions')).not.toBeNull()
      fireEvent.click(screen.getByRole('button', { name: 'Delete sidenote' }))
      expect(written()).toBe(lines('Hello world'))
    })

    it('keeps away from a block of code', () => {
      const { view } = mount(lines('```', 'const a = 1', '```'))
      select(view, 1, 6)
      expect(toolbar('Format selection')).toBeNull()
    })

    it('sets the selected words in the colour picked, and shows the colour they wear', () => {
      const { view, written } = mount('Hello world')
      select(view, 1, 6)
      expect(pressed('Colour')).toBe(false)
      fireEvent.click(button('Colour'))
      expect(toolbar('Text colour')).not.toBeNull()
      expect(pressed('Default')).toBe(true)
      fireEvent.click(button('Danger'))
      expect(written()).toBe(lines('<TextStyle color="danger">Hello</TextStyle> world'))
      // The pick is made: the marks are back, the words still selected.
      expect(toolbar('Format selection')).not.toBeNull()
      expect(view.state.selection.empty).toBe(false)
      expect(pressed('Colour')).toBe(true)
      fireEvent.click(button('Colour'))
      expect(pressed('Danger')).toBe(true)
      expect(pressed('Default')).toBe(false)
    })

    it('changes a colour for another, and takes it off with Default', () => {
      const { view, written } = mount('<TextStyle color="danger">Hello</TextStyle> world')
      select(view, 1, 6)
      fireEvent.click(button('Colour'))
      fireEvent.click(button('Success'))
      expect(written()).toBe(lines('<TextStyle color="success">Hello</TextStyle> world'))
      fireEvent.click(button('Colour'))
      fireEvent.click(button('Default'))
      expect(written()).toBe(lines('Hello world'))
      expect(pressed('Colour')).toBe(false)
    })

    it('goes back to the marks when the colour already worn is picked again', () => {
      const { view, onChange } = mount('<TextStyle color="danger">Hello</TextStyle> world')
      select(view, 1, 6)
      fireEvent.click(button('Colour'))
      fireEvent.click(button('Danger'))
      expect(toolbar('Format selection')).not.toBeNull()
      expect(onChange).not.toHaveBeenCalled()
    })

    it('presses no colour for words in more than one', () => {
      const { view } = mount('<TextStyle color="danger">Hello</TextStyle> world')
      select(view, 1, 12)
      expect(pressed('Colour')).toBe(true)
      fireEvent.click(button('Colour'))
      expect(document.querySelectorAll('[role=toolbar] button[aria-pressed=true]')).toHaveLength(0)
    })

    // A whole block's colour is its words' colour: giving some of them another
    // leaves the rest in it, worn by the words themselves.
    it('reads a block’s colour as its words’, and keeps it on the words left in it', () => {
      const { view, written } = mount(
        lines('<BlockStyle color="muted">', 'Hello world', '</BlockStyle>')
      )
      select(view, 1, 6)
      fireEvent.click(button('Colour'))
      expect(pressed('Muted')).toBe(true)
      fireEvent.click(button('Default'))
      expect(written()).toBe(lines('Hello<TextStyle color="muted"> world</TextStyle>'))
    })

    it('colours the words of a heading too', () => {
      const { view, written } = mount('## Hello world')
      select(view, 1, 6)
      fireEvent.click(button('Colour'))
      fireEvent.click(button('Highlight'))
      expect(written()).toBe(lines('## <TextStyle color="highlight">Hello</TextStyle> world'))
    })

    it('sets every paragraph the selection touches in the size picked', () => {
      const { view, written } = mount(lines('One', '', 'Two', '', 'Three'))
      // From inside One to inside Two.
      select(view, 2, 7)
      expect(pressed('Size')).toBe(false)
      fireEvent.click(button('Size'))
      expect(toolbar('Text size')).not.toBeNull()
      expect(pressed('Medium')).toBe(true)
      fireEvent.click(button('Small'))
      expect(written()).toBe(
        lines(
          '<BlockStyle size="sm">',
          '  One',
          '</BlockStyle>',
          '',
          '<BlockStyle size="sm">',
          '  Two',
          '</BlockStyle>',
          '',
          'Three'
        )
      )
      expect(toolbar('Format selection')).not.toBeNull()
      expect(view.state.selection.empty).toBe(false)
      expect(pressed('Size')).toBe(true)

      fireEvent.click(button('Size'))
      expect(pressed('Small')).toBe(true)
      fireEvent.click(button('Large'))
      expect(written()).toContain('<BlockStyle size="lg">')
      fireEvent.click(button('Size'))
      fireEvent.click(button('Medium'))
      expect(written()).toBe(lines('One', '', 'Two', '', 'Three'))
    })

    it('presses no size for paragraphs in more than one', () => {
      const { view } = mount(lines('<BlockStyle size="lg">', '  One', '</BlockStyle>', '', 'Two'))
      select(view, 2, 7)
      expect(pressed('Size')).toBe(true)
      fireEvent.click(button('Size'))
      expect(document.querySelectorAll('[role=toolbar] button[aria-pressed=true]')).toHaveLength(0)
    })

    it('sizes the paragraph of a list item, and leaves a heading in the selection at its level', () => {
      const { view, written } = mount(lines('# Title', '', '- Item'))
      select(view, 2, 12)
      fireEvent.click(button('Size'))
      fireEvent.click(button('Large'))
      expect(written()).toBe(
        lines('# Title', '', '- <BlockStyle size="lg">', '    Item', '  </BlockStyle>')
      )
    })

    it('offers no size in a heading, whose size is its level', () => {
      const { view } = mount('# Title')
      select(view, 1, 4)
      expect(screen.queryByRole('button', { name: 'Colour' })).not.toBeNull()
      expect(screen.queryByRole('button', { name: 'Size' })).toBeNull()
    })

    it('sets every paragraph and heading the selection touches to the side picked', () => {
      const { view, container, written } = mount(lines('# Title', '', 'One', '', 'Two'))
      // From inside the title to inside One.
      select(view, 2, 10)
      expect(pressed('Alignment')).toBe(false)
      fireEvent.click(button('Alignment'))
      expect(toolbar('Text alignment')).not.toBeNull()
      expect(pressed('Left')).toBe(true)
      fireEvent.click(button('Centre'))
      expect(written()).toBe(
        lines(
          '<BlockStyle align="center">',
          '  # Title',
          '</BlockStyle>',
          '',
          '<BlockStyle align="center">',
          '  One',
          '</BlockStyle>',
          '',
          'Two'
        )
      )
      expect(container.querySelector('h1')?.getAttribute('data-align')).toBe('center')
      expect(toolbar('Format selection')).not.toBeNull()
      expect(view.state.selection.empty).toBe(false)
      expect(pressed('Alignment')).toBe(true)

      fireEvent.click(button('Alignment'))
      expect(pressed('Centre')).toBe(true)
      fireEvent.click(button('Right'))
      expect(written()).toContain(lines('<BlockStyle align="right">', '  One', '</BlockStyle>'))
      expect(container.querySelector('p')?.getAttribute('data-align')).toBe('right')
      fireEvent.click(button('Alignment'))
      fireEvent.click(button('Left'))
      expect(written()).toBe(lines('# Title', '', 'One', '', 'Two'))
      expect(pressed('Alignment')).toBe(false)
    })

    // Marked words keep the toolbar where it stands; words set to a side go across the column.
    it('follows the words to the side they are set to', () => {
      const { view } = mount('Hello world')
      let at = box(100, 100, 200, 124)
      laidOutAs(
        () => [at],
        () => {
          select(view, 1, 6)
          expect(anchor()).toBe('100px 100px 100px 24px')
          fireEvent.click(button('Alignment'))
          at = box(500, 100, 600, 124)
          fireEvent.click(button('Right'))
          expect(anchor()).toBe('500px 100px 100px 24px')
        }
      )
    })

    it('takes a side back in one step', () => {
      const { view, written } = mount(lines('One', '', 'Two'))
      select(view, 2, 7)
      fireEvent.click(button('Alignment'))
      fireEvent.click(button('Right'))
      expect(written()).toContain('align="right"')
      press(view, 'z', MOD)
      expect(written()).toBe(lines('One', '', 'Two'))
    })

    it('presses no side for blocks set to more than one', () => {
      const { view } = mount(
        lines('<BlockStyle align="center">', '  One', '</BlockStyle>', '', 'Two')
      )
      select(view, 2, 7)
      expect(pressed('Alignment')).toBe(true)
      fireEvent.click(button('Alignment'))
      expect(document.querySelectorAll('[role=toolbar] button[aria-pressed=true]')).toHaveLength(0)
    })

    it('keeps a block’s size, colour and indent as it is set to a side', () => {
      const { view, written } = mount(
        lines('<BlockStyle size="lg" color="muted" indent>', '  One', '</BlockStyle>')
      )
      select(view, 1, 3)
      fireEvent.click(button('Alignment'))
      fireEvent.click(button('Centre'))
      expect(written()).toBe(
        lines(
          '<BlockStyle size="lg" color="muted" align="center" indent>',
          '  One',
          '</BlockStyle>'
        )
      )
    })

    // Words in one link have that link's actions; words in two have only links to make.
    it('offers no style over words that are all links', () => {
      const { view } = mount('[one](https://example.com/1)[two](https://example.com/2) end')
      select(view, 1, 7)
      expect(toolbar('Format selection')).not.toBeNull()
      expect(pressed('Add link')).toBe(true)
      expect(screen.queryByRole('button', { name: 'Bold' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Colour' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Size' })).toBeNull()
      expect(screen.queryByRole('button', { name: 'Alignment' })).toBeNull()
    })
  })

  describe('sidenotes', () => {
    const NOTED =
      'One <Sidenote note="First">run</Sidenote> and <Sidenote note="Second">another</Sidenote>.'
    const select = (view: EditorView, from: number, to = from): void =>
      act(() => {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to)))
      })

    it('numbers each note after its run, in the order they are met', () => {
      const { container } = mount(NOTED)
      const numbers = [...container.querySelectorAll('sup.article-sidenote-ref')].map((ref) =>
        ref.getAttribute('data-sidenote-number')
      )
      expect(numbers).toEqual(['1', '2'])
      const run = container.querySelector('[data-sidenote-id="sn-1"]')
      expect(run?.className).toBe('article-sidenote')
      expect(run?.getAttribute('style')).toContain('anchor-name: --sn-sn-1')
      expect(run?.querySelector('.article-sidenote-text')?.textContent).toBe('run')
      // After the run and outside it, so the dotted line stops where the words do.
      expect(run?.querySelector('.article-sidenote-ref')).toBeNull()
      expect(run?.nextElementSibling?.matches('sup.article-sidenote-ref')).toBe(true)
    })

    // A line or a fill on the last word would run on under the number.
    it('stands the number clear of every mark its last word wears', () => {
      const { container } = mount(
        'One <Sidenote note="First">[linked <u>~~**words**~~</u>](https://example.com/)</Sidenote>.'
      )
      const number = container.querySelector('sup.article-sidenote-ref')
      expect(number?.getAttribute('data-sidenote-number')).toBe('1')
      expect(number?.parentElement?.tagName).toBe('P')
      expect(number?.previousElementSibling?.matches('[data-sidenote-id]')).toBe(true)
    })

    it('keeps the number out of what the note is saved as', () => {
      const { view, written } = mount(NOTED)
      type(view, '!')
      expect(written()).toBe(lines('!' + NOTED))
    })

    it('shows each note on a card of its own, under its number', () => {
      mount(NOTED)
      expect(screen.getByRole('textbox', { name: 'Sidenote 1' }).textContent).toBe('First')
      expect(screen.getByRole('textbox', { name: 'Sidenote 2' }).textContent).toBe('Second')
    })

    it('shows the card of the sidenote the caret is in, and hides it as the caret leaves', () => {
      const { view } = mount(NOTED)
      const card = (): Element | null => document.querySelector('[data-sidenote-card-id="sn-1"]')
      expect(card()?.hasAttribute('data-active')).toBe(false)
      // Inside "run", the first note's words.
      select(view, 6)
      expect(card()?.hasAttribute('data-active')).toBe(true)
      select(view, 2)
      expect(card()?.hasAttribute('data-active')).toBe(false)
    })

    it('opens a new sidenote for its note to be written, and saves what is written', () => {
      const { view, written } = mount('Hello world')
      select(view, 1, 6)
      fireEvent.click(screen.getByRole('button', { name: 'Add sidenote' }))
      const card = document.querySelector('[data-sidenote-card-id="sn-1"]')
      expect(card?.hasAttribute('data-active')).toBe(true)
      const note = screen.getByRole('textbox', { name: 'Sidenote 1' })
      note.textContent = 'Beside the prose'
      fireEvent.input(note)
      expect(written()).toBe(lines('<Sidenote note="Beside the prose">Hello</Sidenote> world'))
    })

    it("opens the note of the sidenote the caret is in from the toolbar's Edit", () => {
      const { view } = mount(NOTED)
      // Inside "another", the second note's run.
      select(view, 15)
      fireEvent.click(screen.getByRole('button', { name: 'Edit sidenote' }))
      const card = document.querySelector('[data-sidenote-card-id="sn-2"]')
      expect(card?.hasAttribute('data-active')).toBe(true)
    })
  })

  describe('a block of code', () => {
    it("has today's language picker over it, set to its language", () => {
      const { container } = mount(lines('```typescript', 'const a = 1', '```'))
      const picker = screen.getByRole('combobox', { name: 'Code language' }) as HTMLSelectElement
      expect(picker.value).toBe('typescript')
      expect(container.querySelector('pre')?.textContent).toBe('const a = 1')
      expect(picker.closest('[contenteditable="false"]')).not.toBeNull()
    })

    it('saves the language picked, and none for plain text', () => {
      const { written } = mount(lines('```', 'a { b: c }', '```'))
      const picker = screen.getByRole('combobox', { name: 'Code language' })
      fireEvent.change(picker, { target: { value: 'css' } })
      expect(written()).toBe(lines('```css', 'a { b: c }', '```'))
      fireEvent.change(picker, { target: { value: '' } })
      expect(written()).toBe(lines('```', 'a { b: c }', '```'))
    })

    it('keeps the picker out of what is typed', () => {
      const { view, written } = mount(lines('```css', 'a', '```'))
      type(view, 'b')
      expect(written()).toBe(lines('```css', 'ba', '```'))
    })
  })

  describe('a picture or a clip', () => {
    it('shows a picture with its caption under it, and a clip as a clip', () => {
      const { container } = mount(
        lines(
          '![A hill](https://example.com/a.png "At dawn")',
          '',
          '![](https://example.com/b.mp4)'
        )
      )
      const [picture, clip] = [...container.querySelectorAll('figure')]
      expect(picture.querySelector('img')?.getAttribute('src')).toBe('https://example.com/a.png')
      expect(picture.querySelector('img')?.getAttribute('alt')).toBe('A hill')
      expect(within(picture).getByRole('textbox', { name: 'Caption' }).textContent).toBe('At dawn')
      expect(clip.querySelector('video')?.getAttribute('src')).toBe('https://example.com/b.mp4')
      expect(picture.getAttribute('contenteditable')).toBe('false')
    })

    it('saves the caption written under it, and none when it is cleared', () => {
      const { written } = mount(lines('![A hill](https://example.com/a.png)'))
      const caption = screen.getByRole('textbox', { name: 'Caption' })
      expect(caption.hasAttribute('data-empty')).toBe(true)
      caption.textContent = 'At dawn'
      fireEvent.input(caption)
      expect(written()).toBe(lines('![A hill](https://example.com/a.png "At dawn")'))
      caption.textContent = ''
      fireEvent.input(caption)
      expect(written()).toBe(lines('![A hill](https://example.com/a.png)'))
    })

    it('puts the picture picked from the dialog where the slash was', () => {
      const { view, written } = mount('')
      type(view, 'Above')
      press(view, 'Enter')
      type(view, '/')
      fireEvent.click(screen.getByRole('option', { name: 'Image or video' }))
      fireEvent.click(screen.getByRole('button', { name: 'Insert the picked picture' }))
      expect(screen.queryByRole('button', { name: 'Insert the picked picture' })).toBeNull()
      type(view, 'Below')
      expect(written()).toBe(
        lines('Above', '', '![Picked](https://example.com/picked.png)', '', 'Below')
      )
    })
  })

  describe('pasting', () => {
    /** Paste text as Cmd+V does: read by the editor's own parser, put where the caret is. */
    function paste(view: EditorView, text: string): void {
      act(() => {
        const slice = view.someProp('clipboardTextParser', (parse) =>
          parse(text, view.state.selection.$from, false, view)
        )
        if (slice) view.dispatch(view.state.tr.replaceSelection(slice))
      })
    }

    it('reads pasted markdown as the blocks it says', () => {
      const { view, written } = mount('')
      const pasted = lines('## Pasted', '', '- one', '- two', '', 'With **bold** words.')
      paste(view, pasted)
      expect(written()).toBe(pasted)
    })

    it('reads pasted tasks as tasks', () => {
      const { view, written } = mount('')
      const pasted = lines('- [ ] Open', '- [x] Done')
      paste(view, pasted)
      expect(written()).toBe(pasted)
    })

    it('puts a pasted line of words into the line the caret is in, its spaces kept', () => {
      const { view, written } = mount('Hello')
      act(() => {
        view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)))
      })
      paste(view, ' and *more* ')
      type(view, 'after')
      expect(written()).toBe(lines('Hello and *more* after'))
    })

    // Cmd+Shift+V: the words as they are, a paragraph a line.
    it('pastes text as it is, signs and all, when asked for it plain', () => {
      const { view, written } = mount('')
      act(() => {
        view.pasteText('## not a heading\n- not a list')
      })
      expect(written()).toBe(lines('\\## not a heading', '', '\\- not a list'))
    })

    it('pastes into a block of code as the text it is', () => {
      const { view, written } = mount(lines('```', 'a', '```'))
      act(() => {
        view.pasteText('**not bold**')
      })
      expect(written()).toBe(lines('```', '**not bold**a', '```'))
    })

    // Text read as markdown numbers its sidenotes from one, and a copy brings the
    // id it had: either way it could be an id the note already wears.
    describe('a sidenote', () => {
      const NOTED = 'One <Sidenote note="First">run</Sidenote>.'
      const COPIED =
        '<span class="article-sidenote" data-sidenote-id="sn-1" data-note="First">' +
        '<span class="article-sidenote-text">run</span></span>'

      /** Cmd+V on text, through all the editor does to what is pasted. */
      function pasteMarkdown(view: EditorView, text: string): void {
        const event = new Event('paste', { bubbles: true, cancelable: true })
        Object.defineProperty(event, 'clipboardData', {
          value: { getData: (type: string) => (type === 'text/plain' ? text : '') }
        })
        act(() => {
          view.dom.dispatchEvent(event)
        })
      }
      const caretAt = (view: EditorView, position?: number): void =>
        act(() => {
          const { doc, tr } = view.state
          const selection =
            position === undefined ? TextSelection.atEnd(doc) : TextSelection.create(doc, position)
          view.dispatch(tr.setSelection(selection))
        })
      const ids = (container: HTMLElement): (string | null)[] =>
        [...container.querySelectorAll('[data-sidenote-id]')].map((run) =>
          run.getAttribute('data-sidenote-id')
        )
      const numbers = (container: HTMLElement): (string | null)[] =>
        [...container.querySelectorAll('sup.article-sidenote-ref')].map((ref) =>
          ref.getAttribute('data-sidenote-number')
        )
      const card = (number: number): string | null =>
        screen.getByRole('textbox', { name: `Sidenote ${number}` }).textContent

      it('pasted as text stays a note of its own, beside the one the note has', () => {
        const { view, container, written } = mount(NOTED)
        caretAt(view)
        pasteMarkdown(view, ' And <Sidenote note="Second">another</Sidenote>')
        expect(ids(container)).toEqual(['sn-1', 'sn-2'])
        expect(numbers(container)).toEqual(['1', '2'])
        expect(card(1)).toBe('First')
        expect(card(2)).toBe('Second')
        expect(written()).toBe(lines(NOTED + ' And <Sidenote note="Second">another</Sidenote>'))
      })

      it('takes an id neither the note nor the rest of what is pasted holds', () => {
        const { view, container } = mount(NOTED)
        caretAt(view)
        pasteMarkdown(
          view,
          ' <Sidenote note="Second">two</Sidenote> <Sidenote note="Third">three</Sidenote>'
        )
        expect(new Set(ids(container)).size).toBe(3)
        expect(numbers(container)).toEqual(['1', '2', '3'])
        expect([card(1), card(2), card(3)]).toEqual(['First', 'Second', 'Third'])
      })

      it('copied and pasted beside itself is a second note, saying the same', () => {
        const { view, container } = mount(NOTED)
        caretAt(view)
        act(() => {
          view.pasteHTML(COPIED)
        })
        expect(ids(container)).toEqual(['sn-1', 'sn-2'])
        expect(numbers(container)).toEqual(['1', '2'])
        expect([card(1), card(2)]).toEqual(['First', 'First'])
      })

      it('keeps its id where the note holds no other with it', () => {
        const { view, container } = mount('Plain words.')
        caretAt(view)
        act(() => {
          view.pasteHTML(COPIED)
        })
        expect(ids(container)).toEqual(['sn-1'])
        expect(card(1)).toBe('First')
      })

      it('stays one note when its own words are pasted back inside it', () => {
        const { view, container, written } = mount(NOTED)
        // Between the r and the u of "run".
        caretAt(view, 6)
        act(() => {
          view.pasteHTML(COPIED)
        })
        expect(ids(container)).toEqual(['sn-1'])
        expect(numbers(container)).toEqual(['1'])
        expect(written()).toBe(lines('One <Sidenote note="First">rrunun</Sidenote>.'))
      })

      // A drag hands the editor the very words it will take away.
      it('keeps its id when it is dragged to another place in the note', () => {
        const { view } = mount(NOTED)
        const dragged = view.state.doc.slice(5, 8)
        const idOf = (slice: typeof dragged): unknown =>
          slice.content.firstChild?.marks.find((mark) => mark.type.name === 'sidenote')?.attrs.id
        const through = (move: boolean): typeof dragged => {
          view.dragging = { slice: dragged, move }
          const out = view.someProp('transformPasted', (transform) =>
            transform(dragged, view, false)
          )
          view.dragging = null
          return out ?? dragged
        }
        expect(idOf(dragged)).toBe('sn-1')
        expect(idOf(through(true))).toBe('sn-1')
        // Held to copy, it is a second note.
        expect(idOf(through(false))).toBe('sn-2')
      })
    })
  })

  describe('an address typed bare', () => {
    const typed = (words: string, mdx = ''): string => {
      const { view, written } = mount(mdx)
      type(view, words)
      cleanup()
      return written()
    }

    it('is a link to itself from the space after it', () => {
      expect(typed('See https://example.com/a now')).toBe(
        lines('See [https://example.com/a](https://example.com/a) now')
      )
    })

    it('leaves out the stop or the bracket that ends the sentence', () => {
      expect(typed('At https://example.com. Next')).toBe(
        lines('At [https://example.com](https://example.com). Next')
      )
      expect(typed('(see https://example.com) and on')).toBe(
        lines('(see [https://example.com](https://example.com)) and on')
      )
    })

    it('gives an address that opens with www its scheme', () => {
      expect(typed('www.example.com ok')).toBe(
        lines('[www.example.com](https://www.example.com) ok')
      )
    })

    it('is a link from Enter too', () => {
      const { view, written } = mount('')
      type(view, 'https://example.com')
      press(view, 'Enter')
      type(view, 'next')
      expect(written()).toBe(lines('[https://example.com](https://example.com)', '', 'next'))
    })

    it('is left as it is in code, and where it is a link already', () => {
      expect(typed('https://example.com and', lines('```', '```'))).not.toContain('](')
      const { view, written } = mount(lines('[https://a.example](https://b.example/)'))
      act(() => {
        const end = view.state.doc.content.size - 1
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, end)))
      })
      type(view, ' on')
      expect(written()).toBe(lines('[https://a.example](https://b.example/) on'))
    })

    it('is not seen in words that only hold its signs', () => {
      expect(typed('note: this and http: that ')).not.toContain('](')
    })
  })

  // Picking a kind of list for a line already in a list changes that item's
  // kind where it stands: nothing steps in that was not stepped in by hand.
  describe("a list item's kind", () => {
    /** Pick a block from the menu, asked for after some words of the note. */
    const pick = (mdx: string, words: string, label: string) => {
      const mounted = mount(mdx)
      let at = -1
      mounted.view.state.doc.descendants((node, pos) => {
        const found = node.isText ? node.text!.indexOf(words) : -1
        if (found >= 0) at = pos + found + words.length
      })
      act(() => {
        const { state } = mounted.view
        mounted.view.dispatch(state.tr.setSelection(TextSelection.create(state.doc, at)))
      })
      type(mounted.view, ' /')
      fireEvent.click(screen.getByRole('option', { name: label }))
      return mounted
    }
    const picked = (mdx: string, words: string, label: string): string => {
      const text = pick(mdx, words, label).written()
      cleanup()
      return text
    }

    it('makes a bullet of a numbered item where it stands, the count going on past it', () => {
      const numbered = lines('1. one', '2. two', '3. three')
      expect(picked(numbered, 'two', 'Bulleted list')).toBe(
        lines('1. one', '', '- two', '', '2. three')
      )
      expect(picked(numbered, 'three', 'Bulleted list')).toBe(
        lines('1. one', '2. two', '', '- three')
      )
      expect(picked(numbered, 'one', 'Bulleted list')).toBe(
        lines('- one', '', '1. two', '2. three')
      )
    })

    it('makes a numbered item of a bullet where it stands', () => {
      const dotted = lines('- one', '- two', '- three')
      expect(picked(dotted, 'two', 'Numbered list')).toBe(
        lines('- one', '', '1. two', '', '- three')
      )
      expect(picked(lines('- only'), 'only', 'Numbered list')).toBe(lines('1. only'))
    })

    it('is one list with the list of its new kind it stands beside', () => {
      expect(picked(lines('1. one', '', '- two', '', '2. three'), 'two', 'Numbered list')).toBe(
        lines('1. one', '2. two', '3. three')
      )
      expect(picked(lines('- one', '', '1. two', '', '- three'), 'two', 'Bulleted list')).toBe(
        lines('- one', '- two', '- three')
      )
      // A numbered list that starts elsewhere than the item's number stays its own.
      expect(picked(lines('- one', '', '5. two'), 'one', 'Numbered list')).toBe(
        lines('1. one', '', '5) two')
      )
    })

    it('keeps what is under the item under it, and the caret in its line', () => {
      const { view, written } = pick(
        lines('1. one', '2. second', '', '   - under it'),
        'second',
        'Bulleted list'
      )
      expect(written()).toBe(lines('1. one', '', '- second', '', '  - under it'))
      type(view, '!')
      expect(written()).toBe(lines('1. one', '', '- second!', '', '  - under it'))
    })

    it('changes an item under another where it stands', () => {
      expect(
        picked(lines('- one', '', '  1. under', '  2. beside it'), 'beside it', 'Bulleted list')
      ).toBe(lines('- one', '', '  1. under', '', '  - beside it'))
    })

    it('makes a plain bullet or number of a task', () => {
      expect(picked(lines('- [x] done', '- [ ] open'), 'done', 'Bulleted list')).toBe(
        lines('- done', '- [ ] open')
      )
      expect(picked(lines('- [ ] open'), 'open', 'Numbered list')).toBe(lines('1. open'))
    })

    it('leaves an item of the kind picked as it is', () => {
      expect(picked(lines('- one', '- two'), 'two', 'Bulleted list')).toBe(lines('- one', '- two'))
      expect(picked(lines('1. one', '2. two'), 'two', 'Numbered list')).toBe(
        lines('1. one', '2. two')
      )
    })

    it('makes a task of a numbered item where it stands too', () => {
      expect(picked(lines('1. one', '2. two'), 'two', 'Task list')).toBe(
        lines('1. one', '2. [ ] two')
      )
    })

    it('is taken back in one step', () => {
      const { view, written } = pick(lines('1. one', '2. two', '3. three'), 'two', 'Bulleted list')
      press(view, 'z', MOD)
      expect(written()).toBe(lines('1. one', '2. two', '3. three'))
    })
  })

  describe('a task', () => {
    const boxes = (container: HTMLElement): HTMLInputElement[] => [
      ...container.querySelectorAll<HTMLInputElement>('li input[type=checkbox]')
    ]
    /** Put the caret just after some words of the note, or just before them. */
    const caretAt = (view: EditorView, words: string, before = false): void => {
      let at = -1
      view.state.doc.descendants((node, pos) => {
        const found = node.isText ? node.text!.indexOf(words) : -1
        if (found >= 0) at = pos + found + (before ? 0 : words.length)
      })
      act(() => {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)))
      })
    }

    it('draws a box in place of its bullet or its number, ticked where it is done', () => {
      const { container } = mount(lines('- [ ] Open', '- [x] Done', '- Plain', '', '1. [x] One'))
      const items = [...container.querySelectorAll('li')]
      expect(items.map((item) => item.querySelector('input')?.checked ?? null)).toEqual([
        false,
        true,
        null,
        true
      ])
      // The box is the item's marker: neither a bullet nor a number stands beside it.
      expect(items[0].querySelector('.list-bullet, .list-marker')).toBeNull()
      expect(items[2].querySelector('.list-bullet')).not.toBeNull()
      expect(items[3].querySelector('.list-marker, [data-numbering-marker]')).toBeNull()
      // Never part of the note's words.
      expect(items[0].querySelector('input')!.closest('[contenteditable=false]')).not.toBeNull()
      expect(items[0].querySelector('input')!.getAttribute('aria-label')).toBe('Done')
    })

    it('ticks a task at a press on its box, and unticks it at another', () => {
      const { view, container, written } = mount(lines('- [ ] Open', '- [x] Done'))
      const before = view.state.selection.from
      fireEvent.click(boxes(container)[0])
      expect(written()).toBe(lines('- [x] Open', '- [x] Done'))
      expect(boxes(container).map((box) => box.checked)).toEqual([true, true])
      fireEvent.click(boxes(container)[1])
      expect(written()).toBe(lines('- [x] Open', '- [ ] Done'))
      fireEvent.click(boxes(container)[0])
      expect(written()).toBe(lines('- [ ] Open', '- [ ] Done'))
      // The caret is the note's still.
      expect(view.state.selection.from).toBe(before)
      press(view, 'z', MOD)
      expect(written()).toBe(lines('- [x] Open', '- [ ] Done'))
    })

    it('keeps the caret out of the box: a press on it is not the note’s', () => {
      const { container } = mount('- [ ] Open')
      const down = new MouseEvent('mousedown', { bubbles: true, cancelable: true })
      boxes(container)[0].dispatchEvent(down)
      expect(down.defaultPrevented).toBe(true)
    })

    it('makes a task of a bullet whose line opens with a box as it is typed', () => {
      const made = (typed: string): string => {
        const { view, written } = mount('')
        type(view, typed)
        cleanup()
        return written()
      }
      expect(made('- [ ] Milk')).toBe(lines('- [ ] Milk'))
      expect(made('- [x] Milk')).toBe(lines('- [x] Milk'))
      expect(made('- [] Milk')).toBe(lines('- [ ] Milk'))
      expect(made('1. [ ] Milk')).toBe(lines('1. [ ] Milk'))
      // On a line of its own the box starts the list too.
      expect(made('[ ] Milk')).toBe(lines('- [ ] Milk'))
      expect(made('[x] Milk')).toBe(lines('- [x] Milk'))
    })

    it('joins the list above when a box starts a task under it', () => {
      const { view, written } = mount(lines('- [ ] One', '', 'Two'))
      caretAt(view, 'Two', true)
      type(view, '[ ] ')
      expect(written()).toBe(lines('- [ ] One', '- [ ] Two'))
    })

    it('leaves a box typed among words, in a heading or in code as it is', () => {
      const { view, container } = mount('Words')
      caretAt(view, 'Words')
      type(view, ' [ ] more')
      expect(boxes(container)).toHaveLength(0)
      cleanup()
      const heading = mount('')
      type(heading.view, '# [ ] Title')
      expect(boxes(heading.container)).toHaveLength(0)
      expect(heading.written()).toBe(lines('# \\[ ] Title'))
    })

    it('opens another task under one at Enter, never ticked', () => {
      const { view, written } = mount('- [x] Done')
      caretAt(view, 'Done')
      press(view, 'Enter')
      type(view, 'Next')
      expect(written()).toBe(lines('- [x] Done', '- [ ] Next'))
    })

    it('parts a ticked task in two at Enter, the second one open', () => {
      const { view, written } = mount('- [x] DoneNext')
      caretAt(view, 'Done')
      press(view, 'Enter')
      expect(written()).toBe(lines('- [x] Done', '- [ ] Next'))
    })

    it('goes on under a plain bullet with a plain bullet', () => {
      const { view, written } = mount('- One')
      caretAt(view, 'One')
      press(view, 'Enter')
      type(view, 'Two')
      expect(written()).toBe(lines('- One', '- Two'))
    })

    it('leaves the list at Enter on a task that holds nothing, as any item does', () => {
      const left = (source: string): string => {
        const { view, written } = mount(source)
        caretAt(view, 'One')
        press(view, 'Enter')
        press(view, 'Enter')
        type(view, 'After')
        cleanup()
        return written()
      }
      const task = left('- [ ] One')
      expect(task.startsWith(lines('- [ ] One', '', 'After'))).toBe(true)
      expect(task).toBe(left('- One').replace('- One', '- [ ] One'))
    })

    it('ticks the task the caret is in from the keys, and unticks it', () => {
      const { view, written } = mount(lines('- [ ] Open', '- Plain'))
      caretAt(view, 'Op')
      press(view, 'Enter', MOD)
      expect(written()).toBe(lines('- [x] Open', '- Plain'))
      press(view, 'Enter', MOD)
      expect(written()).toBe(lines('- [ ] Open', '- Plain'))
      // A plain bullet is no task to tick.
      caretAt(view, 'Plain')
      press(view, 'Enter', MOD)
      expect(written()).toBe(lines('- [ ] Open', '- Plain'))
    })

    it('starts a task list from the block menu', () => {
      const { view, container, written } = mount('')
      type(view, '/task')
      fireEvent.click(screen.getByRole('option', { name: 'Task list' }))
      expect(boxes(container)).toHaveLength(1)
      type(view, 'Milk')
      expect(written()).toBe(lines('- [ ] Milk'))
    })

    it('makes a task of the bullet the block menu is asked in', () => {
      const { view, written } = mount('- Milk')
      caretAt(view, 'Milk')
      type(view, ' /task')
      fireEvent.click(screen.getByRole('option', { name: 'Task list' }))
      expect(written()).toBe(lines('- [ ] Milk'))
    })

    it('keeps its tick as it is moved out of its list at Shift+Tab', () => {
      const { view, written } = mount(lines('- One', '', '  - [x] Under'))
      caretAt(view, 'Under')
      press(view, 'Tab', { shiftKey: true })
      expect(written()).toBe(lines('- One', '- [x] Under'))
    })
  })

  describe('a block under a list', () => {
    const caretIn = (view: EditorView, words: string): void => {
      let at = 0
      view.state.doc.descendants((node, position) => {
        if (node.isText && node.text === words) at = position + 1
      })
      act(() => {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at)))
      })
    }

    it('steps in under the item before it on Tab, and back out on Shift+Tab', () => {
      const { view, written } = mount(lines('1. One', '', 'Under'))
      caretIn(view, 'Under')
      press(view, 'Tab')
      expect(written()).toBe(lines('1. One', '', '   Under'))
      type(view, '!')
      expect(written()).toBe(lines('1. One', '', '   U!nder'))
      press(view, 'Tab', { shiftKey: true })
      // Out again, the block takes the place of the line the list was given meanwhile.
      expect(written()).toBe(lines('1. One', '', 'U!nder'))
      expect(view.state.doc.childCount).toBe(2)
    })
  })

  // A block is moved by the grip that stands beside it while the pointer rests
  // on it: a block of the note itself, or an item of a list. Where the pointer
  // rests, and where a dragged block will land, are found from where the
  // pointer is, and a line shows the landing.
  describe('moving a block', () => {
    const grip = (): HTMLElement | null => document.querySelector('[data-block-grip]')
    const dropLine = (): HTMLElement | null => document.querySelector('[data-drop-line]')
    /** Rest the pointer on some words of the note. */
    const rest = (words: string): void => {
      fireEvent.mouseMove(screen.getByText(words))
    }
    /** What a drag carries: jsdom has no DataTransfer of its own. */
    const carried = () => {
      const data = new Map<string, string>()
      return {
        effectAllowed: 'uninitialized',
        dropEffect: 'none',
        setData: (type: string, value: string) => void data.set(type, value),
        getData: (type: string) => data.get(type) ?? '',
        clearData: () => data.clear(),
        setDragImage: vi.fn()
      }
    }
    /** Where the block holding the words starts: at depth 1 a block of the note, at 2 an item. */
    const blockOf = (view: EditorView, words: string, depth = 1): number => {
      let at = 0
      view.state.doc.descendants((node, position) => {
        if (node.isText && node.text === words) at = position
      })
      return view.state.doc.resolve(at).before(depth)
    }

    /**
     * jsdom lays nothing out, so the note is given the boxes a browser gives it:
     * a 28px line a block, 16px between blocks and 8px between a list's items,
     * every block from 200 to 840 across, an item's own lines 32px in from its
     * marker, and the ground the note stands on from 100.
     */
    function layOut(view: EditorView): void {
      const box = (element: Element, left: number, top: number, bottom: number): void => {
        const rect = { left, top, right: 840, bottom, x: left, y: top }
        const size = { width: 840 - left, height: bottom - top }
        element.getBoundingClientRect = () => ({ ...rect, ...size, toJSON: () => rect })
      }
      const list = (element: Element, left: number, top: number): number => {
        let y = top
        for (const item of element.children) {
          const own = item.lastElementChild!
          let inner = y
          for (const child of own.children) {
            if (child.matches('ul, ol')) inner = list(child, left + 32, inner)
            else {
              box(child, left + 32, inner, inner + 28)
              inner += 28
            }
            inner += 8
          }
          box(own, left + 32, y, inner - 8)
          box(item, left, y, inner - 8)
          y = inner
        }
        box(element, left, top, y - 8)
        return y - 8
      }
      let y = 0
      for (const block of view.dom.children) {
        let bottom = y + 28
        if (block.matches('ul, ol')) bottom = list(block, 200, y)
        else for (const part of [block, ...block.querySelectorAll('*')]) box(part, 200, y, bottom)
        y = bottom + 16
      }
      box(view.dom, 100, 0, y - 16)
    }

    /** A drag's event at a place on the page: jsdom has no DragEvent to say where one is. */
    function dragEvent(
      type: string,
      target: Element,
      at: { x?: number; y?: number } = {},
      dataTransfer = carried(),
      keys: MouseEventInit = {}
    ): MouseEvent {
      const event = new MouseEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: at.x ?? 150,
        clientY: at.y ?? 0,
        ...keys
      })
      Object.defineProperty(event, 'dataTransfer', { value: dataTransfer })
      act(() => {
        target.dispatchEvent(event)
      })
      return event
    }
    /** The height of the top or the bottom half of the line some words stand on. */
    function heightOf(view: EditorView, words: string, half: 'top' | 'bottom'): number {
      layOut(view)
      const { top, bottom } = screen.getByText(words).getBoundingClientRect()
      return half === 'top' ? top + 2 : bottom - 2
    }
    /** Take up the block the grip stands beside, and hold it at a height in the note. */
    function dragOver(view: EditorView, y: number): MouseEvent {
      layOut(view)
      fireEvent.dragStart(grip()!, { dataTransfer: carried() })
      return dragEvent('dragover', view.dom, { y })
    }
    /** Drag the block the grip stands beside to a height in the note, and let go. */
    function dragTo(view: EditorView, y: number): void {
      dragOver(view, y)
      dragEvent('drop', view.dom, { y })
    }
    /** Drag it onto the top or the bottom half of the line some words stand on. */
    function dragOnto(view: EditorView, words: string, half: 'top' | 'bottom'): void {
      dragTo(view, heightOf(view, words, half))
    }
    /** The words of the block the grip stands beside, as a drag of it carries them. */
    function gripped(): string {
      const dataTransfer = carried()
      fireEvent.dragStart(grip()!, { dataTransfer })
      fireEvent.dragEnd(grip()!)
      return dataTransfer.getData('text/plain')
    }

    it('stands a grip beside the block the pointer rests on, and none before that', () => {
      mount(lines('One', '', 'Two'))
      expect(grip()).toBeNull()
      rest('Two')
      expect(grip()).not.toBeNull()
    })

    it('takes the grip away as the pointer goes to something else, and as the note is typed in', () => {
      const { view } = mount(lines('One', '', 'Two'))
      const elsewhere = document.body.appendChild(document.createElement('aside'))
      rest('One')
      fireEvent.mouseMove(elsewhere)
      expect(grip()).toBeNull()
      rest('One')
      expect(grip()).not.toBeNull()
      type(view, 'x')
      expect(grip()).toBeNull()
      elsewhere.remove()
    })

    it('takes the grip away as the pointer leaves the window', () => {
      mount(lines('One', '', 'Two'))
      rest('One')
      fireEvent.mouseOut(document.documentElement, { relatedTarget: null })
      expect(grip()).toBeNull()
    })

    it('keeps the grip while the pointer is on it', () => {
      mount(lines('One', '', 'Two'))
      rest('One')
      fireEvent.mouseMove(grip()!)
      expect(grip()).not.toBeNull()
    })

    // The grip stands clear of its block, and a note can be no wider than its
    // blocks: the way from the block to the grip is over whatever the note stands on.
    it('keeps the grip as the pointer crosses the ground between the block and it', () => {
      const { view, container } = mount(lines('One', '', 'Two'))
      layOut(view)
      rest('Two')
      // Two stands from 200 across and from 44 to 72 down, its grip from 168 to 196.
      fireEvent.mouseMove(container, { clientX: 198, clientY: 50 })
      expect(gripped()).toBe('Two')
      // A little past the grip too, where a pointer that overshoots it comes to rest.
      fireEvent.mouseMove(container, { clientX: 162, clientY: 50 })
      expect(gripped()).toBe('Two')
      // Past the grip's own reach the pointer rests on no block.
      fireEvent.mouseMove(container, { clientX: 156, clientY: 50 })
      expect(grip()).toBeNull()
    })

    it('finds the block level with a pointer that rests beside the blocks', () => {
      const { view, container } = mount(lines('One', '', 'Two'))
      layOut(view)
      fireEvent.mouseMove(view.dom, { clientX: 190, clientY: 50 })
      expect(gripped()).toBe('Two')
      fireEvent.mouseMove(container, { clientX: 190, clientY: 10 })
      expect(gripped()).toBe('One')
      // Between two blocks it is level with neither, and the grip stays where it was.
      fireEvent.mouseMove(view.dom, { clientX: 190, clientY: 36 })
      expect(gripped()).toBe('One')
      // Under the note it rests on nothing.
      fireEvent.mouseMove(container, { clientX: 190, clientY: 400 })
      expect(grip()).toBeNull()
    })

    it('keeps to the item level with the pointer, whatever of its list is under it', () => {
      const { view } = mount(lines('- One', '', '  - Under a', '  - Under b', '- Two'))
      const one = screen.getByText('One').closest('li')!
      // On One's own column, but level with the item under it.
      fireEvent.mouseMove(one, { clientX: 210, clientY: heightOf(view, 'Under a', 'top') })
      expect(gripped()).toBe('Under a')
      // Between that item and the next the grip stays where it was.
      const under = screen.getByText('Under a').closest('ul')!
      fireEvent.mouseMove(under, { clientX: 300, clientY: heightOf(view, 'Under a', 'bottom') + 6 })
      expect(gripped()).toBe('Under a')
      fireEvent.mouseMove(one, { clientX: 210, clientY: heightOf(view, 'Under b', 'top') })
      expect(gripped()).toBe('Under b')
    })

    // The reach is the note's, not the item's: no row is out of it for being stepped in.
    it('reaches an item under another from as far beside the note as any block', () => {
      const { view } = mount(lines('- One', '', '  - Under a', '- Two'))
      const y = heightOf(view, 'Under a', 'top')
      // The list starts at 200 across, and the item under One at 232.
      fireEvent.mouseMove(view.dom, { clientX: 162, clientY: y })
      expect(gripped()).toBe('Under a')
      fireEvent.mouseMove(view.dom, { clientX: 156, clientY: y })
      expect(grip()).toBeNull()
    })

    // A block let go changes the note's height, and the note says so a frame later: after
    // the pointer has moved on to a block and been given its grip.
    it('keeps the grip by what the pointer is on when the note is laid out anew', () => {
      const watched: { target: Element; laidOut: () => void }[] = []
      const Observer = globalThis.ResizeObserver
      globalThis.ResizeObserver = class {
        private laidOut: () => void
        constructor(callback: ResizeObserverCallback) {
          this.laidOut = () => callback([], this)
        }
        observe(target: Element): void {
          watched.push({ target, laidOut: this.laidOut })
        }
        unobserve(): void {}
        disconnect(): void {}
      }
      // jsdom lays nothing out, so it has no way to say what is at a point.
      const under = vi.fn<(x: number, y: number) => Element | null>()
      document.elementFromPoint = under
      const elsewhere = document.body.appendChild(document.createElement('aside'))
      try {
        const { view } = mount(lines('One', '', 'Two'))
        const laidOutAnew = (): void =>
          act(() =>
            watched.filter(({ target }) => target === view.dom).forEach((each) => each.laidOut())
          )
        layOut(view)
        const [one, two] = [screen.getByText('One'), screen.getByText('Two')]
        fireEvent.mouseMove(one, { clientX: 300, clientY: 10 })

        // Still on the block it was on: the grip stays.
        under.mockReturnValue(one)
        laidOutAnew()
        expect(under).toHaveBeenLastCalledWith(300, 10)
        expect(gripped()).toBe('One')

        // Another block has come under it: the grip is that block's.
        under.mockReturnValue(two)
        laidOutAnew()
        expect(gripped()).toBe('Two')

        // The block has moved with the pointer still on it: the grip goes with it.
        expect(grip()!.style.top).toBe('44px')
        const box = { left: 200, top: 100, right: 840, bottom: 128, width: 640, height: 28 }
        two.getBoundingClientRect = () => ({ ...box, x: 200, y: 100, toJSON: () => box })
        laidOutAnew()
        expect(grip()!.style.top).toBe('100px')

        // Nothing of the note is under it any more.
        under.mockReturnValue(elsewhere)
        laidOutAnew()
        expect(grip()).toBeNull()

        // A grip taken away by what was typed stays away, however the typing laid the note out.
        fireEvent.mouseMove(one, { clientX: 300, clientY: 10 })
        type(view, 'x')
        under.mockReturnValue(one)
        laidOutAnew()
        expect(grip()).toBeNull()
      } finally {
        globalThis.ResizeObserver = Observer
        Reflect.deleteProperty(document, 'elementFromPoint')
        elsewhere.remove()
      }
    })

    it('stands none beside a line that holds nothing', () => {
      const { view } = mount(lines('One', '', '- Item'))
      rest('One')
      // The line the note was given to go on from, after the list.
      fireEvent.mouseMove(view.dom.lastElementChild!)
      expect(grip()).toBeNull()
    })

    it('stands the grip against the first line of its block, measured from the article', () => {
      const { container } = mount(lines('One', '', 'Two'))
      const two = screen.getByText('Two')
      const box = { left: 200, top: 100, right: 840, bottom: 128, width: 640, height: 28 }
      two.getBoundingClientRect = () => ({ ...box, x: 200, y: 100, toJSON: () => box })
      rest('Two')
      // 28px wide and 4px clear of the block; with no line height to read, level with its top.
      expect(grip()!.style.left).toBe('168px')
      expect(grip()!.style.top).toBe('100px')
      expect(container.contains(grip())).toBe(true)
    })

    it('carries the block as the drag, pictured where it stands', () => {
      const { view } = mount(lines('One', '', 'Two'))
      layOut(view)
      rest('Two')
      const dataTransfer = carried()
      // Taken up by the grip, 10px left of the block and 6px down it.
      dragEvent('dragstart', grip()!, { x: 190, y: 50 }, dataTransfer)
      expect(dataTransfer.getData('text/plain')).toBe('Two')
      expect(dataTransfer.effectAllowed).toBe('move')
      expect(dataTransfer.setDragImage).toHaveBeenCalledWith(screen.getByText('Two'), -10, 6)
      fireEvent.dragEnd(grip()!)
    })

    it('moves the block to where it is let go, as one step to take back', () => {
      const { view, written } = mount(lines('One', '', 'Two', '', 'Three'))
      rest('Three')
      dragOnto(view, 'One', 'top')
      expect(written()).toBe(lines('Three', '', 'One', '', 'Two'))
      expect(grip()).toBeNull()
      expect(dropLine()).toBeNull()
      press(view, 'z', MOD)
      expect(written()).toBe(lines('One', '', 'Two', '', 'Three'))
    })

    it('lands the block above or below the one it is let go on, by the half the pointer is in', () => {
      const { view, written } = mount(lines('One', '', 'Two', '', 'Three'))
      rest('One')
      dragOnto(view, 'Three', 'top')
      expect(written()).toBe(lines('Two', '', 'One', '', 'Three'))
      rest('Two')
      dragOnto(view, 'Three', 'bottom')
      expect(written()).toBe(lines('One', '', 'Three', '', 'Two'))
    })

    it('lands it on the nearer side of a gap, and first or last from beyond the note', () => {
      const { view, written } = mount(lines('One', '', 'Two', '', 'Three'))
      rest('Three')
      // One ends at 28 and Two starts at 44.
      dragTo(view, 30)
      expect(written()).toBe(lines('One', '', 'Three', '', 'Two'))
      rest('One')
      dragTo(view, 5000)
      expect(written()).toBe(lines('Three', '', 'Two', '', 'One'))
      rest('One')
      dragTo(view, -500)
      expect(written()).toBe(lines('One', '', 'Three', '', 'Two'))
    })

    it('shows the line the block will land on, and takes it away when the drag ends', () => {
      const { view, onChange } = mount(lines('One', '', 'Two', '', 'Three'))
      rest('Three')
      const over = dragOver(view, heightOf(view, 'One', 'bottom'))
      // Half way between One, which ends at 28, and Two, which starts at 44; as wide as they are.
      expect(dropLine()!.style.top).toBe('35px')
      expect(dropLine()!.style.left).toBe('100px')
      expect(dropLine()!.style.width).toBe('640px')
      expect(over.defaultPrevented).toBe(true)
      fireEvent.dragEnd(grip()!)
      expect(dropLine()).toBeNull()
      expect(onChange).not.toHaveBeenCalled()
    })

    it('steps the line in to where an item will land under another', () => {
      const { view } = mount(lines('- One', '', '  - Under one', '- Two'))
      rest('Two')
      dragOver(view, heightOf(view, 'One', 'bottom'))
      // Under One's own line, which ends at 28, and 4px over the item under it, at 36.
      expect(dropLine()!.style.top).toBe('31px')
      expect(dropLine()!.style.left).toBe('132px')
      fireEvent.dragEnd(grip()!)
    })

    it('shows no line and changes nothing where the block already stands', () => {
      const { view, onChange } = mount(lines('One', '', 'Two', '', 'Three'))
      rest('Two')
      const places = [
        ['One', 'bottom'],
        ['Two', 'top'],
        ['Two', 'bottom'],
        ['Three', 'top']
      ] as const
      for (const [words, half] of places) {
        const y = heightOf(view, words, half)
        expect(dragOver(view, y).defaultPrevented).toBe(true)
        expect(dropLine()).toBeNull()
        dragEvent('drop', view.dom, { y })
      }
      expect(onChange).not.toHaveBeenCalled()
      expect(grip()).not.toBeNull()
    })

    it('leaves the caret where it was, and takes it along with the block it is in', () => {
      const { view } = mount(lines('One', '', 'Two', '', 'Three'))
      act(() => {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)))
      })
      rest('Three')
      dragOnto(view, 'One', 'top')
      // The caret was after the O of One, which now stands second.
      expect(view.state.selection.empty).toBe(true)
      expect(view.state.selection.from).toBe(blockOf(view, 'One') + 2)
      rest('One')
      dragOnto(view, 'Two', 'bottom')
      expect(view.state.selection.empty).toBe(true)
      expect(view.state.selection.from).toBe(blockOf(view, 'One') + 2)
    })

    it('hands the note the keys with a block it moved, for the move to be taken back', () => {
      const { view } = mount(lines('One', '', 'Two', '', 'Three'))
      rest('Three')
      expect(document.activeElement).not.toBe(view.dom)
      dragOnto(view, 'One', 'top')
      expect(document.activeElement).toBe(view.dom)
    })

    it('gives the note back the keys a press on the grip took, when nothing is moved', () => {
      const { view, onChange } = mount(lines('One', '', 'Two'))
      /** A press on the grip takes the keys from the note, as a browser's does. */
      const pressGrip = (): void => {
        fireEvent.mouseDown(grip()!)
        act(() => view.dom.blur())
      }
      rest('Two')
      // A note that had no keys is given none.
      pressGrip()
      fireEvent.click(grip()!)
      expect(document.activeElement).not.toBe(view.dom)

      act(() => view.focus())
      pressGrip()
      fireEvent.click(grip()!)
      expect(document.activeElement).toBe(view.dom)

      // Let go where it stands, and the drag ends on the grip.
      pressGrip()
      dragOnto(view, 'Two', 'top')
      expect(document.activeElement).not.toBe(view.dom)
      fireEvent.dragEnd(grip()!)
      expect(document.activeElement).toBe(view.dom)
      expect(onChange).not.toHaveBeenCalled()
    })

    // The toolbar is the selected words': a block's grip is no way out of them.
    it('keeps the toolbar over selected words through a press on the grip, aside while a block is carried', () => {
      const { view } = mount(lines('One', '', 'Two', '', 'Three'))
      const toolbar = (): HTMLElement | null =>
        screen.queryByRole('toolbar', { name: 'Format selection' })
      act(() => {
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 4)))
      })
      expect(toolbar()).not.toBeNull()
      rest('Three')
      fireEvent.pointerDown(grip()!)
      fireEvent.mouseDown(grip()!)
      fireEvent.click(grip()!)
      expect(toolbar()).not.toBeNull()

      // Carried, the block may be bound for the line the toolbar stands over.
      const y = heightOf(view, 'Two', 'top')
      fireEvent.pointerDown(grip()!)
      dragOver(view, y)
      expect(toolbar()).toBeNull()
      fireEvent.dragEnd(grip()!)
      expect(toolbar()).not.toBeNull()

      // Let go where it leaves the words as they were, the toolbar is back all the same.
      fireEvent.pointerDown(grip()!)
      dragOver(view, y)
      expect(toolbar()).toBeNull()
      dragEvent('drop', view.dom, { y })
      expect(view.state.doc.child(1).textContent).toBe('Three')
      expect(toolbar()).not.toBeNull()
    })

    it('moves the block even with the key held that would copy it', () => {
      const { view, written } = mount(lines('One', '', 'Two'))
      rest('Two')
      const y = heightOf(view, 'One', 'top')
      dragOver(view, y)
      dragEvent('drop', view.dom, { y }, carried(), { altKey: true, ctrlKey: true })
      expect(written()).toBe(lines('Two', '', 'One'))
    })

    it('lets go of the drag when it ends with no drop', () => {
      const { view, onChange } = mount(lines('One', '', 'Two'))
      rest('Two')
      const y = heightOf(view, 'One', 'top')
      dragOver(view, y)
      fireEvent.dragEnd(grip()!)
      expect(dragEvent('drop', document.body, { y }).defaultPrevented).toBe(false)
      expect(onChange).not.toHaveBeenCalled()
    })

    it('takes no drop beyond the reach of the note', () => {
      const { view, onChange } = mount(lines('One', '', 'Two'))
      rest('Two')
      layOut(view)
      fireEvent.dragStart(grip()!, { dataTransfer: carried() })
      // The note's ground starts at 100, and the grip reaches 40px past it.
      expect(dragEvent('dragover', document.body, { x: 40, y: 10 }).defaultPrevented).toBe(false)
      expect(dropLine()).toBeNull()
      // Whatever it is let go on there takes nothing of it either.
      expect(dragEvent('drop', document.body, { x: 40, y: 10 }).defaultPrevented).toBe(true)
      expect(onChange).not.toHaveBeenCalled()
    })

    // Past the edge of what the note scrolls in its blocks are out of sight, and so would
    // the line be: a block let go there would land where nothing showed it would.
    it('takes no drop above or below where the note is seen to scroll', () => {
      const { view, container, onChange } = mount(lines('One', '', 'Two', '', 'Three', '', 'Four'))
      container.style.overflowY = 'auto'
      const seen = { left: 0, top: 40, right: 900, bottom: 120, width: 900, height: 80 }
      container.getBoundingClientRect = () => ({ ...seen, x: 0, y: 40, toJSON: () => seen })
      rest('Two')
      layOut(view)
      fireEvent.dragStart(grip()!, { dataTransfer: carried() })
      // One stands from 0 to 28 and Four from 132 to 160, both out of sight.
      for (const y of [10, 150]) {
        expect(dragEvent('dragover', document.body, { y }).defaultPrevented).toBe(false)
        expect(dropLine()).toBeNull()
      }
      // Three, from 88 to 116, is in sight.
      expect(dragEvent('dragover', view.dom, { y: 110 }).defaultPrevented).toBe(true)
      expect(dropLine()).not.toBeNull()
      dragEvent('drop', document.body, { y: 10 })
      expect(dropLine()).toBeNull()
      expect(onChange).not.toHaveBeenCalled()
    })

    it('moves a quote whole, from any line of it', () => {
      const { view, written } = mount(lines('> One', '>', '> Two', '', 'After'))
      rest('Two')
      dragOnto(view, 'After', 'bottom')
      expect(written()).toBe(lines('After', '', '> One', '>', '> Two'))
    })

    it('moves a rule and a picture, which hold no words to rest on', () => {
      const { view, container } = mount(
        lines('One', '', '---', '', '![Alt](https://example.com/a.png)', '', 'Two')
      )
      fireEvent.mouseMove(container.querySelector('hr')!)
      dragOnto(view, 'One', 'top')
      expect(String(view.state.doc)).toBe(
        'doc(horizontal_rule, paragraph("One"), media, paragraph("Two"))'
      )
      fireEvent.mouseMove(container.querySelector('figure')!)
      dragOnto(view, 'Two', 'bottom')
      expect(String(view.state.doc)).toBe(
        'doc(horizontal_rule, paragraph("One"), paragraph("Two"), media, paragraph)'
      )
    })

    it('moves an item within its list, and what stands under it with it', () => {
      const { view } = mount(lines('- One', '- Two', '', '  - Under two', '- Three'))
      rest('Two')
      dragOnto(view, 'One', 'top')
      expect(String(view.state.doc)).toBe(
        'doc(bullet_list(' +
          'list_item(paragraph("Two"), bullet_list(list_item(paragraph("Under two")))), ' +
          'list_item(paragraph("One")), ' +
          'list_item(paragraph("Three"))), paragraph)'
      )
    })

    it('moves the innermost item the pointer rests on', () => {
      const { view } = mount(lines('- One', '- Two', '', '  - Under two', '- Three'))
      rest('Under two')
      dragOnto(view, 'One', 'top')
      // With its one item gone, the list under Two goes too.
      expect(String(view.state.doc)).toBe(
        'doc(bullet_list(' +
          'list_item(paragraph("Under two")), ' +
          'list_item(paragraph("One")), ' +
          'list_item(paragraph("Two")), ' +
          'list_item(paragraph("Three"))), paragraph)'
      )
    })

    // An item is taken up by a grip in the margin, so it is let go there too:
    // beside its list, just over it or just under it.
    it('changes nothing when an item is let go where it stands, at any edge of its list', () => {
      const { view, onChange } = mount(lines('Before', '', '1. One', '2. Two', '', 'After'))
      const letGoAt = (heights: number[]): void => {
        for (const y of heights) {
          dragOver(view, y)
          expect(dropLine()).toBeNull()
          dragEvent('drop', view.dom, { y })
        }
      }
      rest('One')
      // Before ends at 28 and the list starts at 44.
      letGoAt([30, 40, heightOf(view, 'One', 'top'), heightOf(view, 'One', 'bottom')])
      letGoAt([heightOf(view, 'Two', 'top')])
      rest('Two')
      // The list ends at 108 and After starts at 124.
      letGoAt([heightOf(view, 'One', 'bottom'), heightOf(view, 'Two', 'bottom'), 110, 122])
      letGoAt([heightOf(view, 'After', 'top')])
      expect(onChange).not.toHaveBeenCalled()
      expect(String(view.state.doc)).toBe(
        'doc(paragraph("Before"), ' +
          'ordered_list(list_item(paragraph("One")), list_item(paragraph("Two"))), ' +
          'paragraph("After"))'
      )
    })

    it('keeps an item in its list when it is let go at the edge of the list', () => {
      const { view, written } = mount(lines('Before', '', '1. One', '2. Two', '', 'After'))
      rest('Two')
      dragTo(view, 30)
      expect(written()).toBe(lines('Before', '', '1. Two', '2. One', '', 'After'))
      rest('Two')
      dragOnto(view, 'After', 'top')
      expect(written()).toBe(lines('Before', '', '1. One', '2. Two', '', 'After'))
    })

    it('moves an item away from every list, to stand as a list of its own kind', () => {
      const { view, written } = mount(lines('Before', '', 'Between', '', '1. One', '2. Two'))
      rest('Two')
      dragOnto(view, 'Before', 'top')
      expect(String(view.state.doc)).toBe(
        'doc(ordered_list(list_item(paragraph("Two"))), paragraph("Before"), ' +
          'paragraph("Between"), ordered_list(list_item(paragraph("One"))), paragraph)'
      )
      expect(written()).toBe(lines('1. Two', '', 'Before', '', 'Between', '', '1. One'))
    })

    it('moves an item into another list, to be numbered or dotted as that list is', () => {
      const { view, written } = mount(lines('- Dot', '', '1. One', '2. Two'))
      rest('Dot')
      dragOnto(view, 'Two', 'top')
      // The list it was the only item of goes with it.
      expect(written()).toBe(lines('1. One', '2. Dot', '3. Two'))
    })

    it('parts a list round a block let go among its items, the count going on past it', () => {
      const { view, written } = mount(lines('Words', '', '1. One', '2. Two', '3. Three'))
      rest('Words')
      dragOnto(view, 'One', 'bottom')
      expect(String(view.state.doc)).toBe(
        'doc(ordered_list(list_item(paragraph("One"))), paragraph("Words"), ' +
          'ordered_list(list_item(paragraph("Two")), list_item(paragraph("Three"))), paragraph)'
      )
      expect(written()).toBe(lines('1. One', '', 'Words', '', '2. Two', '3. Three'))
    })

    it('makes a list whole again when the block between its parts is moved away', () => {
      const numbered = mount(lines('1. One', '', 'Words', '', '2. Two', '3. Three'))
      rest('Words')
      dragOnto(numbered.view, 'One', 'top')
      expect(String(numbered.view.state.doc)).toBe(
        'doc(paragraph("Words"), ordered_list(list_item(paragraph("One")), ' +
          'list_item(paragraph("Two")), list_item(paragraph("Three"))), paragraph)'
      )
      cleanup()
      const dotted = mount(lines('- One', '', 'Words', '', '- Two'))
      rest('Words')
      dragOnto(dotted.view, 'One', 'top')
      expect(String(dotted.view.state.doc)).toBe(
        'doc(paragraph("Words"), ' +
          'bullet_list(list_item(paragraph("One")), list_item(paragraph("Two"))), paragraph)'
      )
    })

    it('leaves two lists apart that count apart', () => {
      const { view } = mount(lines('1. One', '', 'Words', '', '1. Two'))
      rest('Words')
      dragOnto(view, 'One', 'top')
      expect(String(view.state.doc)).toBe(
        'doc(paragraph("Words"), ordered_list(list_item(paragraph("One"))), ' +
          'ordered_list(list_item(paragraph("Two"))), paragraph)'
      )
    })

    it('stands a block outside a list when it is let go at the edge of the list', () => {
      const { view, written } = mount(lines('Words', '', 'More', '', '- One', '- Two'))
      rest('Words')
      dragOnto(view, 'Two', 'bottom')
      // The line the note was given after its list goes, now that it ends on words.
      expect(written()).toBe(lines('More', '', '- One', '- Two', '', 'Words'))
      expect(String(view.state.doc)).toBe(
        'doc(paragraph("More"), ' +
          'bullet_list(list_item(paragraph("One")), list_item(paragraph("Two"))), ' +
          'paragraph("Words"))'
      )
      rest('Words')
      dragOnto(view, 'One', 'top')
      expect(written()).toBe(lines('More', '', 'Words', '', '- One', '- Two'))
    })

    it('stands what is let go under an item’s own line first among what is under it', () => {
      const { view } = mount(lines('- One', '', '  - Under one', '- Two', '', 'Words'))
      rest('Two')
      dragOnto(view, 'One', 'bottom')
      expect(String(view.state.doc)).toBe(
        'doc(bullet_list(list_item(paragraph("One"), bullet_list(' +
          'list_item(paragraph("Two")), list_item(paragraph("Under one"))))), ' +
          'paragraph("Words"))'
      )
      rest('Words')
      dragOnto(view, 'One', 'bottom')
      expect(String(view.state.doc)).toBe(
        'doc(bullet_list(list_item(paragraph("One"), paragraph("Words"), bullet_list(' +
          'list_item(paragraph("Two")), list_item(paragraph("Under one"))))), paragraph)'
      )
    })

    it('lands a block let go under the whole note before the line the note was given', () => {
      const { view, container } = mount(lines('```', 'code', '```', '', '- Item'))
      fireEvent.mouseMove(container.querySelector('pre')!)
      dragTo(view, 5000)
      expect(String(view.state.doc)).toBe(
        'doc(bullet_list(list_item(paragraph("Item"))), code_block("code"), paragraph)'
      )
    })

    // What is dragged without the grip, a picture or selected words, lands by
    // ProseMirror's own line.
    it('draws ProseMirror’s drop line in the app’s own ink', () => {
      const { view } = mount(lines('One', '', 'Two'))
      // jsdom lays nothing out, so the note's element has no offset parent to draw in.
      Object.defineProperty(view.dom, 'offsetParent', { get: () => document.body })
      view.posAtCoords = () => ({ pos: 0, inside: -1 })
      fireEvent.dragOver(view.dom)
      const line = document.querySelector<HTMLElement>('.prosemirror-dropcursor-block')!
      expect(line.classList).toContain('bg-border-drop-line')
      expect(line.style.backgroundColor).toBe('')
      fireEvent.dragEnd(view.dom)
    })

    it('keeps ProseMirror’s drop line out of a drag by the grip, which draws its own', () => {
      const { view } = mount(lines('One', '', 'Two'))
      Object.defineProperty(view.dom, 'offsetParent', { get: () => document.body })
      view.posAtCoords = () => ({ pos: 0, inside: -1 })
      rest('Two')
      dragOver(view, heightOf(view, 'One', 'top'))
      expect(dropLine()).not.toBeNull()
      expect(document.querySelector('.prosemirror-dropcursor-block')).toBeNull()
      fireEvent.dragEnd(grip()!)
    })
  })
})
