import { Fragment, useEffect, useRef, useState, type FC, type SVGProps } from 'react'
import { Popover, POPOVER_TOOLBAR, type PopoverRect } from '@/components/ui/popover'
import { OptionList } from '@/components/ui/input/option-list'
import type { RunMark } from '@shared/mdx/inline'
import type { StyleColor } from '@shared/mdx/dialect'
import LinkIcon from '@/assets/icons/link.svg'
import BoldIcon from '@/assets/icons/bold.svg'
import ItalicIcon from '@/assets/icons/italic.svg'
import CodeIcon from '@/assets/icons/code.svg'
import UnderlineSolidIcon from '@/assets/icons/text-underline-solid.svg'
import StrikethroughIcon from '@/assets/icons/text-strikethrough.svg'
import HighlightIcon from '@/assets/icons/highlight.svg'
import SidenoteIcon from '@/assets/icons/sidenote.svg'
import EditIcon from '@/assets/icons/edit.svg'
import GotoIcon from '@/assets/icons/goto.svg'
import TrashIcon from '@/assets/icons/trash.svg'
import ColorIcon from '@/assets/icons/prop-color.svg'
import SizeIcon from '@/assets/icons/font-size.svg'
import AlignLeftIcon from '@/assets/icons/text-left.svg'
import AlignCenterIcon from '@/assets/icons/text-center.svg'
import AlignRightIcon from '@/assets/icons/text-right.svg'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SelectionToolbarMode =
  | 'format'
  | 'link-edit'
  | 'link-view'
  | 'sidenote-view'
  | 'color'
  | 'size'
  | 'align'

/** A mark by its name. A colour is no mark here: it is asked in a row of its own. */
export type MarkName = Exclude<RunMark['type'], 'color'>

/** The togglable (non-link) marks exposed as formatting buttons. */
export type ToggleableMark = Exclude<MarkName, 'link'>

/** A paragraph's size: its own, or the one either side of it. */
export type TextSize = 'sm' | 'md' | 'lg'

/** The side a block is set to: the left is its own. */
export type TextAlign = 'left' | 'center' | 'right'

interface SelectionToolbarProps {
  mode: SelectionToolbarMode
  /** Article-relative rect the toolbar anchors to (see {@link PopoverRect}). */
  rect: PopoverRect
  /** Mark types the current selection fully carries — drives the active state. */
  activeMarks: ReadonlySet<MarkName>
  /** Existing link href — prefilled in link-edit, opened by goto in link-view. */
  linkHref?: string
  /** The colour the words wear: its name, `default` for none, null for more than one. */
  color?: StyleColor | 'default' | null
  /** The size of the paragraphs selected, null for more than one. */
  size?: TextSize | null
  /** The side the blocks selected are set to, null for more than one. */
  align?: TextAlign | null
  onToggleMark: (type: ToggleableMark) => void
  onStartLink: () => void
  onApplyLink: (href: string) => void
  onRemoveLink: () => void
  onGotoLink: () => void
  onEditLink: () => void
  onAddSidenote: () => void
  onEditSidenote: () => void
  onDeleteSidenote: () => void
  /** Colour and size are offered where the editor can set them: each with its start. */
  onStartColor?: () => void
  onPickColor?: (color: StyleColor | null) => void
  onStartSize?: () => void
  onPickSize?: (size: TextSize) => void
  onStartAlign?: () => void
  onPickAlign?: (align: TextAlign) => void
  onDismiss: () => void
  /** What stands in the note beside its words: a press on it is not a press outside. */
  ignoreSelector?: string
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

// A colour by the name of its role, drawn as a letter in its ink; none is the
// text's own. Every class whole, for Tailwind to find.
const COLORS: { color: StyleColor | null; label: string; ink: string }[] = [
  { color: null, label: 'Default', ink: 'text-ink-body' },
  { color: 'highlight', label: 'Highlight', ink: 'text-ink-style-highlight' },
  { color: 'muted', label: 'Muted', ink: 'text-ink-style-muted' },
  { color: 'danger', label: 'Danger', ink: 'text-ink-style-danger' },
  { color: 'warning', label: 'Warning', ink: 'text-ink-style-warning' },
  { color: 'success', label: 'Success', ink: 'text-ink-style-success' }
]

const SIZES: { size: TextSize; label: string }[] = [
  { size: 'sm', label: 'Small' },
  { size: 'md', label: 'Medium' },
  { size: 'lg', label: 'Large' }
]

const SIDES: { align: TextAlign; label: string; Icon: FC<SVGProps<SVGSVGElement>> }[] = [
  { align: 'left', label: 'Left', Icon: AlignLeftIcon },
  { align: 'center', label: 'Centre', Icon: AlignCenterIcon },
  { align: 'right', label: 'Right', Icon: AlignRightIcon }
]

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

// A colour's letter, in an icon's box.
const swatchStyle = 'flex items-center justify-center size-5 text-style-body-sm font-bold'

// The link editor: as tall as every toolbar is, at the width a URL needs. Its
// field is the command palette's search field: an icon and a bare input on the row, with
// no fill, border or ring of its own, standing on the toolbar's.
const editRailStyle = 'flex items-center gap-2 h-(--size-toolbar) px-2 w-80 text-ink-body'
const linkIconStyle = 'shrink-0 size-5'
const linkInputStyle =
  'flex-1 min-w-0 bg-transparent border-none outline-none text-style-body-sm text-ink-body placeholder:text-ink-body/50'
// "Esc to exit" — a key-cap and a muted label (the `inlineEditRow` hint).
const hintStyle = 'flex items-center gap-1 shrink-0 select-none'
const hintKeyStyle =
  'flex items-center h-5 px-1 rounded-sm border border-border-divider bg-bg-field-hover text-ink-body text-style-caption whitespace-nowrap'
const hintLabelStyle = 'text-ink-body/50 text-style-caption whitespace-nowrap'
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
  color,
  size,
  align,
  onToggleMark,
  onStartLink,
  onApplyLink,
  onRemoveLink,
  onGotoLink,
  onEditLink,
  onAddSidenote,
  onEditSidenote,
  onDeleteSidenote,
  onStartColor,
  onPickColor,
  onStartSize,
  onPickSize,
  onStartAlign,
  onPickAlign,
  onDismiss,
  ignoreSelector
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
        ignoreSelector={ignoreSelector}
      >
        <LinkIcon className={linkIconStyle} aria-hidden />
        <input
          ref={inputRef}
          type="url"
          inputMode="url"
          placeholder="https://..."
          aria-label="Link URL"
          className={linkInputStyle}
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
      <Popover
        rect={rect}
        anchorName={selectionAnchor}
        className={POPOVER_TOOLBAR}
        onDismiss={onDismiss}
        ignoreSelector={ignoreSelector}
      >
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
      <Popover
        rect={rect}
        anchorName={selectionAnchor}
        className={POPOVER_TOOLBAR}
        onDismiss={onDismiss}
        ignoreSelector={ignoreSelector}
      >
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

