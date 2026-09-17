// @vitest-environment jsdom
import React from 'react'
import { render, screen, fireEvent, cleanup, act, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ArticleEditor, type EditorSnapshot } from '../article-editor'
import type { BlockNode, InlineNode, Mark } from '@shared/domain/nodes'
import type { Document } from '@shared/domain/document'
import { useEditorStore } from '@/store/editor'

// ---------------------------------------------------------------------------
// Stand-ins for the slash menu, the image dialog and the media client
// ---------------------------------------------------------------------------

vi.mock('@/components/slash-menu', () => ({
  SlashMenu: ({
    onSelect,
    onDismiss
  }: {
    onSelect: (t: string) => void
    onDismiss: () => void
  }) => (
    <div data-testid="slash-menu">
      <button onClick={() => onSelect('heading')}>heading</button>
      <button onClick={() => onSelect('paragraph')}>paragraph</button>
      <button onClick={() => onSelect('media')}>media</button>
      <button onClick={() => onSelect('link_card')}>link_card</button>
      <button onClick={() => onSelect('list_item')}>list_item</button>
      <button onClick={() => onSelect('bullet_list_item')}>bullet_list_item</button>
      <button onClick={() => onSelect('horizontal_rule')}>horizontal_rule</button>
      <button onClick={onDismiss}>dismiss</button>
    </div>
  ),
  slashMenuHasResults: () => true
}))

vi.mock('@/components/image-insert-dialog', () => ({
  ImageInsertDialog: ({
    open,
    mode,
    onClose,
    onInsert
  }: {
    open: boolean
    mode?: 'insert' | 'change'
    onClose: () => void
    onInsert: (payload: never) => void
  }) =>
    open ? (
      <div data-testid="image-dialog" data-mode={mode ?? 'insert'}>
        <button onClick={onClose}>close</button>
        <button onClick={() => onInsert({ kind: 'image', src: 'https://cdn/1.png' } as never)}>
          insert
        </button>
        {/* The library holds clips too, and the dialog reads their kind off
            the stored content type rather than off the url — so the src here
            carries no extension, and a handler that re-derived the kind from
            it would come back with the wrong answer. */}
        <button onClick={() => onInsert({ kind: 'video', src: 'https://cdn/8f2c-key' } as never)}>
          insert clip
        </button>
      </div>
    ) : null
}))

// The renderer's media client crosses to the main process over IPC, which
// jsdom has no bridge for.
const mediaClient = vi.hoisted(() => ({
  listMediaAssets: vi.fn(async () => []),
  uploadMediaFile: vi.fn(),
  updateMediaAlt: vi.fn(),
  updateMediaFilename: vi.fn(),
  deleteMedia: vi.fn(),
  uploadPoster: vi.fn()
}))
vi.mock('@/lib/media', () => mediaClient)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const text = (t: string): InlineNode => ({ type: 'text', text: t })
const paragraph = (t = ''): BlockNode => ({ type: 'paragraph', children: [text(t)] })
const heading = (
  t: string,
  extra: Partial<{ caption: string; indent: boolean }> = {}
): BlockNode => ({
  type: 'heading',
  level: 2,
  children: [text(t)],
  ...extra
})
const blockquote = (t: string, extra: Partial<{ caption: string }> = {}): BlockNode => ({
  type: 'blockquote',
  children: [text(t)],
  ...extra
})
const image = (extra: Record<string, unknown> = {}): BlockNode =>
  ({
    type: 'media',
    kind: 'image',
    src: 'https://example.com/photo.png',
    ...extra
  }) as BlockNode
const linkCard = (): BlockNode => ({ type: 'link_card', config: {} })

function docOf(content: BlockNode[]): Document {
  return { type: 'doc', content }
}

/**
 * Mounts the editor inside an `<article>`, as the app does: the selection
 * toolbar's anchor rect is measured against the nearest article.
 */
function renderEditor(
  content: BlockNode[] = [],
  options: { title?: string; onChange?: (snapshot: EditorSnapshot) => void; noteId?: string } = {}
) {
  return render(
    <article style={{ position: 'relative' }}>
      <ArticleEditor
        noteId={options.noteId ?? 'n1'}
        initialTitle={options.title ?? ''}
        initialDocument={docOf(content)}
        onChange={options.onChange}
      />
    </article>
  )
}

const blockAt = (i: number) => document.querySelector(`[data-block-index='${i}']`) as HTMLElement

function openSlashMenuOnBlock(block: HTMLElement) {
  block.focus()
  block.textContent = '/'
  const textNode = block.firstChild!
  const sel = window.getSelection()!
  const range = document.createRange()
  range.setStart(textNode, 1)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
  fireEvent.keyUp(block, { key: '/' })
}

function placeCaret(block: HTMLElement, offset: number) {
  block.focus()
  const textNode = block.firstChild ?? block
  const sel = window.getSelection()!
  const range = document.createRange()
  range.setStart(textNode, offset)
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
}

const flushTimers = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

// ---------------------------------------------------------------------------
// ArticleEditor
// ---------------------------------------------------------------------------

