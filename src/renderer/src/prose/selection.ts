import { toggleMark } from 'prosemirror-commands'
import type { Mark as PmMark, MarkType, Node, NodeType, ResolvedPos } from 'prosemirror-model'
import { TextSelection, type EditorState } from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import type { StyleColor } from '@shared/mdx/dialect'
import { isAbsoluteUrl } from '@shared/mdx/reading'
import type { PopoverRect } from '@/components/ui/popover'
import { normalizeLinkHref } from '@/components/editor/marks'
import type { MarkName, TextAlign, TextSize, ToggleableMark } from '@/components/selection-toolbar'
import { nextSidenoteId } from '@/utils/sidenotes'
import { noteSchema } from './schema'

// ---------------------------------------------------------------------------
// The selection toolbar's half of the editor: what the toolbar should show for
// the selection as it stands, and what each of its buttons does to the note.
// ---------------------------------------------------------------------------

const { marks, nodes } = noteSchema

/** The editor's marks under the names the toolbar knows them by. */
const NAMED: Record<string, MarkName> = {
  strong: 'bold',
  em: 'italic',
  code: 'code',
  underline: 'underline',
  strikethrough: 'strikethrough',
  highlight: 'highlight',
  link: 'link',
  sidenote: 'sidenote'
}

const TOGGLED: Partial<Record<ToggleableMark, MarkType>> = {
  bold: marks.strong,
  italic: marks.em,
  code: marks.code,
  underline: marks.underline,
  strikethrough: marks.strikethrough,
  highlight: marks.highlight
}

export interface SelectionUi {
  /** Selected words are formatted; a caret in a link or a sidenote acts on that. */
  mode: 'format' | 'link-view' | 'sidenote-view'
  /** The words acted on: the selection, or the whole link or sidenote round the caret. */
  from: number
  to: number
  /** The marks every one of the words wears. */
  activeMarks: ReadonlySet<MarkName>
  /** The address of the link acted on, or of the one the selected words start in. */
  linkHref?: string
  /** The sidenote acted on. */
  sidenoteId?: string
  /** The colour selected words wear: its name, `default` for none, null for more than one. */
  color?: StyleColor | 'default' | null
  /** The size of the paragraphs selected, null for more than one; none where there is no paragraph. */
  size?: TextSize | null
  /** The side the paragraphs and headings selected are set to, null for more than one. */
  align?: TextAlign | null
}

/** The mark of a kind at the caret. A run's two ends count as in it, as they do today. */
export function markAt($pos: ResolvedPos, type: MarkType): PmMark | null {
  const among = (worn: readonly PmMark[] | undefined): PmMark | undefined =>
    worn?.find((mark) => mark.type === type)
  return (
    among($pos.marks()) ?? among($pos.nodeAfter?.marks) ?? among($pos.nodeBefore?.marks) ?? null
  )
}

interface Run {
  from: number
  to: number
  mark: PmMark
}

/** How far a mark runs either side of the child of a block that wears it. */
function runAround($pos: ResolvedPos, index: number, mark: PmMark): Run {
  const parent = $pos.parent
  let first = index
  let last = index
  while (first > 0 && mark.isInSet(parent.child(first - 1).marks)) first -= 1
  while (last < parent.childCount - 1 && mark.isInSet(parent.child(last + 1).marks)) last += 1
  let from = $pos.start()
  for (let at = 0; at < first; at += 1) from += parent.child(at).nodeSize
  let to = from
  for (let at = first; at <= last; at += 1) to += parent.child(at).nodeSize
  return { from, to, mark }
}

/** How far the mark at a caret runs either side of it. */
function markRange($pos: ResolvedPos, type: MarkType): Run | null {
  const worn = markAt($pos, type)
  if (!worn) return null
  const parent = $pos.parent
  let index = $pos.index()
  // At a run's end the mark is the one behind the caret.
  if (index === parent.childCount || !worn.isInSet(parent.child(index).marks)) index -= 1
  return runAround($pos, index, worn)
}

/** The one run of a mark that holds every selected word, if there is one. */
function runHolding({ $from, to }: TextSelection, type: MarkType): Run | null {
  const worn = type.isInSet($from.nodeAfter?.marks ?? [])
  if (!worn) return null
  const run = runAround($from, $from.index(), worn)
  return to <= run.to ? run : null
}

/**
 * Whether every word between two positions wears a mark. A space alone counts
 * for nothing, as marking the words leaves it bare.
 */
function wornThroughout(doc: Node, from: number, to: number, type: MarkType): boolean {
  let worn = false
  let bare = false
  doc.nodesBetween(from, to, (node, pos, parent) => {
    if (bare) return false
    if (!node.isInline || !parent?.type.allowsMarkType(type)) return
    if (type.isInSet(node.marks)) worn = true
    else if (!node.isText) bare = true
    else
      bare = /\S/.test(node.textBetween(Math.max(0, from - pos), Math.min(node.nodeSize, to - pos)))
  })
  return worn && !bare
}

