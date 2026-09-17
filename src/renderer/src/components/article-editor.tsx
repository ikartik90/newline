import React, { useEffect, useRef, useState } from 'react'
import type { BlockNode, InlineNode, Mark } from '@shared/domain/nodes'
import type { Document } from '@shared/domain/document'
import { useEditorStore } from '@/store/editor'
import { SlashMenu, slashMenuHasResults, type SlashMenuBlockType } from '@/components/slash-menu'
import {
  SelectionToolbar,
  type SelectionToolbarMode,
  type ToggleableMark
} from '@/components/selection-toolbar'
import { ImageInsertDialog, type ImageDialogMode } from '@/components/image-insert-dialog'
import type { ImageInsertPayload } from '@/hooks/use-image-insert'
import { NumberToolbar } from '@/components/number-toolbar'
import { BulletToolbar, type BulletStyle } from '@/components/bullet-toolbar'
import { computeListNumbering, type ListMarkerStyle } from '@/utils/list-numbering'
import { SidenoteLayer } from '@/components/sidenote-layer'
import {
  collectSidenotes,
  makeSidenoteId,
  sidenoteBases,
  type SidenoteEntry
} from '@/utils/sidenotes'
import { typographyStyles } from '@/components/ui/typography'
import { EditableBlock } from './editor/editable-block'
import { domToInlineNodes, inlineNodesToHtml } from './editor/inline-html'
import {
  findTextPositionAtOffset,
  firstTextNode,
  getSelectionOffsets,
  isCaretAtEnd,
  isCaretAtLastLine,
  isFocusAtLastLine,
  lastTextNode,
  placeCaret,
  setCursorAtTextOffset,
  setSelectionRange
} from './editor/caret'
import {
  findLinkRangeAt,
  findSidenoteRangeAt,
  normalizeLinkHref,
  rangeHasMark,
  transformMarksInRange
} from './editor/marks'
import {
  emptyParagraphBlock,
  ensureBlocks,
  hasSyntheticTrailingParagraph,
  isCaretlessBlock,
  isListItemType,
  mediaNodeFrom,
  withTrailingParagraph,
  type ListItemType
} from './editor/blocks'
import { editableBaseStyle } from './editor/styles'

// The pure helpers stay reachable from here so the editor's own tests can
// exercise them beside the component, as kartik.to's do.
export {
  domToInlineNodes,
  inlineNodesToHtml,
  renumberSidenoteSups,
  stripEmptySidenoteWrappers
} from './editor/inline-html'
export {
  findLinkRangeAt,
  findSidenoteRangeAt,
  mergeAdjacentInlineNodes,
  normalizeLinkHref,
  rangeHasMark,
  transformMarksInRange
} from './editor/marks'

// ---------------------------------------------------------------------------
// ArticleEditor
// ---------------------------------------------------------------------------

/** What the editor hands back whenever the note changes. */
export interface EditorSnapshot {
  title: string
  document: Document
}

export interface ArticleEditorProps {
  /** The note being edited. Changing the id reloads the editor. */
  noteId: string
  initialTitle: string
  initialDocument: Document
  /**
   * Called, debounced, whenever the title or document changes — the app
   * writes it to SQLite. ⌘S calls it immediately.
   */
  onChange?: (snapshot: EditorSnapshot) => void
  /** Whether the note has a title to edit above the body. */
  showTitle?: boolean
}

/** The block types the slash menu offers on a line that already has text. */
const CONVERTIBLE_TYPES: SlashMenuBlockType[] = [
  'heading',
  'paragraph',
  'blockquote',
  'list_item',
  'bullet_list_item',
  'metric',
  'code_block'
]

/** Viewport-relative rect used to anchor the floating selection toolbar. */
interface ToolbarRect {
  left: number
  top: number
  width: number
  height: number
}

interface ToolbarState {
  mode: SelectionToolbarMode
  /** Index of the block the toolbar operates on. */
  index: number
  /** Anchor rect in article coordinates. */
  rect: ToolbarRect
  /** Character range within the block the toolbar targets. */
  range: { start: number; end: number }
  /** Existing link href (link-view / link-edit). */
  href?: string
  /** Target sidenote id (sidenote-view). */
  sidenoteId?: string
  /** Mark types the selection fully carries (drives active button state). */
  activeMarks: Set<Mark['type']>
}

const TOOLBAR_MARK_TYPES: Mark['type'][] = [
  'bold',
  'italic',
  'code',
  'underline',
  'strikethrough',
  'highlight',
  'link',
  'sidenote'
]

const CHANGE_DEBOUNCE_MS = 500

