import { Fragment, Slice, type Node, type NodeType } from 'prosemirror-model'
import {
  NodeSelection,
  Plugin,
  PluginKey,
  TextSelection,
  type EditorState,
  type Transaction
} from 'prosemirror-state'
import type { EditorView } from 'prosemirror-view'
import {
  BLOCK_GRIP_REACH,
  BLOCK_GRIP_SIZE,
  type DropLine,
  type GripLine
} from '@/components/block-grip'
import { isGivenLine, withoutLastLine } from './last-line'
import { noteSchema } from './schema'

// ---------------------------------------------------------------------------
// Moving a block. A grip stands beside the block the pointer rests on: a block
// of the note itself, or an item of a list, however far down its lists. Dragged
// by it, the block lands above or below the block the pointer is level with, by
// the half it is in, and a line shows where. Both are found from where the
// pointer is, never from what is under it: the grip stands clear of its block,
// and a block is carried in the margin the grip is in.
// ---------------------------------------------------------------------------

const { nodes } = noteSchema

interface MovingState {
  /** Where the block stands that the grip is beside. */
  over: number | null
  /** The line a block being dragged would land on. */
  line: DropLine | null
}

export const movingKey = new PluginKey<MovingState>('moving')

/** A block taken up by its grip. */
interface Drag {
  from: number
  to: number
  node: Node
  /** The kind of list an item was taken out of. */
  list: NodeType | null
  /** What the note scrolls in, where it scrolls in anything. */
  within: Element | null
  /** Take the drag's listeners off the page. */
  stop: () => void
}

const drags = new WeakMap<EditorView, Drag>()

/** Above an item, below it, or under its own lines: before what stands under it. */
type Side = 'before' | 'after' | 'under'

const ITEM = 'li[data-list-item]'
/** Where a block's first line of words is drawn. */
const WORDS = 'p, h1, h2, h3, h4, code'
/** How far past the last block of its holder, or before the first, a line stands. */
const EDGE = 4

type Box = Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>

const boxOf = (element: Element): Box => element.getBoundingClientRect()

const level = (element: Element, y: number): boolean => {
  const { top, bottom } = boxOf(element)
  return y >= top && y < bottom
}

const isGrip = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest('[data-block-grip]') !== null

const isListElement = (element: Element): boolean => element.matches('ul, ol')

const isList = (node: Node | null | undefined): node is Node =>
  !!node && (node.type === nodes.bullet_list || node.type === nodes.ordered_list)

const itemsOf = (list: Element): Element[] =>
  [...list.children].filter((child) => child.matches(ITEM))

/** The lists that stand under an item, among its own blocks. */
const listsUnder = (item: Element): Element[] =>
  [...(item.lastElementChild?.children ?? [])].filter(isListElement)

// --- The block the pointer rests on ----------------------------------------

/** From an item level with a height, the innermost that is; none between two items under it. */
function itemLevelWith(item: Element, y: number): Element | null {
  const under = listsUnder(item).find((list) => level(list, y))
  if (!under) return item
  const inner = itemsOf(under).find((each) => level(each, y))
  return inner ? itemLevelWith(inner, y) : null
}

/**
 * The element of the block a pointer rests on. None where it rests on no
 * block; unsaid where it is on the grip or between two blocks, and the grip
 * stays as it is.
 */
function restingOn(
  view: EditorView,
  target: EventTarget | null,
  x: number,
  y: number
): Element | null | undefined {
  if (isGrip(target)) return undefined
  const body = view.dom
  if (!(target instanceof Element)) return null
  // Beside the blocks the pointer is on what the note stands on: the block is the one level with it.
  const beside = target.contains(body)
  if (!beside && !body.contains(target)) return null
  let block: Element | undefined
  if (beside) {
    block = [...body.children].find((child) => level(child, y))
    if (!block) return level(body, y) ? undefined : null
  } else {
    block = target
    while (block.parentElement && block.parentElement !== body) block = block.parentElement
  }
  let found: Element | null = block
  if (isListElement(block)) {
    // The item the pointer is in, as far down as its lists go, then the one level with it:
    // an item's own column runs down beside the items under it.
    const holds = (each: Element): boolean => (beside ? level(each, y) : each.contains(target))
    let item: Element | undefined
    let list: Element | undefined = block
    while (list) {
      const inside: Element | undefined = itemsOf(list).find(holds)
      if (!inside) break
      item = inside
      list = beside ? undefined : listsUnder(inside).find(holds)
    }
    found = item ? itemLevelWith(item, y) : null
    if (!found) return undefined
  }
  // A pointer beside the note rests on the block level with it from as far off as a grip
  // stands from a block of the note: an item under another is in reach from there too.
  if (beside && x < boxOf(block).left - BLOCK_GRIP_REACH) return null
  return found
}