/** The one thing every part wears, or null where they differ. */
const shared = <Worn>(worn: Set<Worn>): Worn | null => (worn.size === 1 ? [...worn][0] : null)

/** A run wears its own colour, or else its block's. */
function colorWorn(doc: Node, from: number, to: number): StyleColor | 'default' | null {
  const worn = new Set<StyleColor | 'default'>()
  doc.nodesBetween(from, to, (node, _pos, parent) => {
    if (!node.isText) return
    const own = marks.text_style.isInSet(node.marks)?.attrs.color
    worn.add(own ?? parent?.attrs.color ?? 'default')
  })
  return worn.size ? shared(worn) : 'default'
}

/** Each block of some kinds some of whose words are selected, or that lies whole inside the selection. */
function blocksIn(
  doc: Node,
  from: number,
  to: number,
  kinds: readonly NodeType[],
  each: (block: Node, pos: number) => void
): void {
  doc.nodesBetween(from, to, (node, pos) => {
    if (!kinds.includes(node.type)) return
    const start = pos + 1
    const end = start + node.content.size
    if (node.content.size ? from < end && to > start : from < start && to > end) each(node, pos)
  })
}

/** A size is a paragraph's alone: a heading's is its level. */
const SIZED = [nodes.paragraph]
/** What can be set to a side. */
const ALIGNED = [nodes.paragraph, nodes.heading]

function sizeWorn(doc: Node, from: number, to: number): TextSize | null | undefined {
  const worn = new Set<TextSize>()
  blocksIn(doc, from, to, SIZED, (paragraph) => worn.add(paragraph.attrs.size ?? 'md'))
  return worn.size ? shared(worn) : undefined
}

function alignWorn(doc: Node, from: number, to: number): TextAlign | null | undefined {
  const worn = new Set<TextAlign>()
  blocksIn(doc, from, to, ALIGNED, (block) => worn.add(block.attrs.align ?? 'left'))
  return worn.size ? shared(worn) : undefined
}

export function selectionUi(state: EditorState): SelectionUi | null {
  const { selection } = state
  if (!(selection instanceof TextSelection)) return null
  const { $from, from, to, empty } = selection
  if ($from.parent.type === nodes.code_block) return null
  // Words inside one link or one sidenote are its own to act on, as a caret there is.
  const link = empty ? markRange($from, marks.link) : runHolding(selection, marks.link)
  if (link) {
    const { from, to, mark } = link
    return {
      mode: 'link-view',
      from,
      to,
      activeMarks: new Set(['link']),
      linkHref: mark.attrs.href
    }
  }
  const sidenote = empty ? markRange($from, marks.sidenote) : runHolding(selection, marks.sidenote)
  if (sidenote) {
    const { from, to, mark } = sidenote
    const worn = new Set<MarkName>(['sidenote'])
    return { mode: 'sidenote-view', from, to, activeMarks: worn, sidenoteId: mark.attrs.id }
  }
  if (empty) return null
  const active = Object.entries(NAMED)
    .filter(([name]) => wornThroughout(state.doc, from, to, marks[name]))
    .map(([, known]) => known)
  return {
    mode: 'format',
    from,
    to,
    activeMarks: new Set(active),
    linkHref: marks.link.isInSet($from.nodeAfter?.marks ?? [])?.attrs.href,
    color: colorWorn(state.doc, from, to),
    size: sizeWorn(state.doc, from, to),
    align: alignWorn(state.doc, from, to)
  }
}

type Box = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>

/** The first of the words that shows: a space before them is not what the eye finds. */
function firstShown(doc: Node, from: number, to: number): number {
  const $from = doc.resolve(from)
  if (!$from.parent.isTextblock) return from
  const until = Math.min($from.end(), to) - $from.start()
  const words = $from.parent.textBetween($from.parentOffset, until, undefined, '\ufffc')
  const lead = words.length - words.trimStart().length
  return lead < words.length ? from + lead : from
}

/** The boxes the words between two positions are drawn in, a run and a line at a time. */
function boxesOf(view: EditorView, from: number, to: number): Box[] {
  const start = view.domAtPos(from, 1)
  const end = view.domAtPos(to, -1)
  const range = view.dom.ownerDocument.createRange()
  range.setStart(start.node, start.offset)
  range.setEnd(end.node, end.offset)
  return [...range.getClientRects()]
}

/**
 * The first line of some boxes: as tall as the first to hold anything, and as
 * wide as all that stand level with it. A sidenote's raised number is not level.
 */
function firstLine(boxes: Box[]): Box | null {
  const held = boxes.filter((box) => box.right > box.left)
  const [first] = held
  if (!first) return null
  const half = (first.bottom - first.top) / 2
  const level = held.filter(
    (box) => Math.min(box.bottom, first.bottom) - Math.max(box.top, first.top) > half
  )
  return {
    left: Math.min(...level.map((box) => box.left)),
    top: first.top,
    right: Math.max(...level.map((box) => box.right)),
    bottom: first.bottom
  }
}

