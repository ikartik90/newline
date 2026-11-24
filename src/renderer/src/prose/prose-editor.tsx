import { EditorState } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import 'prosemirror-view/style/prosemirror.css'
import 'prosemirror-gapcursor/style/gapcursor.css'
import { MediaSlots, insertMedia, removeMedia, replaceMedia, type MediaSlot } from './media'
import { MediaFigure, type MediaShape } from './media-figure'
import { mdxToProse } from './mdx-to-prose'
import { dragBlock, endDrag, firstLine, movingKey } from './moving'
import {
  closeNumbering,
  countsOn,
  numberingKey,
  resetNumbering,
  toggleCountingOn
} from './numbering'
import { withLastLine, withoutLastLine } from './last-line'
import { notePlugins } from './plugins'
import { proseToMdx } from './prose-to-mdx'
import {
  addSidenote,
  applyLink,
  removeNoteMark,
  selectionRect,
  selectionUi,
  setNoteAlign,
  setNoteColor,
  setNoteSize,
  toggleNoteMark,
  type SelectionUi
} from './selection'
import { noteEntries, setSidenoteNote, sidenoteAt } from './sidenotes'
import { dismissSlash, pickSlashBlock, slashBlockAt, slashKey, type SlashQuery } from './slash'
import { BlockGrip, DropLine, type GripLine } from '@/components/block-grip'
import { ImageInsertDialog } from '@/components/image-insert-dialog'
import { NumberToolbar } from '@/components/number-toolbar'
import { SelectionToolbar } from '@/components/selection-toolbar'
import { SidenoteLayer } from '@/components/sidenote-layer'
import { SlashMenu, slashMenuHasResults, type SlashMenuBlockType } from '@/components/slash-menu'
import type { PopoverRect } from '@/components/ui/popover'
import { listMediaAssets } from '@/lib/media'
import type { SidenoteEntry } from '@/utils/sidenotes'

// ---------------------------------------------------------------------------
// The note editor: one editable surface over ProseMirror. It opens on a note's
// MDX and hands the MDX back whenever the note changes.
// ---------------------------------------------------------------------------

export interface ProseEditorProps {
  /** The note as it opens. Another note is another editor: key it by the note. */
  mdx: string
  onChange?: (mdx: string) => void
  /** The view, once it stands, for what works on the note from outside it. */
  onReady?: (view: EditorView) => void
}

/** Where an item's number stands, measured from the article its options are placed in. */
function markerRect(view: EditorView, item: number): PopoverRect {
  const dom = view.nodeDOM(item)
  const marker = dom instanceof HTMLElement ? dom.querySelector('[data-numbering-marker]') : null
  const within = (view.dom.closest('article') ?? view.dom).getBoundingClientRect()
  const { left, top, width, height } = (marker ?? view.dom).getBoundingClientRect()
  return { left: left - within.left, top: top - within.top, width, height }
}

