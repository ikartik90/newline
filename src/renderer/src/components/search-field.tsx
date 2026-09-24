import { useHasCursor } from '@/hooks/use-has-cursor'
import { useShortcutLabel } from '@/hooks/use-shortcut-label'
import SearchIcon from '@/assets/icons/search.svg'

// ---------------------------------------------------------------------------
// SearchField — the command menu's door in the top bar: drawn as the field it
// opens onto, so the two read as one thing rather than as a filter and a
// palette that happen to search the same notes.
//
// Its inset and corner are tokens (main.css, `--size-search-field-*`) chosen
// so the ⌘K chip inside sits concentric with the field. The glyph wears the
// bar's icon ink and size; only the placeholder text is faint.
// ---------------------------------------------------------------------------

export interface SearchFieldProps {
  /** Open the search — the command menu. */
  onOpen: () => void
  className?: string
}

const fieldStyle =
  'flex items-center gap-2 h-8 px-(--size-search-field-inset) rounded-(--size-search-field-radius) bg-field text-field-fg-placeholder text-style-body-sm border-[0.5px] border-solid border-field-border hover:bg-field-hover transition-colors'
const glyphStyle = 'size-5 shrink-0 text-fg-body'
// The `hotkey` recipe on a menu: the wash a hovered row wears.
const hotkeyStyle =
  'ml-auto flex items-center shrink-0 h-5 px-1 rounded-sm border-[0.5px] border-divider bg-field-hover text-fg-body text-style-caption whitespace-nowrap'

export function SearchField({ onOpen, className }: SearchFieldProps) {
  // The chip names a key; a device without one is shown none.
  const hasCursor = useHasCursor()
  const shortcut = useShortcutLabel('K')
  return (
    <button
      type="button"
      onClick={onOpen}
      className={className ? `${fieldStyle} ${className}` : fieldStyle}
      aria-label="Search notes"
      title={`Search notes (${shortcut})`}
    >
      <SearchIcon className={glyphStyle} aria-hidden />
      <span className="truncate">Search notes…</span>
      {hasCursor && (
        <kbd aria-hidden className={hotkeyStyle}>
          {shortcut}
        </kbd>
      )}
    </button>
  )
}