describe('ArticleEditor', () => {
  beforeEach(() => {
    useEditorStore.getState().reset()
  })

  afterEach(() => {
    cleanup()
    useEditorStore.getState().reset()
  })

  it("renders the title input with placeholder 'Title'", () => {
    renderEditor()
    const title = screen.getByLabelText('Title')
    expect(title.getAttribute('data-placeholder')).toBe('Title')
  })

  it('renders the body placeholder on the first block when body is empty', () => {
    renderEditor()
    const el = document.querySelector("[data-placeholder='Start writing…']")
    expect(el).not.toBeNull()
  })

  it('updates the code block language from the editor select', () => {
    renderEditor([{ type: 'code_block', children: [text('const x = 1;')] }, paragraph()])

    const select = screen.getByLabelText('Code language') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'typescript' } })

    expect(select.value).toBe('typescript')
  })

  it('appends a trailing paragraph after a terminal code block', () => {
    renderEditor([{ type: 'code_block', children: [text('const x = 1;')] }])

    // A code block is the last authored block; Enter inside it inserts a literal
    // newline, so the editor must synthesise an empty paragraph to escape into.
    const blocks = useEditorStore.getState().document.content
    expect(blocks).toHaveLength(2)
    expect(blocks[0].type).toBe('code_block')
    expect(blocks[1].type).toBe('paragraph')
    expect((blocks[1] as { children: InlineNode[] }).children[0].text).toBe('')
  })

  // Regression: code blocks carry 32px (3xl) vertical padding — larger than the
  // ~24px code line height. Line detection used to measure the caret against the
  // element's border-box edge with a one-line tolerance, so the boundary line
  // fell outside the band and ArrowUp/ArrowDown could never leave the block.
  // Detection now measures against the content box (padding subtracted).
  describe('padded code block caret escape', () => {
    const rect = (top: number, bottom: number): DOMRect =>
      ({
        top,
        bottom,
        height: bottom - top,
        left: 0,
        right: 200,
        width: 200,
        x: 0,
        y: top,
        toJSON: () => ({})
      }) as DOMRect

    // Border box 0..100 with 32px vertical padding → content box 32..68.
    const mockGeometry = (pre: HTMLElement, caret: DOMRect) => {
      pre.getBoundingClientRect = () => rect(0, 100)
      const realGetComputedStyle = window.getComputedStyle.bind(window)
      vi.spyOn(window, 'getComputedStyle').mockImplementation((el, pseudo) =>
        el === pre
          ? ({ paddingTop: '32px', paddingBottom: '32px' } as CSSStyleDeclaration)
          : realGetComputedStyle(el as Element, pseudo)
      )
      vi.spyOn(window, 'getSelection').mockReturnValue({
        rangeCount: 1,
        getRangeAt: () => ({ getBoundingClientRect: () => caret }),
        removeAllRanges: () => {},
        addRange: () => {}
      } as unknown as Selection)
    }

    afterEach(() => vi.restoreAllMocks())

    it('ArrowDown on the last visual line escapes to the block below', () => {
      renderEditor([{ type: 'code_block', children: [text('const x = 1;')] }, paragraph('after')])

      const pre = blockAt(0)
      const next = blockAt(1)
      // Caret bottom (68) sits at the content-box bottom, 32px above the border
      // edge — the geometry the old border-box check misread as "not last line".
      mockGeometry(pre, rect(44, 68))

      pre.focus()
      fireEvent.keyDown(pre, { key: 'ArrowDown' })

      expect(document.activeElement).toBe(next)
    })

    it('ArrowUp on the first visual line escapes to the block above', () => {
      renderEditor([paragraph('before'), { type: 'code_block', children: [text('const x = 1;')] }])

      const prev = blockAt(0)
      const pre = blockAt(1)
      // Caret top (32) sits at the content-box top, 32px below the border edge.
      mockGeometry(pre, rect(32, 56))

      pre.focus()
      fireEvent.keyDown(pre, { key: 'ArrowUp' })

      expect(document.activeElement).toBe(prev)
    })
  })

  it('renders a figcaption with placeholder on image blocks', () => {
    renderEditor([image({ alt: 'Example photo' }), paragraph()])

    const caption = document.querySelector("figcaption[data-placeholder='Add caption...']")
    expect(caption).not.toBeNull()
    expect(document.querySelector('figure img')?.getAttribute('src')).toBe(
      'https://example.com/photo.png'
    )
  })

  it('shows delete action when the horizontal rule is focused', () => {
    renderEditor([{ type: 'horizontal_rule' }, paragraph()])

    const hr = document.querySelector("[role='separator']") as HTMLElement
    fireEvent.focus(hr)

    expect(screen.getByRole('button', { name: 'Delete horizontal rule' })).toBeDefined()
  })

  it('inserts a paragraph before the horizontal rule when Enter is pressed', () => {
    renderEditor([{ type: 'horizontal_rule' }, paragraph()])

    const hr = document.querySelector("[role='separator']") as HTMLElement
    hr.focus()
    fireEvent.keyDown(hr, { key: 'Enter' })

    const blocks = useEditorStore.getState().document.content
    expect(blocks).toHaveLength(3)
    expect(blocks[0].type).toBe('paragraph')
    expect(blocks[1].type).toBe('horizontal_rule')
    expect(blocks[2].type).toBe('paragraph')
  })

  it('updates the image caption in the store when typing in figcaption', () => {
    renderEditor([image(), paragraph()])

    const caption = document.querySelector(
      "figcaption[data-placeholder='Add caption...']"
    ) as HTMLElement
    caption.textContent = 'A sunny day'
    fireEvent.input(caption)

    const imageBlock = useEditorStore.getState().document.content[0]
    expect(imageBlock.type).toBe('media')
    if (imageBlock.type === 'media') {
      expect(imageBlock.caption).toBe('A sunny day')
    }
  })

  it('does not delete the image block when pressing Delete in figcaption', () => {
    renderEditor([image({ caption: 'Keep me' }), paragraph()])

    const caption = document.querySelector('figcaption') as HTMLElement
    caption.focus()
    fireEvent.keyDown(caption, { key: 'Delete' })

    expect(useEditorStore.getState().document.content[0]?.type).toBe('media')
    expect(document.querySelector('figure img')).not.toBeNull()
  })

  // The rail belongs to the picture's frame, not to the caption beneath it.
  it('renders the action rail over the image, not the caption', () => {
    renderEditor([image(), paragraph()])

    const figure = document.querySelector('figure[data-showcase-block]') as HTMLElement
    const img = figure.querySelector('img') as HTMLElement
    fireEvent.focus(img)

    const rail = within(figure).getByRole('toolbar', { name: 'Image actions' })
    const caption = figure.querySelector('figcaption')
    expect(caption?.contains(rail)).toBe(false)
  })

  it('inserts a paragraph before the figure when Enter is pressed on showcase media', () => {
    renderEditor([image(), paragraph()])

    const img = document.querySelector('[data-showcase-media]') as HTMLElement
    img.focus()
    fireEvent.keyDown(img, { key: 'Enter' })

    const blocks = useEditorStore.getState().document.content
    expect(blocks).toHaveLength(3)
    expect(blocks[0].type).toBe('paragraph')
    expect(blocks[1].type).toBe('media')
    expect(blocks[2].type).toBe('paragraph')
  })

  it('moves focus from image to caption on ArrowDown', () => {
    renderEditor([image(), paragraph()])

    const img = document.querySelector('[data-showcase-media]') as HTMLElement
    const caption = document.querySelector('figcaption') as HTMLElement
    img.focus()
    fireEvent.keyDown(img, { key: 'ArrowDown' })

    expect(document.activeElement).toBe(caption)
  })

  it('moves focus from image to caption on ArrowDown, but swallows Tab', () => {
    renderEditor([image(), paragraph()])

    const img = document.querySelector('[data-showcase-media]') as HTMLElement
    const caption = document.querySelector('figcaption') as HTMLElement

    // Tab is swallowed — it must not move the caret into the caption.
    img.focus()
    const notPrevented = fireEvent.keyDown(img, { key: 'Tab' })
    expect(notPrevented).toBe(false)
    expect(document.activeElement).toBe(img)

    // ArrowDown still descends into the caption.
    fireEvent.keyDown(img, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(caption)
  })

  it('inserts a paragraph after the figure when Enter is pressed in the caption', () => {
    renderEditor([image({ caption: 'Caption' }), paragraph('Next block')])

    const caption = document.querySelector('figcaption') as HTMLElement
    caption.focus()
    fireEvent.keyDown(caption, { key: 'Enter' })

    const blocks = useEditorStore.getState().document.content
    expect(blocks).toHaveLength(3)
    expect(blocks[0].type).toBe('media')
    expect(blocks[1].type).toBe('paragraph')
    expect(blocks[2].type).toBe('paragraph')
    if (blocks[1].type === 'paragraph') {
      expect(blocks[1].children.every((c) => c.type === 'text' && !c.text)).toBe(true)
    }
    if (blocks[2].type === 'paragraph') {
      expect(blocks[2].children[0]?.type === 'text' && blocks[2].children[0].text).toBe(
        'Next block'
      )
    }
  })

  it('focuses the trailing paragraph when Enter is pressed in the caption on the last figure', async () => {
    renderEditor([image(), paragraph()])

    const caption = document.querySelector('figcaption') as HTMLElement
    const trailingParagraph = document.querySelector("p[data-block-index='1']") as HTMLElement
    caption.focus()
    fireEvent.keyDown(caption, { key: 'Enter' })

    await flushTimers()

    const blocks = useEditorStore.getState().document.content
    expect(blocks).toHaveLength(2)
    expect(blocks[0].type).toBe('media')
    expect(blocks[1].type).toBe('paragraph')
    expect(document.activeElement).toBe(trailingParagraph)
  })

  it('adds a hard line break in the caption on Shift+Enter', () => {
    const execCommand = vi.fn()
    document.execCommand = execCommand

    renderEditor([image(), paragraph()])

    const caption = document.querySelector('figcaption') as HTMLElement
    caption.focus()
    fireEvent.keyDown(caption, { key: 'Enter', shiftKey: true })

    expect(execCommand).toHaveBeenCalledWith('insertLineBreak')
  })

  it('moves focus from caption to image on ArrowUp at start', () => {
    renderEditor([image({ caption: 'Caption' }), paragraph()])

    const img = document.querySelector('[data-showcase-media]') as HTMLElement
    const caption = document.querySelector('figcaption') as HTMLElement
    caption.focus()

    const sel = window.getSelection()!
    const range = document.createRange()
    range.selectNodeContents(caption)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)

    fireEvent.keyDown(caption, { key: 'ArrowUp' })

    expect(document.activeElement).toBe(img)
  })

  it('moves focus from empty caption to image on ArrowLeft at start', () => {
    renderEditor([image(), paragraph()])

    const img = document.querySelector('[data-showcase-media]') as HTMLElement
    const caption = document.querySelector('figcaption') as HTMLElement
    caption.focus()

    const sel = window.getSelection()!
    const range = document.createRange()
    range.setStart(caption, 0)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)

    fireEvent.keyDown(caption, { key: 'ArrowLeft' })

    expect(document.activeElement).toBe(img)
  })

  it('deletes the image block when pressing Delete on the image', () => {
    renderEditor([image({ caption: 'Gone' }), paragraph()])

    const img = document.querySelector('[data-showcase-media]') as HTMLElement
    img.focus()
    fireEvent.keyDown(img, { key: 'Delete' })

    expect(useEditorStore.getState().document.content[0]?.type).toBe('paragraph')
    expect(document.querySelector('figure')).toBeNull()
  })

  it('gives a media block a rail with properties, replace and delete, but no star', () => {
    renderEditor([image(), paragraph()])

    const rail = screen.getByRole('toolbar', { name: 'Image actions' })
    expect(within(rail).getByRole('button', { name: 'Image properties' })).toBeDefined()
    expect(within(rail).getByRole('button', { name: 'Replace image' })).toBeDefined()
    expect(within(rail).getByRole('button', { name: 'Delete image' })).toBeDefined()
    // Featuring is a move-to-front, and a block standing alone has no other
    // slot to move in front of.
    expect(within(rail).queryByRole('button', { name: 'Feature image' })).toBeNull()
  })

  // ---------------------------------------------------------------------------
  // A media block is a collection of one
  //
  // Everything the docked inspector edits already lives on the node — the
  // caption, the fit, the inset, the corner — and the standalone block reaches
  // it through its own rail.
  // ---------------------------------------------------------------------------

  it('opens the properties panel on a media block', async () => {
    const user = userEvent.setup()
    renderEditor([image(), paragraph()])

    await user.click(screen.getByRole('button', { name: 'Image properties' }))

    expect(screen.getByRole('dialog', { name: 'Media properties' })).toBeDefined()
  })

  // The panel is a live editor with no apply step, so the canvas has to wear
  // what it writes. The editor block used to ignore media layout outright,
  // which would have made every slider in the panel a control with no visible
  // effect until the note was read.
  it('wears the layout its own properties state', () => {
    renderEditor([image({ padding: 16, borderRadius: 8 }), paragraph()])

    const img = document.querySelector('[data-showcase-media]') as HTMLImageElement
    expect(img.style.borderRadius).not.toBe('')
  })

  it('opens the image dialog in change mode from the rail action', () => {
    renderEditor([image(), paragraph()])

    fireEvent.click(screen.getByRole('button', { name: 'Replace image' }))

    const dialog = screen.getByTestId('image-dialog')
    expect(dialog.getAttribute('data-mode')).toBe('change')
  })

  // ---------------------------------------------------------------------------
  // Clips as blocks
  //
  // The whole return on separating the block's IDENTITY from the file's FORMAT.
  // Every predicate in the editor asks `block.type === "media"`, and `type` is
  // the same word on a clip as on a photograph, so a clip arrives already
  // editable: the caption, the traversal, the rail and the delete all work
  // without one of them having heard of `kind`. These lock that in — if any of
  // them ever narrows to a kind, one of these goes red.
  // ---------------------------------------------------------------------------

  const clipDoc = (): BlockNode[] => [
    {
      type: 'media',
      kind: 'video',
      // Extensionless on purpose: the block's own `kind` is the only thing
      // that can answer for this src.
      src: 'https://cdn/8f2c-key'
    },
    paragraph()
  ]

  it('shows a clip block as the clip it is, not a broken picture', () => {
    renderEditor(clipDoc())

    const clip = document.querySelector('figure video')
    expect(clip).not.toBeNull()
    expect(clip?.getAttribute('src')).toBe('https://cdn/8f2c-key')
    expect(document.querySelector('figure img')).toBeNull()
  })

  it('captions a clip block exactly as it captions a picture', () => {
    renderEditor(clipDoc())

    const caption = document.querySelector(
      "figcaption[data-placeholder='Add caption...']"
    ) as HTMLElement
    expect(caption).not.toBeNull()
    caption.textContent = 'The flow, end to end'
    fireEvent.input(caption)

    const block = useEditorStore.getState().document.content[0]
    expect(block.type).toBe('media')
    if (block.type === 'media') {
      expect(block.kind).toBe('video')
      expect(block.caption).toBe('The flow, end to end')
    }
  })

  // The figure's entire keyboard model hangs off the media element: it is the
  // tab stop, the rail keys on its focus, the caret keys are read from it, and
  // `focusBlockAtStart` reaches the block by querying `[data-showcase-media]`
  // and focusing whatever answers. So this asserts WHICH element carries it,
  // not merely that something does.
  it('hands a clip the same focus and keyboard contract a picture had', () => {
    renderEditor(clipDoc())

    const media = document.querySelector('[data-showcase-media]') as HTMLElement
    expect(media.tagName).toBe('VIDEO')
    expect(media.tabIndex).toBe(0)

    // The caret keys reach the figure's handler from the clip itself.
    fireEvent.keyDown(media, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(
      document.querySelector("figcaption[data-placeholder='Add caption...']")
    )
  })

  it('deletes a clip block from the rail, as it does a picture', () => {
    renderEditor(clipDoc())

    fireEvent.click(screen.getByRole('button', { name: 'Delete image' }))

    expect(useEditorStore.getState().document.content.some((block) => block.type === 'media')).toBe(
      false
    )
  })

  // The insert path's own contribution: the kind comes off the upload's
  // content type and is written down, so an extensionless key survives into
  // the document as a clip rather than being guessed back into a picture.
  it("writes an inserted clip's kind, taking the dialog at its word", () => {
    renderEditor(clipDoc())

    fireEvent.click(screen.getByRole('button', { name: 'Replace image' }))
    fireEvent.click(screen.getByText('insert clip'))

    expect(useEditorStore.getState().document.content[0]).toEqual({
      type: 'media',
      kind: 'video',
      src: 'https://cdn/8f2c-key'
    })
  })

  // ---------------------------------------------------------------------------
  // Link card — an empty card is inserted at once and filled in from its rail
  // ---------------------------------------------------------------------------

  it('inserts an empty link card via the slash menu and focuses it', async () => {
    renderEditor()

    const block = blockAt(0)
    openSlashMenuOnBlock(block)
    fireEvent.click(screen.getByText('link_card'))

    // No dialog: the card lands in the document straight away.
    expect(screen.queryByTestId('image-dialog')).toBeNull()
    const blocks = useEditorStore.getState().document.content
    expect(blocks[0]).toEqual({ type: 'link_card', config: {} })
    expect(blocks[1]?.type).toBe('paragraph')

    await flushTimers()
    const host = document.querySelector('figure [data-showcase-media]') as HTMLElement
    expect(document.activeElement).toBe(host)
  })

  it('deletes the focused link card on Backspace', () => {
    renderEditor([linkCard(), paragraph('after')])

    const host = document.querySelector('[data-showcase-media]') as HTMLElement
    host.focus()
    fireEvent.keyDown(host, { key: 'Backspace' })

    const blocks = useEditorStore.getState().document.content
    expect(blocks.some((block) => block.type === 'link_card')).toBe(false)
    expect(document.querySelector('figure')).toBeNull()
  })

  it('keeps a trailing paragraph after a terminal link card', () => {
    renderEditor([linkCard()])

    const blocks = useEditorStore.getState().document.content
    expect(blocks.map((b) => b.type)).toEqual(['link_card', 'paragraph'])
    expect(document.querySelector("p[data-block-index='1']")).not.toBeNull()
  })

  it('populates the title from the note', () => {
    renderEditor([], { title: 'My Post' })
    // The title is a contentEditable <h1>, seeded via innerHTML by an effect.
    const title = screen.getByLabelText('Title')
    expect(title.textContent).toBe('My Post')
  })

  it('updates the store title when typing in the title input', () => {
    renderEditor()
    const title = screen.getByLabelText('Title')
    // The title reads its text back through `textContent`.
    title.textContent = 'New title'
    fireEvent.input(title)
    expect(useEditorStore.getState().title).toBe('New title')
  })

  it('pressing Enter in title moves focus to first body block', () => {
    renderEditor()
    const title = screen.getByLabelText('Title')
    const firstBlock = blockAt(0)
    const focusSpy = vi.spyOn(firstBlock, 'focus')
    fireEvent.keyDown(title, { key: 'Enter' })
    expect(focusSpy).toHaveBeenCalled()
  })

  it('does not show the slash menu initially', () => {
    renderEditor()
    expect(screen.queryByTestId('slash-menu')).toBeNull()
  })

  it('removes the slash trigger when a slash-menu item is selected', () => {
    renderEditor()

    const block = blockAt(0)
    openSlashMenuOnBlock(block)
    expect(screen.getByTestId('slash-menu')).toBeDefined()

    fireEvent.click(screen.getByText('media'))
    expect(screen.getByTestId('image-dialog')).toBeDefined()
    expect(block.textContent).toBe('')

    fireEvent.click(screen.getByText('close'))
    expect(screen.queryByTestId('image-dialog')).toBeNull()
    expect(block.textContent).toBe('')
  })

  it('keeps the slash when the slash menu is dismissed', () => {
    renderEditor()

    const block = blockAt(0)
    openSlashMenuOnBlock(block)
    expect(screen.getByTestId('slash-menu')).toBeDefined()

    fireEvent.click(screen.getByText('dismiss'))
    expect(screen.queryByTestId('slash-menu')).toBeNull()
    expect(block.textContent).toBe('/')
  })

  it('Backspace at the start of a non-empty heading downgrades it to a paragraph', () => {
    renderEditor([heading('Hello')])

    const block = blockAt(0)
    expect(block).not.toBeNull()

    block.focus()
    const sel = window.getSelection()!
    const range = document.createRange()
    range.setStart(block, 0)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)

    fireEvent.keyDown(block, { key: 'Backspace' })

    const blocks = useEditorStore.getState().document.content
    expect(blocks[0].type).toBe('paragraph')
    expect(
      'children' in blocks[0] && blocks[0].children.some((n) => 'text' in n && n.text === 'Hello')
    ).toBe(true)
  })

  it('Backspace at the start of a non-empty blockquote downgrades it to a paragraph', () => {
    renderEditor([blockquote('A quote')])

    const block = blockAt(0)
    block.focus()
    const sel = window.getSelection()!
    const range = document.createRange()
    range.setStart(block, 0)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)

    fireEvent.keyDown(block, { key: 'Backspace' })

    const blocks = useEditorStore.getState().document.content
    expect(blocks[0].type).toBe('paragraph')
  })

  it('Enter on a heading splits into a heading and a paragraph', () => {
    renderEditor([heading('Hello World')])

    const block = blockAt(0)
    block.focus()
    // Place caret after "Hello " (offset 6 in the text node)
    const textNode = block.firstChild!
    const sel = window.getSelection()!
    const range = document.createRange()
    range.setStart(textNode, 6)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)

    fireEvent.keyDown(block, { key: 'Enter' })

    const blocks = useEditorStore.getState().document.content
    // Original block keeps its type
    expect(blocks[0].type).toBe('heading')
    expect((blocks[0] as { level: number }).level).toBe(2)
    // New block is a default paragraph, not another heading
    expect(blocks[1].type).toBe('paragraph')
  })

  it('⌘B toggles bold on and off over the selection', () => {
    renderEditor([paragraph('Hello World')])

    const block = blockAt(0)
    const firstText = (root: Node): Text => {
      if (root.nodeType === Node.TEXT_NODE) return root as Text
      return firstText(root.firstChild!)
    }
    const selectHello = () => {
      block.focus()
      // The first text node holds "Hello" in both the plain and bolded states
      // (bolded: <strong>Hello</strong> World; plain: "Hello World").
      const textNode = firstText(block)
      const sel = window.getSelection()!
      const range = document.createRange()
      range.setStart(textNode, 0)
      range.setEnd(textNode, 5) // "Hello"
      sel.removeAllRanges()
      sel.addRange(range)
    }

    // First ⌘B applies bold to "Hello".
    selectHello()
    fireEvent.keyDown(block, { key: 'b', metaKey: true })
    let children = (useEditorStore.getState().document.content[0] as { children: InlineNode[] })
      .children
    expect(children[0]).toEqual({
      type: 'text',
      text: 'Hello',
      marks: [{ type: 'bold' }]
    })

    // Second ⌘B over the same selection removes it (toggle off).
    selectHello()
    fireEvent.keyDown(block, { key: 'b', metaKey: true })
    children = (useEditorStore.getState().document.content[0] as { children: InlineNode[] })
      .children
    expect(children[0].marks).toBeUndefined()
    expect(children[0].text).toBe('Hello World')
  })

  it('Backspace on an empty paragraph keeps the following paragraph intact', () => {
    renderEditor([heading('Sub'), paragraph(), paragraph('Following')])

    // Focus the empty paragraph (index 1) and delete it with Backspace.
    const empty = blockAt(1)
    empty.focus()
    fireEvent.keyDown(empty, { key: 'Backspace' })

    const blocks = useEditorStore.getState().document.content
    // Only the empty paragraph is removed — heading + following paragraph remain.
    expect(blocks).toHaveLength(2)
    expect(blocks[0].type).toBe('heading')
    expect(blocks[1].type).toBe('paragraph')
    expect((blocks[1] as { children: InlineNode[] }).children[0].text).toBe('Following')
    // The reused DOM node must show the following paragraph's text, not the
    // deleted paragraph's stale empty content.
    const followingEl = blockAt(1)
    expect(followingEl.textContent).toBe('Following')
  })

  it('Enter on a blockquote splits into a blockquote and a paragraph', () => {
    renderEditor([blockquote('A quote')])

    const block = blockAt(0)
    block.focus()
    const textNode = block.firstChild!
    const sel = window.getSelection()!
    const range = document.createRange()
    range.setStart(textNode, 1)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)

    fireEvent.keyDown(block, { key: 'Enter' })

    const blocks = useEditorStore.getState().document.content
    expect(blocks[0].type).toBe('blockquote')
    expect(blocks[1].type).toBe('paragraph')
  })

  it("renders a subheading eyebrow caption with an 'Add caption...' placeholder", () => {
    renderEditor([heading('Section')])

    const caption = document.querySelector(
      ".article-subheading-caption[data-placeholder='Add caption...']"
    )
    expect(caption).not.toBeNull()
  })

  it('updates the heading caption in the store when typing in the eyebrow', () => {
    renderEditor([heading('Section')])

    const caption = document.querySelector(
      ".article-subheading-caption[data-placeholder='Add caption...']"
    ) as HTMLElement
    caption.textContent = 'Chapter One'
    fireEvent.input(caption)

    const block = useEditorStore.getState().document.content[0]
    expect(block.type).toBe('heading')
    if (block.type === 'heading') {
      expect(block.caption).toBe('Chapter One')
    }
  })

  it('clears the heading caption from the store when the eyebrow is emptied', () => {
    renderEditor([heading('Section', { caption: 'Chapter One' })])

    const caption = document.querySelector(
      ".article-subheading-caption[data-placeholder='Add caption...']"
    ) as HTMLElement
    // Clear both innerText and textContent — jsdom stores innerText separately.
    caption.innerText = ''
    caption.textContent = ''
    fireEvent.input(caption)

    const block = useEditorStore.getState().document.content[0]
    expect(block.type).toBe('heading')
    if (block.type === 'heading') {
      expect(block.caption).toBeUndefined()
    }
  })

  it("renders a blockquote citation caption with an 'Add citation...' placeholder", () => {
    renderEditor([blockquote('A quote')])

    const caption = document.querySelector("cite[data-placeholder='Add citation...']")
    expect(caption).not.toBeNull()
  })

  it('updates the blockquote caption in the store when typing in the citation', () => {
    renderEditor([blockquote('A quote')])

    const caption = document.querySelector(
      "cite[data-placeholder='Add citation...']"
    ) as HTMLElement
    caption.textContent = 'Ada Lovelace'
    fireEvent.input(caption)

    const block = useEditorStore.getState().document.content[0]
    expect(block.type).toBe('blockquote')
    if (block.type === 'blockquote') {
      expect(block.caption).toBe('Ada Lovelace')
    }
  })

  it('clears the blockquote caption from the store when the citation is emptied', () => {
    renderEditor([blockquote('A quote', { caption: 'Ada Lovelace' })])

    const caption = document.querySelector(
      "cite[data-placeholder='Add citation...']"
    ) as HTMLElement
    // Clear both innerText and textContent — jsdom stores innerText separately.
    caption.innerText = ''
    caption.textContent = ''
    fireEvent.input(caption)

    const block = useEditorStore.getState().document.content[0]
    expect(block.type).toBe('blockquote')
    if (block.type === 'blockquote') {
      expect(block.caption).toBeUndefined()
    }
  })

  it('inserts a paragraph after the blockquote when Enter is pressed in the citation caption', () => {
    renderEditor([blockquote('A quote', { caption: 'Ada Lovelace' }), paragraph('Next block')])

    const caption = document.querySelector(
      "cite[data-placeholder='Add citation...']"
    ) as HTMLElement
    caption.focus()
    fireEvent.keyDown(caption, { key: 'Enter' })

    const blocks = useEditorStore.getState().document.content
    expect(blocks).toHaveLength(3)
    expect(blocks[0].type).toBe('blockquote')
    expect(blocks[1].type).toBe('paragraph')
    expect(blocks[2].type).toBe('paragraph')
    if (blocks[1].type === 'paragraph') {
      expect(blocks[1].children.every((c) => c.type === 'text' && !c.text)).toBe(true)
    }
  })

  it('inserts a paragraph above when Enter is pressed at the start of a paragraph', () => {
    renderEditor([paragraph('Hello World')])

    const block = blockAt(0)
    block.focus()
    const textNode = block.firstChild!
    const sel = window.getSelection()!
    const range = document.createRange()
    range.setStart(textNode, 0)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)

    fireEvent.keyDown(block, { key: 'Enter' })

    const blocks = useEditorStore.getState().document.content
    expect(blocks).toHaveLength(2)
    expect(blocks[0].type).toBe('paragraph')
    expect(blocks[1].type).toBe('paragraph')
    if (blocks[0].type === 'paragraph') {
      expect(blocks[0].children.every((c) => c.type === 'text' && !c.text)).toBe(true)
    }
    if (blocks[1].type === 'paragraph') {
      expect(blocks[1].children[0]?.type === 'text' && blocks[1].children[0].text).toBe(
        'Hello World'
      )
    }
  })

  // -------------------------------------------------------------------------
  // Numbered list
  // -------------------------------------------------------------------------

  const listDoc = (t: string): BlockNode[] => [{ type: 'list_item', children: [text(t)] }]

  it('converts the block to a paragraph via the slash menu list_item selection', () => {
    renderEditor()
    const block = blockAt(0)
    block.focus()
    block.textContent = '/'
    placeCaret(block, 1)
    fireEvent.keyUp(block, { key: '/' })
    fireEvent.click(screen.getByText('list_item'))

    const blocks = useEditorStore.getState().document.content
    expect(blocks[0].type).toBe('list_item')
  })

  it('Enter at the end of a list item appends a new empty item after it', () => {
    renderEditor(listDoc('Hello'))
    const block = blockAt(0)
    placeCaret(block, 'Hello'.length)
    fireEvent.keyDown(block, { key: 'Enter' })

    const blocks = useEditorStore.getState().document.content
    // A trailing empty paragraph always follows the list.
    expect(blocks.map((b) => b.type)).toEqual(['list_item', 'list_item', 'paragraph'])
    if (blocks[0].type === 'list_item')
      expect(blocks[0].children[0]).toMatchObject({ text: 'Hello' })
    if (blocks[1].type === 'list_item') expect(blocks[1].children.every((c) => !c.text)).toBe(true)
  })

  it('Enter at the start of a list item prepends an empty item before it', () => {
    renderEditor(listDoc('Hello'))
    const block = blockAt(0)
    placeCaret(block, 0)
    fireEvent.keyDown(block, { key: 'Enter' })

    const blocks = useEditorStore.getState().document.content
    expect(blocks.map((b) => b.type)).toEqual(['list_item', 'list_item', 'paragraph'])
    if (blocks[0].type === 'list_item') expect(blocks[0].children.every((c) => !c.text)).toBe(true)
    if (blocks[1].type === 'list_item')
      expect(blocks[1].children[0]).toMatchObject({ text: 'Hello' })
  })

  it('does not leave stale text in the reused element when prepending a list item', () => {
    // Regression: the index-based key reuses the focused element as the new
    // empty item; without clearing its DOM the text is duplicated into it.
    renderEditor(listDoc('Hello'))
    const block = blockAt(0)
    placeCaret(block, 0)
    fireEvent.keyDown(block, { key: 'Enter' })

    const top = blockAt(0)
    const content = blockAt(1)
    expect(top.textContent).toBe('')
    expect(content.textContent).toBe('Hello')
  })

  it('Enter in the middle of a list item splits it into two items', () => {
    renderEditor(listDoc('HelloWorld'))
    const block = blockAt(0)
    placeCaret(block, 5)
    fireEvent.keyDown(block, { key: 'Enter' })

    const blocks = useEditorStore.getState().document.content
    expect(blocks.map((b) => b.type)).toEqual(['list_item', 'list_item', 'paragraph'])
    if (blocks[0].type === 'list_item')
      expect(blocks[0].children[0]).toMatchObject({ text: 'Hello' })
    if (blocks[1].type === 'list_item')
      expect(blocks[1].children[0]).toMatchObject({ text: 'World' })
  })

  it('keeps a trailing empty paragraph when the last block is a list item', () => {
    renderEditor(listDoc('Hello'))
    const blocks = useEditorStore.getState().document.content
    expect(blocks.map((b) => b.type)).toEqual(['list_item', 'paragraph'])
    const last = blocks[blocks.length - 1]
    expect(last.type).toBe('paragraph')
    if (last.type === 'paragraph') expect(last.children.every((c) => !c.text)).toBe(true)
    expect(document.querySelector("p[data-block-index='1']")).not.toBeNull()
  })

  it('Enter on an empty list item converts it into a paragraph', () => {
    renderEditor(listDoc(''))
    const block = blockAt(0)
    placeCaret(block, 0)
    fireEvent.keyDown(block, { key: 'Enter' })

    const blocks = useEditorStore.getState().document.content
    expect(blocks[0].type).toBe('paragraph')
  })

  // -------------------------------------------------------------------------
  // Bulleted list (shares list behaviour; only the marker differs)
  // -------------------------------------------------------------------------

  const bulletDoc = (t: string): BlockNode[] => [{ type: 'bullet_list_item', children: [text(t)] }]

  const bulletItems = (items: Array<{ text: string; marker?: 'check' | 'cross' }>): BlockNode[] =>
    items.map((it) => ({
      type: 'bullet_list_item',
      children: [text(it.text)],
      ...(it.marker ? { marker: it.marker } : {})
    }))

  it('creates a bullet_list_item via the slash menu', () => {
    renderEditor()
    const block = blockAt(0)
    block.focus()
    block.textContent = '/'
    placeCaret(block, 1)
    fireEvent.keyUp(block, { key: '/' })
    fireEvent.click(screen.getByText('bullet_list_item'))

    const blocks = useEditorStore.getState().document.content
    expect(blocks[0].type).toBe('bullet_list_item')
  })

  it('Enter at the end of a bullet item appends a new bullet item (same type)', () => {
    renderEditor(bulletDoc('Hello'))
    const block = blockAt(0)
    placeCaret(block, 'Hello'.length)
    fireEvent.keyDown(block, { key: 'Enter' })

    const blocks = useEditorStore.getState().document.content
    expect(blocks.map((b) => b.type)).toEqual(['bullet_list_item', 'bullet_list_item', 'paragraph'])
  })

  it('Enter on an empty bullet item converts it into a paragraph', () => {
    renderEditor(bulletDoc(''))
    const block = blockAt(0)
    placeCaret(block, 0)
    fireEvent.keyDown(block, { key: 'Enter' })

    expect(useEditorStore.getState().document.content[0].type).toBe('paragraph')
  })

  it('carries the bullet glyph forward when Enter appends an item after', () => {
    renderEditor(bulletItems([{ text: 'Hello', marker: 'check' }]))
    const block = blockAt(0)
    placeCaret(block, 'Hello'.length)
    fireEvent.keyDown(block, { key: 'Enter' })

    const blocks = useEditorStore.getState().document.content
    if (blocks[1].type === 'bullet_list_item') expect(blocks[1].marker).toBe('check')
  })

  it('carries the bullet glyph forward when Enter prepends an item before', () => {
    renderEditor(bulletItems([{ text: 'Hello', marker: 'cross' }]))
    const block = blockAt(0)
    placeCaret(block, 0)
    fireEvent.keyDown(block, { key: 'Enter' })

    const blocks = useEditorStore.getState().document.content
    // The new empty item is prepended; the "Hello" item shifts to index 1.
    if (blocks[0].type === 'bullet_list_item') expect(blocks[0].marker).toBe('cross')
    if (blocks[1].type === 'bullet_list_item')
      expect(blocks[1].children[0]).toMatchObject({ text: 'Hello' })
  })

  it('carries the bullet glyph forward when Enter splits an item', () => {
    renderEditor(bulletItems([{ text: 'HelloWorld', marker: 'check' }]))
    const block = blockAt(0)
    placeCaret(block, 5)
    fireEvent.keyDown(block, { key: 'Enter' })

    const blocks = useEditorStore.getState().document.content
    if (blocks[0].type === 'bullet_list_item') expect(blocks[0].marker).toBe('check')
    if (blocks[1].type === 'bullet_list_item') expect(blocks[1].marker).toBe('check')
  })

  it('resets a bullet run to the default dot via the popover', () => {
    renderEditor(
      bulletItems([
        { text: 'A', marker: 'check' },
        { text: 'B', marker: 'check' }
      ])
    )
    const marker = document.querySelectorAll('[data-bullet-marker]')[0] as HTMLElement
    fireEvent.click(marker)
    fireEvent.click(screen.getByLabelText('Reset bullets to the default style'))

    const blocks = useEditorStore.getState().document.content
    if (blocks[0].type === 'bullet_list_item') expect(blocks[0].marker).toBeUndefined()
    if (blocks[1].type === 'bullet_list_item') expect(blocks[1].marker).toBeUndefined()
  })

  it("continues the previous bullet run's style via the popover", () => {
    renderEditor([
      { type: 'bullet_list_item', children: [text('A')], marker: 'cross' },
      paragraph('gap'),
      { type: 'bullet_list_item', children: [text('B')] }
    ])
    const markers = document.querySelectorAll('[data-bullet-marker]')
    // The second run's marker button is the last one.
    fireEvent.click(markers[markers.length - 1] as HTMLElement)
    fireEvent.click(screen.getByLabelText('Continue bullets from previous list'))

    const blocks = useEditorStore.getState().document.content
    if (blocks[2].type === 'bullet_list_item') expect(blocks[2].marker).toBe('cross')
  })

  it('Backspace at the start of a paragraph merges it into a preceding bullet item without duplicating text', () => {
    renderEditor([
      { type: 'bullet_list_item', children: [text('Item')], marker: 'check' },
      paragraph('Tail')
    ])
    const para = blockAt(1)
    placeCaret(para, 0)
    fireEvent.keyDown(para, { key: 'Backspace' })

    const blocks = useEditorStore.getState().document.content
    // Paragraph merges into the bullet; a synthetic trailing paragraph follows
    // the now-terminal list item.
    expect(blocks.map((b) => b.type)).toEqual(['bullet_list_item', 'paragraph'])
    if (blocks[0].type === 'bullet_list_item') {
      expect(blocks[0].children[0]).toMatchObject({ text: 'ItemTail' })
      expect(blocks[0].marker).toBe('check')
    }
    // Regression: the reused (previously-focused) DOM node must show the empty
    // trailing paragraph, not the deleted paragraph's stale, duplicated "Tail".
    const itemEl = blockAt(0)
    const trailingEl = blockAt(1)
    expect(itemEl.textContent).toBe('ItemTail')
    expect(trailingEl.textContent).toBe('')
  })

  it('inserts a paragraph above when Enter is pressed at the start of a heading', () => {
    renderEditor([heading('Title')])

    const block = blockAt(0)
    block.focus()
    const textNode = block.firstChild!
    const sel = window.getSelection()!
    const range = document.createRange()
    range.setStart(textNode, 0)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)

    fireEvent.keyDown(block, { key: 'Enter' })

    const blocks = useEditorStore.getState().document.content
    expect(blocks).toHaveLength(2)
    expect(blocks[0].type).toBe('paragraph')
    expect(blocks[1].type).toBe('heading')
    if (blocks[1].type === 'heading') {
      expect(blocks[1].children[0]?.type === 'text' && blocks[1].children[0].text).toBe('Title')
    }
  })
})

