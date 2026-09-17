import { cx } from './field'
import { OptionList, type OptionItem } from './option-list'
import { SEGMENTED_LIST, SEGMENTED_OPTION, SEGMENTED_RAIL } from './segmented-control'

// ---------------------------------------------------------------------------
// ToggleBar — the MULTI-select sibling of `SegmentedControl`: one row, every
// choice on show, any combination of them on.
//
//   <Field size="sm">
//     <Field.Label>Direction</Field.Label>
//     <ToggleBar ariaLabel="Direction" options={…} value={directions} onValueChange={setDirections} />
//   </Field>
//
// Same BOX as its sibling, down to the classes. Two controls that sit in the
// same panel and mean "pick from this short row" should not be two different
// shapes; what differs between them is what a press MEANS.
//
// A TOOLBAR, not a listbox, and that is the whole difference: these choices
// are independent, so each button is a Base UI Toggle carrying its own
// `aria-pressed`, and a press toggles it alone.
// ---------------------------------------------------------------------------

export interface ToggleBarProps {
  /** The toggles, left to right. A short row — beyond four or five, use a list. */
  options: OptionItem[]
  /** Controlled value: every pressed option, in the caller's own order. */
  value: string[]
  onValueChange?: (value: string[]) => void
  /**
   * Whether the LAST pressed toggle may be released, emptying the bar. Off by
   * default, because for most of what a row like this controls "none of them"
   * is not a setting — releasing the last one is then ignored, exactly as
   * re-picking a `SegmentedControl`'s selected segment is.
   */
  allowEmpty?: boolean
  /** Names the row of buttons for assistive tech. */
  ariaLabel: string
  className?: string
}

export function ToggleBar({
  options,
  value,
  onValueChange,
  allowEmpty = false,
  ariaLabel,
  className
}: ToggleBarProps) {
  const pressed = new Set(value)

  const toggle = (option: string) => {
    if (!pressed.has(option)) {
      // Added in the OPTIONS' order rather than appended, so two bars in the
      // same state hold equal arrays, which is what lets a caller compare them.
      onValueChange?.(
        options
          .map((entry) => entry.value)
          .filter((entry) => (entry === option ? true : pressed.has(entry)))
      )
      return
    }
    if (!allowEmpty && pressed.size === 1) return
    onValueChange?.(value.filter((entry) => entry !== option))
  }

  return (
    <div className={cx(SEGMENTED_RAIL, className)}>
      <OptionList direction="inline">
        <OptionList.Toolbar aria-label={ariaLabel} className={SEGMENTED_LIST}>
          {options.map((option) => (
            <OptionList.Option
              key={option.value}
              value={option.value}
              aria-label={option.ariaLabel}
              className={SEGMENTED_OPTION}
              pressed={pressed.has(option.value)}
              onClick={() => toggle(option.value)}
            >
              {option.label}
            </OptionList.Option>
          ))}
        </OptionList.Toolbar>
      </OptionList>
    </div>
  )
}
