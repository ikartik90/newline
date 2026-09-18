import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BlockNode, CodeLanguage, InlineNode } from '@shared/domain/nodes'
import { CodeLanguageSchema } from '@shared/domain/nodes'
import type { LinkCardConfig } from '@shared/domain/link-card'
import { Button } from '@/components/ui/button'
import { OptionList } from '@/components/ui/input/option-list'
import { typographyStyles } from '@/components/ui/typography'
import { MediaObject, mediaObjectRailStyle } from '@/components/media-object'
import { MediaPropertiesPanel } from '@/components/media-properties-panel'
import { LinkCard } from '@/components/link-card'
import { LinkCardPropertiesPanel } from '@/components/link-card-properties-panel'
import { useMediaProperties } from '@/hooks/use-media-properties'
import type { ToggleableMark } from '@/components/selection-toolbar'
import { CODE_LANGUAGE_LABELS } from '@/utils/syntax-highlight'
import TrashIcon from '@/assets/icons/trash.svg'
import SettingsIcon from '@/assets/icons/settings.svg'
import {
  domToInlineNodes,
  escapeHtml,
  inlineNodesToHtml,
  renumberSidenoteSups,
  sanitiseClipboardHtml,
  stripEmptySidenoteWrappers
} from './inline-html'
import {
  getCaretSplitHtml,
  getSelectionOffsets,
  getTextBeforeCursor,
  isCaretAtEnd,
  isCaretAtFirstLine,
  isCaretAtLastLine,
  isCaretAtStart,
  isFocusAtFirstLine,
  isFocusAtLastLine,
  placeCaret,
  setSelectionRange
} from './caret'
import { isBlockEmpty, isCaretlessBlock, isListItemType } from './blocks'
import {
  articleBlockquoteBodyStyle,
  articleBlockquoteShellStyle,
  articleBlockquoteStyle,
  articleHeadingShellStyle,
  articleMetricStyle,
  editableBaseStyle,
  editorBlockquoteCaptionStyle,
  editorBulletCircleClass,
  editorCaptionStyle,
  editorCodeBlockStyle,
  editorCodeBlockWrapperStyle,
  editorCodeLanguageSelectStyle,
  editorFurnitureWrapperStyle,
  editorHrShellStyle,
  editorHrStyle,
  editorHrWrapperStyle,
  editorImageOverlayActionsStyle,
  editorImageOverlayStyle,
  editorImageOverlayTintStyle,
  editorImagePlaceholderStyle,
  editorImgStyle,
  editorListBulletButtonStyle,
  editorListBulletIconButtonStyle,
  editorListItemContentStyle,
  editorListItemShellStyle,
  editorListMarkerButtonStyle,
  editorListMarkerPillStyle,
  editorMetricCaptionStyle,
  editorMetricLabelStyle,
  editorMetricValueStyle,
  editorShowcaseMediaStyle,
  editorShowcaseStyle,
  editorSubheadingCaptionStyle,
  mediaBlockStyles,
  menuIconStyle
} from './styles'

const CODE_LANGUAGE_OPTIONS: Array<{ value: CodeLanguage | ''; label: string }> = [
  { value: '', label: 'Plain text' },
  ...CodeLanguageSchema.options.map((language) => ({
    value: language,
    label: CODE_LANGUAGE_LABELS[language]
  }))
]

/** The blocks whose `caption` field the caption effects and handlers write. */
function hasCaption(block: BlockNode): block is Extract<BlockNode, { caption?: string }> {
  return (
    block.type === 'media' ||
    block.type === 'blockquote' ||
    block.type === 'heading' ||
    block.type === 'metric'
  )
}

// ---------------------------------------------------------------------------
// EditableBlock
// ---------------------------------------------------------------------------

export interface EditableBlockProps {
  block: BlockNode
  blockIndex: number
  /** Count of distinct sidenotes before this block — offsets the block's own
   *  note ordinals to their global values (see inlineNodesToHtml / sidenoteBases). */
  sidenoteBase: number
  isFirst: boolean
  isOnly: boolean
  onChange: (block: BlockNode) => void
  /** Called on Enter; receives the HTML for before and after the caret so the
   *  parent can split the current block at the cursor position. */
  onEnter: (beforeHtml: string, afterHtml: string) => void
  onDelete: () => void
  onSlash: (el: HTMLElement) => void
  /** Called on every input event while the slash menu is open for this block. */
  onSlashInput?: (text: string) => void
  /** True while the slash menu is open for this block. */
  isSlashActive?: boolean
  onArrowUp?: () => void
  onArrowDown?: () => void
  onArrowLeft?: () => void
  onArrowRight?: () => void
  /**
   * Called when pasted content contains hard returns. Receives the HTML for
   * the current block and an array of HTML strings for the new blocks after it.
   */
  onPasteBlocks?: (firstBlockHtml: string, newBlocksHtml: string[]) => void
  /** Backspace at the start of a non-empty block — merge into the previous block. */
  onMergeWithPrev?: (currentHtml: string) => void
  /** Delete at the end of a non-empty block — absorb the next block. */
  onMergeWithNext?: (currentHtml: string) => void
  /** Called after a non-paragraph block is downgraded to paragraph. */
  onConvertedToParagraph?: () => void
  /** Toggle an inline mark over the current selection (⌘B / ⌘I / ⌘U). */
  onToggleMark?: (type: ToggleableMark) => void
  onShiftArrowUp?: () => void
  onShiftArrowDown?: () => void
  /** Open the image library to replace the current image. */
  onChangeImage?: () => void
  /** Insert an empty paragraph immediately before this block. */
  onInsertParagraphBefore?: () => void
  /** Insert an empty paragraph after this block, or focus the trailing one. */
  onInsertParagraphAfter?: () => void
  onInsertListItemBefore?: () => void
  onInsertListItemAfter?: () => void
  /** Precomputed marker text for this numbered-list item (zero-padded or a→z). */
  listLabel?: string
  /** Open the numbering popover anchored to this item's marker badge. */
  onMarkerClick?: (rect: DOMRect) => void
  elRef: (el: HTMLElement | null) => void
}