// ---------------------------------------------------------------------------
// Selection toolbar
// ---------------------------------------------------------------------------

describe('ArticleEditor selection toolbar', () => {
  beforeEach(() => {
    useEditorStore.getState().reset()
  })

  afterEach(() => {
    cleanup()
    useEditorStore.getState().reset()
  })

  function seedParagraph(t: string) {
    renderEditor([paragraph(t)])
    return blockAt(0)
  }

  function selectRange(el: HTMLElement, start: number, end: number) {
    const textNode = el.firstChild!
    const sel = window.getSelection()!
    const range = document.createRange()
    range.setStart(textNode, start)
    range.setEnd(textNode, end)
    sel.removeAllRanges()
    sel.addRange(range)
    act(() => {
      document.dispatchEvent(new Event('selectionchange'))
    })
  }

  it('shows the format toolbar on a non-collapsed selection and toggles bold', () => {
    const block = seedParagraph('hello world')
    block.focus()
    selectRange(block, 0, 5)

    const toolbar = screen.getByRole('toolbar', { name: 'Format selection' })
    expect(toolbar).toBeDefined()

    fireEvent.click(screen.getByLabelText('Bold'))

    const nodes = (useEditorStore.getState().document.content[0] as { children: InlineNode[] })
      .children
    const bolded = nodes.find((n) => (n.marks ?? []).some((m: Mark) => m.type === 'bold'))
    expect(bolded?.text).toBe('hello')
  })

  it('applies a link through the link editor', () => {
    const block = seedParagraph('click me')
    block.focus()
    selectRange(block, 0, 5)

    fireEvent.click(screen.getByLabelText('Add link'))

    const input = screen.getByLabelText('Link URL') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'https://example.com' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    const nodes = (useEditorStore.getState().document.content[0] as { children: InlineNode[] })
      .children
    const linked = nodes.find((n) => (n.marks ?? []).some((m: Mark) => m.type === 'link'))
    expect(linked?.text).toBe('click')
    const linkMark = linked?.marks?.find((m: Mark) => m.type === 'link')
    expect(linkMark && linkMark.type === 'link' && linkMark.href).toBe('https://example.com')
  })

  // --- anchoring across a soft wrap -----------------------------------------
  // jsdom has no layout, so the browser's client rects are faked: the fragments
  // a real engine reports for a selection that begins at a wrap boundary — the
  // space that ends the previous visual line (far right, one line up), then the
  // glyphs on the next line.
  const WRAP_TAIL = { left: 900, top: 100, width: 4, height: 20 }
  const NEXT_LINE = { left: 20, top: 130, width: 8, height: 20 }

  function fakeClientRects(rectsFor: (t: string) => (typeof WRAP_TAIL)[]) {
    const original = Range.prototype.getClientRects
    Range.prototype.getClientRects = function (this: Range) {
      const rects = rectsFor(this.toString())
      return Object.assign([...rects], {
        item: (i: number) => rects[i] ?? null
      }) as unknown as DOMRectList
    }
    return () => {
      Range.prototype.getClientRects = original
    }
  }

  it('anchors to the first visible glyph when the selection starts at a soft wrap', () => {
    // The leading space belongs to the previous line, so its rect hangs at the
    // far right of the line above — the toolbar must ignore it.
    const restore = fakeClientRects((t) =>
      t.startsWith(' ') ? [WRAP_TAIL, NEXT_LINE] : [NEXT_LINE]
    )
    try {
      const block = seedParagraph('one two three')
      block.focus()
      selectRange(block, 3, 5) // " t" — wrap space + first glyph of the line

      const anchor = document.querySelector('[data-popover-anchor]') as HTMLElement
      expect(anchor.style.left).toBe(`${NEXT_LINE.left}px`)
      expect(anchor.style.top).toBe(`${NEXT_LINE.top}px`)
    } finally {
      restore()
    }
  })

  it('ignores an empty leading fragment left on the previous line', () => {
    // A wrap with no space to swallow reports a zero-width fragment instead.
    const restore = fakeClientRects(() => [{ ...WRAP_TAIL, width: 0 }, NEXT_LINE])
    try {
      const block = seedParagraph('one two three')
      block.focus()
      selectRange(block, 4, 7)

      const anchor = document.querySelector('[data-popover-anchor]') as HTMLElement
      expect(anchor.style.left).toBe(`${NEXT_LINE.left}px`)
      expect(anchor.style.top).toBe(`${NEXT_LINE.top}px`)
    } finally {
      restore()
    }
  })
})

