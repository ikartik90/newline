import { Popover, POPOVER_TOOLBAR, type PopoverRect } from '@/components/ui/popover'
import { OptionList } from '@/components/ui/input/option-list'
import ContinueNumberingIcon from '@/assets/icons/continue-numbering.svg'
import ResetNumberingIcon from '@/assets/icons/reset-numbering.svg'

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface NumberToolbarProps {
  /** Article-relative rect of the clicked ordinal marker. */
  rect: PopoverRect
  /** Whether "continue numbering" is currently on for this run. */
  continueActive: boolean
  onContinue: () => void
  onReset: () => void
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
  continueActive,
  onContinue,
  onReset,
  onDismiss
}: NumberToolbarProps) {
  return (
    <Popover
      rect={rect}
      anchorName={selectionAnchor}
      align="start"
      className={POPOVER_TOOLBAR}
      // The rect was captured at the click; a scroll or resize leaves it stale.
      dismissOnReflow
      // A press on a number is the number's to answer: it opens these, or puts them away.
      ignoreSelector="[data-numbering-marker]"
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
        </OptionList.Toolbar>
      </OptionList>
    </Popover>
  )
}
