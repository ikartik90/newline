import type { FC, SVGProps } from 'react'
import { Popover } from '@/components/ui/popover'
import { OptionList } from '@/components/ui/input/option-list'
import SubheadingIcon from '@/assets/icons/subheading.svg'
import ParagraphIcon from '@/assets/icons/paragraph.svg'
import MediaIcon from '@/assets/icons/media.svg'
import LinkIcon from '@/assets/icons/link.svg'
import QuoteIcon from '@/assets/icons/quote.svg'
import CodeIcon from '@/assets/icons/code.svg'
import BorderIcon from '@/assets/icons/border.svg'
import NumberedListIcon from '@/assets/icons/numbered-list.svg'
import BulletedListIcon from '@/assets/icons/bulleted-list.svg'
import MetricIcon from '@/assets/icons/metric.svg'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

// `media` and `link_card` are menu vocabulary, not finished blocks: selecting
// one commits the block type and hands off to the editor, which opens the
// picker / URL prompt that fills the remaining field. Both ride the same
// onSelect(type) channel as every other item.
export type SlashMenuBlockType =
  | 'heading'
  | 'paragraph'
  | 'media'
  | 'link_card'
  | 'blockquote'
  | 'list_item'
  | 'bullet_list_item'
  | 'metric'
  | 'code_block'
  | 'horizontal_rule'

export interface SlashMenuEntry {
  type: SlashMenuBlockType
  label: string
  Icon: FC<SVGProps<SVGSVGElement>>
}

interface SlashMenuProps {
  /** Characters typed after the "/" — used to filter menu items. */
  query?: string
  /**
   * When provided, only items whose type is in this set are shown. Used to
   * hide non-text blocks (media, horizontal_rule) when the menu is opened on
   * an existing text block that needs type conversion.
   */
  allowedTypes?: ReadonlyArray<SlashMenuBlockType>
  /** The type of the block currently being edited — hidden from the list. */
  excludeType?: SlashMenuBlockType
  onSelect: (type: SlashMenuBlockType) => void
  onDismiss: () => void
}

// ---------------------------------------------------------------------------
// Menu items
// ---------------------------------------------------------------------------

const MENU_ITEMS: SlashMenuEntry[] = [
  { type: 'heading', label: 'Subheading', Icon: SubheadingIcon },
  { type: 'paragraph', label: 'Paragraph', Icon: ParagraphIcon },
  { type: 'media', label: 'Image or video', Icon: MediaIcon },
  { type: 'link_card', label: 'Link card', Icon: LinkIcon },
  { type: 'blockquote', label: 'Quote', Icon: QuoteIcon },
  { type: 'list_item', label: 'Numbered list', Icon: NumberedListIcon },
  { type: 'bullet_list_item', label: 'Bulleted list', Icon: BulletedListIcon },
  { type: 'metric', label: 'Metric', Icon: MetricIcon },
  { type: 'code_block', label: 'Code', Icon: CodeIcon },
  { type: 'horizontal_rule', label: 'Divider', Icon: BorderIcon }
]

/**
 * Pure filter helper — exported so parent components can check whether a given
 * query/context would produce any results without mounting <SlashMenu>.
 */
export function getFilteredSlashMenu(
  query: string,
  allowedTypes?: ReadonlyArray<SlashMenuBlockType>,
  excludeType?: SlashMenuBlockType
): SlashMenuEntry[] {
  const q = query.toLowerCase()
  return MENU_ITEMS.filter(
    (item) =>
      item.label.toLowerCase().includes(q) &&
      (!allowedTypes || allowedTypes.includes(item.type)) &&
      item.type !== excludeType
  )
}

export function slashMenuHasResults(
  query: string,
  allowedTypes?: ReadonlyArray<SlashMenuBlockType>,
  excludeType?: SlashMenuBlockType
): boolean {
  return getFilteredSlashMenu(query, allowedTypes, excludeType).length > 0
}

// ---------------------------------------------------------------------------
// Component
//
// A thin domain wrapper over the shared Popover + OptionList primitives. The
// wrapper owns slash-specific data (allowedTypes/excludeType filtering); the
// OptionList owns cursor/keyboard/hover. Filtering is pre-applied here
// (non-matching options are absent from the DOM, not merely hidden), so the
// authored children ARE the filtered set and the highlight re-homes to the first
// survivor when the active one drops out.
//
// `externalKeys` keeps focus in the editor: ArrowUp/Down/Enter are captured at
// the document to drive the highlight and commit, and the option under the
// pointer is preselected on open. `tone="plain"` because the popover owns the
// surface. `fit="content"` because the menu IS the vocabulary — the shared
// 7-row cap belongs to lists you browse, not to one you read whole.
// Element-anchored: the editor stamps `data-slash-anchor` on the active block
// and the popover opens below its left edge.
// ---------------------------------------------------------------------------

// The `slashMenuPopover` recipe's 200px column. Surface, hairline, radius and
// elevation come from the Popover shell; no inset of its own — the listbox's
// 4px is the only gap to the rows.
const menuStyle = 'w-[200px] flex flex-col'

export function SlashMenu({
  query = '',
  allowedTypes,
  excludeType,
  onSelect,
  onDismiss
}: SlashMenuProps) {
  const entries = getFilteredSlashMenu(query, allowedTypes, excludeType)

  return (
    <Popover
      anchor="[data-slash-anchor]"
      side="bottom"
      align="start"
      className={menuStyle}
      onDismiss={onDismiss}
    >
      <OptionList
        tone="plain"
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