  if (mode === 'color') {
    return (
      <Popover
        rect={rect}
        anchorName={selectionAnchor}
        className={POPOVER_TOOLBAR}
        onDismiss={onDismiss}
        ignoreSelector={ignoreSelector}
      >
        <OptionList direction="inline">
          <OptionList.Toolbar aria-label="Text colour">
            {COLORS.map((option) => (
              <OptionList.Option
                key={option.label}
                aria-label={option.label}
                pressed={color === (option.color ?? 'default')}
                onClick={() => onPickColor?.(option.color)}
              >
                <span aria-hidden className={`${swatchStyle} ${option.ink}`}>
                  A
                </span>
              </OptionList.Option>
            ))}
          </OptionList.Toolbar>
        </OptionList>
      </Popover>
    )
  }

  if (mode === 'size') {
    return (
      <Popover
        rect={rect}
        anchorName={selectionAnchor}
        className={POPOVER_TOOLBAR}
        onDismiss={onDismiss}
        ignoreSelector={ignoreSelector}
      >
        <OptionList direction="inline">
          <OptionList.Toolbar aria-label="Text size">
            {SIZES.map((option) => (
              <OptionList.Option
                key={option.size}
                // A word's line is taller than a glyph: held to a button's height, as the icons are.
                className="h-(--size-toolbar-button) px-2"
                pressed={size === option.size}
                onClick={() => onPickSize?.(option.size)}
              >
                {option.label}
              </OptionList.Option>
            ))}
          </OptionList.Toolbar>
        </OptionList>
      </Popover>
    )
  }

  if (mode === 'align') {
    return (
      <Popover
        rect={rect}
        anchorName={selectionAnchor}
        className={POPOVER_TOOLBAR}
        onDismiss={onDismiss}
        ignoreSelector={ignoreSelector}
      >
        <OptionList direction="inline">
          <OptionList.Toolbar aria-label="Text alignment">
            {SIDES.map((option) => (
              <OptionList.Option
                key={option.align}
                aria-label={option.label}
                pressed={align === option.align}
                onClick={() => onPickAlign?.(option.align)}
              >
                <option.Icon aria-hidden />
              </OptionList.Option>
            ))}
          </OptionList.Toolbar>
        </OptionList>
      </Popover>
    )
  }

  // A link carries no style, so over one there is none to offer.
  const styled = !activeMarks.has('link')
  // The button draws the side the blocks stand on: the left's where they stand on more than one.
  const AlignIcon = SIDES.find((side) => side.align === align)?.Icon ?? AlignLeftIcon

  return (
    <Popover
      rect={rect}
      anchorName={selectionAnchor}
      className={POPOVER_TOOLBAR}
      onDismiss={onDismiss}
      ignoreSelector={ignoreSelector}
    >
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
          {(styled ? FORMAT_GROUPS : []).map((group, groupIdx) => (
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
          {styled && (onStartColor || onStartSize || onStartAlign) && (
            <>
              <OptionList.Divider />
              {onStartColor && (
                <OptionList.Option
                  aria-label="Colour"
                  pressed={color !== undefined && color !== 'default'}
                  onClick={onStartColor}
                >
                  <ColorIcon aria-hidden />
                </OptionList.Option>
              )}
              {onStartSize && (
                <OptionList.Option
                  aria-label="Size"
                  pressed={size !== undefined && size !== 'md'}
                  onClick={onStartSize}
                >
                  <SizeIcon aria-hidden />
                </OptionList.Option>
              )}
              {onStartAlign && (
                <OptionList.Option
                  aria-label="Alignment"
                  pressed={align !== undefined && align !== 'left'}
                  onClick={onStartAlign}
                >
                  <AlignIcon aria-hidden />
                </OptionList.Option>
              )}
            </>
          )}
        </OptionList.Toolbar>
      </OptionList>
    </Popover>
  )
}
