import type { BlockContent, Paragraph, PhrasingContent } from 'mdast'
import type { MdxJsxAttribute, MdxJsxFlowElement, MdxJsxTextElement } from 'mdast-util-mdx-jsx'
import { TAG, type Style } from './dialect'
import { BREAK, MARK_ORDER, breakMarks, type Run, type RunMark } from './inline'

// ---------------------------------------------------------------------------
// What every writer of the MDX shares: a run of text as nested marks, and a
// block inside its style tag.
// ---------------------------------------------------------------------------

/** The marks whose signs must touch a word, so a space at their edge is written outside them. */
const EDGED = new Set<RunMark['type']>(['strikethrough', 'bold', 'italic'])

/** A stretch of text under one set of marks: a line break alone, or text with none in it. */
interface Piece {
  text: string
  marks: RunMark[]
  /** For a line break: whether a hard break can stand for it. */
  hard?: boolean
}

/**
 * Runs as pieces, each line break one of its own and outside every signed
 * mark: a break at a sign's edge would leave the sign where markdown cannot
 * read it.
 */
function piecesOf(runs: Run[], hardBreaks: boolean): Piece[] {
  // Words, the spaces between them and line breaks, each a piece of its own.
  const atoms: Piece[] = []
  for (const each of runs) {
    const marks = each.marks ?? []
    for (const part of each.text.split(/(\n|[^\S\n]+)/)) {
      if (!part) continue
      atoms.push(part === BREAK ? { text: BREAK, marks: breakMarks(marks) } : { text: part, marks })
    }
  }
  const isSpace = (piece: Piece): boolean => piece.text !== BREAK && !/\S/.test(piece.text)
  // The word a space stands beside; a line break or the block's end is none.
  const beside = (from: number, step: number): RunMark[] => {
    for (let at = from + step; at >= 0 && at < atoms.length; at += step) {
      if (atoms[at].text === BREAK) return []
      if (!isSpace(atoms[at])) return atoms[at].marks
    }
    return []
  }
  // A sign must touch a word: a space keeps bold, italic or strikethrough
  // only where the words either side of it both wear it.
  const pieces: Piece[] = []
  atoms.forEach((atom, index) => {
    const before = isSpace(atom) ? beside(index, -1) : []
    const after = isSpace(atom) ? beside(index, 1) : []
    const marks = isSpace(atom)
      ? atom.marks.filter(
          (mark) =>
            !EDGED.has(mark.type) ||
            (before.some((worn) => worn.type === mark.type) &&
              after.some((worn) => worn.type === mark.type))
        )
      : atom.marks
    const last = pieces.at(-1)
    const joins =
      last && atom.text !== BREAK && last.text !== BREAK && markKeys(last.marks) === markKeys(marks)
    if (joins) last.text += atom.text
    else pieces.push({ text: atom.text, marks })
  })
  // A hard break needs words either side of it; one at an end of the block has none.
  const first = pieces.findIndex((piece) => piece.text !== BREAK)
  const last = pieces.map((piece) => piece.text !== BREAK).lastIndexOf(true)
  pieces.forEach((piece, index) => {
    if (piece.text === BREAK) piece.hard = hardBreaks && index > first && index < last
  })
  return pieces
}

const markKeys = (marks: RunMark[]): string => JSON.stringify(marks)

const markKey = (mark: RunMark | undefined): string | null => (mark ? JSON.stringify(mark) : null)

function attribute(name: string, value: string | null): MdxJsxAttribute {
  return { type: 'mdxJsxAttribute', name, value }
}

/**
 * A note's words as an attribute holds them: a line break written out too,
 * since one left as it is would end a heading part way through the tag.
 */
