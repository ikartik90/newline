import { Fragment, useEffect, useRef, useState, type FC, type SVGProps } from 'react'
import { Popover, type PopoverRect } from '@/components/ui/popover'
import { OptionList } from '@/components/ui/input/option-list'
import { TextInput } from '@/components/ui/input/text-input'
import type { Mark } from '@shared/domain/nodes'
import LinkIcon from '@/assets/icons/link.svg'
import BoldIcon from '@/assets/icons/bold.svg'
import ItalicIcon from '@/assets/icons/italic.svg'
import CodeIcon from '@/assets/icons/code.svg'
import UnderlineSolidIcon from '@/assets/icons/underline-solid.svg'
import StrikethroughIcon from '@/assets/icons/strikethrough.svg'
import HighlightIcon from '@/assets/icons/highlight.svg'
import SidenoteIcon from '@/assets/icons/sidenote.svg'
import EditIcon from '@/assets/icons/edit.svg'
import GotoIcon from '@/assets/icons/goto.svg'
import TrashIcon from '@/assets/icons/trash.svg'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SelectionToolbarMode = 'format' | 'link-edit' | 'link-view' | 'sidenote-view'

/** The togglable (non-link) marks exposed as formatting buttons. */
export type ToggleableMark = Exclude<Mark['type'], 'link'>

interface SelectionToolbarProps {
  mode: SelectionToolbarMode
  /** Article-relative rect the toolbar anchors to (see {@link PopoverRect}). */
  rect: PopoverRect
  /** Mark types the current selection fully carries — drives the active state. */
  activeMarks: ReadonlySet<Mark['type']>
  /** Existing link href — prefilled in link-edit, opened by goto in link-view. */
  linkHref?: string
  onToggleMark: (type: ToggleableMark) => void
  onStartLink: () => void
  onApplyLink: (href: string) => void
  onRemoveLink: () => void
  onGotoLink: () => void
  onEditLink: () => void
  onAddSidenote: () => void
  onEditSidenote: () => void
  onDeleteSidenote: () => void
  onDismiss: () => void
}

// ---------------------------------------------------------------------------
// Format-mode button groups
// ---------------------------------------------------------------------------

interface FormatButton {
  mark: ToggleableMark
  label: string
  Icon: FC<SVGProps<SVGSVGElement>>
}

const FORMAT_GROUPS: FormatButton[][] = [
  [
    { mark: 'bold', label: 'Bold', Icon: BoldIcon },
    { mark: 'italic', label: 'Italic', Icon: ItalicIcon },
    { mark: 'underline', label: 'Underline', Icon: UnderlineSolidIcon }
  ],
  [
    { mark: 'strikethrough', label: 'Strikethrough', Icon: StrikethroughIcon },
    { mark: 'highlight', label: 'Highlight', Icon: HighlightIcon },
    { mark: 'code', label: 'Code', Icon: CodeIcon }
  ]
]

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

// The shared `toolbar` rail at its default size: a 40px row with a 6px inset
// and 4px gap, hugging its contents. The hairline, elevation and clip that
// floating costs (`selectionPopover`) come from the Popover shell.
const railStyle = 'flex items-center gap-1 h-10 px-1.5 w-max'
// The link editor: the same rail, holding one field at the width a URL needs.
const editRailStyle = 'flex items-center gap-2 h-10 px-1.5 w-80'
// "Esc to exit" — a key-cap and a muted label (the `inlineEditRow` hint).
const hintStyle = 'flex items-center gap-1 shrink-0 select-none'
const hintKeyStyle =
  'flex items-center h-5 px-1 rounded-sm border-[0.5px] border-divider bg-item-hover text-fg text-style-caption whitespace-nowrap'
