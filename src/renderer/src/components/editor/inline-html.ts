import type { InlineNode, Mark } from '@shared/domain/nodes'
import { sidenoteAnchorName } from '@/utils/sidenotes'

// ---------------------------------------------------------------------------
// DOM ↔ AST serialisation — the editor's contentEditable blocks hold this HTML
// and hand it back through `domToInlineNodes`.
//
// The class names are the prose utilities in `assets/main.css` (`@utility
// article-*`), kept as stable names because they are embedded in HTML strings
// and queried back by selector (`.article-sidenote-ref`).
// ---------------------------------------------------------------------------

export const inlineCodeClass = 'inline-code'
export const linkClass = 'article-link'
export const underlineClass = 'article-underline'
export const strikethroughClass = 'article-strikethrough'
export const highlightClass = 'article-highlight'
export const sidenoteClass = 'article-sidenote'
export const sidenoteTextClass = 'article-sidenote-text'
export const sidenoteRefClass = 'article-sidenote-ref'

/** HTML-escape a plain string so it is safe to inject into innerHTML. */
export function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** HTML-escape a string for use inside a double-quoted attribute value. */
function escapeAttr(text: string): string {
  return escapeHtml(text).replace(/"/g, '&quot;')
}

function isHighlighted(node: InlineNode): boolean {
  return (node.marks ?? []).some((m) => m.type === 'highlight')
}

/** Serialise a node's marks to nested HTML; `highlight` is applied at the run level. */
function styledTextToHtml(node: InlineNode): string {
  let html = escapeHtml(node.text)
  for (const mark of node.marks ?? []) {
    switch (mark.type) {
      case 'bold':
        html = `<strong>${html}</strong>`
        break
      case 'italic':
        html = `<em>${html}</em>`
        break
      case 'code':
        html = `<code class="${inlineCodeClass}">${html}</code>`
        break
      case 'underline':
        html = `<u class="${underlineClass}">${html}</u>`
        break
      case 'strikethrough':
        html = `<s class="${strikethroughClass}">${html}</s>`
        break
      case 'link':
        html = `<a href="${escapeAttr(mark.href)}" class="${linkClass}">${html}</a>`
        break
    }
  }
  return html
}

/** The sidenote id a node carries, or null. Groups a note's contiguous runs. */
function sidenoteIdOf(node: InlineNode): string | null {
  const mark = (node.marks ?? []).find((m) => m.type === 'sidenote')
  return mark?.type === 'sidenote' ? mark.id : null
}

function sidenoteTextOf(node: InlineNode): string {
  const mark = (node.marks ?? []).find((m) => m.type === 'sidenote')
  return mark?.type === 'sidenote' ? mark.text : ''
}

/** Serialise a run of non-sidenote nodes, coalescing consecutive highlights. */
function inlineRunToHtml(nodes: InlineNode[]): string {
  let out = ''
  let i = 0
  while (i < nodes.length) {
    if (isHighlighted(nodes[i])) {
      let inner = ''
      while (i < nodes.length && isHighlighted(nodes[i])) {
        inner += styledTextToHtml(nodes[i])
        i++
      }
      out += `<mark class="${highlightClass}">${inner}</mark>`
    } else {
      out += styledTextToHtml(nodes[i])
      i++
    }
  }
  return out
}

/**
 * Serialise inline nodes to editor HTML. `base` is the count of distinct notes
 * appearing before this block (see `sidenoteBases`): each note's `<sup>` gets
 * its global ordinal in `data-sidenote-number`, rendered via `content:
 * attr(...)`, so numbering survives re-serialisation and stays live on
 * add/remove — a CSS counter cannot, because Chromium does not re-resolve
 * `counter()` when a preceding counter element is removed.
 */
export function inlineNodesToHtml(nodes: InlineNode[], base = 0): string {
  let out = ''
  let i = 0
  let noteIndex = 0
  const numberById = new Map<string, number>()
  while (i < nodes.length) {
    const id = sidenoteIdOf(nodes[i])
    if (id !== null) {
      // One span per note carrying its id/text (for round-tripping) and an
      // anchor-name (for the aside card). The annotated prose gets its own
      // dotted-underline span so the trailing <sup> sits outside the underline
      // and stays on the last word's line.
      const start = i
      while (i < nodes.length && sidenoteIdOf(nodes[i]) === id) i++
      const group = nodes.slice(start, i)
      if (!numberById.has(id)) numberById.set(id, base + ++noteIndex)
      out +=
        `<span class="${sidenoteClass}" data-sidenote-id="${escapeAttr(id)}"` +
        ` data-sidenote-text="${escapeAttr(sidenoteTextOf(group[0]))}"` +
        ` style="anchor-name:${sidenoteAnchorName(id)}">` +
        `<span class="${sidenoteTextClass}">${inlineRunToHtml(group)}</span>` +
        `<sup class="${sidenoteRefClass}" contenteditable="false" aria-hidden="true"` +
        ` data-sidenote-number="${numberById.get(id)}"></sup>` +
        `</span>`
    } else {
      const start = i
      while (i < nodes.length && sidenoteIdOf(nodes[i]) === null) i++
      out += inlineRunToHtml(nodes.slice(start, i))
    }
  }
  return out
}

/** Walk a contentEditable DOM node and extract inline nodes. */
export function domToInlineNodes(el: Node): InlineNode[] {
  const nodes: InlineNode[] = []

  function walk(node: Node, marks: Mark[]) {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent ?? ''
      if (text) nodes.push({ type: 'text', text, ...(marks.length > 0 ? { marks } : {}) })
      return
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const element = node as Element
      const nextMarks = [...marks]

      if (element.tagName === 'STRONG' || element.tagName === 'B') nextMarks.push({ type: 'bold' })
      else if (element.tagName === 'EM' || element.tagName === 'I')
        nextMarks.push({ type: 'italic' })
      else if (element.tagName === 'CODE') nextMarks.push({ type: 'code' })
      else if (element.tagName === 'U') nextMarks.push({ type: 'underline' })
      else if (element.tagName === 'S' || element.tagName === 'STRIKE' || element.tagName === 'DEL')
        nextMarks.push({ type: 'strikethrough' })
      else if (element.tagName === 'MARK') nextMarks.push({ type: 'highlight' })
      else if (element.tagName === 'A') {
        // The raw attribute, NOT `.href`: the latter is resolved against the
        // page URL, so a bare "google.com" would come back as a local path.
        const href = element.getAttribute('href')
        if (href) nextMarks.push({ type: 'link', href })
      } else if (element.tagName === 'SPAN' && element.hasAttribute('data-sidenote-id')) {
        nextMarks.push({
          type: 'sidenote',
          id: element.getAttribute('data-sidenote-id') ?? '',
          text: element.getAttribute('data-sidenote-text') ?? ''
        })
      }
      // The decorative ordinal superscript holds no text — skip it entirely so
      // its CSS-generated digit never leaks into the AST.
      else if (element.tagName === 'SUP') return
      else if (element.tagName === 'BR') return

      element.childNodes.forEach((child) => walk(child, nextMarks))
    }
  }

  el.childNodes.forEach((child) => walk(child, []))
  return nodes
}