/** Where the node an element draws stands. */
function positionOf(view: EditorView, element: Element): number | null {
  let inside: number
  try {
    inside = view.posAtDOM(element, 0)
  } catch {
    return null
  }
  const $inside = view.state.doc.resolve(inside)
  // A block that holds content is found from just inside it, one that holds none at itself.
  const places = $inside.depth ? [$inside.before(), inside] : [inside]
  return places.find((place) => view.nodeDOM(place) === element) ?? null
}

/** A block with nothing in it to move: an empty line, or an item that is one. */
function isBlank(node: Node): boolean {
  if (node.type === nodes.list_item) return node.childCount === 1 && isBlank(node.child(0))
  return node.isTextblock && node.content.size === 0
}

const sameLine = (a: DropLine | null, b: DropLine | null): boolean =>
  a === b || (!!a && !!b && a.left === b.left && a.top === b.top && a.width === b.width)

function say(view: EditorView, said: Partial<MovingState>): void {
  const now = movingKey.getState(view.state)
  if (!now || view.isDestroyed) return
  const over = 'over' in said && said.over !== now.over
  const line = 'line' in said && !sameLine(said.line ?? null, now.line)
  if (over || line) view.dispatch(view.state.tr.setMeta(movingKey, said))
}

/** The first line of a block, measured from the article the grip is placed in. */
export function firstLine(view: EditorView, pos: number): GripLine {
  const drawn = view.nodeDOM(pos)
  const block = drawn instanceof HTMLElement ? drawn : view.dom
  const frame = boxOf(view.dom.closest('article') ?? view.dom)
  const box = boxOf(block)
  const left = box.left - frame.left
  // A rule is one line, its own height; a picture has none, and the grip keeps to its top.
  if (view.state.doc.nodeAt(pos)?.type === nodes.horizontal_rule) {
    return { left, top: box.top - frame.top, height: box.bottom - box.top }
  }
  const words = block.matches(WORDS) ? block : block.querySelector(WORDS)
  const height = words ? parseFloat(getComputedStyle(words).lineHeight) : NaN
  const top = boxOf(words ?? block).top
  return {
    left,
    top: top - frame.top,
    height: Number.isFinite(height) ? height : BLOCK_GRIP_SIZE
  }
}

// --- Where a dragged block lands -------------------------------------------

/** Of elements that stand one under another, the one a height is in, or the nearer of two it is between. */
function nearest(elements: Element[], y: number): { element: Element; side: Side | null } | null {
  let last: Element | null = null
  for (const element of elements) {
    const { top, bottom } = boxOf(element)
    if (y < top) {
      if (!last || top - y < y - boxOf(last).bottom) return { element, side: 'before' }
      return { element: last, side: 'after' }
    }
    if (y < bottom) return { element, side: null }
    last = element
  }
  return last && { element: last, side: 'after' }
}

/** The item of a list a height is beside, and on which side of it. */
function besideItem(list: Element, y: number): { element: Element; side: Side } | null {
  const found = nearest(itemsOf(list), y)
  if (!found) return null
  const item = found.element
  if (found.side) return { element: item, side: found.side }
  const lists = listsUnder(item)
  const { top, bottom } = boxOf(item)
  // An item's own lines run down to the first list under it.
  const end = lists.length ? boxOf(lists[0]).top : bottom
  if (y < end) {
    if (y < (top + end) / 2) return { element: item, side: 'before' }
    return { element: item, side: lists.length ? 'under' : 'after' }
  }
  const under = lists.find((each) => y < boxOf(each).bottom)
  return under ? besideItem(under, y) : { element: item, side: 'after' }
}

