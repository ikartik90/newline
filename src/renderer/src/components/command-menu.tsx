import { useState, type ComponentType, type SVGProps } from 'react'
import { Command } from 'cmdk'
import { Dialog } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useHasCursor } from '@/hooks/use-has-cursor'
import { useNoteSearch } from '@/hooks/use-note-search'
import { formatRelativeTime, noteDisplayTitle } from '@/utils/note-display'
import { shortcutLabel } from '@/utils/keyboard-shortcut'
import SearchIcon from '@/assets/icons/search.svg'
import CrossIcon from '@/assets/icons/cross.svg'
import PageIcon from '@/assets/icons/page.svg'

// ---------------------------------------------------------------------------
// The command menu — ⌘K, then type. Ported from kartik.to's command palette,
// in the same panel the confirm dialog borrows: a 40px top row holding the
// field, then groups of menu rows.
//
// Every note is a row. On an empty field the most recent few; once something
// is typed, main's full-text search over titles, tags and text — which is why
// cmdk's own filter is off. cmdk still owns what a palette is (the roving
// highlight, Enter, the groups, the empty state); it just does not decide
// which notes answer, because a note is answered by words that are not in its
// row. The app's actions are matched here by name, the one place cmdk's
// filter would otherwise have been used.
//
// The highlight is the menu's rather than cmdk's own. cmdk puts it on the
// first row it has when the field changes — and the actions are there at once
// where the notes arrive over IPC a beat later, so left to itself it would sit
// on an action under a list of notes. Whenever the rows change, the highlight
// goes back to the first of them.
//
// The dialog's children mount only while it is open, so the field and the
// search start empty on every open with nothing to reset.
// ---------------------------------------------------------------------------

type Icon = ComponentType<SVGProps<SVGSVGElement>>

export interface CommandMenuAction {
  id: string
  label: string
  icon: Icon
  /** The bare key, written for the platform beside the label — `N` ⇒ `⌘N`. */
  shortcut?: string
  run: () => void
}

export interface CommandMenuProps {
  open: boolean
  onClose: () => void
  actions: CommandMenuAction[]
  onOpenNote: (note: Note) => void
}

/** How many notes an empty field offers — the ones you were just in. */
export const RECENT_LIMIT = 8

// The `commandHeader` recipe: the palette's top row, with a divider under it.
// Its 12px inset lands the field on the line the row icons sit on (group 4px +
// row 8px).
const headerStyle =
  'flex items-center gap-2 h-10 px-3 border-b-[0.5px] border-divider shrink-0 text-fg-body'
const inputStyle =
  'flex-1 min-w-0 bg-transparent border-none outline-none text-style-body-sm text-fg-body placeholder:text-fg-body/25'
const iconStyle = 'shrink-0 size-5'

// The way out: named as the key that does it where there is a key, drawn as
// the button that does it where there is not. The icon button pads its glyph
// by 4px, so it is pulled out by that much to land on the row's own inset.
const hintStyle = 'flex items-center gap-1 shrink-0'
const hintLabelStyle = 'text-style-caption text-fg-body/50 whitespace-nowrap'
const closeButtonStyle = '-mr-1'

// `commandList` + `commandGroup`: the scrolling column of groups, each inset
// 4px from the panel. cmdk moves the focus onto the list once the arrows are
// used, so it draws no ring of its own; the highlighted row says where it is.
const listStyle = 'flex flex-col gap-1 py-2 max-h-96 overflow-y-auto outline-none'
const groupStyle = 'flex flex-col px-1'
const groupHeadingStyle = 'flex items-center h-6 px-2 text-style-caption text-fg-body/50'
const emptyStyle = 'px-3 py-6 text-style-body-sm text-fg-body/50 text-center'

// The `menuItem` recipe: a 32px row on an 8px inset, washed when highlighted.
const itemStyle =
  'flex items-center w-full gap-2 h-8 px-2 rounded-sm cursor-default text-style-body-sm text-fg-body data-[selected=true]:bg-field-hover'
const itemTitleStyle = 'truncate'
const itemTimeStyle = 'ml-auto shrink-0 text-style-caption text-fg-body/50 whitespace-nowrap'

