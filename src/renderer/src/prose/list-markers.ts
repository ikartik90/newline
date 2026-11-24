import type { Node } from 'prosemirror-model'
import { Plugin } from 'prosemirror-state'
import { Decoration, DecorationSet, type EditorView, type NodeView } from 'prosemirror-view'
import { CHECKBOX_BOX } from '@/components/ui/input/checkbox'
import { askNumbering } from './numbering'
import { noteSchema } from './schema'
import { setTask } from './tasks'

// ---------------------------------------------------------------------------
// A list's markers, drawn as the app draws them: a number in its own column,
// zero-padded to the width of its list's largest, with its period in a slot of
// its own; a bullet as a dot; a task's box in place of either. A marker is
// never part of the note's text: the plugin says each item's label, and the
// item's view draws it. A number is a button that opens its list's numbering
// options, and a task's box ticks it.
// ---------------------------------------------------------------------------

const { nodes } = noteSchema

/** What an item is told of itself: its number as written, or null for a bullet. */
interface Label {
  label: string | null
}

/** Every item's label, as a decoration on the item. */
function labels(doc: Node): DecorationSet {
  const decorations: Decoration[] = []
  doc.descendants((list, position) => {
    const ordered = list.type === nodes.ordered_list
    if (!ordered && list.type !== nodes.bullet_list) return
    const start: number = ordered ? list.attrs.start : 0
    const width = String(start + list.childCount - 1).length
    let at = position + 1
    list.forEach((item, _offset, index) => {
      const spec: Label = { label: ordered ? String(start + index).padStart(width, '0') : null }
      decorations.push(Decoration.node(at, at + item.nodeSize, {}, spec))
      at += item.nodeSize
    })
  })
  return DecorationSet.create(doc, decorations)
}

// The button is the marker's box; the app's own reset takes the native chrome off it.
const NUMBER_BUTTON =
  'list-marker-box appearance-none border-none bg-transparent p-0 pointer-events-auto! cursor-pointer'

// A task's box in the marker's column, as tall as the item's first line. The
// column takes no press of its own; the box does.
const TASK_BOX = 'list-marker-box'
const TASK_CHECK = `${CHECKBOX_BOX} pointer-events-auto`

class ListItemView implements NodeView {
  dom = document.createElement('li')
  contentDOM = document.createElement('div')
  private marker: HTMLElement = document.createElement('span')
  private drawn: string | null | undefined

  constructor(
    node: Node,
    private view: EditorView,
    private getPos: () => number | undefined,
    decorations: readonly Decoration[]
  ) {
    this.dom.setAttribute('data-list-item', '')
    this.contentDOM.className = 'flex-auto min-w-0 flex flex-col gap-2'
    this.dom.append(this.marker, this.contentDOM)
    this.draw(node, decorations)
  }

  // A press on the marker is the marker's own, never a caret for the note.
  stopEvent(event: Event): boolean {
    return event.target instanceof globalThis.Node && this.marker.contains(event.target)
  }

  update(node: Node, decorations: readonly Decoration[]): boolean {
    if (node.type !== nodes.list_item) return false
    this.draw(node, decorations)
    return true
  }

  // The marker is ours to change; only the item's own content is the note's.
  ignoreMutation(mutation: { target: globalThis.Node }): boolean {
    return !this.contentDOM.contains(mutation.target)
  }

  private draw(node: Node, decorations: readonly Decoration[]): void {
    const checked: boolean | null = node.attrs.checked
    if (checked !== null) {
      // A box has no baseline either: it keeps to the first line, as a bullet does.
      if (this.drawn !== 'task') {
        this.drawn = 'task'
        this.dom.className = 'flex flex-row items-start gap-2'
        this.stand(this.taskBox())
      }
      this.marker.querySelector('input')!.checked = checked
      return
    }
    const said = decorations.find((decoration) => 'label' in decoration.spec)
    const label: string | null = said ? (said.spec as Label).label : null
    if (label === this.drawn) return
    this.drawn = label
    if (label === null) {
      // A bullet has no baseline: it keeps to the top of the row.
      this.dom.className = 'flex flex-row items-start gap-2'
      this.stand(document.createElement('span'))
      this.marker.className = 'list-bullet'
      return
    }
    // A number is text, so it stands on its item's first baseline.
    this.dom.className = 'flex flex-row items-baseline gap-2'
    if (this.marker.tagName !== 'BUTTON') this.stand(this.numberButton())
    const number = document.createElement('span')
    number.className = 'list-marker'
    const period = document.createElement('span')
    period.className = 'list-marker-period'
    period.textContent = '.'
    number.append(label, period)
    this.marker.replaceChildren(number)
  }

  private stand(marker: HTMLElement): void {
    marker.setAttribute('contenteditable', 'false')
    this.marker.replaceWith(marker)
    this.marker = marker
  }

  private taskBox(): HTMLElement {
    const column = document.createElement('span')
    column.className = TASK_BOX
    const box = document.createElement('input')
    box.type = 'checkbox'
    box.className = TASK_CHECK
    box.setAttribute('aria-label', 'Done')
    // The caret stays in the note while a task is ticked.
    box.addEventListener('mousedown', (event) => event.preventDefault())
    box.addEventListener('change', () => {
      const item = this.getPos()
      if (item !== undefined) setTask(this.view, item, box.checked)
    })
    column.append(box)
    return column
  }

  private numberButton(): HTMLButtonElement {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = NUMBER_BUTTON
    button.setAttribute('data-numbering-marker', '')
    button.setAttribute('aria-label', 'List numbering options')
    // The caret stays in the note while the options open.
    button.addEventListener('mousedown', (event) => event.preventDefault())
    button.addEventListener('click', () => {
      const item = this.getPos()
      if (item !== undefined) askNumbering(this.view, item)
    })
    return button
  }
}

export function listMarkers(): Plugin {
  return new Plugin({
    props: {
      decorations: (state) => labels(state.doc),
      nodeViews: {
        list_item: (node, view, getPos, decorations) =>
          new ListItemView(node, view, getPos, decorations)
      }
    }
  })
}
