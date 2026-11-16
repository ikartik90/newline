import { Popover, POPOVER_TOOLBAR, type PopoverRect } from '@/components/ui/popover'
import { OptionList } from '@/components/ui/input/option-list'
import type { ListMarkerStyle } from '@/utils/list-numbering'
import ContinueNumberingIcon from '@/assets/icons/continue-numbering.svg'
import ResetNumberingIcon from '@/assets/icons/reset-numbering.svg'
import AlphabetedListIcon from '@/assets/icons/alphabeted-list.svg'
import NumberedListIcon from '@/assets/icons/numbered-list.svg'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface NumberToolbarProps {
  /** Article-relative rect of the clicked ordinal marker. */
  rect: PopoverRect
  /** Current run style — decides whether the swap button offers a→z or 1→n. */
  marker: ListMarkerStyle
  /** Whether "continue numbering" is currently on for this run. */
  continueActive: boolean
  onContinue: () => void
  onReset: () => void
  onSwapStyle: () => void
  onDismiss: () => void
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

// Pairs with a stylesheet that positions against the same target.
const selectionAnchor = '--selection-popover'

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function NumberToolbar({
  rect,
  marker,
  continueActive,
  onContinue,
  onReset,
  onSwapStyle,
  onDismiss
}: NumberToolbarProps) {
  const isAlpha = marker === 'alpha'
  const SwapIcon = isAlpha ? NumberedListIcon : AlphabetedListIcon
  const swapLabel = isAlpha ? 'Switch to numbered list' : 'Switch to lettered list'

  return (
    <Popover
      rect={rect}
      anchorName={selectionAnchor}
      align="start"
      className={POPOVER_TOOLBAR}
      // The rect was captured at the click; a scroll or resize leaves it stale.
      dismissOnReflow
      onDismiss={onDismiss}
    >
      <OptionList direction="inline">
        <OptionList.Toolbar aria-label="List numbering options">
          <OptionList.Option
            aria-label="Continue numbering from previous list"
            pressed={continueActive}
            onClick={onContinue}
          >
            <ContinueNumberingIcon aria-hidden />
          </OptionList.Option>
          <OptionList.Option aria-label="Reset numbering at this item" onClick={onReset}>
            <ResetNumberingIcon aria-hidden />
          </OptionList.Option>
          <OptionList.Divider />
          <OptionList.Option aria-label={swapLabel} onClick={onSwapStyle}>
            <SwapIcon aria-hidden />
          </OptionList.Option>
        </OptionList.Toolbar>
      </OptionList>
    </Popover>
  )
}
