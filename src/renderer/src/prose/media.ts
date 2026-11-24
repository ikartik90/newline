import type { Node } from 'prosemirror-model'
import { NodeSelection, Plugin, TextSelection } from 'prosemirror-state'
import type { EditorView, NodeView } from 'prosemirror-view'
import { editorCaptionStyle, editorShowcaseStyle } from '@/components/editor/styles'
import { mediaKind } from '@shared/mdx/reading'
import { noteSchema } from './schema'

// ---------------------------------------------------------------------------
// A picture or a clip as the editor draws it: the media itself, bare, under
// today's rail, and the caption under it, which is written in place and kept
// as the node's own. The media and its rail are the app's own React
// components: each node's view opens a slot, and the editor draws into it.
// ---------------------------------------------------------------------------

const { nodes } = noteSchema

/** A picture or a clip in the note, and the element the editor draws it in. */
export interface MediaSlot {
  id: number
  frame: HTMLElement
  node: Node
  getPos: () => number | undefined
}

/** The pictures and clips the note is showing, for the editor to draw. */
export class MediaSlots {
  private held = new Map<number, MediaSlot>()
  private listeners = new Set<() => void>()
  private listed: readonly MediaSlot[] = []
  private next = 0

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  list = (): readonly MediaSlot[] => this.listed

  open(frame: HTMLElement, node: Node, getPos: () => number | undefined): number {
    const id = this.next++
    this.held.set(id, { id, frame, node, getPos })
    this.tell()
    return id
  }

  change(id: number, node: Node): void {
    const slot = this.held.get(id)
    if (!slot || slot.node === node) return
    this.held.set(id, { ...slot, node })
    this.tell()
  }

  close(id: number): void {
    if (this.held.delete(id)) this.tell()
  }

  private tell(): void {
    this.listed = [...this.held.values()]
    for (const listener of this.listeners) listener()
  }
}

// A picture that is selected is ringed as today's is in focus: only while the keys drive.
const FIGURE = `${editorShowcaseStyle} [html[data-keyboard-focus]_&[data-selected]_:is(img,video)]:shadow-[0_0_0_1.5px_var(--outline-focus)]`

class MediaView implements NodeView {
  dom = document.createElement('figure')
  private frame = document.createElement('div')
  private caption = document.createElement('figcaption')
  private slot: number

  constructor(
    private node: Node,
    private view: EditorView,
    private getPos: () => number | undefined,
    private slots: MediaSlots
  ) {
    this.dom.className = FIGURE
    this.dom.setAttribute('contenteditable', 'false')
    // The frame is no box of its own: what is drawn in it stands in the figure.
    this.frame.className = 'contents'
    this.caption.className = editorCaptionStyle
    this.caption.setAttribute('contenteditable', 'plaintext-only')
    this.caption.setAttribute('role', 'textbox')
    this.caption.setAttribute('aria-label', 'Caption')
    this.caption.setAttribute('data-placeholder', 'Add caption...')
    this.caption.addEventListener('input', () => this.write())
    this.dom.append(this.frame, this.caption)
    this.read(node)
    this.slot = slots.open(this.frame, node, getPos)
  }

  private read(node: Node): void {
    const caption: string = node.attrs.caption ?? ''
    // What is being typed is already there: writing it back would move the caret.
    if (this.caption.textContent !== caption) this.caption.textContent = caption
    this.caption.toggleAttribute('data-empty', !caption)
  }

  private write(): void {
    const position = this.getPos()
    if (position === undefined) return
    const caption = this.caption.textContent || null
    this.caption.toggleAttribute('data-empty', !caption)
    this.view.dispatch(
      this.view.state.tr.setNodeMarkup(position, null, { ...this.node.attrs, caption })
    )
  }

  update(node: Node): boolean {
    if (node.type !== nodes.media) return false
    if (mediaKind(node.attrs.src) !== mediaKind(this.node.attrs.src)) return false
    this.node = node
    this.read(node)
    this.slots.change(this.slot, node)
    return true
  }

  selectNode(): void {
    this.dom.setAttribute('data-selected', '')
  }

  deselectNode(): void {
    this.dom.removeAttribute('data-selected')
  }

  // The caption is typed in by its own rules, and the rail is pressed, not selected.
  stopEvent(event: Event): boolean {
    const target = event.target
    if (!(target instanceof Element)) return false
    return this.caption.contains(target) || target.closest('[role="toolbar"]') !== null
  }

  ignoreMutation(): boolean {
    return true
  }

  destroy(): void {
    this.slots.close(this.slot)
  }
}

export function mediaBlocks(slots: MediaSlots): Plugin {
  return new Plugin({
    props: {
      nodeViews: { media: (node, view, getPos) => new MediaView(node, view, getPos, slots) }
    }
  })
}

/**
 * Put a picture or a clip into the note at the caret: in place of a line that
 * holds nothing, else under the block the caret is in, with a line after it to
 * go on from.
 */
export function insertMedia(view: EditorView, media: { src: string; alt?: string }): void {
  const { $from } = view.state.selection
  const node = nodes.media.create({ src: media.src, alt: media.alt || null })
  const empty = $from.parent.type === nodes.paragraph && $from.parent.content.size === 0
  const at = empty ? $from.before() : $from.after()
  const tr = empty
    ? view.state.tr.replaceWith($from.before(), $from.after(), node)
    : view.state.tr.insert(at, node)
  const after = at + node.nodeSize
  if (after >= tr.doc.content.size) tr.insert(after, nodes.paragraph.create())
  view.dispatch(tr.setSelection(TextSelection.near(tr.doc.resolve(after + 1))).scrollIntoView())
  view.focus()
}

/** Another picture or clip where one stands. The caption is its place's, so it stays. */
export function replaceMedia(
  view: EditorView,
  at: number,
  media: { src: string; alt?: string }
): void {
  const was = view.state.doc.nodeAt(at)
  if (was?.type !== nodes.media) return
  const node = nodes.media.create({ ...was.attrs, src: media.src, alt: media.alt || null })
  const tr = view.state.tr.replaceWith(at, at + was.nodeSize, node)
  view.dispatch(tr.setSelection(NodeSelection.create(tr.doc, at)))
  view.focus()
}

/** Take a picture or a clip out of the note, leaving a line where it was the note's all. */
export function removeMedia(view: EditorView, at: number): void {
  const { doc } = view.state
  const was = doc.nodeAt(at)
  if (was?.type !== nodes.media) return
  const only = doc.childCount === 1 && doc.firstChild === was
  const tr = only
    ? view.state.tr.replaceWith(at, at + was.nodeSize, nodes.paragraph.create())
    : view.state.tr.delete(at, at + was.nodeSize)
  const near = tr.doc.resolve(Math.min(at, tr.doc.content.size))
  view.dispatch(tr.setSelection(TextSelection.near(near, -1)))
  view.focus()
}