export function ProseEditor({ mdx, onChange, onReady }: ProseEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const opened = useRef(mdx)
  const changed = useRef(onChange)
  const ready = useRef(onReady)
  const editor = useRef<EditorView | null>(null)
  // The slash the block menu is answering, and the block it stands in.
  const [asked, setAsked] = useState<{ slash: SlashQuery; block?: SlashMenuBlockType } | null>(null)
  // What the selection toolbar stands over, and where; `asking` while it holds an
  // address being typed, or the colours, the sizes or the sides to pick from.
  const [picked, setPicked] = useState<{ ui: SelectionUi; rect: PopoverRect; key: string } | null>(
    null
  )
  const [asking, setAsking] = useState<'link' | 'color' | 'size' | 'align' | null>(null)
  const [closed, setClosed] = useState<string | null>(null)
  const shown = useRef<string | null>(null)
  // Whether the note had the keys as its grip was pressed: the press takes them, and its end
  // gives them back.
  const keyed = useRef(false)
  // The words the toolbar stands over, and where: the same words keep it there.
  const stood = useRef<{ words: string; rect: PopoverRect } | null>(null)
  // The note's sidenotes, for the cards beside the prose; the one being written, and
  // the one whose card is to take the caret.
  const [notes, setNotes] = useState<SidenoteEntry[]>([])
  const noted = useRef('[]')
  const [writing, setWriting] = useState<string | null>(null)
  const [toFocus, setToFocus] = useState<string | null>(null)
  const caretIn = useRef<string | null>(null)
  // The dialog a picture or a clip is picked from, open while one is being put in,
  // or put in place of the one named.
  const [picking, setPicking] = useState<{ inPlaceOf: MediaSlot | null } | null>(null)
  // The note's pictures and clips, each drawn into its own node's view.
  const [slots] = useState(() => new MediaSlots())
  const media = useSyncExternalStore(slots.subscribe, slots.list)
  // What the media library knows of them that the note does not say.
  const [shapes, setShapes] = useState<ReadonlyMap<string, MediaShape>>(new Map())
  const openNote = (id: string | null): void => {
    setWriting(id)
    setToFocus(id)
  }
  const questioned = useRef<string | null>(null)
  // The item whose number was pressed, and where that number stands.
  const [numbered, setNumbered] = useState<{ item: number; rect: PopoverRect } | null>(null)
  const counted = useRef<number | null>(null)
  // The first line of the block the pointer rests on, for the grip it is moved by.
  const [gripped, setGripped] = useState<GripLine | null>(null)
  const rested = useRef<number | null>(null)
  // The line a block being dragged by the grip would land on.
  const [landing, setLanding] = useState<DropLine | null>(null)
  // A block is being carried by its grip: the toolbar keeps out of its way.
  const [carrying, setCarrying] = useState(false)
  const lined = useRef<DropLine | null>(null)

  useEffect(() => {
    changed.current = onChange
    ready.current = onReady
  }, [onChange, onReady])

  useEffect(() => {
    let live = true
    listMediaAssets()
      .then((assets) => {
        if (!live) return
        setShapes(
          (known) => new Map([...assets.map((asset) => [asset.url, asset] as const), ...known])
        )
      })
      // With no library to ask, a picture sizes itself once it loads.
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    if (!host.current) return
    const list = (doc: Parameters<typeof noteEntries>[0]): void => {
      const entries = noteEntries(doc)
      const key = JSON.stringify(entries)
      if (key === noted.current) return
      noted.current = key
      setNotes(entries)
    }
    const view = new EditorView(host.current, {
      state: EditorState.create({
        doc: withLastLine(mdxToProse(opened.current)),
        plugins: notePlugins(slots)
      }),
      attributes: {
        class: 'flex flex-col items-center gap-4 outline-none',
        'data-note-body': '',
        role: 'textbox',
        'aria-multiline': 'true',
        'aria-label': 'Note'
      },
      dispatchTransaction(transaction) {
        const state = view.state.apply(transaction)
        view.updateState(state)
        if (transaction.docChanged) {
          changed.current?.(proseToMdx(withoutLastLine(state.doc)))
          list(state.doc)
        }
        // The toolbar follows the selection: told only when what it shows changes.
        const ui = selectionUi(state)
        const key = ui
          ? [
              ui.mode,
              ui.from,
              ui.to,
              ui.linkHref,
              ui.color,
              ui.size,
              ui.align,
              ...ui.activeMarks
            ].join(' ')
          : null
        if (key !== shown.current) {
          shown.current = key
          setAsking(null)
          // A toolbar closed was closed for the selection it stood over, not the next.
          setClosed(null)
          if (ui && key) {
            // Marking the words makes them wider: the toolbar stays under the pointer.
            // Set to a side they go across the column, and it goes with them.
            const words = [ui.mode, ui.from, ui.to, ui.align].join(' ')
            const rect =
              stood.current?.words === words
                ? stood.current.rect
                : selectionRect(view, ui, view.dom.closest('article') ?? view.dom)
            stood.current = { words, rect }
            setPicked({ ui, key, rect })
          } else {
            stood.current = null
            setPicked(null)
          }
        }
        // The caret in a sidenote shows its card; leaving it puts the card away.
        const inside = sidenoteAt(state)
        if (inside !== caretIn.current) {
          caretIn.current = inside
          setWriting(inside)
        }
        const item = numberingKey.getState(state)?.asked ?? null
        if (item !== counted.current) {
          counted.current = item
          setNumbered(item === null ? null : { item, rect: markerRect(view, item) })
        }
        const moving = movingKey.getState(state)
        const over = moving?.over ?? null
        if (over !== rested.current) {
          rested.current = over
          setGripped(over === null ? null : firstLine(view, over))
          // The grip goes with the block it let go.
          if (over === null) setCarrying(false)
        }
        const line = moving?.line ?? null
        if (line !== lined.current) {
          lined.current = line
          setLanding(line)
        }
        const slash = slashKey.getState(state)?.active ?? null
        const question = slash ? `${slash.from} ${slash.query}` : null
        if (question !== questioned.current) {
          questioned.current = question
          setAsked(slash && { slash, block: slashBlockAt(state) })
        }
      }
    })
    editor.current = view
    list(view.state.doc)
    ready.current?.(view)
    // A pane made narrower, or a picture loading in, moves the words: what stands
    // over them is measured again.
    const laidOut = new ResizeObserver(() => {
      const within = view.dom.closest('article') ?? view.dom
      setPicked((was) => {
        if (!was) return was
        const rect = selectionRect(view, was.ui, within)
        if (stood.current) stood.current.rect = rect
        return { ...was, rect }
      })
      setNumbered((was) => was && { ...was, rect: markerRect(view, was.item) })
      setGripped((was) => (was && rested.current !== null ? firstLine(view, rested.current) : was))
    })
    laidOut.observe(view.dom)
    return () => {
      laidOut.disconnect()
      editor.current = null
      view.destroy()
    }
  }, [slots])

  const menu = asked && slashMenuHasResults(asked.slash.query, asked.block)

  const view = editor.current
  const toolbar = picked && view && closed !== picked.key && !carrying ? picked : null

  return (
    <>
      {/* As wide as the article, so a picture can run its whole width. */}
      <div ref={host} className="w-full" />
      {toolbar && view && (
        <SelectionToolbar
          mode={asking === 'link' ? 'link-edit' : (asking ?? toolbar.ui.mode)}
          rect={toolbar.rect}
          activeMarks={toolbar.ui.activeMarks}
          linkHref={toolbar.ui.linkHref}
          color={toolbar.ui.color}
          size={toolbar.ui.size}
          align={toolbar.ui.align}
          ignoreSelector="[data-block-grip]"
          onToggleMark={(type) => toggleNoteMark(view, type)}
          onStartLink={() => setAsking('link')}
          onEditLink={() => setAsking('link')}
          onApplyLink={(address) => {
            applyLink(view, toolbar.ui, address)
            setAsking(null)
          }}
          onStartColor={() => setAsking('color')}
          onPickColor={(color) => {
            setNoteColor(view, toolbar.ui, color)
            setAsking(null)
          }}
          // A heading's size is its level: only a paragraph is given one.
          onStartSize={toolbar.ui.size === undefined ? undefined : () => setAsking('size')}
          onPickSize={(size) => {
            setNoteSize(view, toolbar.ui, size)
            setAsking(null)
          }}
          onStartAlign={toolbar.ui.align === undefined ? undefined : () => setAsking('align')}
          onPickAlign={(align) => {
            setNoteAlign(view, toolbar.ui, align)
            setAsking(null)
          }}
          onRemoveLink={() => removeNoteMark(view, toolbar.ui, 'link')}
          onGotoLink={() => window.open(toolbar.ui.linkHref, '_blank', 'noopener,noreferrer')}
          onAddSidenote={() => openNote(addSidenote(view, toolbar.ui))}
          onEditSidenote={() => openNote(toolbar.ui.sidenoteId ?? sidenoteAt(view.state))}
          onDeleteSidenote={() => removeNoteMark(view, toolbar.ui, 'sidenote')}
          onDismiss={() => {
            // The address field had the keys: they go back to the words it was for.
            if (asking === 'link') view.focus()
            setAsking(null)
            setClosed(toolbar.key)
          }}
        />
      )}
      <SidenoteLayer
        entries={notes}
        trigger="caret"
        editable
        activeId={writing}
        autoFocusId={toFocus}
        onAutoFocused={() => setToFocus(null)}
        onStopEditing={() => setWriting(null)}
        onExitEdit={() => {
          setWriting(null)
          view?.focus()
        }}
        onChangeText={(entry, text) => view && setSidenoteNote(view, entry.id, text)}
      />
      {numbered && view && (
        <NumberToolbar
          rect={numbered.rect}
          continueActive={countsOn(view.state.doc, numbered.item)}
          onContinue={() => toggleCountingOn(view, numbered.item)}
          onReset={() => resetNumbering(view, numbered.item)}
          onDismiss={() => closeNumbering(view)}
        />
      )}
      {gripped && view && (
        <BlockGrip
          line={gripped}
          onPress={() => {
            keyed.current = view.hasFocus()
          }}
          onDragStart={(event) => {
            const held = { x: event.clientX, y: event.clientY }
            if (!dragBlock(view, event.dataTransfer, held)) return event.preventDefault()
            setAsking(null)
            setCarrying(true)
          }}
          onRelease={() => {
            endDrag(view)
            setCarrying(false)
            if (keyed.current) view.focus()
          }}
        />
      )}
      {landing && <DropLine line={landing} />}
      {view &&
        media.map((slot) => (
          <MediaFigure
            key={slot.id}
            slot={slot}
            shape={shapes.get(slot.node.attrs.src)}
            onReplace={() => setPicking({ inPlaceOf: slot })}
            onRemove={() => {
              const at = slot.getPos()
              if (at !== undefined) removeMedia(view, at)
            }}
          />
        ))}
      <ImageInsertDialog
        open={picking !== null}
        mode={picking?.inPlaceOf ? 'change' : 'insert'}
        initialPhase={picking?.inPlaceOf ? 'library' : 'upload'}
        onClose={() => setPicking(null)}
        onInsert={(payload) => {
          const { src, width, height, poster } = payload
          setShapes((known) => new Map(known).set(src, { width, height, poster }))
          const at = picking?.inPlaceOf?.getPos()
          if (view && at !== undefined) replaceMedia(view, at, payload)
          else if (view && !picking?.inPlaceOf) insertMedia(view, payload)
          setPicking(null)
        }}
      />
      {asked && menu && (
        <SlashMenu
          query={asked.slash.query}
          excludeType={asked.block}
          onSelect={(type) => {
            if (!editor.current) return
            pickSlashBlock(editor.current, type)
            if (type === 'media') setPicking({ inPlaceOf: null })
          }}
          onDismiss={() => editor.current && dismissSlash(editor.current)}
        />
      )}
    </>
  )
}
