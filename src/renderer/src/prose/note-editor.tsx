import type { EditorView } from 'prosemirror-view'
import { useCallback, useEffect, useRef, useState } from 'react'
import { typographyStyles } from '@/components/ui/typography'
import { ProseEditor } from './prose-editor'

// ---------------------------------------------------------------------------
// A note as the app edits it: its title over its body, the ProseMirror editor
// working on MDX, text in and text out. A note that is only opened is never
// handed back: reading it is not a change to it.
// ---------------------------------------------------------------------------

export interface MdxNoteSnapshot {
  title: string
  mdx: string
}

export interface MdxNoteEditorProps {
  /** The note being edited. Another note is another editor: key it by this. */
  noteId: string
  initialTitle: string
  initialMdx: string
  /** Whether the note has a title to edit above the body. */
  showTitle?: boolean
  /** The body's view, once it stands. */
  onReady?: (view: EditorView) => void
  /** Called once typing rests, when the note is left, and on Cmd+S, with what is unsaved. */
  onChange?: (snapshot: MdxNoteSnapshot) => void
}

/** How long typing rests before the note is handed back. */
const CHANGE_DEBOUNCE_MS = 500

const TITLE_STYLE = `outline-none focus-visible:outline-none min-h-0 whitespace-pre-wrap break-words focus:min-h-[1.5em] editor-placeholder ${typographyStyles({ type: 'heading1' })}`

export function MdxNoteEditor({
  initialTitle,
  initialMdx,
  onChange,
  showTitle = true,
  onReady
}: MdxNoteEditorProps) {
  const [opened] = useState(() => ({ title: initialTitle, mdx: initialMdx }))
  const title = useRef(opened.title)
  const mdx = useRef(opened.mdx)
  const unsaved = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const body = useRef<EditorView | null>(null)
  const changed = useRef(onChange)

  useEffect(() => {
    changed.current = onChange
  }, [onChange])

  /** Hand back what is unsaved, if anything is. */
  const handBack = useCallback((): void => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    if (!unsaved.current) return
    unsaved.current = false
    changed.current?.({ title: title.current, mdx: mdx.current })
  }, [])

  const touched = useCallback((): void => {
    unsaved.current = true
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(handBack, CHANGE_DEBOUNCE_MS)
  }, [handBack])

  useEffect(() => {
    // Cmd+S hands the note back at once.
    function onKeyDown(event: KeyboardEvent): void {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return
      if (event.key !== 's' && event.key !== 'S') return
      event.preventDefault()
      handBack()
    }
    document.addEventListener('keydown', onKeyDown, { capture: true })
    // Closing the window unloads the page without unmounting.
    window.addEventListener('pagehide', handBack)
    return () => {
      document.removeEventListener('keydown', onKeyDown, { capture: true })
      window.removeEventListener('pagehide', handBack)
      // Leaving the note mid-sentence: what is unsaved goes out first.
      handBack()
    }
  }, [handBack])

  return (
    <>
      {showTitle && (
        <h1
          id="article-title"
          aria-label="Title"
          contentEditable
          suppressContentEditableWarning
          data-placeholder="Title"
          className={TITLE_STYLE}
          onInput={(event) => {
            title.current = event.currentTarget.textContent ?? ''
            touched()
          }}
          onPaste={(event) => {
            event.preventDefault()
            const text = event.clipboardData.getData('text/plain')
            if (text) document.execCommand('insertText', false, text)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Tab') event.preventDefault()
            // A title is one line: Enter and the way down lead into the note.
            if (event.key === 'Enter' || event.key === 'ArrowDown') {
              event.preventDefault()
              body.current?.focus()
            }
          }}
        >
          {opened.title}
        </h1>
      )}
      <ProseEditor
        mdx={opened.mdx}
        onChange={(next) => {
          mdx.current = next
          touched()
        }}
        onReady={(view) => {
          body.current = view
          onReady?.(view)
        }}
      />
    </>
  )
}
