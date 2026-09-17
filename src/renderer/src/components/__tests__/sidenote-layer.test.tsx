import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SidenoteLayer } from '../sidenote-layer'
import type { SidenoteEntry } from '@/utils/sidenotes'

function entry(overrides: Partial<SidenoteEntry> = {}): SidenoteEntry {
  return {
    id: 'n1',
    blockIndex: 0,
    number: 1,
    text: 'the note',
    anchorName: '--sn-n1',
    ...overrides
  }
}

const card = (id = 'n1') =>
  document.querySelector<HTMLElement>(`[data-sidenote-card][data-sidenote-card-id="${id}"]`)!

// requestAnimationFrame runs the autofocus retry — flush it synchronously.
function flushFrames() {
  act(() => {
    vi.runOnlyPendingTimers()
  })
}

// Placement reads the viewport width; a test that narrows it must not leak.
const innerWidth = window.innerWidth
afterEach(() => {
  vi.useRealTimers()
  Object.defineProperty(window, 'innerWidth', { value: innerWidth, configurable: true })
})

describe('SidenoteLayer — cards', () => {
  it('renders the rail and one card per entry, vertically anchored to its annotation', () => {
    render(
      <SidenoteLayer entries={[entry(), entry({ id: 'n2', number: 2, anchorName: '--sn-n2' })]} />
    )
    expect(document.querySelector('[data-sidenote-rail]')).not.toBeNull()
    expect(document.querySelectorAll('[data-sidenote-card]')).toHaveLength(2)
    // The vertical axis is CSS-anchored; the annotation's anchor-name is the
    // card's default anchor. (jsdom keeps the unknown property as a plain
    // field, which is enough to see the wiring.)
    const style = card('n2').style as CSSStyleDeclaration & { positionAnchor?: string }
    expect(style.positionAnchor).toBe('--sn-n2')
    expect(card('n2').textContent).toContain('2.')
  })

  it('reveals only the active card in caret mode', () => {
    const { rerender } = render(
      <SidenoteLayer
        entries={[entry(), entry({ id: 'n2', number: 2, anchorName: '--sn-n2' })]}
        trigger="caret"
        activeId={null}
      />
    )
    expect(card('n1').hasAttribute('data-active')).toBe(false)
    rerender(
      <SidenoteLayer
        entries={[entry(), entry({ id: 'n2', number: 2, anchorName: '--sn-n2' })]}
        trigger="caret"
        activeId="n2"
      />
    )
    expect(card('n1').hasAttribute('data-active')).toBe(false)
    expect(card('n2').hasAttribute('data-active')).toBe(true)
  })

  it('places the active card 100px right of the rail when the viewport has room', () => {
    // Mount inactive, measure nothing; the layout effect measures the rail
    // when a card becomes visible.
    const { rerender } = render(
      <SidenoteLayer entries={[entry()]} trigger="caret" activeId={null} />
    )
    const rail = document.querySelector<HTMLElement>('[data-sidenote-rail]')!
    vi.spyOn(rail, 'getBoundingClientRect').mockReturnValue({
      left: 200,
      right: 840,
      width: 640,
      top: 0,
      bottom: 0,
      height: 0,
      x: 200,
      y: 0,
      toJSON: () => ({})
    })
    Object.defineProperty(window, 'innerWidth', { value: 1400, configurable: true })
    rerender(<SidenoteLayer entries={[entry()]} trigger="caret" activeId="n1" />)
    expect(card().getAttribute('data-placement')).toBe('side')
    expect(card().style.left).toBe('940px')
    expect(card().style.width).toBe('320px')
  })

  it('stacks the card centred on the column when there is no room beside it', () => {
    // Narrower than rail.right + 100 + 320 + 16 — jsdom's rail is a zero rect.
    Object.defineProperty(window, 'innerWidth', { value: 400, configurable: true })
    render(<SidenoteLayer entries={[entry()]} trigger="caret" activeId="n1" />)
    expect(card().getAttribute('data-placement')).toBe('stacked')
    // Centred on x=0 at the minimum width.
    expect(card().style.left).toBe('0px')
    expect(card().style.width).toBe('320px')
  })

  it('reveals on hover and pins on click in pointer mode', () => {
    const annotation = document.createElement('span')
    annotation.setAttribute('data-sidenote-id', 'n1')
    document.body.appendChild(annotation)
    try {
      render(<SidenoteLayer entries={[entry()]} trigger="pointer" />)
      expect(card().hasAttribute('data-active')).toBe(false)
      fireEvent.pointerOver(annotation)
      expect(card().hasAttribute('data-active')).toBe(true)
      fireEvent.pointerOut(annotation)
      expect(card().hasAttribute('data-active')).toBe(false)
      fireEvent.pointerDown(annotation)
      expect(card().hasAttribute('data-active')).toBe(true)
      fireEvent.pointerDown(document.body)
      expect(card().hasAttribute('data-active')).toBe(false)
    } finally {
      annotation.remove()
    }
  })
})

