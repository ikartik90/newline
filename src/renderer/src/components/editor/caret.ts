// ---------------------------------------------------------------------------
// Caret and selection helpers over a contentEditable element — module-level,
// no component state.
// ---------------------------------------------------------------------------

/** Walk depth-first and return the first leaf Text node in `root`. */
export function firstTextNode(root: Node): Text | null {
  if (root.nodeType === Node.TEXT_NODE) return root as Text
  for (let i = 0; i < root.childNodes.length; i++) {
    const found = firstTextNode(root.childNodes[i])
    if (found) return found
  }
  return null
}

/** Walk depth-first and return the last leaf Text node in `root`. */
export function lastTextNode(root: Node): Text | null {
  if (root.nodeType === Node.TEXT_NODE) return root as Text
  for (let i = root.childNodes.length - 1; i >= 0; i--) {
    const found = lastTextNode(root.childNodes[i])
    if (found) return found
  }
  return null
}

/**
 * The text between the beginning of `el` and the caret. Used to detect a "/"
 * typed at position 0 regardless of how much text follows the caret.
 */
export function getTextBeforeCursor(el: HTMLElement): string {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return ''
  const range = sel.getRangeAt(0).cloneRange()
  range.setStart(el, 0)
  return range.toString()
}

/**
 * The innerHTML of `el` split at the current selection boundary. `before` is
 * everything up to the selection start, `after` everything from the selection
 * end. Selected text is omitted, as Delete would.
 */
export function getCaretSplitHtml(el: HTMLElement): { before: string; after: string } {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return { before: el.innerHTML, after: '' }

  const range = sel.getRangeAt(0)

  const beforeRange = document.createRange()
  beforeRange.selectNodeContents(el)
  beforeRange.setEnd(range.startContainer, range.startOffset)
  const beforeDiv = document.createElement('div')
  beforeDiv.appendChild(beforeRange.cloneContents())

  const afterRange = document.createRange()
  afterRange.selectNodeContents(el)
  afterRange.setStart(range.endContainer, range.endOffset)
  const afterDiv = document.createElement('div')
  afterDiv.appendChild(afterRange.cloneContents())

  return { before: beforeDiv.innerHTML, after: afterDiv.innerHTML }
}

/**
 * Top of an element's content box. Line detection must measure against this,
 * not the border box: a padded block (a code block) would otherwise never
 * register its first line as a boundary and trap the caret.
 */
function contentBoxTop(el: HTMLElement): number {
  const paddingTop = parseFloat(getComputedStyle(el).paddingTop) || 0
  return el.getBoundingClientRect().top + paddingTop
}

function contentBoxBottom(el: HTMLElement): number {
  const paddingBottom = parseFloat(getComputedStyle(el).paddingBottom) || 0
  return el.getBoundingClientRect().bottom - paddingBottom
}

/** True when the caret is on the first visual line, so ArrowUp should leave. */
export function isCaretAtFirstLine(el: HTMLElement): boolean {
  if (!el.textContent) return true
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return true
  const caretRect = sel.getRangeAt(0).getBoundingClientRect()
  if (!caretRect.height) return true
  return caretRect.top < contentBoxTop(el) + caretRect.height
}

/** True when the caret is on the last visual line, so ArrowDown should leave. */
export function isCaretAtLastLine(el: HTMLElement): boolean {
  if (!el.textContent) return true
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return true
  const caretRect = sel.getRangeAt(0).getBoundingClientRect()
  // A zero-height rect means the caret is at an element boundary, not a text
  // node — let the browser handle it.
  if (!caretRect.height) return false
  return caretRect.bottom > contentBoxBottom(el) - caretRect.height
}

/**
 * Like `isCaretAtFirstLine` but inspects the selection FOCUS. Needed for
 * cross-block Shift+Arrow: the range's rect spans the whole multi-block
 * selection, not just the focus line.
 */
export function isFocusAtFirstLine(el: HTMLElement): boolean {
  if (!el.textContent) return true
  const sel = window.getSelection()
  if (!sel || !sel.focusNode || !el.contains(sel.focusNode)) return false
  const r = document.createRange()
  r.setStart(sel.focusNode, sel.focusOffset)
  r.collapse(true)
  const rect = r.getBoundingClientRect()
  if (!rect.height) return true
  return rect.top < contentBoxTop(el) + rect.height
}