export function ArticleEditor({
  noteId,
  initialTitle,
  initialDocument,
  onChange,
  showTitle = true
}: ArticleEditorProps) {
  const { title, setTitle, document: doc, setDocument, pushHistory } = useEditorStore()

  // Populate the store from the note on mount and whenever the note changes;
  // reset on unmount.
  useEffect(() => {
    useEditorStore.getState().load({
      noteId,
      title: initialTitle,
      document: { ...initialDocument, content: withTrailingParagraph(initialDocument.content) }
    })
    return () => useEditorStore.getState().reset()
    // Keyed on identity: re-seeding on every new prop reference would wipe
    // in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  // Hand every change back to the app, debounced, and mark the store clean
  // once it has gone out. Re-read at fire time so a save between scheduling
  // and firing cannot be undone by a stale snapshot.
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null
    const unsubscribe = useEditorStore.subscribe((state) => {
      if (!state.isDirty) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        const s = useEditorStore.getState()
        if (!s.isDirty) return
        onChangeRef.current?.({ title: s.title, document: s.document })
        s.setDirty(false)
      }, CHANGE_DEBOUNCE_MS)
    })
    return () => {
      if (timer) clearTimeout(timer)
      unsubscribe()
    }
  }, [])

  // ⌘S / Ctrl+S → hand the current state back at once.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return
      if (e.key !== 's' && e.key !== 'S') return
      e.preventDefault()
      const s = useEditorStore.getState()
      if (!s.isDirty) return
      onChangeRef.current?.({ title: s.title, document: s.document })
      s.setDirty(false)
    }
    document.addEventListener('keydown', onKeyDown, { capture: true })
    return () => document.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [])

  const blocks = ensureBlocks(doc)
  // Distinct-note count before each block — offsets each block's own sidenote
  // ordinals to their global values when serialising it independently.
  const sidenoteBaseList = sidenoteBases(blocks)
  const blockRefs = useRef<(HTMLElement | null)[]>([])
  const titleRef = useRef<HTMLHeadingElement>(null)
  // Index of the editing host where the current pointer-drag started.
  // -1 = title, 0+ = block index, null = no active drag.
  const dragAnchorIdx = useRef<number | null>(null)
  // Holds the latest cross-block keyboard handler so the document listener
  // registered once always calls current logic.
  const crossBlockDeleteRef = useRef<(e: KeyboardEvent) => void>(() => {})
  // Timer for batching rapid text-input changes into a single history entry.
  const historyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** Push the current store state as a new history snapshot immediately. */
  function pushHistoryNow() {
    const s = useEditorStore.getState()
    pushHistory({ title: s.title, document: s.document })
  }

  /** Push a history snapshot after a brief pause (batches consecutive keystrokes). */
  function pushHistoryDebounced() {
    if (historyTimerRef.current) clearTimeout(historyTimerRef.current)
    historyTimerRef.current = setTimeout(pushHistoryNow, 500)
  }

  /** Cancel any pending debounced push (call before a structural operation). */
  function cancelHistoryDebounce() {
    if (historyTimerRef.current) {
      clearTimeout(historyTimerRef.current)
      historyTimerRef.current = null
    }
  }

  // Cross-block mouse-drag selection. Chromium clips a drag-selection at the
  // editing host boundary; when the pointer crosses into another host, extend
  // the selection there by hand.
  useEffect(() => {
    function blockIdxForNode(node: Node | null): number | null {
      if (!node) return null
      const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
      if (!el) return null
      if (titleRef.current?.contains(el)) return -1
      for (let i = 0; i < blockRefs.current.length; i++) {
        if (blockRefs.current[i]?.contains(el)) return i
      }
      return null
    }

    function onPointerDown(e: PointerEvent) {
      dragAnchorIdx.current = blockIdxForNode(e.target as Node | null)
    }

    function onPointerMove(e: PointerEvent) {
      if (e.buttons !== 1 || dragAnchorIdx.current === null) return
      const el = document.elementFromPoint(e.clientX, e.clientY)
      const currentIdx = blockIdxForNode(el)
      if (currentIdx === null || currentIdx === dragAnchorIdx.current) return
      const sel = window.getSelection()
      if (!sel || !sel.anchorNode) return
      const range = document.caretRangeFromPoint(e.clientX, e.clientY)
      if (
        range &&
        !(range.startContainer === sel.focusNode && range.startOffset === sel.focusOffset)
      ) {
        sel.extend(range.startContainer, range.startOffset)
      }
    }

    function onPointerUp() {
      dragAnchorIdx.current = null
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerup', onPointerUp)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
    }
  }, [])

  // ⌘A while any editor element is focused → select from title start to
  // last-block end.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!((e.metaKey || e.ctrlKey) && e.key === 'a')) return
      const focused = document.activeElement
      const inTitle = focused === titleRef.current || titleRef.current?.contains(focused) === true
      const inBlock = blockRefs.current.some(
        (el) => el === focused || el?.contains(focused) === true
      )
      if (!inTitle && !inBlock) return

      e.preventDefault()

      const firstEl = titleRef.current ?? blockRefs.current.find((el) => el != null)
      const lastEl = blockRefs.current.findLast((el) => el != null) ?? titleRef.current
      if (!firstEl || !lastEl) return

      const startNode: Node = firstTextNode(firstEl) ?? firstEl
      const endNode: Node = lastTextNode(lastEl) ?? lastEl
      const endOffset =
        endNode.nodeType === Node.TEXT_NODE
          ? (endNode as Text).length
          : (endNode as Element).childNodes.length

      window.getSelection()?.setBaseAndExtent(startNode, 0, endNode, endOffset)
    }

    document.addEventListener('keydown', onKeyDown, { capture: true })
    return () => document.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [])

  // Delete / Backspace across editing hosts.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      crossBlockDeleteRef.current(e)
    }
    document.addEventListener('keydown', onKeyDown, { capture: true })
    return () => document.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [])

  // ⌘Z (undo) and ⌘⇧Z (redo) while focus is in the editor. Blurs the focused
  // element first so EditableBlock's DOM-sync effect is not blocked by the
  // "skip if focused" guard, then re-focuses the same block index.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey) || (e.key !== 'z' && e.key !== 'Z')) return

      const focused = document.activeElement as HTMLElement | null
      const inTitle = focused === titleRef.current || titleRef.current?.contains(focused) === true
      const focusedBlockIdx = blockRefs.current.findIndex(
        (el) => el === focused || el?.contains(focused) === true
      )
      if (!inTitle && focusedBlockIdx === -1) return

      e.preventDefault()

      const store = useEditorStore.getState()
      const isRedo = e.shiftKey

      if (isRedo) {
        if (store.historyIndex >= store.history.length - 1) return
      } else {
        if (store.historyIndex <= 0) return
      }

      cancelHistoryDebounce()
      focused?.blur()

      if (isRedo) store.redo()
      else store.undo()

      const targetIdx = inTitle ? -1 : focusedBlockIdx
      setTimeout(() => {
        if (targetIdx === -1) {
          titleRef.current?.focus()
          return
        }
        const currentBlocks = blockRefs.current.filter(Boolean)
        const idx = Math.min(targetIdx, Math.max(0, currentBlocks.length - 1))
        const el =
          blockRefs.current.find((e, i) => e != null && i === idx) ??
          blockRefs.current.find((e) => e != null)
        if (el) placeCaret(el, 'end')
      }, 0)
    }

    document.addEventListener('keydown', onKeyDown, { capture: true })
    return () => document.removeEventListener('keydown', onKeyDown, { capture: true })
  }, [])

  // Update the title DOM imperatively when the store title changes, but skip
  // while the user has focus there so we never reset their cursor.
  useEffect(() => {
    if (titleRef.current && document.activeElement !== titleRef.current) {
      titleRef.current.innerText = title
    }
  }, [title])

  // Slash menu state
  const [slashAnchor, setSlashAnchor] = useState<{
    el: HTMLElement
    index: number
    /** True when the menu was opened on a block that already had text content
     *  beyond the triggering "/". Suppresses content-as-query behaviour. */
    hasExistingContent: boolean
  } | null>(null)
  const [slashQuery, setSlashQuery] = useState('')
  const [imageDialogOpen, setImageDialogOpen] = useState(false)
  const [imageDialogMode, setImageDialogMode] = useState<ImageDialogMode>('insert')
  const [imageDialogBlockIndex, setImageDialogBlockIndex] = useState<number | null>(null)

  // Floating selection toolbar (formatting / link editing / link actions).
  const [toolbar, setToolbar] = useState<ToolbarState | null>(null)
  // Id of a just-added sidenote whose aside card should grab focus.
  const [pendingSidenoteFocusId, setPendingSidenoteFocusId] = useState<string | null>(null)
  // Id of the sidenote whose card is open for editing.
  const [editingSidenoteId, setEditingSidenoteId] = useState<string | null>(null)
  // Numbered-list marker popover, anchored to the clicked marker's rect.
  const [numbering, setNumbering] = useState<{ index: number; rect: ToolbarRect } | null>(null)
  // Bulleted-list marker popover, anchored the same way.
  const [bullet, setBullet] = useState<{ index: number; rect: ToolbarRect } | null>(null)
  // Latest selection tracker — assigned every render so the once-registered
  // document listener always calls the current closure.
  const trackSelectionRef = useRef<(force?: boolean) => void>(() => {})

  // -------------------------------------------------------------------------
  // Focus helpers
  // -------------------------------------------------------------------------

  function isShowcaseFigure(el: HTMLElement): boolean {
    return el.hasAttribute('data-showcase-block')
  }

  function focusBlockAtEnd(el: HTMLElement) {
    if (isShowcaseFigure(el)) {
      const caption = el.querySelector('figcaption[contenteditable]') as HTMLElement | null
      if (caption) {
        placeCaret(caption, 'end')
        return
      }
      const host = el.querySelector('[data-showcase-media]') as HTMLElement | null
      host?.focus()
      return
    }
    placeCaret(el, 'end')
  }

  function focusBlockAtStart(el: HTMLElement) {
    if (isShowcaseFigure(el)) {
      const host = el.querySelector('[data-showcase-media]') as HTMLElement | null
      host?.focus()
      return
    }
    placeCaret(el, 'start')
  }

  /** Shift+ArrowUp at the first line of block[index]: extend into the previous block. */
  function shiftArrowUp(blockIndex: number) {
    const sel = window.getSelection()
    if (!sel) return

    const prevEl = blockIndex === 0 ? titleRef.current : blockRefs.current[blockIndex - 1]
    if (!prevEl) return
    const focus = lastTextNode(prevEl) ?? prevEl
    const offset = focus.nodeType === Node.TEXT_NODE ? (focus as Text).length : 0
    // `extend()` does NOT change document.activeElement.
    sel.extend(focus, offset)
  }

  /** Shift+ArrowDown at the last line of block[index]: extend into the next block. */
  function shiftArrowDown(blockIndex: number) {
    const sel = window.getSelection()
    if (!sel) return
    const nextEl = blockRefs.current[blockIndex + 1]
    if (!nextEl) return
    const focus = firstTextNode(nextEl) ?? nextEl
    sel.extend(focus, 0)
  }

  // -------------------------------------------------------------------------
  // Block mutations
  // -------------------------------------------------------------------------

  function updateBlocks(next: BlockNode[]) {
    setDocument({ ...doc, content: withTrailingParagraph(next) })
  }

  function updateBlock(index: number, block: BlockNode) {
    const next = [...blocks]
    next[index] = block
    updateBlocks(next)
    pushHistoryDebounced()
  }

  function commitBlocks(next: BlockNode[]) {
    updateBlocks(next)
    cancelHistoryDebounce()
    pushHistoryNow()
  }

  function focusBlockLater(index: number, position: 'start' | 'end' = 'start') {
    setTimeout(() => {
      const el = blockRefs.current[index]
      if (!el) return
      if (position === 'end') focusBlockAtEnd(el)
      else focusBlockAtStart(el)
    }, 0)
  }

  function splitBlock(index: number, beforeHtml: string, afterHtml: string) {
    const current = blocks[index]
    const updatedCurrent: BlockNode =
      'children' in current && current.type !== 'code_block'
        ? ({ ...current, children: htmlToNodes(beforeHtml) } as BlockNode)
        : current

    // The new block inherits the current block's type for list items only, so
    // Enter continues the list. Everything else splits into a paragraph that
    // carries the indent forward.
    const newBlock: BlockNode = (() => {
      const afterNodes = htmlToNodes(afterHtml)
      if (isListItemType(current.type)) {
        const marker = (current as { marker?: string }).marker
        return {
          type: current.type,
          children: afterNodes,
          ...(marker ? { marker } : {})
        } as BlockNode
      }
      const indent = (current as { indent?: boolean }).indent
      return { type: 'paragraph', children: afterNodes, ...(indent ? { indent: true } : {}) }
    })()

    commitBlocks([...blocks.slice(0, index), updatedCurrent, newBlock, ...blocks.slice(index + 1)])
    focusBlockLater(index + 1)
  }

  // A fresh empty paragraph that inherits `indent` from `source`.
  function emptyParagraphInheriting(source: BlockNode | undefined): BlockNode {
    const base = emptyParagraphBlock()
    return (source as { indent?: boolean } | undefined)?.indent
      ? ({ ...base, indent: true } as BlockNode)
      : base
  }

  function insertParagraphBefore(index: number) {
    commitBlocks([
      ...blocks.slice(0, index),
      emptyParagraphInheriting(blocks[index]),
      ...blocks.slice(index)
    ])
    focusBlockLater(index)
  }

  function insertParagraphAfter(index: number) {
    if (hasSyntheticTrailingParagraph(blocks, index)) {
      focusBlockLater(index + 1)
      return
    }
    commitBlocks([
      ...blocks.slice(0, index + 1),
      emptyParagraphInheriting(blocks[index]),
      ...blocks.slice(index + 1)
    ])
    focusBlockLater(index + 1)
  }

  function emptyListItemBlock(type: ListItemType): BlockNode {
    return { type, children: [{ type: 'text', text: '' }] }
  }

  /** A fresh empty item that inherits `source`'s bullet glyph. */
  function emptyListItemInheriting(source: BlockNode): BlockNode {
    if (source.type === 'bullet_list_item' && source.marker) {
      return {
        type: 'bullet_list_item',
        children: [{ type: 'text', text: '' }],
        marker: source.marker
      }
    }
    return emptyListItemBlock(source.type as ListItemType)
  }

  /** Enter at the start of a list item: prepend an empty item of the same type. */
  function insertListItemBefore(index: number) {
    const source = blocks[index]
    const type = source.type as ListItemType
    // Prepending before a numbered run's first item makes the new item the run
    // head — carry the run-level marker/continue settings so the list keeps its style.
    const atRunStart =
      type === 'list_item' && (index === 0 || blocks[index - 1].type !== 'list_item')
    const newItem: BlockNode =
      atRunStart && source.type === 'list_item'
        ? {
            type: 'list_item',
            children: [{ type: 'text', text: '' }],
            marker: source.marker,
            continued: source.continued
          }
        : emptyListItemInheriting(source)
    commitBlocks([...blocks.slice(0, index), newItem, ...blocks.slice(index)])
    // The original (content) item shifted down to index + 1.
    focusBlockLater(index + 1)
  }

  // -------------------------------------------------------------------------
  // Numbered-list numbering controls (the marker popover)
  // -------------------------------------------------------------------------

  /** First index of the contiguous list_item run containing `index`. */
  function listRunStart(index: number): number {
    let start = index
    while (start > 0 && blocks[start - 1].type === 'list_item') start--
    return start
  }

  /** True when a numbered-list run exists before the run containing `index`. */
  function hasPrecedingList(index: number): boolean {
    const start = listRunStart(index)
    for (let k = 0; k < start; k++) {
      if (blocks[k].type === 'list_item') return true
    }
    return false
  }

  function isContinueActive(index: number): boolean {
    const first = blocks[listRunStart(index)]
    return first?.type === 'list_item' && first.continued === true
  }

  /** Toggle "continue numbering" on the run head. No-op with no preceding list. */
  function toggleContinueNumbering(index: number) {
    const start = listRunStart(index)
    const first = blocks[start]
    if (first.type !== 'list_item') return
    const turningOn = first.continued !== true
    if (turningOn && !hasPrecedingList(index)) return
    const next = [...blocks]
    next[start] = { ...first, continued: turningOn ? true : undefined }
    commitBlocks(next)
  }

  /** Restart the counter at the clicked item (toggle an explicit start of 1). */
  function resetNumbering(index: number) {
    const item = blocks[index]
    if (item.type !== 'list_item') return
    const next = [...blocks]
    next[index] = { ...item, start: item.start != null ? undefined : 1 }
    commitBlocks(next)
  }

  /** Swap the whole run between decimal and alpha markers. */
  function swapListStyle(index: number) {
    const start = listRunStart(index)
    const first = blocks[start]
    if (first.type !== 'list_item') return
    const nextMarker: ListMarkerStyle | undefined = first.marker === 'alpha' ? undefined : 'alpha'
    const next = [...blocks]
    next[start] = { ...first, marker: nextMarker }
    commitBlocks(next)
  }

  // -------------------------------------------------------------------------
  // Bulleted-list marker controls (the bullet popover)
  // -------------------------------------------------------------------------

  function bulletStyleOf(index: number): BulletStyle {
    const item = blocks[index]
    if (item?.type !== 'bullet_list_item') return 'dot'
    return item.marker ?? 'dot'
  }

  function setBulletStyle(index: number, style: BulletStyle) {
    const item = blocks[index]
    if (item?.type !== 'bullet_list_item') return
    const next = [...blocks]
    next[index] = { ...item, marker: style === 'dot' ? undefined : style }
    commitBlocks(next)
  }

  /** Bounds [start, end) of the contiguous bullet run containing `index`. */
  function bulletRunBounds(index: number): { start: number; end: number } {
    let start = index
    while (start > 0 && blocks[start - 1].type === 'bullet_list_item') start--
    let end = index
    while (end < blocks.length && blocks[end].type === 'bullet_list_item') end++
    return { start, end }
  }

  /** The head glyph of the nearest bulleted list ending before `runStart`. */
  function prevBulletRunStyle(runStart: number): BulletStyle | null {
    let last = runStart - 1
    while (last >= 0 && blocks[last].type !== 'bullet_list_item') last--
    if (last < 0) return null
    let head = last
    while (head > 0 && blocks[head - 1].type === 'bullet_list_item') head--
    const item = blocks[head]
    return item.type === 'bullet_list_item' ? (item.marker ?? 'dot') : null
  }

  function setBulletRunStyle(index: number, style: BulletStyle) {
    const { start, end } = bulletRunBounds(index)
    const marker = style === 'dot' ? undefined : style
    const next = [...blocks]
    for (let k = start; k < end; k++) {
      const item = next[k]
      if (item.type === 'bullet_list_item') next[k] = { ...item, marker }
    }
    commitBlocks(next)
  }

  function continueBulleting(index: number) {
    const { start } = bulletRunBounds(index)
    const style = prevBulletRunStyle(start)
    if (style === null) return
    setBulletRunStyle(index, style)
  }

  function resetBulleting(index: number) {
    setBulletRunStyle(index, 'dot')
  }

  /** Open the numbering or bullet popover for the clicked list marker. */
  function handleMarkerClick(index: number, rect: DOMRect) {
    const b = blocks[index]
    const rel = toArticleRect(rect, blockRefs.current[index])
    if (b?.type === 'list_item') setNumbering({ index, rect: rel })
    else if (b?.type === 'bullet_list_item') setBullet({ index, rect: rel })
  }

  /** Enter at the end of a list item: append a fresh empty item and focus it. */
  function insertListItemAfter(index: number) {
    commitBlocks([
      ...blocks.slice(0, index + 1),
      emptyListItemInheriting(blocks[index]),
      ...blocks.slice(index + 1)
    ])
    focusBlockLater(index + 1)
  }

  /** Parse an HTML string into InlineNode[], with a non-empty fallback. */
  function htmlToNodes(html: string): InlineNode[] {
    const div = document.createElement('div')
    div.innerHTML = html
    const nodes = domToInlineNodes(div)
    return nodes.length > 0 ? nodes : [{ type: 'text', text: '' }]
  }

  /** Backspace at the start of block[index]: append its content to block[index-1]. */
  function mergeWithPrev(index: number, currentHtml: string) {
    if (index === 0) {
      const el = titleRef.current
      if (el) focusBlockAtEnd(el)
      return
    }

    // The focused block merges away; blur so the reused DOM node re-syncs.
    ;(document.activeElement as HTMLElement | null)?.blur()

    const prevBlock = blocks[index - 1]

    // Caret-less predecessor — just delete it, keep the current block.
    if (isCaretlessBlock(prevBlock)) {
      commitBlocks([...blocks.slice(0, index - 1), ...blocks.slice(index)])
      focusBlockLater(index - 1)
      return
    }

    const prevEl = blockRefs.current[index - 1]
    const prevTextLength = prevEl?.textContent?.length ?? 0
    const prevHtml = prevEl?.innerHTML ?? ''

    const updatedPrev: BlockNode = {
      ...(prevBlock as Extract<BlockNode, { children: InlineNode[] }>),
      children: htmlToNodes(prevHtml + currentHtml)
    } as BlockNode

    commitBlocks([...blocks.slice(0, index - 1), updatedPrev, ...blocks.slice(index + 1)])

    setTimeout(() => {
      const el = blockRefs.current[index - 1]
      if (el) setCursorAtTextOffset(el, prevTextLength)
    }, 0)
  }

  /** Delete at the end of block[index]: absorb block[index+1]'s content. */
  function mergeWithNext(index: number, currentHtml: string) {
    if (index >= blocks.length - 1) return

    const nextBlock = blocks[index + 1]

    if (isCaretlessBlock(nextBlock)) {
      commitBlocks([...blocks.slice(0, index + 1), ...blocks.slice(index + 2)])
      return
    }

    const currentEl = blockRefs.current[index]
    const currentTextLength = currentEl?.textContent?.length ?? 0
    const nextEl = blockRefs.current[index + 1]
    const nextHtml = nextEl?.innerHTML ?? ''
    const mergedHtml = currentHtml + nextHtml

    const currentBlock = blocks[index]
    const updatedCurrent: BlockNode = {
      ...(currentBlock as Extract<BlockNode, { children: InlineNode[] }>),
      children: htmlToNodes(mergedHtml)
    } as BlockNode

    // The current block stays focused so the sync effect skips it — write the DOM directly.
    if (currentEl) currentEl.innerHTML = mergedHtml

    commitBlocks([...blocks.slice(0, index), updatedCurrent, ...blocks.slice(index + 2)])

    setTimeout(() => {
      const el = blockRefs.current[index]
      if (el) setCursorAtTextOffset(el, currentTextLength)
    }, 0)
  }

  function deleteBlock(index: number) {
    if (blocks.length === 1) {
      titleRef.current?.focus()
      return
    }
    // Blur first so the reused DOM node re-syncs (mirrors undo/redo).
    ;(document.activeElement as HTMLElement | null)?.blur()
    commitBlocks([...blocks.slice(0, index), ...blocks.slice(index + 1)])
    focusBlockLater(Math.max(0, index - 1), 'end')
  }

  /** Multi-line paste: rewrite the current block and insert paragraphs after it. */
  function pasteBlocks(blockIndex: number, firstBlockHtml: string, newBlocksHtml: string[]) {
    const current = blocks[blockIndex]
    const updatedCurrent: BlockNode =
      'children' in current && current.type !== 'code_block'
        ? ({ ...current, children: htmlToNodes(firstBlockHtml) } as BlockNode)
        : current

    const inserted: BlockNode[] = newBlocksHtml.map((html) => ({
      type: 'paragraph' as const,
      children: htmlToNodes(html)
    }))

    commitBlocks([
      ...blocks.slice(0, blockIndex),
      updatedCurrent,
      ...inserted,
      ...blocks.slice(blockIndex + 1)
    ])
    focusBlockLater(blockIndex + newBlocksHtml.length, 'end')
  }

  // -------------------------------------------------------------------------
  // Slash menu
  // -------------------------------------------------------------------------

  function handleSlash(el: HTMLElement, index: number) {
    const hasExistingContent = (el.innerText ?? '').trim().length > 1
    setSlashAnchor({ el, index, hasExistingContent })
    setSlashQuery('')
  }

  /**
   * Called by the active block on every input event while the slash menu is
   * open. Derives the query (text after the leading "/") or dismisses the menu
   * if the slash has been deleted or the query matches nothing.
   */
  function handleSlashInput(text: string) {
    const trimmed = text.trim()
    if (!trimmed.startsWith('/')) {
      setSlashAnchor(null)
      setSlashQuery('')
      return
    }
    if (slashAnchor?.hasExistingContent) {
      setSlashQuery('')
      return
    }
    const newQuery = trimmed.slice(1)
    const excludeType = slashAnchor
      ? (blocks[slashAnchor.index]?.type as SlashMenuBlockType | undefined)
      : undefined
    if (!slashMenuHasResults(newQuery, undefined, excludeType)) {
      handleSlashDismiss()
      return
    }
    setSlashQuery(newQuery)
  }

  /** Remove the slash-menu trigger "/" from inline children. */
  function stripSlashTrigger(children: InlineNode[]): InlineNode[] {
    const stripped: InlineNode[] =
      children.length > 0 && children[0].type === 'text' && children[0].text.startsWith('/')
        ? [{ ...children[0], text: children[0].text.slice(1) }, ...children.slice(1)]
        : children
    const hasContent = stripped.some((n) => n.text.trim() !== '')
    return hasContent ? stripped : [{ type: 'text' as const, text: '' }]
  }

  /** Write stripped inline content back into a focused block (its sync effect skips it). */
  function syncFocusedBlockDom(
    el: HTMLElement,
    children: InlineNode[],
    blockType: SlashMenuBlockType,
    base = 0
  ) {
    if (blockType === 'horizontal_rule' || blockType === 'link_card') return
    if (blockType === 'code_block') {
      el.innerHTML = children.map((n) => n.text).join('')
      return
    }
    el.innerHTML = inlineNodesToHtml(children, base)
  }

  function handleSlashSelect(type: SlashMenuBlockType) {
    if (!slashAnchor) return
    const { index, el } = slashAnchor
    setSlashAnchor(null)
    setSlashQuery('')

    // Read from the DOM — it is authoritative while the block is focused.
    const keptChildren = stripSlashTrigger(domToInlineNodes(el))
    syncFocusedBlockDom(el, keptChildren, type, sidenoteBaseList[index])

    // Media is a deferred insertion: replace the trigger block with a
    // paragraph placeholder, then hand off to the dialog.
    if (type === 'media') {
      const next = [...blocks]
      next[index] = { type: 'paragraph', children: keptChildren }
      updateBlocks(next)
      setImageDialogMode('insert')
      setImageDialogBlockIndex(index)
      setImageDialogOpen(true)
      return
    }

    let newBlock: BlockNode
    if (type === 'heading') {
      newBlock = { type: 'heading', level: 2, children: keptChildren }
    } else if (type === 'paragraph') {
      newBlock = { type: 'paragraph', children: keptChildren }
    } else if (type === 'blockquote') {
      newBlock = { type: 'blockquote', children: keptChildren }
    } else if (type === 'list_item') {
      newBlock = { type: 'list_item', children: keptChildren }
    } else if (type === 'bullet_list_item') {
      newBlock = { type: 'bullet_list_item', children: keptChildren }
    } else if (type === 'metric') {
      newBlock = { type: 'metric', children: keptChildren }
    } else if (type === 'code_block') {
      const plainText = keptChildren.map((n) => n.text).join('')
      newBlock = { type: 'code_block', children: [{ type: 'text', text: plainText }] }
    } else if (type === 'link_card') {
      // A card starts empty and is filled in from its rail; any text on the
      // trigger line is dropped, as it is for a horizontal rule.
      newBlock = { type: 'link_card', config: {} }
    } else {
      newBlock = { type: 'horizontal_rule' }
    }

    const next = [...blocks]
    next[index] = newBlock
    commitBlocks(next)

    setTimeout(() => {
      if (type === 'horizontal_rule') {
        // A rule takes no caret — focus the paragraph guaranteed after it.
        const trailing = blockRefs.current[index + 1]
        if (trailing) focusBlockAtStart(trailing)
      } else if (type === 'link_card') {
        const figure = blockRefs.current[index]
        if (figure) focusBlockAtStart(figure)
      } else {
        blockRefs.current[index]?.focus()
      }
    }, 0)
  }

  function handleChangeImage(blockIndex: number) {
    setImageDialogMode('change')
    setImageDialogBlockIndex(blockIndex)
    setImageDialogOpen(true)
  }

  function handleImageInsert(payload: ImageInsertPayload) {
    if (imageDialogBlockIndex === null) return

    const existing = blocks[imageDialogBlockIndex]
    const next = [...blocks]
    next[imageDialogBlockIndex] = {
      ...mediaNodeFrom(payload),
      // The caption belongs to the block's POSITION rather than to the file.
      ...(existing.type === 'media' && existing.caption ? { caption: existing.caption } : {})
    }
    commitBlocks(next)

    const changedBlockIndex = imageDialogBlockIndex
    const wasChange = imageDialogMode === 'change'
    setImageDialogOpen(false)
    setImageDialogBlockIndex(null)
    setImageDialogMode('insert')

    setTimeout(() => {
      if (wasChange) {
        const figure = blockRefs.current[changedBlockIndex]
        const media = figure?.querySelector('[data-showcase-media]') as HTMLElement | null
        media?.focus()
        return
      }
      const el = blockRefs.current[changedBlockIndex + 1]
      if (el) focusBlockAtStart(el)
    }, 0)
  }

  function handleImageDialogClose() {
    setImageDialogOpen(false)
    setImageDialogBlockIndex(null)
    setImageDialogMode('insert')
  }

  function handleSlashDismiss() {
    setSlashAnchor(null)
    setSlashQuery('')
  }

  // -------------------------------------------------------------------------
  // Selection toolbar
  // -------------------------------------------------------------------------

  /** Resolve the block index whose element contains `node`, else null. */
  function toolbarBlockIndex(node: Node | null): number | null {
    if (!node) return null
    const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
    if (!el) return null
    for (let i = 0; i < blockRefs.current.length; i++) {
      if (blockRefs.current[i]?.contains(el)) return i
    }
    return null
  }

  // Viewport-space → <article>-relative, so the anchor rides the scrolling
  // article and needs no per-scroll JS.
  function toArticleRect(
    r: { left: number; top: number; width: number; height: number },
    within: Node | null
  ): ToolbarRect {
    const el = within?.nodeType === 1 ? (within as Element) : within?.parentElement
    const article = el?.closest('article') ?? null
    const base =
      article && typeof article.getBoundingClientRect === 'function'
        ? article.getBoundingClientRect()
        : { left: 0, top: 0 }
    return { left: r.left - base.left, top: r.top - base.top, width: r.width, height: r.height }
  }

  function rectFromRange(range: Range): ToolbarRect {
    // Anchor to the FIRST line's rect, not the whole-range bounding box, so a
    // wrapped run does not centre the popover in the column's middle.
    const rects =
      typeof range.getClientRects === 'function' ? Array.from(range.getClientRects()) : []
    // Skip an EMPTY leading fragment at a soft-wrap boundary; keep a caret's.
    const r =
      rects.find((rect) => rect.width > 0) ??
      rects[0] ??
      (typeof range.getBoundingClientRect === 'function'
        ? range.getBoundingClientRect()
        : { left: 0, top: 0, width: 0, height: 0 })
    return toArticleRect(r, range.startContainer)
  }

  /** Anchor rect for a selection, measured from its first VISIBLE glyph. */
  function selectionAnchorRect(
    el: HTMLElement,
    range: Range,
    offsets: { start: number; end: number }
  ): ToolbarRect {
    const text = range.toString()
    const lead = text.length - text.trimStart().length
    if (lead > 0 && lead < text.length) {
      const trimmed = domRangeForOffsets(el, offsets.start + lead, offsets.end)
      if (trimmed) return rectFromRange(trimmed)
    }
    return rectFromRange(range)
  }

  function domRangeForOffsets(el: HTMLElement, start: number, end: number): Range | null {
    const s = findTextPositionAtOffset(el, start)
    const e = findTextPositionAtOffset(el, end)
    if (!s || !e) return null
    const range = document.createRange()
    range.setStart(s.node, s.offset)
    range.setEnd(e.node, e.offset)
    return range
  }

  // Recomputes the toolbar from the live selection. `forceRect` re-measures
  // even when the selection is unchanged (resize); otherwise a same-selection
  // update keeps the existing rect so toggling a mark doesn't shift it.
  function trackSelection(forceRect = false) {
    if (slashAnchor) {
      setToolbar(null)
      return
    }
    // Keep the link editor open — its input holds focus.
    if (toolbar?.mode === 'link-edit') return

    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0) {
      setToolbar(null)
      return
    }
    const range = sel.getRangeAt(0)
    const index = toolbarBlockIndex(range.startContainer)
    if (index === null) {
      setToolbar(null)
      return
    }
    const el = blockRefs.current[index]
    const block = blocks[index]
    if (
      !el ||
      !block ||
      !('children' in block) ||
      block.type === 'code_block' ||
      !el.contains(range.endContainer)
    ) {
      setToolbar(null)
      return
    }
    const offsets = getSelectionOffsets(el)
    if (!offsets) {
      setToolbar(null)
      return
    }
    const nodes = domToInlineNodes(el)

    // Caret on — or a selection wholly within — an annotated run shows the
    // sidenote actions, unless that note's card is already being edited.
    const sidenote = findSidenoteRangeAt(nodes, offsets.start)
    if (
      sidenote &&
      offsets.start >= sidenote.start &&
      offsets.end <= sidenote.end &&
      editingSidenoteId !== sidenote.id
    ) {
      setToolbar({
        mode: 'sidenote-view',
        index,
        rect: selectionAnchorRect(el, range, offsets),
        range: { start: sidenote.start, end: sidenote.end },
        sidenoteId: sidenote.id,
        activeMarks: new Set()
      })
      return
    }

    // A caret on — or a selection wholly within — a link shows the link actions.
    const link = findLinkRangeAt(nodes, offsets.start)
    if (link && offsets.start >= link.start && offsets.end <= link.end) {
      setToolbar({
        mode: 'link-view',
        index,
        rect: selectionAnchorRect(el, range, offsets),
        range: { start: link.start, end: link.end },
        href: link.href,
        activeMarks: new Set()
      })
      return
    }

    if (offsets.start !== offsets.end) {
      const activeMarks = new Set(
        TOOLBAR_MARK_TYPES.filter((m) => rangeHasMark(nodes, offsets.start, offsets.end, m))
      )
      const sameSelection =
        !forceRect &&
        toolbar?.mode === 'format' &&
        toolbar.index === index &&
        toolbar.range.start === offsets.start &&
        toolbar.range.end === offsets.end
      setToolbar({
        mode: 'format',
        index,
        rect: sameSelection ? toolbar.rect : selectionAnchorRect(el, range, offsets),
        range: offsets,
        activeMarks
      })
      return
    }
    setToolbar(null)
  }

  // Toggle an inline mark over a character range within block `index`.
  function toggleMarkInRange(
    index: number,
    type: ToggleableMark,
    range: { start: number; end: number }
  ) {
    const el = blockRefs.current[index]
    const block = blocks[index]
    if (!el || !block || !('children' in block)) return
    if (range.start === range.end) return
    const nodes = domToInlineNodes(el)
    const has = rangeHasMark(nodes, range.start, range.end, type)
    const next = transformMarksInRange(nodes, range.start, range.end, (marks) =>
      has
        ? marks.filter((m) => m.type !== type)
        : [...marks.filter((m) => m.type !== type), { type } as Mark]
    )
    el.innerHTML = inlineNodesToHtml(next, sidenoteBaseList[index])
    updateBlock(index, { ...block, children: next })
    setSelectionRange(el, range.start, range.end)
  }

  function handleToggleMark(type: ToggleableMark) {
    if (!toolbar) return
    const { index } = toolbar
    const el = blockRefs.current[index]
    if (!el) return
    const off = getSelectionOffsets(el) ?? toolbar.range
    toggleMarkInRange(index, type, off)
  }

  function toggleMarkFromKeyboard(index: number, type: ToggleableMark) {
    const el = blockRefs.current[index]
    if (!el) return
    const off = getSelectionOffsets(el)
    if (!off) return
    toggleMarkInRange(index, type, off)
  }

  function handleStartLink() {
    if (!toolbar) return
    const { index } = toolbar
    const el = blockRefs.current[index]
    if (!el) return
    const off = getSelectionOffsets(el) ?? toolbar.range
    if (off.start === off.end) return
    const linkRange = domRangeForOffsets(el, off.start, off.end)
    const nodes = domToInlineNodes(el)
    const existing = findLinkRangeAt(nodes, off.start)
    setToolbar({
      mode: 'link-edit',
      index,
      rect: linkRange ? rectFromRange(linkRange) : toolbar.rect,
      range: off,
      href: existing?.href,
      activeMarks: new Set()
    })
  }

  function handleApplyLink(href: string) {
    if (!toolbar) return
    const { index, range } = toolbar
    const el = blockRefs.current[index]
    const block = blocks[index]
    if (!el || !block || !('children' in block) || range.start === range.end) {
      setToolbar(null)
      return
    }
    const normalized = normalizeLinkHref(href)
    const nodes = domToInlineNodes(el)
    const next = transformMarksInRange(nodes, range.start, range.end, (marks) => [
      ...marks.filter((m) => m.type !== 'link'),
      { type: 'link', href: normalized } as Mark
    ])
    el.innerHTML = inlineNodesToHtml(next, sidenoteBaseList[index])
    updateBlock(index, { ...block, children: next })
    // Collapse into the link so the link-view popover surfaces next.
    setSelectionRange(el, range.end, range.end)
  }

  function handleRemoveLink() {
    if (!toolbar) return
    const { index, range } = toolbar
    const el = blockRefs.current[index]
    const block = blocks[index]
    if (!el || !block || !('children' in block)) {
      setToolbar(null)
      return
    }
    const nodes = domToInlineNodes(el)
    const next = transformMarksInRange(nodes, range.start, range.end, (marks) =>
      marks.filter((m) => m.type !== 'link')
    )
    el.innerHTML = inlineNodesToHtml(next, sidenoteBaseList[index])
    updateBlock(index, { ...block, children: next })
    setSelectionRange(el, range.end, range.end)
    setToolbar(null)
  }

  function handleGotoLink() {
    if (!toolbar?.href) return
    window.open(toolbar.href, '_blank', 'noopener,noreferrer')
  }

  // Toggle a sidenote annotation over the current selection.
  function handleAddSidenote() {
    if (!toolbar) return
    const { index, range } = toolbar
    const el = blockRefs.current[index]
    const block = blocks[index]
    if (!el || !block || !('children' in block) || range.start === range.end) return
    const nodes = domToInlineNodes(el)
    const has = rangeHasMark(nodes, range.start, range.end, 'sidenote')
    const id = has ? null : makeSidenoteId()
    const next = transformMarksInRange(nodes, range.start, range.end, (marks) =>
      has
        ? marks.filter((m) => m.type !== 'sidenote')
        : [
            ...marks.filter((m) => m.type !== 'sidenote'),
            { type: 'sidenote', id: id as string, text: '' } as Mark
          ]
    )
    el.innerHTML = inlineNodesToHtml(next, sidenoteBaseList[index])
    updateBlock(index, { ...block, children: next })
    setSelectionRange(el, range.start, range.end)
    // A freshly added note opens straight into its card for editing.
    if (id) {
      setEditingSidenoteId(id)
      setPendingSidenoteFocusId(id)
    }
  }

  function handleEditSidenote() {
    if (!toolbar?.sidenoteId) return
    setEditingSidenoteId(toolbar.sidenoteId)
    setPendingSidenoteFocusId(toolbar.sidenoteId)
    setToolbar(null)
  }

  function handleDeleteSidenote() {
    if (!toolbar?.sidenoteId) return
    const { index, range, sidenoteId } = toolbar
    const el = blockRefs.current[index]
    const block = blocks[index]
    if (!el || !block || !('children' in block)) {
      setToolbar(null)
      return
    }
    const nodes = domToInlineNodes(el)
    const next = transformMarksInRange(nodes, range.start, range.end, (marks) =>
      marks.filter((m) => !(m.type === 'sidenote' && m.id === sidenoteId))
    )
    el.innerHTML = inlineNodesToHtml(next, sidenoteBaseList[index])
    updateBlock(index, { ...block, children: next })
    if (editingSidenoteId === sidenoteId) setEditingSidenoteId(null)
    setSelectionRange(el, range.end, range.end)
    setToolbar(null)
  }

  // Persist an aside-card edit back into every run of that note, and keep the
  // prose DOM's data-sidenote-text in sync for a later re-serialisation.
  function handleSidenoteTextChange(entry: SidenoteEntry, text: string) {
    const block = blocks[entry.blockIndex]
    if (!block || !('children' in block)) return
    const children = block.children.map((node) => {
      const marks = node.marks ?? []
      if (!marks.some((m) => m.type === 'sidenote' && m.id === entry.id)) return node
      return {
        ...node,
        marks: marks.map((m) => (m.type === 'sidenote' && m.id === entry.id ? { ...m, text } : m))
      }
    })
    updateBlock(entry.blockIndex, { ...block, children })
    blockRefs.current[entry.blockIndex]
      ?.querySelectorAll(`[data-sidenote-id="${CSS.escape(entry.id)}"]`)
      .forEach((el) => el.setAttribute('data-sidenote-text', text))
  }

  // Sidenote card (Esc): close the card and return the caret to the annotation.
  function handleExitSidenoteEdit(entry: SidenoteEntry) {
    const el = blockRefs.current[entry.blockIndex]
    if (!el) {
      setEditingSidenoteId(null)
      return
    }
    const span = el.querySelector<HTMLElement>(`[data-sidenote-id="${CSS.escape(entry.id)}"]`)
    el.focus()
    const sel = window.getSelection()
    if (!sel) return
    const range = document.createRange()
    const target = span ? lastTextNode(span) : null
    if (target) range.setStart(target, target.length)
    else range.selectNodeContents(el)
    range.collapse(true)
    sel.removeAllRanges()
    sel.addRange(range)
  }

  function handleEditLink() {
    if (!toolbar) return
    setToolbar({ ...toolbar, mode: 'link-edit' })
  }

  function handleToolbarDismiss() {
    setToolbar(null)
  }

  // Register selection tracking once — the ref always holds the latest closure.
  useEffect(() => {
    function onSelectionChange() {
      trackSelectionRef.current(false)
    }
    function onResize() {
      trackSelectionRef.current(true)
    }
    document.addEventListener('selectionchange', onSelectionChange)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // ── Cross-block Delete / Backspace handler (assigned every render via ref) ──
  function crossBlockDelete(e: KeyboardEvent) {
    function resolveBlockIdx(node: Node | null): number | null {
      if (!node) return null
      const el = node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement
      if (!el) return null
      if (el === titleRef.current || titleRef.current?.contains(el)) return -1
      for (let i = 0; i < blockRefs.current.length; i++) {
        const ref = blockRefs.current[i]
        if (ref === el || ref?.contains(el)) return i
      }
      return null
    }

    if (e.key !== 'Backspace' && e.key !== 'Delete') return

    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return

    const range = sel.getRangeAt(0)
    const startIdx = resolveBlockIdx(range.startContainer)
    const endIdx = resolveBlockIdx(range.endContainer)

    if (startIdx === null || endIdx === null) return
    if (startIdx === endIdx) return // same editing host — the browser handles it

    e.preventDefault()
    sel.removeAllRanges()

    const startEl = startIdx === -1 ? titleRef.current! : blockRefs.current[startIdx]!
    const endEl = endIdx === -1 ? titleRef.current! : blockRefs.current[endIdx]!

    const beforeRange = document.createRange()
    beforeRange.setStart(startEl, 0)
    beforeRange.setEnd(range.startContainer, range.startOffset)

    const afterRange = document.createRange()
    afterRange.setStart(range.endContainer, range.endOffset)
    afterRange.setEnd(endEl, endEl.childNodes.length)

    const tempDiv = document.createElement('div')

    if (startIdx === -1) {
      // Selection starts inside the title.
      const newTitleText = beforeRange.toString()

      tempDiv.appendChild(afterRange.cloneContents())
      const afterHtml = tempDiv.innerHTML
      const endBlock = blocks[endIdx]
      const mergedBlock: BlockNode =
        'children' in endBlock
          ? ({ ...endBlock, children: htmlToNodes(afterHtml) } as BlockNode)
          : { type: 'paragraph', children: [{ type: 'text', text: '' }] }

      updateBlocks([mergedBlock, ...blocks.slice(endIdx + 1)])

      setTitle(newTitleText)
      titleRef.current!.innerText = newTitleText
      cancelHistoryDebounce()
      pushHistoryNow()

      focusBlockLater(0)
      return
    }

    // A caret-less start block has no editable host — the selection boundary
    // merely landed on it. Preserve it and rebuild only the trailing content.
    if (!('children' in blocks[startIdx])) {
      tempDiv.appendChild(afterRange.cloneContents())
      const afterNodes = htmlToNodes(tempDiv.innerHTML)
      const hasTail = afterNodes.some((n) => n.text.trim() !== '')
      const endBlock = blocks[endIdx]
      const tail: BlockNode[] = hasTail
        ? [
            'children' in endBlock
              ? ({ ...endBlock, children: afterNodes } as BlockNode)
              : { type: 'paragraph', children: afterNodes }
          ]
        : []
      commitBlocks([...blocks.slice(0, startIdx + 1), ...tail, ...blocks.slice(endIdx + 1)])
      focusBlockLater(startIdx + 1)
      return
    }

    tempDiv.appendChild(beforeRange.cloneContents())
    const beforeHtml = tempDiv.innerHTML

    tempDiv.innerHTML = ''
    tempDiv.appendChild(afterRange.cloneContents())
    const afterHtml = tempDiv.innerHTML

    const mergedHtml = beforeHtml + afterHtml
    const startBlock = blocks[startIdx]
    const mergedBlock: BlockNode =
      'children' in startBlock
        ? ({ ...startBlock, children: htmlToNodes(mergedHtml) } as BlockNode)
        : startBlock

    const newBlocks = [...blocks.slice(0, startIdx), mergedBlock, ...blocks.slice(endIdx + 1)]

    // Measure the caret offset BEFORE mutating innerHTML orphans the range's nodes.
    const targetCaretLength = beforeRange.toString().length

    startEl.innerHTML = mergedHtml
    startEl.focus()

    let charCount = 0
    function findCaretPos(node: Node): { node: Node; offset: number } | null {
      if (node.nodeType === Node.TEXT_NODE) {
        const len = (node.textContent ?? '').length
        if (charCount + len >= targetCaretLength) {
          return { node, offset: targetCaretLength - charCount }
        }
        charCount += len
        return null
      }
      for (const child of Array.from(node.childNodes)) {
        const res = findCaretPos(child)
        if (res) return res
      }
      return null
    }
    const pos = findCaretPos(startEl)
    const r = document.createRange()
    if (pos) r.setStart(pos.node, pos.offset)
    else r.setStart(startEl, startEl.childNodes.length)
    r.collapse(true)
    sel.removeAllRanges()
    sel.addRange(r)

    commitBlocks(newBlocks)
  }

  // Keep the latest closures reachable from the once-registered listeners.
  useEffect(() => {
    trackSelectionRef.current = trackSelection
    crossBlockDeleteRef.current = crossBlockDelete
  })

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const listNumbering = computeListNumbering(blocks)

  return (
    <>
      {showTitle && (
        <h1
          ref={titleRef}
          id="article-title"
          aria-label="Title"
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Title"
          className={`${editableBaseStyle} ${typographyStyles({ type: 'title' })}`}
          onInput={(e) => {
            setTitle(e.currentTarget.innerText)
            pushHistoryDebounced()
          }}
          onPaste={(e) => {
            e.preventDefault()
            const text = e.clipboardData.getData('text/plain')
            if (text) document.execCommand('insertText', false, text)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Tab') {
              e.preventDefault()
              return
            }
            if (e.key === 'Enter') {
              e.preventDefault()
              const el = blockRefs.current[0]
              if (el) focusBlockAtStart(el)
            }
            if (e.key === 'ArrowDown' && !e.shiftKey && isCaretAtLastLine(e.currentTarget)) {
              e.preventDefault()
              const el = blockRefs.current[0]
              if (el) focusBlockAtStart(el)
            }
            if (e.key === 'ArrowDown' && e.shiftKey && isFocusAtLastLine(e.currentTarget)) {
              e.preventDefault()
              const sel = window.getSelection()
              if (!sel?.anchorNode) return
              const { anchorNode, anchorOffset } = sel
              const nextEl = blockRefs.current[0]
              if (nextEl) {
                const focus = firstTextNode(nextEl) ?? nextEl
                nextEl.focus()
                sel.setBaseAndExtent(anchorNode, anchorOffset, focus, 0)
              }
            }
            if (e.key === 'ArrowRight' && !e.shiftKey && isCaretAtEnd(e.currentTarget)) {
              e.preventDefault()
              const el = blockRefs.current[0]
              if (el) focusBlockAtStart(el)
            }
          }}
        />
      )}

      {blocks.map((block, i) => (
        <EditableBlock
          key={`${i}-${block.type}`}
          block={block}
          blockIndex={i}
          sidenoteBase={sidenoteBaseList[i]}
          isFirst={i === 0}
          isOnly={blocks.length === 1}
          onChange={(updated) => updateBlock(i, updated)}
          onEnter={(before, after) => splitBlock(i, before, after)}
          onDelete={() => deleteBlock(i)}
          onSlash={(el) => handleSlash(el, i)}
          isSlashActive={slashAnchor?.index === i}
          onSlashInput={slashAnchor?.index === i ? handleSlashInput : undefined}
          onArrowUp={() => {
            const el = i === 0 ? titleRef.current : blockRefs.current[i - 1]
            if (el) focusBlockAtEnd(el)
          }}
          onArrowDown={() => {
            const el = blockRefs.current[i + 1]
            if (el) focusBlockAtStart(el)
          }}
          onArrowLeft={() => {
            const el = i === 0 ? titleRef.current : blockRefs.current[i - 1]
            if (el) focusBlockAtEnd(el)
          }}
          onArrowRight={() => {
            const el = blockRefs.current[i + 1]
            if (el) focusBlockAtStart(el)
          }}
          onPasteBlocks={(firstHtml, restHtmls) => pasteBlocks(i, firstHtml, restHtmls)}
          onMergeWithPrev={(html) => mergeWithPrev(i, html)}
          onMergeWithNext={(html) => mergeWithNext(i, html)}
          onConvertedToParagraph={() => focusBlockLater(i)}
          onToggleMark={(type) => toggleMarkFromKeyboard(i, type)}
          onShiftArrowUp={() => shiftArrowUp(i)}
          onShiftArrowDown={() => shiftArrowDown(i)}
          onChangeImage={block.type === 'media' ? () => handleChangeImage(i) : undefined}
          onInsertParagraphBefore={() => insertParagraphBefore(i)}
          onInsertParagraphAfter={
            block.type === 'media' ||
            block.type === 'link_card' ||
            block.type === 'metric' ||
            block.type === 'blockquote'
              ? () => insertParagraphAfter(i)
              : undefined
          }
          onInsertListItemBefore={() => insertListItemBefore(i)}
          onInsertListItemAfter={() => insertListItemAfter(i)}
          listLabel={listNumbering[i]?.label}
          onMarkerClick={(rect) => handleMarkerClick(i, rect)}
          elRef={(el) => {
            blockRefs.current[i] = el
          }}
        />
      ))}

      {slashAnchor && (
        <SlashMenu
          query={slashQuery}
          // On a line that already has text the menu CONVERTS it, so only the
          // types that can hold that text are offered.
          allowedTypes={slashAnchor.hasExistingContent ? CONVERTIBLE_TYPES : undefined}
          excludeType={blocks[slashAnchor.index]?.type as SlashMenuBlockType | undefined}
          onSelect={handleSlashSelect}
          onDismiss={handleSlashDismiss}
        />
      )}

      {toolbar && (
        <SelectionToolbar
          mode={toolbar.mode}
          rect={toolbar.rect}
          activeMarks={toolbar.activeMarks}
          linkHref={toolbar.href}
          onToggleMark={handleToggleMark}
          onStartLink={handleStartLink}
          onApplyLink={handleApplyLink}
          onRemoveLink={handleRemoveLink}
          onGotoLink={handleGotoLink}
          onEditLink={handleEditLink}
          onAddSidenote={handleAddSidenote}
          onEditSidenote={handleEditSidenote}
          onDeleteSidenote={handleDeleteSidenote}
          onDismiss={handleToolbarDismiss}
        />
      )}

      <SidenoteLayer
        entries={collectSidenotes(blocks)}
        trigger="caret"
        editable
        activeId={editingSidenoteId}
        autoFocusId={pendingSidenoteFocusId}
        onAutoFocused={() => setPendingSidenoteFocusId(null)}
        onStopEditing={() => setEditingSidenoteId(null)}
        onExitEdit={handleExitSidenoteEdit}
        onChangeText={handleSidenoteTextChange}
      />

      {numbering && (
        <NumberToolbar
          rect={numbering.rect}
          marker={listNumbering[numbering.index]?.marker ?? 'decimal'}
          continueActive={isContinueActive(numbering.index)}
          onContinue={() => {
            toggleContinueNumbering(numbering.index)
            setNumbering(null)
          }}
          onReset={() => {
            resetNumbering(numbering.index)
            setNumbering(null)
          }}
          onSwapStyle={() => {
            swapListStyle(numbering.index)
            setNumbering(null)
          }}
          onDismiss={() => setNumbering(null)}
        />
      )}

      {bullet && (
        <BulletToolbar
          rect={bullet.rect}
          style={bulletStyleOf(bullet.index)}
          onSelect={(style) => {
            setBulletStyle(bullet.index, style)
            setBullet(null)
          }}
          onContinue={() => {
            continueBulleting(bullet.index)
            setBullet(null)
          }}
          onReset={() => {
            resetBulleting(bullet.index)
            setBullet(null)
          }}
          onDismiss={() => setBullet(null)}
        />
      )}

      <ImageInsertDialog
        open={imageDialogOpen}
        mode={imageDialogMode}
        initialPhase={imageDialogMode === 'change' ? 'library' : 'upload'}
        onClose={handleImageDialogClose}
        onInsert={handleImageInsert}
      />
    </>
  )
}
