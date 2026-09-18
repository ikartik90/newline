import { forwardRef, useEffect, type ButtonHTMLAttributes } from 'react'
import { Switch as BaseSwitch } from '@base-ui/react/switch'
import { cx, toggleControlClass, useField } from './field'

export interface SwitchProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'onChange' | 'type' | 'role' | 'aria-checked' | 'children' | 'value'
> {
  /** Controlled on/off state. */
  checked?: boolean
  /** Initial state when uncontrolled. */
  defaultChecked?: boolean
  /** Fired with the next state whenever the switch toggles. */
  onCheckedChange?: (checked: boolean) => void
  /**
   * Override the track/thumb geometry, independent of the field `size` — e.g. a
   * large switch beside a caption-sized label, or `md` for one that shares a
   * row with bodySmall text. Unset → follows `<Field size>`.
   */
  size?: 'sm' | 'md' | 'lg'
  /** Applied to the control (track). */
  className?: string
}

// Track height = thumb + 2·inset, travel = width − 2·inset − thumb, so nothing
// is arbitrary: lg 48×24 on a 16px thumb, md 40×20 on 12, sm 20×12 on 8.
const GEOMETRY = {
  lg: { track: 'w-12 h-6', thumb: 'size-4 top-1 left-1 data-[checked]:translate-x-4' },
  md: { track: 'w-10 h-5', thumb: 'size-3 top-1 left-1 data-[checked]:translate-x-3' },
  sm: { track: 'w-5 h-3', thumb: 'size-2 top-0.5 left-0.5 data-[checked]:translate-x-2' }
} as const

/**
 * Toggle switch — the control slot of a `<Field>`. Base UI's Switch.Root drawn
 * as a native button, reading the field context for its id, label association
 * and `aria-describedby` wiring; it contributes only what is switch-specific:
 * the on/off state and the track + thumb visuals. Size comes from the field
 * root, so the label typography and the track geometry scale together.
 *
 * @example
 * <Field size="lg">
 *   <Switch defaultChecked />
 *   <Field.Label>Wi-Fi</Field.Label>
 * </Field>
 */
export const Switch = forwardRef<HTMLButtonElement, SwitchProps>(function Switch(
  { checked, defaultChecked, onCheckedChange, size: sizeProp, className, disabled, ...rest },
  ref
) {
  const field = useField('Switch')
  const { controlId, hintId, hasHint, size, setToggle } = field

  useEffect(() => {
    setToggle(true)
    return () => setToggle(false)
  }, [setToggle])

  // An explicit `size` prop overrides the field default; otherwise follow the
  // field. The switch is designed at sm and lg, so the field's text default
  // (md) coerces to lg — a size-less switch still renders full geometry.
  const resolved = sizeProp ?? (size === 'sm' ? 'sm' : 'lg')
  const geometry = GEOMETRY[resolved]

  return (
    <BaseSwitch.Root
      ref={ref}
      id={controlId}
      nativeButton
      render={<button type="button" />}
      // In the tab order explicitly, because WebKit's default one skips a
      // bare <button> — see `Button`.
      tabIndex={0}
      data-size={resolved}
      checked={checked}
      defaultChecked={defaultChecked}
      disabled={disabled}
      onCheckedChange={(next) => onCheckedChange?.(next)}
      aria-describedby={hasHint ? hintId : undefined}
      className={cx(
        'relative shrink-0 inline-block p-0 m-0 appearance-none cursor-pointer rounded-lg bg-field',
        // An inset shadow, NOT a border: a real border is subtracted from the
        // interior, so the thumb would sit half a pixel off centre.
        'shadow-[inset_0_0_0_0.5px_var(--field-border)] transition-[background-color,box-shadow] duration-150',
        'aria-checked:bg-field-active aria-checked:shadow-[inset_0_0_0_0.5px_var(--field-border-active)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        geometry.track,
        toggleControlClass(field),
        className
      )}
      // Button attributes onto a part typed for its default <span>; the
      // element IS a button (see `render`), so the handlers line up at runtime.
      {...(rest as Omit<BaseSwitch.Root.Props, 'ref'>)}
    >
      <BaseSwitch.Thumb
        aria-hidden
        className={cx(
          'absolute rounded-full bg-field-fg transition-[transform,background-color] duration-150',
          'data-[checked]:bg-field-fg-active',
          geometry.thumb
        )}
      />
    </BaseSwitch.Root>
  )
})
