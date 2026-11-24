import { act, cleanup } from '@testing-library/react'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { insertReply } from '../insert-reply'
import { MOD, lines, mount, press, standInLayout } from './support/editor'

beforeAll(standInLayout)
afterEach(cleanup)

// Gemma writes Markdown. Its reply goes in at the end of the note as real
// blocks, read as markdown pasted in is.
describe('insertReply', () => {
  it("adds the reply's Markdown as blocks at the end of the note", () => {
    const { view, written } = mount(lines('Mine'))
    act(() => insertReply(view, '## Summary\n\nShort **and** sweet.'))
    expect(written()).toBe(lines('Mine', '', '## Summary', '', 'Short **and** sweet.'))
  })

  it('takes the place of the empty lines the note ends on', () => {
    const ended = mount(lines('Mine', '', '&nbsp;', '', '&nbsp;'))
    act(() => insertReply(ended.view, 'Added'))
    expect(ended.written()).toBe(lines('Mine', '', 'Added'))
    cleanup()
    const empty = mount('')
    act(() => insertReply(empty.view, 'Added'))
    expect(empty.written()).toBe(lines('Added'))
  })

  it('leaves somewhere to type after a reply that ends in a list', () => {
    const { view, container, written } = mount(lines('Mine'))
    act(() => insertReply(view, '- one\n- two'))
    expect(written()).toBe(lines('Mine', '', '- one', '- two'))
    expect(container.querySelector('[data-note-body]')!.lastElementChild!.tagName).toBe('P')
  })

  it('changes nothing for an empty reply', () => {
    const { view, onChange } = mount(lines('Mine'))
    act(() => insertReply(view, '   '))
    expect(onChange).not.toHaveBeenCalled()
  })

  it("keeps the reply's tasks, and a list under an item", () => {
    const { view, written } = mount(lines('Mine'))
    act(() => insertReply(view, '- [x] done\n- [ ] todo\n  - under it\n    1. and under that'))
    expect(written()).toBe(
      lines('Mine', '', '- [x] done', '- [ ] todo', '', '  - under it', '', '    1. and under that')
    )
  })

  it('links an address the reply writes bare, and reads a footnote as a sidenote', () => {
    const { view, written } = mount(lines('Mine'))
    act(() => insertReply(view, 'See https://example.com for more[^1].\n\n[^1]: The source.'))
    expect(written()).toBe(
      lines(
        'Mine',
        '',
        'See [https://example.com](https://example.com) for <Sidenote note="The source.">more</Sidenote>.'
      )
    )
  })

  it("keeps the reply's sidenote apart from the one the note already has", () => {
    const { view } = mount(lines('<Sidenote note="Mine.">Word</Sidenote>'))
    act(() => insertReply(view, 'More[^1].\n\n[^1]: Theirs.'))
    const ids = new Set<string>()
    view.state.doc.descendants((node) => {
      for (const mark of node.marks) if (mark.type.name === 'sidenote') ids.add(mark.attrs.id)
    })
    expect(ids.size).toBe(2)
  })

  it('keeps the words of what it cannot read as markdown', () => {
    const { view, written } = mount(lines('Mine'))
    act(() => insertReply(view, 'A line<br>broken, and {braces}.'))
    expect(written()).toBe(lines('Mine', '', 'A line\\<br>broken, and \\{braces}.'))
  })

  it('is one step to take back', () => {
    const { view, written } = mount(lines('Mine'))
    act(() => insertReply(view, '## Summary\n\n- one\n- two'))
    press(view, 'z', MOD)
    expect(written()).toBe(lines('Mine'))
  })
})