/** The block a height is beside, and on which side of it. */
function besideBlock(view: EditorView, y: number): { element: Element; side: Side } | null {
  const found = nearest([...view.dom.children], y)
  if (!found) return null
  const block = found.element
  if (isListElement(block)) return besideItem(block, y)
  const { top, bottom } = boxOf(block)
  return { element: block, side: found.side ?? (y < (top + bottom) / 2 ? 'before' : 'after') }
}

/**
 * Where in the note, as it stands, a dragged block goes in to land on a side
 * of another. None where that is where it stands already, or inside itself.
 */
function landing(doc: Node, drag: Drag, beside: number, side: Side): number | null {
  if (beside >= drag.from && beside < drag.to) return null
  const target = doc.nodeAt(beside)
  if (!target) return null
  const $beside = doc.resolve(beside)
  const end = beside + target.nodeSize
  const item = drag.node.type === nodes.list_item
  let pos: number
  if (target.type !== nodes.list_item) {
    // Under the line the note was given to go on from is before it.
    const given = end === doc.content.size && withoutLastLine(doc) !== doc
    pos = side === 'before' || given ? beside : end
    // An item let go beside a list is one of its items.
    const $pos = doc.resolve(pos)
    if (item && isList($pos.nodeBefore)) pos -= 1
    else if (item && isList($pos.nodeAfter)) pos += 1
  } else {
    // The first list under the item, where there is one to land in.
    let under: number | null = null
    if (side === 'under') {
      target.forEach((child, offset) => {
        if (under === null && isList(child)) under = beside + 1 + offset
      })
    }
    const edge = $beside.index() === (side === 'before' ? 0 : $beside.parent.childCount - 1)
    // Under an item's own lines: first among the items under it, or a block last of those lines.
    if (under !== null) pos = item ? under + 1 : under
    // A block at the edge of a list stands outside it; among its items it parts the list.
    else if (item || !edge) pos = side === 'before' ? beside : end
    else pos = side === 'before' ? $beside.before() : $beside.after()
  }
  return pos === drag.from || pos === drag.to ? null : pos
}

/** The move: the block taken out, and put in where it lands. */
function moved(state: EditorState, drag: Drag, pos: number): Transaction {
  const { doc, selection } = state
  const tr = state.tr
  const $from = doc.resolve(drag.from)
  // A list left with no item goes with it.
  const alone = isList($from.parent) && $from.parent.childCount === 1
  const out = alone ? $from.before() : drag.from
  tr.delete(out, alone ? $from.after() : drag.to)
  // Two parts of one list are one list again, with what parted them gone: lists of dots,
  // or numbered ones where the second counts on from the first.
  const $out = tr.doc.resolve(out)
  const first = $out.nodeBefore
  const second = $out.nodeAfter
  if (isList(first) && isList(second) && first.type === second.type) {
    const dotted = first.type === nodes.bullet_list
    if (dotted || second.attrs.start === first.attrs.start + first.childCount) tr.join(out)
  }

  let at = tr.mapping.map(pos)
  const $at = tr.doc.resolve(at)
  const into = $at.parent
  let put = drag.node
  if (put.type === nodes.list_item) {
    // An item let go among no items stands as a list of the kind it came from.
    if (!isList(into)) put = (drag.list ?? nodes.bullet_list).create(null, put)
  } else if (isList(into)) {
    const index = $at.index()
    if (index === 0) at = $at.before()
    else if (index === into.childCount) at = $at.after()
    else {
      // The list parts round the block, its second part counting on from its first.
      const numbered = into.type === nodes.ordered_list
      const attrs = numbered ? { ...into.attrs, start: into.attrs.start + index } : into.attrs
      tr.split(at, 1, [{ type: into.type, attrs }])
      at += 1
    }
  }
  tr.insert(at, put)

  // A caret in the block goes with it; elsewhere it stays where it was.
  const shift = (put === drag.node ? at : at + 1) - drag.from
  if (selection instanceof NodeSelection && selection.from === drag.from) {
    tr.setSelection(NodeSelection.create(tr.doc, drag.from + shift))
  } else if (
    selection instanceof TextSelection &&
    selection.from > drag.from &&
    selection.to < drag.to
  ) {
    tr.setSelection(TextSelection.create(tr.doc, selection.anchor + shift, selection.head + shift))
  }

  // The line the note was given goes, once the note no longer ends where it needs one.
  const last = tr.doc.lastChild
  const stray =
    withoutLastLine(doc) !== doc &&
    tr.doc.childCount > 1 &&
    isGivenLine(last) &&
    withoutLastLine(tr.doc) === tr.doc
  if (stray) tr.delete(tr.doc.content.size - last!.nodeSize, tr.doc.content.size)

  return tr.setMeta(movingKey, { over: null, line: null }).setMeta('uiEvent', 'drop')
}

