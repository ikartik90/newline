import { cx } from './field'
import { OptionList, type OptionItem } from './option-list'

// ---------------------------------------------------------------------------
// SegmentedControl — a short single-select with every choice on show, as one
// row of a form:
//
//   <Field size="sm">
//     <Field.Label>Object Fit</Field.Label>
//     <SegmentedControl options={[{ value: "cover", label: "Cover" }, …]} value={fit} onValueChange={setFit} />
//   </Field>
//
// Composed rather than drawn. The BOX is the shared toolbar rail at its small
// size — 28px, no inset, no gap, items squared and the rail clipping the row's
// ends to its own 4px corner — on the field tone, so it lines up with the text
// inputs and sliders stacked above it. The OPTIONS are `OptionList`'s, which
// already paint the active chip for `aria-selected`. The only thing left to
// say is that the segments stretch.
//
// A LISTBOX, not a toolbar: exactly one option is on and picking a second
// releases the first, which is `aria-selected` on a `role="listbox"` and gets
// the roving arrow-key cursor for free. `ToggleBar` is the multi-toggle sibling.
// ---------------------------------------------------------------------------

/**
 * The 28px rail a segmented row sits in, on the field tone and filling its
 * slot. A gap of none has to mean none wherever the row is actually laid out —
 * the `OptionList` a level down owns the 2px between its options — and the
 * items go square: the rail owns the only corner in the box, and clips to it.
 */
export const SEGMENTED_RAIL =
  'flex items-center flex-1 min-w-0 h-(--size-toolbar-button) gap-0 px-0 rounded-sm overflow-hidden ' +
  'bg-field shadow-[inset_0_0_0_0.5px_var(--field-border)] ' +
  '[&_:is([role=toolbar],[role=listbox])]:gap-0 [&_:is(button,[role=button])]:rounded-none'

/** The row fills the rail; stretched as well as grown, so the segments inherit a real box. */
export const SEGMENTED_LIST = 'grow basis-0 min-w-0 self-stretch'

/**
 * A segment takes an equal share of the rail, centres its label and stands
 * the rail's full height. The SEAM between two segments is drawn by the right
 * one of each pair on its leading edge — only where both agree (two off get
 * the resting hairline); where they differ the chip's own fill already divides
 * them, and a line would be a second answer to a question already answered.
 */
export const SEGMENTED_OPTION =
  'grow basis-0 min-w-0 justify-center self-stretch relative ' +
  'before:content-[""] before:absolute before:inset-y-0 before:left-0 before:w-[0.5px] before:bg-transparent ' +
  '[[aria-selected=false]+&[aria-selected=false]]:before:bg-field-border [[aria-pressed=false]+&[aria-pressed=false]]:before:bg-field-border'

export interface SegmentedControlProps {
  /** The segments, left to right. Two or three — beyond that use a Combobox. */
  options: OptionItem[]
  /** Controlled value. */
  value?: string
  /** Initial value when uncontrolled. */
  defaultValue?: string
  onValueChange?: (value: string) => void
  /**
   * Names the control when there is no `Field` around it to borrow a label
   * from. Omit inside a `Field` — the field's own label already names it.
   */
  ariaLabel?: string
  className?: string
}

export function SegmentedControl({
  options,
  value,
  defaultValue,
  onValueChange,
  ariaLabel,
  className
}: SegmentedControlProps) {
  return (
    // The rail is a wrapper rather than the listbox itself: the listbox already
    // carries the option list's own inline-row classes.
    <div className={cx(SEGMENTED_RAIL, className)}>
      <OptionList
        direction="inline"
        value={value}
        defaultValue={defaultValue}
        // A segment is never released, only replaced.
        onValueChange={(next) => {
          if (next != null) onValueChange?.(next)
        }}
      >
        <OptionList.Listbox
          aria-label={ariaLabel}
          className={SEGMENTED_LIST}
          // Wraps, because the row is short and both ends are one key apart.
          loop
        >
          {options.map((option) => (
            <OptionList.Option
              key={option.value}
              value={option.value}
              aria-label={option.ariaLabel}
              className={SEGMENTED_OPTION}
            >
              {option.label}
            </OptionList.Option>
          ))}
        </OptionList.Listbox>
      </OptionList>
    </div>
  )
}
