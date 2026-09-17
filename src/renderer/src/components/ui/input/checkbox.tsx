import { forwardRef, useEffect, type ButtonHTMLAttributes } from 'react'
import { Checkbox as BaseCheckbox } from '@base-ui/react/checkbox'
import { cx, toggleControlClass, useField } from './field'
import CheckSmallIcon from '@/assets/icons/check-small.svg'

export interface CheckboxProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange' | 'type' | 'role' | 'aria-checked' | 'children' | 'value'
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
 * Checkbox — the control slot of a `<Field>`, and the Switch's sibling. Base
 * UI's Checkbox.Root drawn as a native button, reading the field context for
 * its id, label association and `aria-describedby` wiring, so `Field.Label`
 * and `Field.Hint` work with it exactly as they do for a text input. Unlike the
 * Switch it takes no `size` — one geometry, a 20px hit frame around a 16px box,
 * so `<Field size>` scales the label and hint around a fixed control.
 *
 * @example
 * <Field>
 *   <Checkbox defaultChecked />
 *   <Field.Label>Remember me</Field.Label>
 * </Field>
 */
export const Checkbox = forwardRef<HTMLButtonElement, CheckboxProps>(function Checkbox(
  { checked, defaultChecked, onCheckedChange, className, disabled, ...rest },
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
    <BaseCheckbox.Root
      ref={ref}
      id={controlId}
      nativeButton
      render={<button type="button" />}
      checked={checked}
      defaultChecked={defaultChecked}
      disabled={disabled}
      onCheckedChange={(next) => onCheckedChange?.(next)}
      aria-describedby={hasHint ? hintId : undefined}
      className={cx(
        'relative shrink-0 block size-5 p-0 m-0 border-none bg-transparent appearance-none cursor-pointer',
        'disabled:cursor-not-allowed disabled:opacity-50',
        toggleControlClass(field),
        className
      )}
      // Button attributes onto a part typed for its default <span>; the
      // element IS a button (see `render`), so the handlers line up at runtime.
      {...(rest as Omit<BaseCheckbox.Root.Props, 'ref'>)}
    >
      {/* The 16px box centred in the 20px frame, the 2px surround keeping it
          optically centred on the label's cap-height. Off = neutral, on = the
          field family's active accent, keyed off the root's aria-checked. */}
      <span
        aria-hidden
        className={cx(
          'absolute top-0.5 left-0.5 size-4 rounded-sm bg-field text-field-fg-active',
          'shadow-[inset_0_0_0_0.5px_var(--field-border)] transition-[background-color,box-shadow] duration-150',
          '[[aria-checked=true]>&]:bg-field-active [[aria-checked=true]>&]:shadow-[inset_0_0_0_0.5px_var(--field-border-active)]'
        )}
      >
        {/* A 20px glyph on a 16px box, hanging 2px off every side, revealed by
            opacity so it fades rather than pops. */}
        <BaseCheckbox.Indicator
          keepMounted
          render={<span />}
          className="absolute -top-0.5 -left-0.5 block size-5 pointer-events-none transition-opacity duration-150 data-[unchecked]:opacity-0 [&>svg]:size-5 [&>svg]:block"
        >
          <CheckSmallIcon />
        </BaseCheckbox.Indicator>
      </span>
    </BaseCheckbox.Root>
  )
})
