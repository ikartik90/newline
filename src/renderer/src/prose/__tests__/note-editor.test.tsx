import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { EditorView } from 'prosemirror-view'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { MdxNoteEditor, type MdxNoteSnapshot } from '../note-editor'

vi.mock('@/components/image-insert-dialog', () => ({ ImageInsertDialog: () => null }))

beforeAll(() => {
  const nowhere = { top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, x: 0, y: 0 }
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList
  Range.prototype.getBoundingClientRect = () => nowhere as DOMRect
})

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// A note is opened on its MDX and handed back as MDX, so what only MDX holds
// (a colour, a list under an item, a size) is never flattened.
describe('MdxNoteEditor', () => {
  const MDX = [
    'Plain and <TextStyle color="danger">red</TextStyle> words.',
    '',
    '- One',
    '',
    '  - Under one',
    '',
    '<BlockStyle size="sm">',
    '  A small line.',
    '</BlockStyle>',
    ''
  ].join('\n')

  function mountMdx(mdx: string = MDX, title = 'A note') {
    const onChange = vi.fn<(snapshot: MdxNoteSnapshot) => void>()
    let body!: EditorView
    const view = render(
      <MdxNoteEditor
        noteId="m1"
        initialTitle={title}
        initialMdx={mdx}
        onChange={onChange}
        onReady={(ready) => (body = ready)}
      />
    )
    const typeInBody = (text: string): void => {
      act(() => {
        const { from, to } = body.state.selection
        body.dispatch(body.state.tr.insertText(text, from, to))
      })
    }
    return { ...view, onChange, body, typeInBody }
  }

  it('shows the title over the note as its text says it', () => {
    const { container } = mountMdx()
    const title = screen.getByRole('heading', { name: 'Title' })
    expect(title.textContent).toBe('A note')
    expect(title.className).toContain('text-style-heading-1')
    const blocks = [...container.querySelectorAll('.ProseMirror > *')].map(
      (block) => `${block.tagName.toLowerCase()}: ${block.textContent}`
    )
    expect(blocks.slice(0, 3)).toEqual([
      'p: Plain and red words.',
      'ul: OneUnder one',
      'p: A small line.'
    ])
    expect(container.querySelector('.ProseMirror ul ul')?.textContent).toBe('Under one')
    expect(container.querySelector('.ProseMirror > p:last-of-type')?.className).toContain(
      'text-style-paragraph-sm'
    )
  })

  it('hands nothing back for a note that is only opened', () => {
    const { onChange, unmount } = mountMdx()
    act(() => vi.runAllTimers())
    unmount()
    expect(onChange).not.toHaveBeenCalled()
  })

  it('hands the text back as it came when only the title changes', () => {
    const odd = 'Written   by another hand.\n\n\n* a star bullet\n'
    const { onChange } = mountMdx(odd)
    const title = screen.getByRole('heading', { name: 'Title' })
    title.textContent = 'A better title'
    fireEvent.input(title)
    expect(onChange).not.toHaveBeenCalled()
    act(() => vi.runAllTimers())
    expect(onChange.mock.calls).toEqual([[{ title: 'A better title', mdx: odd }]])
  })

  it('hands the note back as MDX once typing rests, what only MDX holds still in it', () => {
    const { onChange, typeInBody } = mountMdx()
    typeInBody('!')
    expect(onChange).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(500))
    expect(onChange.mock.calls).toEqual([[{ title: 'A note', mdx: `!${MDX}` }]])
  })

  it('hands back what is unsaved at once on Cmd+S, and when the note is left', () => {
    const saved = mountMdx()
    saved.typeInBody('!')
    fireEvent.keyDown(document, { key: 's', metaKey: true })
    expect(saved.onChange).toHaveBeenCalledTimes(1)
    cleanup()
    const left = mountMdx()
    left.typeInBody('?')
    left.unmount()
    expect(left.onChange.mock.calls).toEqual([[{ title: 'A note', mdx: `?${MDX}` }]])
  })

  it('hands a title left mid-word back when the note is left', () => {
    const { onChange, unmount } = mountMdx()
    const title = screen.getByRole('heading', { name: 'Title' })
    title.textContent = 'Left mid-word'
    fireEvent.input(title)
    unmount()
    expect(onChange.mock.calls).toEqual([[{ title: 'Left mid-word', mdx: MDX }]])
  })

  it('goes from the title into the note on Enter', () => {
    const { body } = mountMdx()
    const title = screen.getByRole('heading', { name: 'Title' })
    title.focus()
    fireEvent.keyDown(title, { key: 'Enter' })
    expect(document.activeElement).toBe(body.dom)
  })

  it('leaves the title out where the note has none to edit', () => {
    render(<MdxNoteEditor noteId="m2" initialTitle="" initialMdx={MDX} showTitle={false} />)
    expect(screen.queryByRole('heading', { name: 'Title' })).toBeNull()
  })
})