const hintLabelStyle = 'text-fg/50 text-style-caption whitespace-nowrap'
// Pairs with a stylesheet that positions against the same target.
const selectionAnchor = '--selection-popover'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SelectionToolbar({
  mode,
  rect,
  activeMarks,
  linkHref,
  onToggleMark,
  onStartLink,
  onApplyLink,
  onRemoveLink,
  onGotoLink,
  onEditLink,
  onAddSidenote,
  onEditSidenote,
  onDeleteSidenote,
  onDismiss
}: SelectionToolbarProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [href, setHref] = useState(linkHref ?? '')

  // Reset the draft href whenever we (re)enter link-edit for a different link.
  const [prevMode, setPrevMode] = useState(mode)
  if (mode !== prevMode) {
    setPrevMode(mode)
    if (mode === 'link-edit') setHref(linkHref ?? '')
  }

  useEffect(() => {
    if (mode === 'link-edit') {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [mode])

  if (mode === 'link-edit') {
    return (
      <Popover
        rect={rect}
        anchorName={selectionAnchor}
        className={editRailStyle}
        role="toolbar"
        ariaLabel="Edit link"
        onDismiss={onDismiss}
      >
        <TextInput
          ref={inputRef}
          size="sm"
          type="url"
          inputMode="url"
          placeholder="https://..."
          aria-label="Link URL"
          iconBefore={<LinkIcon aria-hidden />}
          className="flex-1 min-w-0"
          value={href}
          onChange={(e) => setHref(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              // Read the control, not the draft state, so a commit that lands
              // in the same tick as the last keystroke cannot apply a stale href.
              const trimmed = e.currentTarget.value.trim()
              if (trimmed) onApplyLink(trimmed)
            }
          }}
        />
        <div className={hintStyle} aria-hidden>
          <span className={hintKeyStyle}>Esc</span>
          <span className={hintLabelStyle}>to exit</span>
        </div>
      </Popover>
    )
  }

  if (mode === 'link-view') {
    return (
      <Popover rect={rect} anchorName={selectionAnchor} className={railStyle} onDismiss={onDismiss}>
        <OptionList direction="inline">
          <OptionList.Toolbar aria-label="Link actions">
            <OptionList.Option aria-label="Edit link" onClick={onEditLink}>
              <EditIcon aria-hidden />
            </OptionList.Option>
            <OptionList.Option aria-label="Open link" onClick={onGotoLink}>
              <GotoIcon aria-hidden />
            </OptionList.Option>
            <OptionList.Option aria-label="Remove link" onClick={onRemoveLink}>
              <TrashIcon aria-hidden />
            </OptionList.Option>
          </OptionList.Toolbar>
        </OptionList>
      </Popover>
    )
  }

  if (mode === 'sidenote-view') {
    return (
      <Popover rect={rect} anchorName={selectionAnchor} className={railStyle} onDismiss={onDismiss}>
        <OptionList direction="inline">
          <OptionList.Toolbar aria-label="Sidenote actions">
            <OptionList.Option aria-label="Edit sidenote" onClick={onEditSidenote}>
              <EditIcon aria-hidden />
            </OptionList.Option>
            <OptionList.Option aria-label="Delete sidenote" onClick={onDeleteSidenote}>
              <TrashIcon aria-hidden />
            </OptionList.Option>
          </OptionList.Toolbar>
        </OptionList>
      </Popover>
    )
  }

  return (
    <Popover rect={rect} anchorName={selectionAnchor} className={railStyle} onDismiss={onDismiss}>
      <OptionList direction="inline">
        <OptionList.Toolbar aria-label="Format selection">
          <OptionList.Option
            aria-label="Add link"
            pressed={activeMarks.has('link')}
            onClick={onStartLink}
          >
            <LinkIcon aria-hidden />
          </OptionList.Option>
          <OptionList.Option
            aria-label="Add sidenote"
            pressed={activeMarks.has('sidenote')}
            onClick={onAddSidenote}
          >
            <SidenoteIcon aria-hidden />
          </OptionList.Option>
          {FORMAT_GROUPS.map((group, groupIdx) => (
            <Fragment key={groupIdx}>
              <OptionList.Divider />
              {group.map(({ mark, label, Icon }) => (
                <OptionList.Option
                  key={mark}
                  aria-label={label}
                  pressed={activeMarks.has(mark)}
                  onClick={() => onToggleMark(mark)}
                >
                  <Icon aria-hidden />
                </OptionList.Option>
              ))}
            </Fragment>
          ))}
        </OptionList.Toolbar>
      </OptionList>
    </Popover>
  )
}
