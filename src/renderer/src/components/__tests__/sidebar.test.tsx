import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Sidebar from '../Sidebar'

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
  it('insets the rows 8px from either edge, with the scrollbar in the right margin', () => {
    renderSidebar()
    // The list's inset stops 2px short on the right and the gutter, held open
    // whether or not the list scrolls, is the rest of the 8px.
    const scroll = row('Apples').closest('.overflow-y-auto')!
    expect(scroll.className.split(/\s+/)).toContain('[scrollbar-gutter:stable]')
    const listInset = scroll.parentElement!.className.split(/\s+/)
    expect(listInset).toContain('pl-2')
    expect(listInset).toContain('pr-0.5')
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