/** The line across where a block goes in, between what will stand either side of it. */
function lineAt(view: EditorView, pos: number): DropLine | null {
  const $pos = view.state.doc.resolve(pos)
  const index = $pos.index()
  const holder = $pos.parent
  const before = index > 0 ? view.nodeDOM(pos - holder.child(index - 1).nodeSize) : null
  const after = index < holder.childCount ? view.nodeDOM(pos) : null
  const above = before instanceof Element ? boxOf(before) : null
  const below = after instanceof Element ? boxOf(after) : null
  const one = above ?? below
  if (!one) return null
  const frame = boxOf(view.dom.closest('article') ?? view.dom)
  const top =
    above && below ? (above.bottom + below.top) / 2 : above ? above.bottom + EDGE : one.top - EDGE
  const left = Math.max(above?.left ?? one.left, below?.left ?? one.left)
  const right = Math.min(above?.right ?? one.right, below?.right ?? one.right)
  return { left: left - frame.left, top: top - frame.top, width: right - left }
}

/**
 * Where a block held at a point would go in. Unsaid beyond the reach of the
 * note, where it is not the note's to take; none where it stands already.
 */
function landingAt(view: EditorView, drag: Drag, x: number, y: number): number | null | undefined {
  const frame = boxOf(view.dom.closest('article') ?? view.dom)
  if (x < frame.left - BLOCK_GRIP_REACH || x > frame.right) return undefined
  // Past the edge of what the note scrolls in its blocks are out of sight, and so would the line be.
  const seen = drag.within && boxOf(drag.within)
  if (seen && (y < seen.top || y > seen.bottom)) return undefined
  const beside = besideBlock(view, y)
  const pos = beside && positionOf(view, beside.element)
  return beside && pos !== null ? landing(view.state.doc, drag, pos, beside.side) : null
}

/** The nearest thing round the note that scrolls up and down. */
function scrollerOf(view: EditorView): Element | null {
  for (let each = view.dom.parentElement; each; each = each.parentElement) {
    if (/auto|scroll|overlay/.test(getComputedStyle(each).overflowY)) return each
  }
  return null
}

/** Let go of a drag with nothing said: its listeners come off the page. */
function release(view: EditorView): boolean {
  drags.get(view)?.stop()
  return drags.delete(view)
}

/** The grip's drag is over, dropped or not. */
export function endDrag(view: EditorView): void {
  if (release(view)) say(view, { line: null })
}

/**
 * Begin dragging the block the grip stands beside, taken up at a point of the
 * page. False where there is none to drag. The drag is the grip's own from
 * here to its end: the page hears of it before the note does, so it lands by
 * the line drawn here and nothing else takes it.
 */
