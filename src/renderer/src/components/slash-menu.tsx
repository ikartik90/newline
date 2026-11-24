import type { FC, SVGProps } from 'react'
import { Popover } from '@/components/ui/popover'
import { OptionList } from '@/components/ui/input/option-list'
import HeadingOneIcon from '@/assets/icons/h1.svg'
import HeadingTwoIcon from '@/assets/icons/h2.svg'
import HeadingThreeIcon from '@/assets/icons/h3.svg'
import HeadingFourIcon from '@/assets/icons/h4.svg'
import ParagraphIcon from '@/assets/icons/paragraph.svg'
import MediaIcon from '@/assets/icons/media.svg'
import QuoteIcon from '@/assets/icons/quote.svg'
import CodeIcon from '@/assets/icons/code.svg'
import BorderIcon from '@/assets/icons/border.svg'
import NumberedListIcon from '@/assets/icons/numbered-list.svg'
import BulletedListIcon from '@/assets/icons/bulleted-list.svg'
import TaskListIcon from '@/assets/icons/checked-list.svg'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// `media` is menu vocabulary, not a finished block: selecting it commits the
// block type and hands off to the editor, which opens the picker that fills
// the remaining field. It rides the same onSelect(type) channel as every
// other item. A heading is named by its level.
export type SlashMenuBlockType =
  | 'heading_1'
  | 'heading_2'
  | 'heading_3'
  | 'heading_4'
  | 'paragraph'
  | 'media'
  | 'blockquote'
  | 'list_item'
  | 'bullet_list_item'
  | 'task_list_item'
  | 'code_block'
  | 'horizontal_rule'

export interface SlashMenuEntry {
  type: SlashMenuBlockType
  label: string
  /** A shorter name the query may start to spell: `h2` for Heading 2. */
  short?: string
  Icon: FC<SVGProps<SVGSVGElement>>
}

interface SlashMenuProps {
  /** Characters typed after the "/" — used to filter menu items. */
  query?: string
  /** The type of the block currently being edited — hidden from the list. */
  excludeType?: SlashMenuBlockType
  onSelect: (type: SlashMenuBlockType) => void
  onDismiss: () => void
}

// ---------------------------------------------------------------------------
// Menu items
// ---------------------------------------------------------------------------

const MENU_ITEMS: SlashMenuEntry[] = [
  { type: 'heading_1', label: 'Heading 1', short: 'h1', Icon: HeadingOneIcon },
  { type: 'heading_2', label: 'Heading 2', short: 'h2', Icon: HeadingTwoIcon },
  { type: 'heading_3', label: 'Heading 3', short: 'h3', Icon: HeadingThreeIcon },
  { type: 'heading_4', label: 'Heading 4', short: 'h4', Icon: HeadingFourIcon },
  { type: 'paragraph', label: 'Paragraph', Icon: ParagraphIcon },
  { type: 'media', label: 'Image or video', Icon: MediaIcon },
  { type: 'blockquote', label: 'Quote', Icon: QuoteIcon },
  { type: 'list_item', label: 'Numbered list', Icon: NumberedListIcon },
  { type: 'bullet_list_item', label: 'Bulleted list', Icon: BulletedListIcon },
  { type: 'task_list_item', label: 'Task list', short: 'todo', Icon: TaskListIcon },
  { type: 'code_block', label: 'Code', Icon: CodeIcon },
  { type: 'horizontal_rule', label: 'Divider', Icon: BorderIcon }
]

/**
 * Pure filter helper — exported so parent components can check whether a given
 * query/context would produce any results without mounting <SlashMenu>.
 */
export function getFilteredSlashMenu(
  query: string,
  excludeType?: SlashMenuBlockType
): SlashMenuEntry[] {
  const q = query.toLowerCase()
  return MENU_ITEMS.filter(
    (item) =>
      (item.label.toLowerCase().includes(q) || item.short?.startsWith(q)) &&
      item.type !== excludeType
  )
}

export function slashMenuHasResults(query: string, excludeType?: SlashMenuBlockType): boolean {
  return getFilteredSlashMenu(query, excludeType).length > 0
}

// ---------------------------------------------------------------------------
// Component
//
// A thin domain wrapper over the shared Popover + OptionList primitives. The
// wrapper owns slash-specific data (the query and excludeType filtering); the
// OptionList owns cursor/keyboard/hover. Filtering is pre-applied here
// (non-matching options are absent from the DOM, not merely hidden), so the
// authored children ARE the filtered set and the highlight re-homes to the first
// survivor when the active one drops out.
//
// `externalKeys` keeps focus in the editor: ArrowUp/Down/Enter are captured at
// the document to drive the highlight and commit, and the option under the
// pointer is preselected on open. `tone="menu"` because the popover owns the
// surface and the rows are the floating toolbar's buttons stood on end.
// `fit="content"` because the menu IS the vocabulary — the shared 7-row cap
// belongs to lists you browse, not to one you read whole.
// Element-anchored: the editor stamps `data-slash-anchor` on the active block
// and the popover opens below its left edge.
// ---------------------------------------------------------------------------

// The `slashMenuPopover` recipe's 200px column. Surface, radius and
// elevation come from the Popover shell; the inset round the rows and the gap
// between them are the menu tone's, the floating toolbar's own.
const menuStyle = 'w-[200px] flex flex-col'

export function SlashMenu({ query = '', excludeType, onSelect, onDismiss }: SlashMenuProps) {
  const entries = getFilteredSlashMenu(query, excludeType)

  return (
    <Popover
      anchor="[data-slash-anchor]"
      side="bottom"
      align="start"
      className={menuStyle}
      onDismiss={onDismiss}
    >
      <OptionList
        tone="menu"
        fit="content"
        onValueChange={(type) => onSelect(type as SlashMenuBlockType)}
      >
        <OptionList.Listbox externalKeys loop aria-label="Insert block">
          {entries.map(({ type, label, Icon }) => (
            <OptionList.Option key={type} value={type} label={label}>
              <Icon aria-hidden />
              {label}
            </OptionList.Option>
          ))}
        </OptionList.Listbox>
      </OptionList>
    </Popover>
  )
}