/**
 * Remove sidenote wrappers left empty by deleting their annotated text.
 * Returns whether any were removed. Empty wrappers hold no characters, so
 * callers can restore the caret by re-applying the pre-strip offsets.
 */
export function stripEmptySidenoteWrappers(el: HTMLElement): boolean {
  const orphans = Array.from(el.querySelectorAll<HTMLElement>('[data-sidenote-id]')).filter(
    (w) => (w.textContent ?? '') === ''
  )
  orphans.forEach((w) => w.remove())
  return orphans.length > 0
}

/**
 * Renumber a block's sidenote superscripts in place from `base`. Used for the
 * FOCUSED block, whose content-sync effect is skipped to protect the caret.
 * Setting the attribute alone does not touch the editable text.
 */
export function renumberSidenoteSups(el: HTMLElement, base = 0): void {
  const numberById = new Map<string, number>()
  let n = base
  el.querySelectorAll<HTMLElement>('[data-sidenote-id]').forEach((wrapper) => {
    const id = wrapper.getAttribute('data-sidenote-id')
    if (!id) return
    if (!numberById.has(id)) numberById.set(id, ++n)
    const sup = wrapper.querySelector<HTMLElement>(`.${sidenoteRefClass}`)
    if (sup) sup.setAttribute('data-sidenote-number', String(numberById.get(id)))
  })
}

/**
 * Parse clipboard HTML and return a sanitised HTML string suitable for
 * insertion into a contentEditable block. Only semantic inline marks are
 * preserved; style/class attributes, presentational elements and wrappers are
 * stripped. Block-level elements collapse to <br> line breaks.
 */
export function sanitiseClipboardHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html')

  function walk(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE) return escapeHtml(node.textContent ?? '')
    if (node.nodeType !== Node.ELEMENT_NODE) return ''

    const element = node as Element
    const tag = element.tagName.toLowerCase()
    const inner = Array.from(element.childNodes).map(walk).join('')

    switch (tag) {
      case 'br':
        return '<br>'
      case 'p':
      case 'div':
      case 'li':
      case 'h1':
      case 'h2':
      case 'h3':
      case 'h4':
      case 'h5':
      case 'h6':
        return inner ? inner + '<br>' : ''
      case 'strong':
      case 'b':
        return `<strong>${inner}</strong>`
      case 'em':
      case 'i':
        return `<em>${inner}</em>`
      case 'u':
        return `<u class="${underlineClass}">${inner}</u>`
      case 's':
      case 'strike':
      case 'del':
        return `<s class="${strikethroughClass}">${inner}</s>`
      case 'mark':
        return `<mark class="${highlightClass}">${inner}</mark>`
      case 'code':
        return `<code class="${inlineCodeClass}">${inner}</code>`
      // Links — strip the anchor entirely, keep only the visible text.
      case 'a':
        return inner
      default:
        return inner
    }
  }

  const result = Array.from(doc.body.childNodes).map(walk).join('')
  return result.replace(/<br>$/, '')
}