function attributeText(text: string): string {
  return text.replace(/[&"\r\n]/g, (sign) => `&#x${sign.charCodeAt(0).toString(16).toUpperCase()};`)
}

function tag(
  name: string,
  attributes: MdxJsxAttribute[],
  children: PhrasingContent[]
): MdxJsxTextElement {
  return { type: 'mdxJsxTextElement', name, attributes, children }
}

function wrap(mark: RunMark, children: PhrasingContent[]): PhrasingContent[] {
  switch (mark.type) {
    case 'bold':
      return [{ type: 'strong', children }]
    case 'italic':
      return [{ type: 'emphasis', children }]
    case 'strikethrough':
      return [{ type: 'delete', children }]
    case 'link':
      return [{ type: 'link', url: mark.href, title: null, children }]
    case 'underline':
      return [tag(TAG.underline, [], children)]
    case 'highlight':
      return [tag(TAG.highlight, [], children)]
    case 'color':
      return [tag(TAG.textStyle, [attribute('color', mark.color)], children)]
    // Its tags are written by hand: the tag writer leaves a line break in an
    // attribute as it is.
    case 'sidenote':
      return [
        { type: 'html', value: `<${TAG.sidenote} note="${attributeText(mark.text)}">` },
        ...children,
        { type: 'html', value: `</${TAG.sidenote}>` }
      ]
    case 'code':
      return []
  }
}

function plain(piece: Piece): PhrasingContent {
  if (piece.text !== BREAK) return { type: 'text', value: piece.text }
  // Written out where a hard break cannot stand: in a heading, at a block's ends.
  return piece.hard ? { type: 'break' } : { type: 'html', value: '&#xA;' }
}

/** Pieces as nested marks, each mark opened once around every piece that wears it. */
function phrasing(pieces: Piece[], depth = 0): PhrasingContent[] {
  if (depth === MARK_ORDER.length) return pieces.map(plain)
  const type = MARK_ORDER[depth]
  const markOf = (piece: Piece): RunMark | undefined =>
    piece.marks.find((mark) => mark.type === type)
  const out: PhrasingContent[] = []
  let from = 0
  while (from < pieces.length) {
    const mark = markOf(pieces[from])
    let to = from + 1
    while (to < pieces.length && markKey(markOf(pieces[to])) === markKey(mark)) to++
    const stretch = pieces.slice(from, to)
    if (!mark) out.push(...phrasing(stretch, depth + 1))
    else if (mark.type === 'code')
      out.push({ type: 'inlineCode', value: stretch.map((piece) => piece.text).join('') })
    else out.push(...wrap(mark, phrasing(stretch, depth + 1)))
    from = to
  }
  return out
}

/** Runs as markdown's inline tree; a heading cannot hold a hard break. */
export function writeInline(runs: Run[], hardBreaks = true): PhrasingContent[] {
  return phrasing(piecesOf(runs, hardBreaks))
}

/** Runs as a paragraph, or null where they hold nothing. */
export function writeParagraph(runs: Run[]): Paragraph | null {
  const children = writeInline(runs)
  return children.length ? { type: 'paragraph', children } : null
}

/** Markdown folds blank lines together, so a paragraph that holds nothing holds a no-break space. */
export const emptyParagraph = (): Paragraph => ({
  type: 'paragraph',
  children: [{ type: 'html', value: '&nbsp;' }]
})

/** What a style says, as its tag's attributes: none where it says nothing. */
export function styleAttributes(style: Style): MdxJsxAttribute[] {
  const attributes: MdxJsxAttribute[] = []
  if (style.size) attributes.push(attribute('size', style.size))
  if (style.color) attributes.push(attribute('color', style.color))
  if (style.align) attributes.push(attribute('align', style.align))
  if (style.indent) attributes.push(attribute('indent', null))
  return attributes
}

/**
 * A block inside its style tag, or bare where it has no style to carry.
 * `node` is null for a paragraph that holds nothing.
 */
export function dress(node: BlockContent | null, style: Style): BlockContent {
  const attributes = styleAttributes(style)
  if (!attributes.length) return node ?? emptyParagraph()
  const element: MdxJsxFlowElement = {
    type: 'mdxJsxFlowElement',
    name: TAG.blockStyle,
    attributes,
    children: node ? [node] : []
  }
  return element
}