describe('SidenoteLayer — editor card', () => {
  it("renders the 'Esc to exit' hint only in editable mode", () => {
    const { rerender } = render(<SidenoteLayer entries={[entry()]} trigger="caret" editable />)
    expect(screen.getByText('Esc')).toBeDefined()
    expect(screen.getByText('to exit')).toBeDefined()

    rerender(<SidenoteLayer entries={[entry()]} trigger="pointer" />)
    expect(screen.queryByText('Esc')).toBeNull()
  })

  it('autofocuses the note body when its id becomes the autoFocusId', () => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame'] })
    const onAutoFocused = vi.fn()
    // Start inactive (no autoFocusId), then flip it on — mirrors clicking Edit
    // on an existing note whose card was hidden until now.
    const { rerender } = render(
      <SidenoteLayer
        entries={[entry()]}
        trigger="caret"
        editable
        activeId={null}
        autoFocusId={null}
        onAutoFocused={onAutoFocused}
      />
    )
    const body = screen.getByRole('textbox', { name: 'Sidenote 1' })
    expect(document.activeElement).not.toBe(body)

    rerender(
      <SidenoteLayer
        entries={[entry()]}
        trigger="caret"
        editable
        activeId="n1"
        autoFocusId="n1"
        onAutoFocused={onAutoFocused}
      />
    )
    flushFrames()

    expect(document.activeElement).toBe(body)
    expect(onAutoFocused).toHaveBeenCalled()
  })

  it('calls onExitEdit with the entry when Escape is pressed in the body', () => {
    const onExitEdit = vi.fn()
    render(
      <SidenoteLayer
        entries={[entry()]}
        trigger="caret"
        editable
        activeId="n1"
        onExitEdit={onExitEdit}
      />
    )
    const body = screen.getByRole('textbox', { name: 'Sidenote 1' })
    fireEvent.keyDown(body, { key: 'Escape' })
    expect(onExitEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1' }))
  })

  it('reports the end of editing when the card loses focus', () => {
    const onStopEditing = vi.fn()
    render(
      <>
        <button>elsewhere</button>
        <SidenoteLayer
          entries={[entry()]}
          trigger="caret"
          editable
          activeId="n1"
          onStopEditing={onStopEditing}
        />
      </>
    )
    const body = screen.getByRole('textbox', { name: 'Sidenote 1' })
    body.focus()
    expect(onStopEditing).not.toHaveBeenCalled()
    screen.getByText('elsewhere').focus()
    expect(onStopEditing).toHaveBeenCalledTimes(1)
  })
})