export function dragBlock(
  view: EditorView,
  transfer: DataTransfer,
  held?: { x: number; y: number }
): boolean {
  const pos = movingKey.getState(view.state)?.over ?? null
  const node = pos === null ? null : view.state.doc.nodeAt(pos)
  if (pos === null || !node) return false
  endDrag(view)
  const { dom, text } = view.serializeForClipboard(new Slice(Fragment.from(node), 0, 0))
  transfer.clearData()
  transfer.setData('text/html', dom.innerHTML)
  transfer.setData('text/plain', text)
  transfer.effectAllowed = 'move'
  const drawn = view.nodeDOM(pos)
  if (drawn instanceof Element) {
    // Pictured where it stands, so it does not jump to the pointer as it is taken up.
    const { left, top } = boxOf(drawn)
    const known = held && Number.isFinite(held.x) && Number.isFinite(held.y)
    transfer.setDragImage(drawn, known ? held.x - left : 0, known ? held.y - top : 0)
  }

  const over = (event: DragEvent): void => {
    const to = landingAt(view, drag, event.clientX, event.clientY)
    if (to !== undefined) {
      event.preventDefault()
      event.stopPropagation()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    }
    say(view, { line: to == null ? null : lineAt(view, to) })
  }
  const letGo = (event: DragEvent): void => {
    // Whatever the block is let go on takes nothing of it: it is moved, or it stays.
    event.preventDefault()
    event.stopPropagation()
    const to = landingAt(view, drag, event.clientX, event.clientY)
    endDrag(view)
    if (to == null) return
    // The grip moves its block whatever key is held: a copy would repeat a sidenote's id.
    const tr = moved(view.state, drag, to)
    if (tr.doc.eq(view.state.doc)) return
    view.dispatch(tr)
    // The press on the grip took the keys: the note has them, to take the move back with.
    view.focus()
  }
  const end = (): void => endDrag(view)
  const heard = [
    ['dragenter', over],
    ['dragover', over],
    ['drop', letGo],
    ['dragend', end]
  ] as const
  const drag: Drag = {
    from: pos,
    to: pos + node.nodeSize,
    node,
    list: node.type === nodes.list_item ? view.state.doc.resolve(pos).parent.type : null,
    within: scrollerOf(view),
    stop: () => heard.forEach(([type, hear]) => document.removeEventListener(type, hear, true))
  }
  heard.forEach(([type, hear]) => document.addEventListener(type, hear, true))
  drags.set(view, drag)
  return true
}

export function moving(): Plugin<MovingState> {
  return new Plugin<MovingState>({
    key: movingKey,
    state: {
      init: () => ({ over: null, line: null }),
      apply(tr, value) {
        const said = tr.getMeta(movingKey) as Partial<MovingState> | undefined
        if (said) return { ...value, ...said }
        // The note changed under the pointer: the grip waits for it to move again.
        return tr.docChanged ? { over: null, line: null } : value
      }
    },
    // The page's listeners, not the note's: the grip and the way to it are outside the note.
    view(view) {
      /** Where the pointer was last seen at rest. */
      let pointer: { x: number; y: number } | null = null
      const restOn = (target: EventTarget | null, x: number, y: number): void => {
        const element = restingOn(view, target, x, y)
        if (element === undefined) return
        const pos = element && positionOf(view, element)
        const node = pos === null ? null : view.state.doc.nodeAt(pos)
        say(view, { over: node && !isBlank(node) ? pos : null })
      }
      const onMove = (event: MouseEvent): void => {
        // A button held is a selection being dragged out, not a pointer at rest.
        if (event.buttons || drags.has(view)) return
        pointer = { x: event.clientX, y: event.clientY }
        restOn(event.target, pointer.x, pointer.y)
      }
      // Out of the page with nowhere gone to is out of the window.
      const onOut = (event: MouseEvent): void => {
        if (event.relatedTarget) return
        pointer = null
        if (!drags.has(view)) say(view, { over: null })
      }
      // A note laid out anew has moved under a pointer at rest: the grip is for what is under
      // it now. The note says so a frame late, so a grip given since is looked for again too.
      const laidOut = new ResizeObserver(() => {
        if (!pointer || drags.has(view) || movingKey.getState(view.state)?.over == null) return
        restOn(document.elementFromPoint(pointer.x, pointer.y), pointer.x, pointer.y)
      })
      document.addEventListener('mousemove', onMove)
      document.addEventListener('mouseout', onOut)
      laidOut.observe(view.dom)
      return {
        // The note changed under a block being carried: it has nowhere true to land.
        update(_view, before) {
          if (before.doc !== view.state.doc) release(view)
        },
        destroy() {
          release(view)
          document.removeEventListener('mousemove', onMove)
          document.removeEventListener('mouseout', onOut)
          laidOut.disconnect()
        }
      }
    }
  })
}
