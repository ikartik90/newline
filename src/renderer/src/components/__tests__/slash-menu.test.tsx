import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Mock } from 'vitest'
import { SlashMenu, slashMenuHasResults, type SlashMenuBlockType } from '../slash-menu'
import { resetInputModality } from '@/hooks/use-input-modality'

// The editor stamps `data-slash-anchor` on the active block; the menu anchors
// to whichever element carries it.
function setSlashAnchorOnBody() {
  const el = document.createElement('p')
  el.setAttribute('data-slash-anchor', '')
  document.body.appendChild(el)
  return el
}

const ALL_LABELS = [
  'Heading 1',
  'Heading 2',
  'Heading 3',
  'Heading 4',
  'Paragraph',
  'Image or video',
  'Quote',
  'Numbered list',
  'Bulleted list',
  'Task list',
  'Code',
  'Divider'
]

describe('SlashMenu', () => {
  let onSelect: Mock<(type: SlashMenuBlockType) => void>
  let onDismiss: Mock<() => void>
  let anchorEl: HTMLElement

  beforeEach(() => {
    onSelect = vi.fn<(type: SlashMenuBlockType) => void>()
    onDismiss = vi.fn<() => void>()
    anchorEl = setSlashAnchorOnBody()
  })

  afterEach(() => {
    anchorEl.remove()
    // Input modality is module-level (it tracks the real device), so an arrow
    // key in one test would otherwise suppress the next one's hover.
    resetInputModality()
  })
  it('stands its rows on the menu tone: toolbar-tall, 2px clear of the shell and 1px apart', () => {
    render(<SlashMenu onSelect={onSelect} onDismiss={onDismiss} />)
    const listbox = screen.getByRole('listbox')
    expect(listbox.className.split(/\s+/)).toEqual(expect.arrayContaining(['p-0.5', 'gap-px']))
    for (const option of screen.getAllByRole('option')) {
      expect(option.className.split(/\s+/)).toContain('h-(--size-toolbar-button)')
    }
  })

  function renderMenu(props: Partial<React.ComponentProps<typeof SlashMenu>> = {}) {
    return render(<SlashMenu onSelect={onSelect} onDismiss={onDismiss} {...props} />)
  }

  // -------------------------------------------------------------------------
  // Positioning
  // -------------------------------------------------------------------------

  it('anchors to the editor element, not a synthesized rect anchor', () => {
    renderMenu()
    expect(screen.getByRole('listbox', { name: 'Insert block' })).toBeDefined()
    expect(document.querySelector('[data-popover-anchor]')).toBeNull()
  })

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  it('renders every menu item, in order, when query is empty', () => {
    renderMenu()
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(ALL_LABELS)
    expect(screen.queryByText('Link card')).toBeNull()
  })

  it('highlights the first item by default', () => {
    renderMenu()
    const items = screen.getAllByRole('option')
    // The roving highlight is `data-active` (aria-selected is reserved for a
    // persistent selection, which a transient command menu never commits).
    expect(items[0].hasAttribute('data-active')).toBe(true)
    expect(items[1].hasAttribute('data-active')).toBe(false)
  })

  // -------------------------------------------------------------------------
  // Filtering
  // -------------------------------------------------------------------------

  it('filters items by query (case-insensitive)', () => {
    renderMenu({ query: 'PARA' })
    expect(screen.getByText('Paragraph')).toBeDefined()
    expect(screen.queryByText('Heading 2')).toBeNull()
    expect(screen.queryByText('Image or video')).toBeNull()
  })

  it('filters items by partial query match', () => {
    renderMenu({ query: 'cod' })
    expect(screen.getByText('Code')).toBeDefined()
    expect(screen.queryByText('Paragraph')).toBeNull()
  })

  it('finds a heading by its level, said the short way', () => {
    renderMenu({ query: 'h3' })
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Heading 3'])
  })

  it('finds a task list by what it is often called', () => {
    renderMenu({ query: 'todo' })
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Task list'])
  })

  it('offers every level for the word they share', () => {
    renderMenu({ query: 'head' })
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual([
      'Heading 1',
      'Heading 2',
      'Heading 3',
      'Heading 4'
    ])
  })

  it('renders no items when the query matches nothing', () => {
    renderMenu({ query: 'zzz' })
    expect(screen.queryAllByRole('option')).toHaveLength(0)
  })

  it('leaves out the kind of block the caret is already in', () => {
    renderMenu({ excludeType: 'paragraph' })
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(
      ALL_LABELS.filter((label) => label !== 'Paragraph')
    )
  })

  it('slashMenuHasResults mirrors the rendered filter', () => {
    expect(slashMenuHasResults('')).toBe(true)
    expect(slashMenuHasResults('zzz')).toBe(false)
    expect(slashMenuHasResults('quote')).toBe(true)
    expect(slashMenuHasResults('quote', 'blockquote')).toBe(false)
  })

  // -------------------------------------------------------------------------
  // Click selection
  // -------------------------------------------------------------------------

  it.each<[string, SlashMenuBlockType]>([
    ['Heading 1', 'heading_1'],
    ['Heading 2', 'heading_2'],
    ['Heading 3', 'heading_3'],
    ['Heading 4', 'heading_4'],
    ['Paragraph', 'paragraph'],
    ['Image or video', 'media'],
    ['Quote', 'blockquote'],
    ['Numbered list', 'list_item'],
    ['Bulleted list', 'bullet_list_item'],
    ['Task list', 'task_list_item'],
    ['Code', 'code_block'],
    ['Divider', 'horizontal_rule']
  ])("calls onSelect with the block type when '%s' is clicked", (label, type) => {
    renderMenu()
    fireEvent.click(screen.getByText(label))
    expect(onSelect).toHaveBeenCalledWith(type)
  })

  // -------------------------------------------------------------------------
  // Keyboard navigation — arrows and Enter arrive at the document because
  // focus stays in the editor.
  // -------------------------------------------------------------------------

  it('moves active item down with ArrowDown', () => {
    renderMenu()
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    const items = screen.getAllByRole('option')
    expect(items[0].hasAttribute('data-active')).toBe(false)
    expect(items[1].hasAttribute('data-active')).toBe(true)
  })

  it('moves active item up with ArrowUp', () => {
    renderMenu()
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    fireEvent.keyDown(document, { key: 'ArrowUp' })
    const items = screen.getAllByRole('option')
    expect(items[1].hasAttribute('data-active')).toBe(true)
  })

  it('wraps from last item to first when pressing ArrowDown', () => {
    renderMenu()
    const count = screen.getAllByRole('option').length
    for (let i = 0; i < count; i++) {
      fireEvent.keyDown(document, { key: 'ArrowDown' })
    }
    const items = screen.getAllByRole('option')
    expect(items[0].hasAttribute('data-active')).toBe(true)
    expect(items[items.length - 1].hasAttribute('data-active')).toBe(false)
  })

  it('wraps from first item to last when pressing ArrowUp', () => {
    renderMenu()
    fireEvent.keyDown(document, { key: 'ArrowUp' })
    const items = screen.getAllByRole('option')
    expect(items[items.length - 1].hasAttribute('data-active')).toBe(true)
    expect(items[0].hasAttribute('data-active')).toBe(false)
  })

  it('moves highlight to item under pointer (onPointerEnter)', () => {
    renderMenu()
    fireEvent.pointerEnter(screen.getByText('Image or video'))
    const items = screen.getAllByRole('option')
    expect(items[5].hasAttribute('data-active')).toBe(true)
    expect(items[0].hasAttribute('data-active')).toBe(false)
  })

  // You type `/` with the mouse already parked where the menu is about to
  // appear. The cursor never moves, so every pointer event that follows is the
  // engine's, not yours — the arrow keys own the highlight until you genuinely
  // reach for the mouse.
  it('keeps the keyboard in charge when the menu opens under a parked cursor', () => {
    fireEvent.keyDown(document, { key: '/' })
    renderMenu()
    const items = () => screen.getAllByRole('option')

    fireEvent.pointerEnter(screen.getByText('Image or video'))
    expect(items()[5].hasAttribute('data-active')).toBe(false)
    expect(items()[0].hasAttribute('data-active')).toBe(true)

    fireEvent.keyDown(document, { key: 'ArrowDown' })
    expect(items()[1].hasAttribute('data-active')).toBe(true)
    fireEvent.pointerEnter(screen.getByText('Image or video'))
    expect(items()[1].hasAttribute('data-active')).toBe(true)

    // Reaching for the mouse hands control straight back.
    fireEvent.pointerMove(document, { clientX: 120, clientY: 64 })
    fireEvent.pointerEnter(screen.getByText('Image or video'))
    expect(items()[5].hasAttribute('data-active')).toBe(true)
  })

  it('keyboard arrow navigation takes over from the pointer-entered position', () => {
    renderMenu()
    fireEvent.pointerEnter(screen.getByText('Image or video'))
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    const items = screen.getAllByRole('option')
    expect(items[6].hasAttribute('data-active')).toBe(true)
  })

  it('selects the active item on Enter', () => {
    renderMenu()
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('heading_2')
  })

  it('selects the first item on Enter with no navigation', () => {
    renderMenu()
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onSelect).toHaveBeenCalledWith('heading_1')
  })

  it('does not select on Enter when the query leaves nothing', () => {
    renderMenu({ query: 'zzz' })
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('re-homes the highlight to the first survivor when the query changes', () => {
    const { rerender } = renderMenu()
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    fireEvent.keyDown(document, { key: 'ArrowDown' })
    act(() => {
      rerender(<SlashMenu query="p" onSelect={onSelect} onDismiss={onDismiss} />)
    })
    const items = screen.getAllByRole('option')
    expect(items[0].hasAttribute('data-active')).toBe(true)
  })

  // -------------------------------------------------------------------------
  // Dismiss
  // -------------------------------------------------------------------------

  it('calls onDismiss when Escape is pressed', () => {
    renderMenu()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('calls onDismiss on pointer down outside the menu', () => {
    renderMenu()
    fireEvent.pointerDown(document.body)
    expect(onDismiss).toHaveBeenCalledOnce()
  })

  it('does not call onDismiss on pointer down inside the menu', () => {
    renderMenu()
    fireEvent.pointerDown(screen.getByText('Paragraph'))
    expect(onDismiss).not.toHaveBeenCalled()
  })
})