/**
 * Where the words acted on stand, measured from the article the toolbar is
 * placed in: their first line, so that words run over two lines do not centre
 * the toolbar in the column.
 */
export function selectionRect(view: EditorView, ui: SelectionUi, within: Element): PopoverRect {
  const frame = within.getBoundingClientRect()
  const from = firstShown(view.state.doc, ui.from, ui.to)
  let line = firstLine(boxesOf(view, from, ui.to))
  if (!line) {
    // Nothing drawn to measure: from one end of the words to the other.
    const start = view.coordsAtPos(ui.from)
    const end = view.coordsAtPos(ui.to)
    line = {
      left: Math.min(start.left, end.left),
      top: Math.min(start.top, end.top),
      right: Math.max(start.right, end.right),
      bottom: Math.max(start.bottom, end.bottom)
    }
  }
  return {
    left: line.left - frame.left,
    top: line.top - frame.top,
    width: line.right - line.left,
    height: line.bottom - line.top
  }
}

/** Mark all the words, or unmark them when every one of them is marked already. */
export const toggleWords = (mark: MarkType): ReturnType<typeof toggleMark> =>
  toggleMark(mark, null, { removeWhenPresent: false })

export function toggleNoteMark(view: EditorView, type: ToggleableMark): void {
  const mark = TOGGLED[type]
  if (mark) toggleWords(mark)(view.state, view.dispatch)
}

/**
 * Link the words to an address, read as today's editor reads one: typed without
 * its scheme it is taken as https. The caret is left in the link, so the link's
 * own actions show next.
 */
export function applyLink(view: EditorView, ui: SelectionUi, address: string): void {
  const href = normalizeLinkHref(address)
  if (!isAbsoluteUrl(href)) return
  const tr = view.state.tr.removeMark(ui.from, ui.to, marks.link)
  tr.addMark(ui.from, ui.to, marks.link.create({ href }))
  view.dispatch(tr.setSelection(TextSelection.create(tr.doc, ui.to)))
  view.focus()
}

/**
 * Set the words in a colour, or in none. A block's own colour goes down to
 * its words first, so the words left out keep it.
 */
export function setNoteColor(view: EditorView, ui: SelectionUi, color: StyleColor | null): void {
  view.focus()
  if (ui.color === (color ?? 'default')) return
  const tr = view.state.tr
  view.state.doc.nodesBetween(ui.from, ui.to, (node, pos) => {
    if (!node.isTextblock || !node.attrs.color) return
    const worn = marks.text_style.create({ color: node.attrs.color })
    node.forEach((child, offset) => {
      if (child.isText && !marks.text_style.isInSet(child.marks)) {
        tr.addMark(pos + 1 + offset, pos + 1 + offset + child.nodeSize, worn)
      }
    })
    tr.setNodeAttribute(pos, 'color', null)
  })
  tr.removeMark(ui.from, ui.to, marks.text_style)
  if (color) tr.addMark(ui.from, ui.to, marks.text_style.create({ color }))
  view.dispatch(tr)
}

/** Set every paragraph selected in a size; the paragraph's own is written as none. */
export function setNoteSize(view: EditorView, ui: SelectionUi, size: TextSize): void {
  view.focus()
  const tr = view.state.tr
  const next = size === 'md' ? null : size
  blocksIn(view.state.doc, ui.from, ui.to, SIZED, (paragraph, pos) => {
    if (paragraph.attrs.size !== next) tr.setNodeAttribute(pos, 'size', next)
  })
  if (tr.docChanged) view.dispatch(tr)
}

/** Set every paragraph and heading selected to a side; the left is written as none. */
export function setNoteAlign(view: EditorView, ui: SelectionUi, align: TextAlign): void {
  view.focus()
  const tr = view.state.tr
  const next = align === 'left' ? null : align
  blocksIn(view.state.doc, ui.from, ui.to, ALIGNED, (block, pos) => {
    if (block.attrs.align !== next) tr.setNodeAttribute(pos, 'align', next)
  })
  if (tr.docChanged) view.dispatch(tr)
}

export function removeNoteMark(view: EditorView, ui: SelectionUi, type: 'link' | 'sidenote'): void {
  view.dispatch(view.state.tr.removeMark(ui.from, ui.to, marks[type]))
  view.focus()
}

/**
 * A sidenote on the words, its note still to be written; its id, the next one
 * free, is handed back. Words that all wear one already have theirs taken off.
 */
export function addSidenote(view: EditorView, ui: SelectionUi): string | null {
  if (ui.activeMarks.has('sidenote')) {
    view.dispatch(view.state.tr.removeMark(ui.from, ui.to, marks.sidenote))
    return null
  }
  const held: string[] = []
  view.state.doc.descendants((node) => {
    for (const mark of node.marks) if (mark.type === marks.sidenote) held.push(mark.attrs.id)
  })
  const id = nextSidenoteId(held)
  view.dispatch(view.state.tr.addMark(ui.from, ui.to, marks.sidenote.create({ id, note: '' })))
  return id
}