export function EditableBlock({
  block,
  blockIndex,
  sidenoteBase,
  isFirst,
  isOnly,
  onChange,
  onEnter,
  onDelete,
  onSlash,
  onSlashInput,
  isSlashActive,
  onArrowUp,
  onArrowDown,
  onArrowLeft,
  onArrowRight,
  onPasteBlocks,
  onMergeWithPrev,
  onMergeWithNext,
  onConvertedToParagraph,
  onToggleMark,
  onShiftArrowUp,
  onShiftArrowDown,
  onChangeImage,
  onInsertParagraphBefore,
  onInsertParagraphAfter,
  onInsertListItemBefore,
  onInsertListItemAfter,
  listLabel,
  onMarkerClick,
  elRef
}: EditableBlockProps) {
  const placeholder = isFirst && isOnly && block.type === 'paragraph' ? 'Start writing…' : undefined

  const slashAnchorProps = isSlashActive ? { 'data-slash-anchor': '' } : {}

  // Local ref to the DOM element — needed for the imperative innerHTML update.
  const contentRef = useRef<HTMLElement | null>(null)
  const captionRef = useRef<HTMLElement | null>(null)
  // Metric-only: the subtext line below the value.
  const subtextRef = useRef<HTMLElement | null>(null)
  const showcaseMediaRef = useRef<HTMLElement | null>(null)

  // Stable combined ref: forwards to both contentRef and the parent's elRef
  // callback without recreating on every render.
  const elRefRef = useRef(elRef)
  useEffect(() => {
    elRefRef.current = elRef
  }, [elRef])
  const combinedRef = useCallback((el: HTMLElement | null) => {
    contentRef.current = el
    elRefRef.current(el)
  }, [])
  const showcaseMediaCallbackRef = useCallback((el: HTMLElement | null) => {
    showcaseMediaRef.current = el
  }, [])

  // Whether this non-text block currently has keyboard focus (drives overlay).
  const [isFocused, setIsFocused] = useState(false)

  // A media block is a collection of ONE — the same docked inspector edits it
  // through the same item algebra. Called unconditionally because it is a hook.
  const mediaItems = useMemo(() => (block.type === 'media' ? [block] : []), [block])
  const mediaProperties = useMediaProperties(mediaItems, ([next]) => {
    // Rides `onChange`'s history debounce like every caption in the editor.
    if (next) onChange(next)
  })

  // The link card's rail, mirroring the media inspector.
  const [cardPropertiesOpen, setCardPropertiesOpen] = useState(false)

  // Keyboard handler for caret-less blocks: arrow keys navigate between
  // blocks, Backspace/Delete removes the block, Enter inserts a paragraph above.
  const handleNonTextKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      // Only the keystrokes aimed at the BLOCK, never the ones aimed at
      // something inside it (a field in the card's rail, say).
      if (e.target !== e.currentTarget) return

      switch (e.key) {
        case 'ArrowUp':
          if (!e.shiftKey) {
            e.preventDefault()
            onArrowUp?.()
          }
          break
        case 'ArrowDown':
          if (!e.shiftKey) {
            e.preventDefault()
            onArrowDown?.()
          }
          break
        case 'Enter':
          if (!e.shiftKey) {
            e.preventDefault()
            onInsertParagraphBefore?.()
          }
          break
        case 'ArrowLeft':
          if (!e.shiftKey) {
            e.preventDefault()
            onArrowLeft?.()
          }
          break
        case 'ArrowRight':
          if (!e.shiftKey) {
            e.preventDefault()
            onArrowRight?.()
          }
          break
        case 'Tab':
          e.preventDefault()
          break
        case 'Backspace':
        case 'Delete':
          e.preventDefault()
          onDelete()
          break
      }
    },
    [onArrowUp, onArrowDown, onArrowLeft, onArrowRight, onDelete, onInsertParagraphBefore]
  )

  const focusCaption = useCallback((position: 'start' | 'end') => {
    const caption = captionRef.current
    if (caption) placeCaret(caption, position)
  }, [])

  // Metric-only: move the caret into the subtext line below the value.
  const focusSubtext = useCallback((position: 'start' | 'end') => {
    const subtext = subtextRef.current
    if (subtext) placeCaret(subtext, position)
  }, [])

  // From a caption, move focus back to the element it captions: the showcase
  // media when present, otherwise the block's own text.
  const focusCaptionOrigin = useCallback(() => {
    const media = showcaseMediaRef.current
    if (media) {
      media.focus()
      return
    }
    const content = contentRef.current
    if (content) placeCaret(content, 'end')
  }, [])

  const handleShowcaseMediaKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return
      switch (e.key) {
        case 'ArrowUp':
          if (!e.shiftKey) {
            e.preventDefault()
            onArrowUp?.()
          }
          break
        case 'ArrowDown':
          if (!e.shiftKey) {
            e.preventDefault()
            if (captionRef.current) focusCaption('start')
            else onArrowDown?.()
          }
          break
        case 'Enter':
          if (!e.shiftKey) {
            e.preventDefault()
            onInsertParagraphBefore?.()
          }
          break
        case 'ArrowLeft':
          if (!e.shiftKey) {
            e.preventDefault()
            onArrowLeft?.()
          }
          break
        case 'ArrowRight':
          if (!e.shiftKey) {
            e.preventDefault()
            if (captionRef.current) focusCaption('start')
            else onArrowRight?.()
          }
          break
        case 'Tab':
          e.preventDefault()
          break
        case 'Backspace':
        case 'Delete':
          e.preventDefault()
          onDelete()
          break
      }
    },
    [
      onArrowUp,
      onArrowDown,
      onArrowLeft,
      onArrowRight,
      onDelete,
      focusCaption,
      onInsertParagraphBefore
    ]
  )

  // Update innerHTML when block content changes externally. While the user is
  // actively typing the element has focus — skip the update so we never reset
  // the cursor position. Caret-less blocks have no editable children.
  useEffect(() => {
    if (isCaretlessBlock(block)) return
    const el = contentRef.current
    if (!el || document.activeElement === el) return
    const html =
      block.type === 'code_block'
        ? block.children.map((c) => c.text).join('')
        : 'children' in block
          ? inlineNodesToHtml(block.children as InlineNode[], sidenoteBase)
          : ''
    el.innerHTML = html
    // `sidenoteBase` is a dep so a note added/removed in an EARLIER block
    // re-serialises this (non-focused) block with its new ordinals.
  }, [block, sidenoteBase])

  useEffect(() => {
    if (!hasCaption(block)) return
    const el = captionRef.current
    if (!el || document.activeElement === el) return
    el.innerText = block.caption ?? ''
  }, [block])

  useEffect(() => {
    if (block.type !== 'metric') return
    const el = subtextRef.current
    if (!el || document.activeElement === el) return
    el.innerText = block.subtext ?? ''
  }, [block])

  // ---------------------------------------------------------------------------
  // Keyboard handling
  // ---------------------------------------------------------------------------

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      // The cross-block delete handler runs in the document capture phase and
      // calls preventDefault when it processes a multi-block deletion.
      if (e.nativeEvent.defaultPrevented) return

      // While the slash menu is open, hand Enter and the arrows to the menu.
      if (isSlashActive) {
        if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') {
          e.preventDefault()
          return
        }
      }

      // Tab's only role is one-step indentation on indentable blocks.
      if (e.key === 'Tab') {
        e.preventDefault()
        if (
          block.type === 'paragraph' ||
          block.type === 'heading' ||
          block.type === 'blockquote' ||
          block.type === 'metric'
        ) {
          const isIndented = block.indent === true
          if (!e.shiftKey && !isIndented) {
            onChange({ ...block, indent: true })
          } else if (e.shiftKey && isIndented) {
            onChange({ ...block, indent: undefined })
          }
        }
        return
      }

      // Shift+ArrowUp: extend selection upward across blocks.
      if (e.key === 'ArrowUp' && e.shiftKey) {
        const sel = window.getSelection()
        const focusInBlock = e.currentTarget.contains(sel?.focusNode ?? null)
        const atFirst = focusInBlock ? isFocusAtFirstLine(e.currentTarget) : false
        if (!focusInBlock && sel?.focusNode) {
          // Focus is in a different block: jump a full line up from the focus
          // and extend to whatever caret position lands there.
          e.preventDefault()
          const r = document.createRange()
          r.setStart(sel.focusNode, sel.focusOffset)
          r.collapse(true)
          const rect = r.getBoundingClientRect()
          const lineH = Math.max(rect.height, 20)
          const target = document.caretRangeFromPoint(rect.left, rect.top - lineH)
          if (
            target &&
            !(target.startContainer === sel.focusNode && target.startOffset === sel.focusOffset)
          ) {
            sel.extend(target.startContainer, target.startOffset)
          }
          return
        }
        if (onShiftArrowUp && atFirst) {
          e.preventDefault()
          onShiftArrowUp()
          return
        }
      }

      // Shift+ArrowDown: extend selection downward across blocks.
      if (e.key === 'ArrowDown' && e.shiftKey) {
        const sel = window.getSelection()
        const focusInBlock = e.currentTarget.contains(sel?.focusNode ?? null)
        const atLast = focusInBlock ? isFocusAtLastLine(e.currentTarget) : false
        if (!focusInBlock && sel?.focusNode) {
          e.preventDefault()
          const r = document.createRange()
          r.setStart(sel.focusNode, sel.focusOffset)
          r.collapse(true)
          const rect = r.getBoundingClientRect()
          const lineH = Math.max(rect.height, 20)
          const target = document.caretRangeFromPoint(rect.left, rect.bottom + lineH)
          if (
            target &&
            !(target.startContainer === sel.focusNode && target.startOffset === sel.focusOffset)
          ) {
            sel.extend(target.startContainer, target.startOffset)
          }
          return
        }
        if (onShiftArrowDown && atLast) {
          e.preventDefault()
          onShiftArrowDown()
          return
        }
      }

      // ArrowUp from a subheading's / metric's first line → its eyebrow caption.
      if (
        e.key === 'ArrowUp' &&
        !e.shiftKey &&
        (block.type === 'heading' || block.type === 'metric') &&
        isCaretAtFirstLine(e.currentTarget)
      ) {
        e.preventDefault()
        focusCaption('end')
        return
      }

      if (e.key === 'ArrowUp' && !e.shiftKey && onArrowUp && isCaretAtFirstLine(e.currentTarget)) {
        e.preventDefault()
        onArrowUp()
        return
      }

      // ArrowDown from a blockquote's last line → its citation; from a metric's
      // last line → its subtext.
      if (
        e.key === 'ArrowDown' &&
        !e.shiftKey &&
        (block.type === 'blockquote' || block.type === 'metric') &&
        isCaretAtLastLine(e.currentTarget)
      ) {
        e.preventDefault()
        if (block.type === 'metric') focusSubtext('start')
        else focusCaption('start')
        return
      }

      if (
        e.key === 'ArrowDown' &&
        !e.shiftKey &&
        onArrowDown &&
        isCaretAtLastLine(e.currentTarget)
      ) {
        e.preventDefault()
        onArrowDown()
        return
      }

      // ArrowLeft at the start of a subheading / metric value → its eyebrow.
      if (
        e.key === 'ArrowLeft' &&
        !e.shiftKey &&
        (block.type === 'heading' || block.type === 'metric') &&
        isCaretAtStart(e.currentTarget)
      ) {
        e.preventDefault()
        focusCaption('end')
        return
      }

      if (e.key === 'ArrowLeft' && !e.shiftKey && onArrowLeft && isCaretAtStart(e.currentTarget)) {
        e.preventDefault()
        onArrowLeft()
        return
      }

      // ArrowRight at the end of a blockquote → its citation; of a metric → its subtext.
      if (
        e.key === 'ArrowRight' &&
        !e.shiftKey &&
        (block.type === 'blockquote' || block.type === 'metric') &&
        isCaretAtEnd(e.currentTarget)
      ) {
        e.preventDefault()
        if (block.type === 'metric') focusSubtext('start')
        else focusCaption('start')
        return
      }

      if (e.key === 'ArrowRight' && !e.shiftKey && onArrowRight && isCaretAtEnd(e.currentTarget)) {
        e.preventDefault()
        onArrowRight()
        return
      }

      // List Enter behaviour (numbered + bulleted; caret-position dependent).
      if (e.key === 'Enter' && !e.shiftKey && isListItemType(block.type)) {
        e.preventDefault()
        // Empty item → exit the list, converting to a paragraph.
        if (isBlockEmpty(block)) {
          onChange({ type: 'paragraph', children: [{ type: 'text', text: '' }] })
          onConvertedToParagraph?.()
          return
        }
        // Caret at start → add an empty item before; keep editing this one.
        if (isCaretAtStart(e.currentTarget) && onInsertListItemBefore) {
          // This element is reused (index-based key) as the new empty item;
          // its text lives on in the store on the block that shifts down.
          e.currentTarget.innerHTML = ''
          onInsertListItemBefore()
          return
        }
        if (isCaretAtEnd(e.currentTarget) && onInsertListItemAfter) {
          onInsertListItemAfter()
          return
        }
        const { before, after } = getCaretSplitHtml(e.currentTarget)
        e.currentTarget.innerHTML = before
        onEnter(before, after)
        return
      }

      // Enter → insert paragraph above at caret start; otherwise split at caret.
      // Code blocks keep Enter as a literal newline.
      if (e.key === 'Enter' && !e.shiftKey && block.type !== 'code_block') {
        e.preventDefault()
        if (isCaretAtStart(e.currentTarget) && onInsertParagraphBefore) {
          e.currentTarget.innerHTML = ''
          onInsertParagraphBefore()
          return
        }
        const { before, after } = getCaretSplitHtml(e.currentTarget)
        // Trim the current block's DOM to the "before" portion immediately so
        // the sync effect won't fight us while the element still has focus.
        e.currentTarget.innerHTML = before
        onEnter(before, after)
        return
      }

      // Backspace/Delete on empty block → delete block
      if ((e.key === 'Backspace' || e.key === 'Delete') && isBlockEmpty(block)) {
        e.preventDefault()
        onDelete()
        return
      }

      // Backspace at the start of a non-empty, non-paragraph block → downgrade to paragraph
      if (
        e.key === 'Backspace' &&
        isCaretAtStart(e.currentTarget) &&
        (block.type === 'heading' ||
          block.type === 'blockquote' ||
          block.type === 'metric' ||
          isListItemType(block.type) ||
          block.type === 'code_block')
      ) {
        e.preventDefault()
        const children =
          'children' in block
            ? (block.children as InlineNode[])
            : [{ type: 'text' as const, text: '' }]
        onChange({ type: 'paragraph', children })
        onConvertedToParagraph?.()
        return
      }

      // Backspace at the start of a non-empty block → merge into previous block
      if (e.key === 'Backspace' && onMergeWithPrev && isCaretAtStart(e.currentTarget)) {
        e.preventDefault()
        onMergeWithPrev(e.currentTarget.innerHTML)
        return
      }

      // Delete at the end of a non-empty block → absorb the next block
      if (e.key === 'Delete' && onMergeWithNext && isCaretAtEnd(e.currentTarget)) {
        e.preventDefault()
        onMergeWithNext(e.currentTarget.innerHTML)
        return
      }

      // ⌘B / ⌘I / ⌘U → toggle bold / italic / underline over the selection,
      // through the AST so a second press reliably removes the mark.
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.shiftKey &&
        (e.key === 'b' || e.key === 'i' || e.key === 'u')
      ) {
        e.preventDefault()
        if (onToggleMark && block.type !== 'code_block') {
          const markForKey = { b: 'bold', i: 'italic', u: 'underline' } as const
          onToggleMark(markForKey[e.key as 'b' | 'i' | 'u'])
        }
        return
      }
    },
    [
      block,
      onChange,
      onEnter,
      onDelete,
      isSlashActive,
      onArrowUp,
      onArrowDown,
      onArrowLeft,
      onArrowRight,
      onMergeWithPrev,
      onMergeWithNext,
      onConvertedToParagraph,
      onToggleMark,
      onShiftArrowUp,
      onShiftArrowDown,
      onInsertParagraphBefore,
      onInsertListItemBefore,
      onInsertListItemAfter,
      focusCaption,
      focusSubtext
    ]
  )

  // ---------------------------------------------------------------------------
  // Input / change handling
  // ---------------------------------------------------------------------------

  const handleInput = useCallback(
    (e: React.FormEvent<HTMLElement>) => {
      const el = e.currentTarget

      // Detect backtick wrapping for inline code: `text`
      if (block.type !== 'code_block') {
        const text = el.innerText ?? ''
        const match = text.match(/`([^`]+)`/)
        if (match && 'children' in block) {
          const nodes = domToInlineNodes(el)
          const replaced: InlineNode[] = nodes.flatMap((n) => {
            if (!n.marks || n.marks.length === 0) {
              const parts: InlineNode[] = []
              const remaining = n.text
              let m: RegExpExecArray | null
              const re = /`([^`]+)`/g
              let lastIndex = 0
              while ((m = re.exec(remaining)) !== null) {
                if (m.index > lastIndex) {
                  parts.push({ type: 'text', text: remaining.slice(lastIndex, m.index) })
                }
                parts.push({ type: 'text', text: m[1], marks: [{ type: 'code' }] })
                lastIndex = m.index + m[0].length
              }
              if (lastIndex < remaining.length) {
                parts.push({ type: 'text', text: remaining.slice(lastIndex) })
              }
              return parts.length > 0 ? parts : [n]
            }
            return [n]
          })

          onChange({ ...block, children: replaced } as BlockNode)
          el.innerHTML = inlineNodesToHtml(replaced, sidenoteBase)
          const range = document.createRange()
          range.selectNodeContents(el)
          range.collapse(false)
          window.getSelection()?.removeAllRanges()
          window.getSelection()?.addRange(range)
          return
        }
      }

      if (block.type === 'code_block') {
        const text = el.innerText ?? ''
        onChange({ ...block, children: [{ type: 'text', text }] })
        return
      }

      if ('children' in block) {
        const nodes = domToInlineNodes(el)
        // Deleting an annotation's text leaves its empty wrapper orphaned in
        // the DOM. Strip it; it holds no characters, so selection offsets hold.
        const off = getSelectionOffsets(el)
        if (stripEmptySidenoteWrappers(el) && off) {
          setSelectionRange(el, off.start, off.end)
        }
        // This block is focused, so its content-sync effect won't re-serialise
        // it — refresh its own superscripts directly.
        renumberSidenoteSups(el, sidenoteBase)
        onChange({ ...block, children: nodes } as BlockNode)
      }

      // Notify parent about text changes while the slash menu is active so it
      // can update the filter query or dismiss the menu.
      onSlashInput?.(el.innerText ?? '')
    },
    [block, sidenoteBase, onChange, onSlashInput]
  )

  const handleCaptionInput = useCallback(
    (e: React.FormEvent<HTMLElement>) => {
      if (!hasCaption(block)) return
      const el = e.currentTarget
      const text = (el.innerText || el.textContent || '').replace(/\n$/, '')
      if (text.trim().length === 0) el.innerHTML = ''
      onChange({ ...block, caption: text.trim().length > 0 ? text : undefined })
    },
    [block, onChange]
  )

  // Metric-only: persist the subtext line.
  const handleSubtextInput = useCallback(
    (e: React.FormEvent<HTMLElement>) => {
      if (block.type !== 'metric') return
      const el = e.currentTarget
      const text = (el.innerText || el.textContent || '').replace(/\n$/, '')
      if (text.trim().length === 0) el.innerHTML = ''
      onChange({ ...block, subtext: text.trim().length > 0 ? text : undefined })
    },
    [block, onChange]
  )

  const handleCaptionKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.stopPropagation()
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        return
      }
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault()
        document.execCommand('insertLineBreak')
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        onInsertParagraphAfter?.()
        return
      }
      if (e.key === 'ArrowUp' && !e.shiftKey && isCaretAtStart(e.currentTarget)) {
        e.preventDefault()
        focusCaptionOrigin()
        return
      }
      if (e.key === 'ArrowDown' && !e.shiftKey && isCaretAtEnd(e.currentTarget)) {
        e.preventDefault()
        onArrowDown?.()
        return
      }
      if (e.key === 'ArrowLeft' && !e.shiftKey && isCaretAtStart(e.currentTarget)) {
        e.preventDefault()
        focusCaptionOrigin()
        return
      }
      if (e.key === 'ArrowRight' && !e.shiftKey && isCaretAtEnd(e.currentTarget)) {
        e.preventDefault()
        onArrowRight?.()
        return
      }
    },
    [onArrowDown, onArrowRight, onInsertParagraphAfter, focusCaptionOrigin]
  )

  // Move the caret to the start of the block's own editable content (used by
  // the subheading eyebrow, which sits above the heading text).
  const focusContentStart = useCallback(() => {
    const content = contentRef.current
    if (content) placeCaret(content, 'start')
  }, [])

  // Keydown handler for a caption that sits ABOVE its block (the eyebrow).
  const handleHeadingCaptionKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.stopPropagation()
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        return
      }
      if (e.key === 'Enter' && e.shiftKey) {
        e.preventDefault()
        document.execCommand('insertLineBreak')
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        focusContentStart()
        return
      }
      if (
        (e.key === 'ArrowDown' || e.key === 'ArrowRight') &&
        !e.shiftKey &&
        isCaretAtEnd(e.currentTarget)
      ) {
        e.preventDefault()
        focusContentStart()
        return
      }
      if (
        (e.key === 'ArrowUp' || e.key === 'ArrowLeft') &&
        !e.shiftKey &&
        isCaretAtStart(e.currentTarget)
      ) {
        e.preventDefault()
        onArrowUp?.()
        return
      }
    },
    [onArrowUp, focusContentStart]
  )

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLElement>) => {
      e.preventDefault()

      // Code blocks are plain text — no markup, no splitting.
      if (block.type === 'code_block') {
        const text = e.clipboardData.getData('text/plain')
        if (text) document.execCommand('insertText', false, text)
        return
      }

      const htmlData = e.clipboardData.getData('text/html')
      const textData = e.clipboardData.getData('text/plain') ?? ''

      const lines: string[] = htmlData
        ? sanitiseClipboardHtml(htmlData).split('<br>').filter(Boolean)
        : textData.split('\n').filter(Boolean).map(escapeHtml)

      if (lines.length === 0) return

      // Single line (or no multi-block callback) — standard inline insert.
      if (lines.length === 1 || !onPasteBlocks) {
        document.execCommand(htmlData ? 'insertHTML' : 'insertText', false, lines[0])
        return
      }

      const el = contentRef.current
      if (!el) return

      const { before, after } = getCaretSplitHtml(el)
      const firstBlockHtml = before + lines[0]
      const newBlocksHtml = [...lines.slice(1, -1), lines[lines.length - 1] + after]

      // The sync effect skips a focused element, so this persists.
      el.innerHTML = firstBlockHtml
      onPasteBlocks(firstBlockHtml, newBlocksHtml)
    },
    [block.type, onPasteBlocks]
  )

  // ---------------------------------------------------------------------------
  // Slash menu detection — fires on keyup so the "/" is already in the DOM
  // ---------------------------------------------------------------------------

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLElement>) => {
      const isTextBlock = 'children' in block
      if (e.key === '/' && isTextBlock) {
        // Open the slash menu whenever "/" is the first character typed.
        if (getTextBeforeCursor(e.currentTarget) === '/') {
          onSlash(e.currentTarget)
        }
      }
    },
    [block, onSlash]
  )

  // ---------------------------------------------------------------------------
  // Horizontal rule (non-editable)
  // ---------------------------------------------------------------------------

  if (block.type === 'horizontal_rule') {
    return (
      <div
        tabIndex={0}
        role="separator"
        ref={combinedRef as React.RefCallback<HTMLDivElement>}
        className={editorHrWrapperStyle}
        data-block-index={blockIndex}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        onKeyDown={handleNonTextKeyDown}
      >
        <div className={editorHrShellStyle}>
          <hr className={editorHrStyle} />
          {isFocused && (
            <div className={editorImageOverlayStyle} onMouseDown={(e) => e.preventDefault()}>
              <div className={editorImageOverlayTintStyle} aria-hidden />
              <div className={editorImageOverlayActionsStyle}>
                <Button
                  type="button"
                  variant="icon"
                  tabIndex={-1}
                  aria-label="Delete horizontal rule"
                  onClick={onDelete}
                >
                  <TrashIcon className={menuIconStyle} />
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Code block
  // ---------------------------------------------------------------------------

  if (block.type === 'code_block') {
    return (
      <div className={editorCodeBlockWrapperStyle}>
        <label className="sr-only" htmlFor={`code-language-${blockIndex}`}>
          Code language
        </label>
        <select
          id={`code-language-${blockIndex}`}
          className={editorCodeLanguageSelectStyle}
          value={block.language ?? ''}
          onChange={(e) => {
            const value = e.target.value
            onChange({
              ...block,
              language: value === '' ? undefined : CodeLanguageSchema.parse(value)
            })
          }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {CODE_LANGUAGE_OPTIONS.map((option) => (
            <option key={option.value || 'plain'} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <pre
          ref={combinedRef as React.RefCallback<HTMLPreElement>}
          className={editorCodeBlockStyle}
          contentEditable
          suppressContentEditableWarning
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onInput={handleInput}
          onPaste={handlePaste}
          data-block-index={blockIndex}
          {...slashAnchorProps}
        />
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Heading
  // ---------------------------------------------------------------------------

  if (block.type === 'heading') {
    return (
      <div className={articleHeadingShellStyle} data-indented={block.indent ? '' : undefined}>
        <span
          ref={captionRef}
          className={editorSubheadingCaptionStyle}
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Add caption..."
          data-empty={!block.caption?.trim() ? '' : undefined}
          onInput={handleCaptionInput}
          onKeyDown={handleHeadingCaptionKeyDown}
        />
        <h2
          ref={combinedRef as React.RefCallback<HTMLHeadingElement>}
          className={`${editableBaseStyle} ${typographyStyles({ type: 'subheading' })}`}
          contentEditable
          suppressContentEditableWarning
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onKeyUp={handleKeyUp}
          onPaste={handlePaste}
          data-placeholder={placeholder}
          data-block-index={blockIndex}
          data-empty={isBlockEmpty(block) ? '' : undefined}
          {...slashAnchorProps}
        />
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Blockquote
  // ---------------------------------------------------------------------------

  if (block.type === 'blockquote') {
    return (
      <div className={articleBlockquoteShellStyle} data-indented={block.indent ? '' : undefined}>
        <span className="article-blockquote-mark" aria-hidden />
        <div className={articleBlockquoteBodyStyle}>
          <blockquote
            ref={combinedRef as React.RefCallback<HTMLElement>}
            className={`${editableBaseStyle} ${articleBlockquoteStyle}`}
            contentEditable
            suppressContentEditableWarning
            onKeyDown={handleKeyDown}
            onInput={handleInput}
            onKeyUp={handleKeyUp}
            onPaste={handlePaste}
            data-placeholder={placeholder}
            data-block-index={blockIndex}
            data-empty={isBlockEmpty(block) ? '' : undefined}
            {...slashAnchorProps}
          />
          <cite
            ref={captionRef}
            className={editorBlockquoteCaptionStyle}
            contentEditable
            suppressContentEditableWarning
            data-placeholder="Add citation..."
            data-block-index={blockIndex}
            data-empty={!block.caption?.trim() ? '' : undefined}
            onInput={handleCaptionInput}
            onKeyDown={handleCaptionKeyDown}
          />
        </div>
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Media block — the picture (or clip) with an editable caption
  // ---------------------------------------------------------------------------

  if (block.type === 'media') {
    const showcaseMediaContract = {
      tabIndex: 0 as const,
      'data-showcase-media': '',
      onKeyDown: handleShowcaseMediaKeyDown
    }

    return (
      <figure
        ref={combinedRef as React.RefCallback<HTMLElement>}
        className={editorShowcaseStyle}
        data-block-index={blockIndex}
        data-showcase-block=""
      >
        <MediaObject
          item={block}
          classes={{
            root: mediaBlockStyles.root,
            frame: mediaBlockStyles.frame,
            image: editorImgStyle
          }}
          label="Image"
          propertiesOpen={mediaProperties.isOpen(0)}
          onToggleProperties={() => mediaProperties.toggle(0)}
          onReplace={() => onChangeImage?.()}
          onRemove={() => onDelete?.()}
          removeLabel="Delete image"
          mediaProps={{
            // Held, not played: this canvas is for arranging blocks.
            autoPlay: false,
            // The block's tab stop — the media element itself.
            elementRef: showcaseMediaCallbackRef,
            ...showcaseMediaContract
          }}
          placeholder={
            <span
              aria-label="Image placeholder"
              className={editorImagePlaceholderStyle}
              ref={showcaseMediaCallbackRef}
              {...showcaseMediaContract}
            >
              📷
            </span>
          }
        />
        {mediaProperties.panel && (
          // A SIBLING of the block: a panel full of inputs inside the figure
          // would put every keystroke through the showcase handler. It docks
          // to the viewport, so it takes no space here.
          <MediaPropertiesPanel key={mediaProperties.panel.key} {...mediaProperties.panel.props} />
        )}
        <figcaption
          ref={captionRef}
          className={editorCaptionStyle}
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Add caption..."
          data-block-index={blockIndex}
          data-empty={!block.caption?.trim() ? '' : undefined}
          onInput={handleCaptionInput}
          onKeyDown={handleCaptionKeyDown}
        />
      </figure>
    )
  }

  // ---------------------------------------------------------------------------
  // Link card — a picture, some words and a destination, authored in the rail
  // ---------------------------------------------------------------------------

  if (block.type === 'link_card') {
    const onConfigChange = (config: LinkCardConfig) => onChange({ ...block, config })

    return (
      <figure
        ref={combinedRef as React.RefCallback<HTMLElement>}
        className={editorShowcaseStyle}
        data-block-index={blockIndex}
        data-showcase-block=""
      >
        <div className={`${mediaBlockStyles.root} group/cell`}>
          <div
            tabIndex={0}
            data-showcase-media=""
            data-media-cell=""
            className={`${mediaBlockStyles.frame} ${editorShowcaseMediaStyle} ${editorFurnitureWrapperStyle}`}
            ref={showcaseMediaCallbackRef as React.RefCallback<HTMLDivElement>}
            onKeyDown={handleShowcaseMediaKeyDown}
          >
            <LinkCard config={block.config} interactive={false} />
          </div>
          <div className={mediaObjectRailStyle}>
            <OptionList direction="inline">
              <OptionList.Toolbar aria-label="Link card actions">
                <OptionList.Option
                  aria-label="Card properties"
                  aria-pressed={cardPropertiesOpen}
                  onClick={() => setCardPropertiesOpen((open) => !open)}
                >
                  <SettingsIcon aria-hidden />
                </OptionList.Option>
                <OptionList.Option aria-label="Delete card" onClick={onDelete}>
                  <TrashIcon aria-hidden />
                </OptionList.Option>
              </OptionList.Toolbar>
            </OptionList>
          </div>
        </div>
        {cardPropertiesOpen && (
          <LinkCardPropertiesPanel
            config={block.config}
            onChange={onConfigChange}
            onDismiss={() => setCardPropertiesOpen(false)}
          />
        )}
      </figure>
    )
  }

  // ---------------------------------------------------------------------------
  // List item (numbered or bulleted)
  // ---------------------------------------------------------------------------

  if (block.type === 'list_item' || block.type === 'bullet_list_item') {
    const markerLabel = listLabel ?? '1'

    return (
      <div className={editorListItemShellStyle} data-list-item="">
        {block.type === 'list_item' ? (
          <button
            type="button"
            className={editorListMarkerButtonStyle}
            data-numbering-marker=""
            aria-label="List numbering options"
            // Keep the caret in the editor when opening the popover.
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => onMarkerClick?.(e.currentTarget.getBoundingClientRect())}
          >
            <span className={editorListMarkerPillStyle}>{markerLabel}</span>
          </button>
        ) : (
          <button
            type="button"
            className={
              block.type === 'bullet_list_item' && block.marker
                ? editorListBulletIconButtonStyle
                : editorListBulletButtonStyle
            }
            data-bullet-marker=""
            aria-label="List bullet options"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => onMarkerClick?.(e.currentTarget.getBoundingClientRect())}
          >
            {block.type === 'bullet_list_item' && block.marker && (
              <span className={editorBulletCircleClass[block.marker]} />
            )}
          </button>
        )}
        <p
          ref={combinedRef as React.RefCallback<HTMLParagraphElement>}
          className={editorListItemContentStyle}
          contentEditable
          suppressContentEditableWarning
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onKeyUp={handleKeyUp}
          onPaste={handlePaste}
          data-block-index={blockIndex}
          data-empty={isBlockEmpty(block) ? '' : undefined}
          {...slashAnchorProps}
        />
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Metric — an eyebrow caption above a gradient value, with a subtext beneath
  // ---------------------------------------------------------------------------

  if (block.type === 'metric') {
    return (
      <div className={articleMetricStyle} data-indented={block.indent ? '' : undefined}>
        <span
          ref={captionRef}
          className={editorMetricCaptionStyle}
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Add caption..."
          data-empty={!block.caption?.trim() ? '' : undefined}
          onInput={handleCaptionInput}
          onKeyDown={handleHeadingCaptionKeyDown}
        />
        <div
          ref={combinedRef as React.RefCallback<HTMLDivElement>}
          className={editorMetricValueStyle}
          contentEditable
          suppressContentEditableWarning
          onKeyDown={handleKeyDown}
          onInput={handleInput}
          onKeyUp={handleKeyUp}
          onPaste={handlePaste}
          data-block-index={blockIndex}
          data-empty={isBlockEmpty(block) ? '' : undefined}
          {...slashAnchorProps}
        />
        <span
          ref={subtextRef}
          className={editorMetricLabelStyle}
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Add subtext..."
          data-block-index={blockIndex}
          data-empty={!block.subtext?.trim() ? '' : undefined}
          onInput={handleSubtextInput}
          onKeyDown={handleCaptionKeyDown}
        />
      </div>
    )
  }

  // ---------------------------------------------------------------------------
  // Paragraph (default)
  // ---------------------------------------------------------------------------

  const align = block.align

  return (
    <p
      ref={combinedRef as React.RefCallback<HTMLParagraphElement>}
      className={`${editableBaseStyle} ${typographyStyles({
        type: 'bodyLarge',
        wrap: align === 'center' ? 'balance' : undefined
      })}`}
      contentEditable
      suppressContentEditableWarning
      onKeyDown={handleKeyDown}
      onInput={handleInput}
      onKeyUp={handleKeyUp}
      onPaste={handlePaste}
      data-placeholder={placeholder}
      data-block-index={blockIndex}
      data-empty={isBlockEmpty(block) ? '' : undefined}
      data-indented={block.indent ? '' : undefined}
      data-align={align}
      {...slashAnchorProps}
    />
  )
}
