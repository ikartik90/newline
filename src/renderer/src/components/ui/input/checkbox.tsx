import { forwardRef, useEffect, type InputHTMLAttributes } from 'react'
import { cx, toggleControlClass, useField } from './field'

export interface CheckboxProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'type' | 'role' | 'checked' | 'defaultChecked' | 'children' | 'size'
> {
  /** Controlled on/off state. */
  checked?: boolean
  /** Initial state when uncontrolled. */
  defaultChecked?: boolean
  /** Fired with the next state whenever the checkbox toggles. */
  onCheckedChange?: (checked: boolean) => void
  /** Applied to the control (the 20px frame around the box). */
  className?: string
}

/**
 * Checkbox — the control slot of a `<Field>`, and the Switch's sibling. A
 * native checkbox, reading the field context for its id, label association and
 * `aria-describedby` wiring, so `Field.Label` and `Field.Hint` work with it
 * exactly as they do for a text input. Unlike the Switch it takes no `size` —
 * one geometry, a 20px hit frame around a 16px box, so `<Field size>` scales
 * the label and hint around a fixed control.
 *
 * @example
 * <Field>
 *   <Checkbox defaultChecked />
 *   <Field.Label>Remember me</Field.Label>
 * </Field>
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { checked, defaultChecked, onCheckedChange, className, ...rest },
  ref
) {
  const field = useField('Checkbox')
  const { controlId, hintId, hasHint, setToggle } = field

  // Flip the field into the control ∣ label/hint layout for as long as this
  // control is mounted.
  useEffect(() => {
    setToggle(true)
    return () => setToggle(false)
  }, [setToggle])

  return (
    <input
      ref={ref}
      type="checkbox"
      id={controlId}
      checked={checked}
      defaultChecked={defaultChecked}
      onChange={(event) => onCheckedChange?.(event.currentTarget.checked)}
      aria-describedby={hasHint ? hintId : undefined}
      className={cx(
        'relative shrink-0 block size-5 p-0 m-0 border-none bg-transparent appearance-none cursor-pointer',
        'disabled:cursor-not-allowed disabled:opacity-50',
        // The 16px box centred in the 20px frame, the 2px surround keeping it
        // optically centred on the label's cap-height. Off = neutral, on = the
        // field family's active accent.
        'before:absolute before:top-0.5 before:left-0.5 before:size-4 before:rounded-sm before:bg-surface-field-default',
        'before:shadow-[inset_0_0_0_0.5px_var(--border-field-default)] before:transition-[background-color,box-shadow] before:duration-150',
        'checked:before:bg-surface-field-active checked:before:shadow-[inset_0_0_0_0.5px_var(--border-field-active)]',
        // The 20px tick over the whole frame, hanging 2px off every side of the
        // box, revealed by opacity so it fades rather than pops.
        'after:absolute after:inset-0 after:bg-glyph-field-active after:mask-(--check-glyph) after:opacity-0 after:transition-opacity after:duration-150',
        'checked:after:opacity-100',
        toggleControlClass(field),
        className
      )}
      {...rest}
    />
  )
})