// ---------------------------------------------------------------------------
// ⌘S / Ctrl+S — hand the snapshot back at once
//
// kartik.to saved a draft over the network here; newline has no drafts or
// router. The editor's only outlet is `onChange`, which the app writes to
// SQLite: debounced after a dirty change, immediately on ⌘S.
// ---------------------------------------------------------------------------

describe('ArticleEditor ⌘S onChange', () => {
  const DIRTY_DOC: Document = {
    type: 'doc',
    content: [{ type: 'paragraph', children: [{ type: 'text', text: 'edited' }] }]
  }

  function pressSave(init: KeyboardEventInit = { metaKey: true }) {
    return act(async () => {
      document.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 's',
          bubbles: true,
          cancelable: true,
          ...init
        })
      )
      await Promise.resolve()
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    useEditorStore.getState().reset()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    useEditorStore.getState().reset()
  })

  it('hands the current snapshot to onChange at once on ⌘S and marks the store clean', async () => {
    const onChange = vi.fn()
    renderEditor([], { title: 'Existing', onChange })

    // Make an unsaved edit.
    act(() => useEditorStore.getState().setDocument(DIRTY_DOC))
    expect(useEditorStore.getState().isDirty).toBe(true)

    await pressSave()

    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ title: 'Existing', document: DIRTY_DOC })
    expect(useEditorStore.getState().isDirty).toBe(false)
  })

  it('answers Ctrl+S the same way', async () => {
    const onChange = vi.fn()
    renderEditor([], { title: 'Existing', onChange })

    act(() => useEditorStore.getState().setDocument(DIRTY_DOC))
    await pressSave({ ctrlKey: true })

    expect(onChange).toHaveBeenCalledWith({ title: 'Existing', document: DIRTY_DOC })
    expect(useEditorStore.getState().isDirty).toBe(false)
  })

  it('is a no-op when there are no unsaved changes', async () => {
    const onChange = vi.fn()
    renderEditor([], { title: 'Clean', onChange })
    // The initial load leaves isDirty false.
    expect(useEditorStore.getState().isDirty).toBe(false)

    await pressSave()

    expect(onChange).not.toHaveBeenCalled()
  })

  it('reaches onChange on the debounced path too, without a keystroke', () => {
    vi.useFakeTimers()
    const onChange = vi.fn()
    renderEditor([], { title: 'Existing', onChange })

    act(() => useEditorStore.getState().setDocument(DIRTY_DOC))
    expect(onChange).not.toHaveBeenCalled()

    // Still inside the debounce window: nothing has gone out yet.
    act(() => {
      vi.advanceTimersByTime(499)
    })
    expect(onChange).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenCalledWith({ title: 'Existing', document: DIRTY_DOC })
    expect(useEditorStore.getState().isDirty).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Numbered-list marker popover (continue / reset / swap style)
// ---------------------------------------------------------------------------

describe('ArticleEditor numbering popover', () => {
  beforeEach(() => {
    useEditorStore.getState().reset()
  })

  afterEach(() => {
    cleanup()
    useEditorStore.getState().reset()
  })

  const listItem = (t: string): BlockNode => ({ type: 'list_item', children: [text(t)] })

  const markers = () =>
    Array.from(document.querySelectorAll('[data-numbering-marker]')).map((el) => el.textContent)

  const openPopoverForMarker = (i: number) => {
    const marker = document.querySelectorAll('[data-numbering-marker]')[i]
    fireEvent.click(marker)
  }

  it('opens the numbering popover when a marker is clicked', () => {
    renderEditor([listItem('one'), listItem('two')])
    expect(screen.queryByRole('toolbar', { name: 'List numbering options' })).toBeNull()

    openPopoverForMarker(0)

    expect(screen.getByRole('toolbar', { name: 'List numbering options' })).toBeDefined()
  })

  it('reset numbering restarts the counter at the clicked item', () => {
    renderEditor([listItem('one'), listItem('two'), listItem('three')])
    expect(markers()).toEqual(['1', '2', '3'])

    openPopoverForMarker(2)
    fireEvent.click(screen.getByLabelText('Reset numbering at this item'))

    const block = useEditorStore.getState().document.content[2]
    expect(block.type === 'list_item' && block.start).toBe(1)
    expect(markers()).toEqual(['1', '2', '1'])
  })

  it('swaps the run to lettered markers and back', () => {
    renderEditor([listItem('one'), listItem('two'), listItem('three')])

    openPopoverForMarker(0)
    fireEvent.click(screen.getByLabelText('Switch to lettered list'))

    expect(markers()).toEqual(['a', 'b', 'c'])
    const head = useEditorStore.getState().document.content[0]
    expect(head.type === 'list_item' && head.marker).toBe('alpha')

    // The third button now offers switching back to numbers.
    openPopoverForMarker(1)
    fireEvent.click(screen.getByLabelText('Switch to numbered list'))
    expect(markers()).toEqual(['1', '2', '3'])
  })

  it('continue numbering picks up from the previous list', () => {
    renderEditor([
      listItem('a'),
      listItem('b'),
      listItem('c'),
      paragraph('gap'),
      listItem('d'),
      listItem('e')
    ])
    expect(markers()).toEqual(['1', '2', '3', '1', '2'])

    openPopoverForMarker(3) // head of the second list
    fireEvent.click(screen.getByLabelText('Continue numbering from previous list'))

    expect(markers()).toEqual(['1', '2', '3', '4', '5'])
    const head = useEditorStore.getState().document.content[4]
    expect(head.type === 'list_item' && head.continued).toBe(true)
  })

  it('continue numbering is a no-op when no list precedes it', () => {
    renderEditor([listItem('only'), listItem('list')])

    openPopoverForMarker(0)
    fireEvent.click(screen.getByLabelText('Continue numbering from previous list'))

    const head = useEditorStore.getState().document.content[0]
    expect(head.type === 'list_item' && head.continued).toBeUndefined()
    expect(markers()).toEqual(['1', '2'])
  })
})

// ---------------------------------------------------------------------------
// Block indentation (Tab / Shift+Tab)
// ---------------------------------------------------------------------------

describe('ArticleEditor block indent', () => {
  beforeEach(() => {
    useEditorStore.getState().reset()
  })

  afterEach(() => {
    cleanup()
    useEditorStore.getState().reset()
  })

  function seed(block: BlockNode) {
    renderEditor([block])
    return blockAt(0)
  }

  function caretAtStart(el: HTMLElement) {
    const sel = window.getSelection()!
    const range = document.createRange()
    range.setStart(el.firstChild ?? el, 0)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  function caretAtEnd(el: HTMLElement) {
    const sel = window.getSelection()!
    const range = document.createRange()
    range.selectNodeContents(el)
    range.collapse(false)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  const para = (t: string): BlockNode => ({ type: 'paragraph', children: [text(t)] })

  const indentOf = (i = 0) => {
    const b = useEditorStore.getState().document.content[i]
    return (b as { indent?: boolean }).indent
  }

  it('indents a paragraph on Tab at the start', () => {
    const el = seed(para('hello'))
    el.focus()
    caretAtStart(el)

    fireEvent.keyDown(el, { key: 'Tab' })

    expect(indentOf()).toBe(true)
    expect(document.querySelector("p[data-block-index='0'][data-indented]")).not.toBeNull()
  })

  it('outdents on Shift+Tab', () => {
    const el = seed({ ...para('hello'), indent: true } as BlockNode)
    el.focus()
    caretAtStart(el)

    fireEvent.keyDown(el, { key: 'Tab', shiftKey: true })

    expect(indentOf()).toBeUndefined()
    expect(document.querySelector("[data-block-index='0'][data-indented]")).toBeNull()
  })

  it('Tab on an already-indented block is a no-op', () => {
    const el = seed({ ...para('hello'), indent: true } as BlockNode)
    el.focus()
    caretAtStart(el)

    fireEvent.keyDown(el, { key: 'Tab' })

    expect(indentOf()).toBe(true)
  })

  it('Shift+Tab on a non-indented block is a no-op', () => {
    const el = seed(para('hello'))
    el.focus()
    caretAtStart(el)

    fireEvent.keyDown(el, { key: 'Tab', shiftKey: true })

    expect(indentOf()).toBeUndefined()
  })

  it('indents with the caret anywhere in the block (not just the start)', () => {
    const el = seed(para('hello'))
    el.focus()
    caretAtEnd(el)

    fireEvent.keyDown(el, { key: 'Tab' })

    expect(indentOf()).toBe(true)
  })

  it('carries the indent to the new paragraph when splitting mid-block', () => {
    const el = seed({ ...para('hello world'), indent: true } as BlockNode)
    el.focus()
    // Caret between "hello" and " world".
    const sel = window.getSelection()!
    const range = document.createRange()
    range.setStart(el.firstChild!, 5)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)

    fireEvent.keyDown(el, { key: 'Enter' })

    const content = useEditorStore.getState().document.content
    expect((content[0] as { indent?: boolean }).indent).toBe(true)
    expect((content[1] as { indent?: boolean }).indent).toBe(true)
    expect(content[1].type).toBe('paragraph')
  })

  it('carries the indent to a new block on Enter at the end', () => {
    const el = seed({ ...para('hello'), indent: true } as BlockNode)
    el.focus()
    caretAtEnd(el)

    fireEvent.keyDown(el, { key: 'Enter' })

    const content = useEditorStore.getState().document.content
    expect((content[1] as { indent?: boolean }).indent).toBe(true)
  })

  it('carries the indent to the empty paragraph on Enter at the start', () => {
    const el = seed({ ...para('hello'), indent: true } as BlockNode)
    el.focus()
    caretAtStart(el)

    fireEvent.keyDown(el, { key: 'Enter' })

    // Both the new empty paragraph and the shifted content stay indented.
    const content = useEditorStore.getState().document.content
    expect((content[0] as { indent?: boolean }).indent).toBe(true)
    expect((content[1] as { indent?: boolean }).indent).toBe(true)
  })

  it('splitting an indented heading yields an indented paragraph', () => {
    const el = seed(heading('Title', { indent: true }))
    el.focus()
    caretAtEnd(el)

    fireEvent.keyDown(el, { key: 'Enter' })

    const content = useEditorStore.getState().document.content
    expect(content[0].type).toBe('heading')
    expect((content[0] as { indent?: boolean }).indent).toBe(true)
    expect(content[1].type).toBe('paragraph')
    expect((content[1] as { indent?: boolean }).indent).toBe(true)
  })

  it('indents a blockquote on Tab', () => {
    const el = seed(blockquote('quote'))
    el.focus()
    caretAtStart(el)

    fireEvent.keyDown(el, { key: 'Tab' })

    expect(indentOf()).toBe(true)
  })

  it('indents a metric on Tab', () => {
    const el = seed({ type: 'metric', children: [text('$1M')] })
    el.focus()
    caretAtStart(el)

    fireEvent.keyDown(el, { key: 'Tab' })

    expect(indentOf()).toBe(true)
  })

  // fireEvent.keyDown returns false when a handler called preventDefault — i.e.
  // Tab was swallowed and won't move the caret to the next node.
  it('swallows Tab on a list item without indenting', () => {
    const el = seed({ type: 'list_item', children: [text('item')] })
    el.focus()
    caretAtStart(el)

    const notPrevented = fireEvent.keyDown(el, { key: 'Tab' })

    expect(notPrevented).toBe(false)
    expect(indentOf()).toBeUndefined()
  })

  it('swallows Tab in a code block', () => {
    const el = seed({ type: 'code_block', children: [text('const x = 1')] })
    el.focus()
    caretAtStart(el)

    expect(fireEvent.keyDown(el, { key: 'Tab' })).toBe(false)
  })

  it('swallows Tab in the title', () => {
    seed(para('body'))
    const title = document.querySelector('#article-title') as HTMLElement
    title.focus()

    expect(fireEvent.keyDown(title, { key: 'Tab' })).toBe(false)
  })

  it('swallows Shift+Tab on a list item (no outdent jump)', () => {
    const el = seed({ type: 'list_item', children: [text('item')] })
    el.focus()
    caretAtStart(el)

    expect(fireEvent.keyDown(el, { key: 'Tab', shiftKey: true })).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Bulleted-list marker popover (dot / check / cross)
// ---------------------------------------------------------------------------

describe('ArticleEditor bullet popover', () => {
  beforeEach(() => {
    useEditorStore.getState().reset()
  })

  afterEach(() => {
    cleanup()
    useEditorStore.getState().reset()
  })

  const bullet = (t: string, marker?: 'check' | 'cross'): BlockNode => ({
    type: 'bullet_list_item',
    ...(marker ? { marker } : {}),
    children: [text(t)]
  })

  const openPopover = (i: number) => {
    const marker = document.querySelectorAll('[data-bullet-marker]')[i]
    fireEvent.click(marker)
  }

  const markerOf = (i: number) => {
    const b = useEditorStore.getState().document.content[i]
    return b.type === 'bullet_list_item' ? b.marker : undefined
  }

  it('opens the bullet popover when a bullet is clicked', () => {
    renderEditor([bullet('one'), bullet('two')])
    expect(screen.queryByRole('toolbar', { name: 'List bullet options' })).toBeNull()

    openPopover(0)

    expect(screen.getByRole('toolbar', { name: 'List bullet options' })).toBeDefined()
    // Default (dot) option is selected.
    expect(screen.getByLabelText('Bulleted list').getAttribute('aria-pressed')).toBe('true')
  })

  it("sets the check glyph when 'Checked list' is chosen", () => {
    renderEditor([bullet('one')])
    openPopover(0)
    fireEvent.click(screen.getByLabelText('Checked list'))

    expect(markerOf(0)).toBe('check')
    // The marker button now renders a glyph circle instead of the bare dot.
    // The glyph is masked onto the circle so the brand gradient can reach it,
    // so the shape shows up as a class on the circle rather than a child <svg>.
    expect(document.querySelector('[data-bullet-marker] .list-bullet-circle-check')).not.toBeNull()
  })

  it("sets the cross glyph when 'Crossed list' is chosen", () => {
    renderEditor([bullet('one')])
    openPopover(0)
    fireEvent.click(screen.getByLabelText('Crossed list'))

    expect(markerOf(0)).toBe('cross')
    expect(document.querySelector('[data-bullet-marker] .list-bullet-circle-cross')).not.toBeNull()
  })

  it("returns to the default dot when 'Bulleted list' is chosen", () => {
    renderEditor([bullet('one', 'check')])
    openPopover(0)
    fireEvent.click(screen.getByLabelText('Bulleted list'))

    expect(markerOf(0)).toBeUndefined()
    expect(document.querySelector('[data-bullet-marker] .list-bullet-circle')).toBeNull()
  })

  it('styles bullets per-item (one check, one default)', () => {
    renderEditor([bullet('one', 'check'), bullet('two')])
    expect(markerOf(0)).toBe('check')
    expect(markerOf(1)).toBeUndefined()
  })
})