export function isFocusAtLastLine(el: HTMLElement): boolean {
  if (!el.textContent) return true
  const sel = window.getSelection()
  const focusNode = sel?.focusNode ?? null
  if (!sel || !focusNode || !el.contains(focusNode)) return false
  const r = document.createRange()
  r.setStart(focusNode, sel.focusOffset)
  r.collapse(true)
  const rect = r.getBoundingClientRect()
  return rect.height ? rect.bottom > contentBoxBottom(el) - rect.height : false
}

/**
 * True when the caret is collapsed at the very start of `el`. False for an
 * active selection so the browser handles deletion of selected text.
 */
export function isCaretAtStart(el: HTMLElement): boolean {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return false
  const range = sel.getRangeAt(0)
  if (!range.collapsed) return false
  if (range.startContainer === el && range.startOffset === 0) return true
  const first = firstTextNode(el)
  return first !== null && range.startContainer === first && range.startOffset === 0
}

/** True when the caret is collapsed at the very end of `el`. */
export function isCaretAtEnd(el: HTMLElement): boolean {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return false
  const range = sel.getRangeAt(0)
  if (!range.collapsed) return false
  if (range.startContainer === el && range.startOffset === el.childNodes.length) return true
  const last = lastTextNode(el)
  return last !== null && range.startContainer === last && range.startOffset === last.length
}

/** Walk Text nodes in DOM order and resolve a character offset to a DOM position. */
export function findTextPositionAtOffset(
  root: Node,
  offset: number
): { node: Text; offset: number } | null {
  let remaining = offset
  function find(node: Node): { node: Text; offset: number } | null {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node as Text
      if (remaining <= t.length) return { node: t, offset: remaining }
      remaining -= t.length
      return null
    }
    for (let i = 0; i < node.childNodes.length; i++) {
      const found = find(node.childNodes[i])
      if (found) return found
    }
    return null
  }
  return find(root)
}

/**
 * Focus `el` and place the caret at a character offset measured by walking
 * Text nodes in DOM order — the merge junction after two blocks are joined.
 */
export function setCursorAtTextOffset(el: HTMLElement, offset: number): void {
  el.focus()
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  const pos = findTextPositionAtOffset(el, offset)
  if (pos) {
    range.setStart(pos.node, pos.offset)
  } else {
    range.selectNodeContents(el)
    range.collapse(false)
  }
  range.collapse(true)
  sel.removeAllRanges()
  sel.addRange(range)
}

/**
 * The current selection as character offsets within `el`, or null when there
 * is no selection anchored inside `el`.
 */
export function getSelectionOffsets(el: HTMLElement): { start: number; end: number } | null {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!el.contains(range.startContainer) || !el.contains(range.endContainer)) return null
  // Boundary nodes can be orphaned mid-edit; a stale range throws here.
  try {
    const pre = document.createRange()
    pre.selectNodeContents(el)
    pre.setEnd(range.startContainer, range.startOffset)
    const start = pre.toString().length
    const end = start + range.toString().length
    return { start, end }
  } catch {
    return null
  }
}

/** Focus `el` and set the DOM selection to the given character-offset range. */
export function setSelectionRange(el: HTMLElement, start: number, end: number): void {
  el.focus()
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  try {
    const startPos = findTextPositionAtOffset(el, start)
    const endPos = findTextPositionAtOffset(el, end)
    if (startPos && endPos) {
      range.setStart(startPos.node, startPos.offset)
      range.setEnd(endPos.node, endPos.offset)
    } else {
      range.selectNodeContents(el)
      range.collapse(false)
    }
    sel.removeAllRanges()
    sel.addRange(range)
  } catch {
    // Offsets can fall out of bounds if the DOM changed underneath us.
  }
}

/** Focus `el` and put the caret at its start or end. */
export function placeCaret(el: HTMLElement, position: 'start' | 'end'): void {
  el.focus()
  if (!el.isContentEditable) return
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  const node = position === 'end' ? lastTextNode(el) : firstTextNode(el)
  if (node) {
    range.setStart(node, position === 'end' ? node.length : 0)
  } else {
    range.setStart(el, 0)
  }
  range.collapse(position !== 'end')
  sel.removeAllRanges()
  sel.addRange(range)
}