// Collapse the caret inside `el` at absolute text offset `at` (paragraph breaks
// count as one character), mirroring where the user would be typing.
function placeCaret(el: HTMLElement, at: number) {
  const paragraphs = Array.from(el.children)
  let index = 0
  let column = at
  while (index < paragraphs.length - 1 && column > (paragraphs[index].textContent ?? '').length) {
    column -= (paragraphs[index].textContent ?? '').length + 1
    index++
  }
  const host = paragraphs[index] ?? el
  const textNode = host.firstChild
  const range = document.createRange()
  if (textNode && textNode.nodeType === Node.TEXT_NODE) {
    range.setStart(textNode, column)
  } else {
    range.setStart(host, 0)
  }
  range.collapse(true)
  const sel = window.getSelection()
  sel?.removeAllRanges()
  sel?.addRange(range)
}

describe('SidenoteLayer — note paragraphs', () => {
  function renderEditable(text: string, handlers: Record<string, unknown> = {}) {
    render(
      <SidenoteLayer
        entries={[entry({ text })]}
        trigger="caret"
        editable
        activeId="n1"
        {...handlers}
      />
    )
    return screen.getByRole('textbox', { name: 'Sidenote 1' })
  }

  it('renders a stored multi-paragraph note as one element per paragraph', () => {
    const body = renderEditable('first\nsecond')
    expect(Array.from(body.children).map((c) => c.textContent)).toEqual(['first', 'second'])
  })

  it('splits the note at the caret on Shift+Enter', () => {
    const onChangeText = vi.fn()
    const onExitEdit = vi.fn()
    const body = renderEditable('onetwo', { onChangeText, onExitEdit })
    placeCaret(body, 3)

    fireEvent.keyDown(body, { key: 'Enter', shiftKey: true })

    expect(onChangeText).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1' }), 'one\ntwo')
    expect(Array.from(body.children).map((c) => c.textContent)).toEqual(['one', 'two'])
    expect(onExitEdit).not.toHaveBeenCalled()
  })

  it('appends an empty paragraph when Shift+Enter lands at the end', () => {
    const onChangeText = vi.fn()
    const body = renderEditable('note', { onChangeText })
    placeCaret(body, 4)

    fireEvent.keyDown(body, { key: 'Enter', shiftKey: true })

    expect(onChangeText).toHaveBeenCalledWith(expect.anything(), 'note\n')
    expect(body.children).toHaveLength(2)
  })

  it('exits on a plain Enter without adding a paragraph', () => {
    const onChangeText = vi.fn()
    const onExitEdit = vi.fn()
    const body = renderEditable('note', { onChangeText, onExitEdit })
    placeCaret(body, 4)

    fireEvent.keyDown(body, { key: 'Enter' })

    expect(onExitEdit).toHaveBeenCalledWith(expect.objectContaining({ id: 'n1' }))
    expect(onChangeText).not.toHaveBeenCalled()
    expect(body.children).toHaveLength(1)
  })

  it('reports typed text with paragraph breaks preserved', () => {
    const onChangeText = vi.fn()
    const body = renderEditable('first\nsecond', { onChangeText })
    body.children[1].textContent = 'second edited'

    fireEvent.input(body)

    expect(onChangeText).toHaveBeenCalledWith(expect.anything(), 'first\nsecond edited')
  })

  it('reads as empty again once the last character is deleted', () => {
    const onChangeText = vi.fn()
    const body = renderEditable('x', { onChangeText })
    body.children[0].textContent = ''

    fireEvent.input(body)

    expect(onChangeText).toHaveBeenCalledWith(expect.anything(), '')
    // No stray paragraph left behind — the `:empty` placeholder can show.
    expect(body.childNodes).toHaveLength(0)
    expect(body.getAttribute('data-placeholder')).toBe('Add a note…')
  })

  it('renders each paragraph in the read-only card', () => {
    render(<SidenoteLayer entries={[entry({ text: 'first\nsecond' })]} />)
    expect(screen.getByText('first')).toBeDefined()
    expect(screen.getByText('second')).toBeDefined()
    expect(screen.queryByRole('textbox')).toBeNull()
  })
})