// The `hotkey` recipe on a menu: the wash a hovered row wears, so the hint
// sits at the depth of the thing it hints.
const hotkeyStyle =
  'flex items-center shrink-0 h-5 px-1 rounded-sm border-[0.5px] border-divider bg-field-hover text-fg-body text-style-caption whitespace-nowrap'
const itemHotkeyStyle = `ml-auto ${hotkeyStyle}`

export function CommandMenu({ open, onClose, actions, onOpenNote }: CommandMenuProps) {
  return (
    <Dialog open={open} onClose={onClose} align="top-center" size="sm" aria-label="Command menu">
      <CommandMenuBody actions={actions} onOpenNote={onOpenNote} onClose={onClose} />
    </Dialog>
  )
}

function CommandMenuBody({ actions, onOpenNote, onClose }: Omit<CommandMenuProps, 'open'>) {
  const [query, setQuery] = useState('')
  // Key chips name keys; a device without a keyboard is shown none, and gets a
  // close button in the Esc chip's place.
  const hasCursor = useHasCursor()
  const notes = useNoteSearch(query)
  const needle = query.trim().toLowerCase()
  const shown = needle ? notes : notes.slice(0, RECENT_LIMIT)
  const matching = needle
    ? actions.filter((action) => action.label.toLowerCase().includes(needle))
    : actions

  // The rows as they stand, and the highlight among them. Adjusted during the
  // render that changes the rows, so no frame shows the old highlight over the
  // new rows.
  const rowsKey = [
    ...shown.map((note) => `note:${note.id}`),
    ...matching.map((a) => `action:${a.id}`)
  ]
  const first = rowsKey[0] ?? ''
  const [highlight, setHighlight] = useState({ rows: rowsKey.join('\n'), value: first })
  if (highlight.rows !== rowsKey.join('\n')) {
    setHighlight({ rows: rowsKey.join('\n'), value: first })
  }

  return (
    <Command
      shouldFilter={false}
      loop
      vimBindings={false}
      label="Command menu"
      className="contents"
      value={highlight.value}
      onValueChange={(value) => setHighlight((current) => ({ ...current, value }))}
    >
      <div className={headerStyle}>
        <SearchIcon className={iconStyle} aria-hidden />
        <Command.Input
          value={query}
          onValueChange={setQuery}
          placeholder="Search notes or type a command…"
          className={inputStyle}
        />
        {hasCursor ? (
          <div className={hintStyle}>
            <kbd className={hotkeyStyle}>Esc</kbd>
            <span className={hintLabelStyle}>to exit</span>
          </div>
        ) : (
          <Button aria-label="Close" className={closeButtonStyle} onClick={onClose}>
            <CrossIcon />
          </Button>
        )}
      </div>

      <Command.List className={listStyle}>
        <Command.Empty className={emptyStyle}>No results</Command.Empty>

        {shown.length > 0 && (
          <Command.Group className={groupStyle}>
            <div className={groupHeadingStyle}>{needle ? 'Notes' : 'Recent'}</div>
            {shown.map((note) => (
              <Command.Item
                key={note.id}
                value={`note:${note.id}`}
                className={itemStyle}
                onSelect={() => {
                  onClose()
                  onOpenNote(note)
                }}
              >
                <PageIcon className={iconStyle} aria-hidden />
                <span className={itemTitleStyle}>{noteDisplayTitle(note)}</span>
                <span className={itemTimeStyle}>{formatRelativeTime(note.updatedAt)}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {matching.length > 0 && (
          <Command.Group className={groupStyle}>
            <div className={groupHeadingStyle}>Actions</div>
            {matching.map((action) => {
              const Glyph = action.icon
              return (
                <Command.Item
                  key={action.id}
                  value={`action:${action.id}`}
                  className={itemStyle}
                  // Closed first: an action may open another dialog, and a
                  // menu still standing over it reads as a press that did
                  // nothing.
                  onSelect={() => {
                    onClose()
                    action.run()
                  }}
                >
                  <Glyph className={iconStyle} aria-hidden />
                  {action.label}
                  {action.shortcut && hasCursor && (
                    <kbd aria-hidden className={itemHotkeyStyle}>
                      {shortcutLabel(action.shortcut)}
                    </kbd>
                  )}
                </Command.Item>
              )
            })}
          </Command.Group>
        )}
      </Command.List>
    </Command>
  )
}
