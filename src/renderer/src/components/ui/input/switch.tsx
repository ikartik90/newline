import { forwardRef, useEffect, type InputHTMLAttributes } from 'react'
import { cx, toggleControlClass, useField } from './field'

export interface SwitchProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'onChange' | 'type' | 'role' | 'checked' | 'defaultChecked' | 'children' | 'size'
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
// is arbitrary: lg 40×24 on a 16px thumb, md 32×20 on 12, sm 20×12 on 8. The
// thumb is the track's ::before.
const GEOMETRY = {
  lg: {
    track: 'w-10 h-6',
    thumb: 'before:size-4 before:top-1 before:left-1 checked:before:translate-x-4'
  },
  md: {
    track: 'w-8 h-5',
    thumb: 'before:size-3 before:top-1 before:left-1 checked:before:translate-x-3'
  },
  sm: {
    track: 'w-5 h-3',
    thumb: 'before:size-2 before:top-0.5 before:left-0.5 checked:before:translate-x-2'
  }
} as const

/**
 * Toggle switch — the control slot of a `<Field>`. A native checkbox in the
 * `switch` role, reading the field context for its id, label association
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
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { checked, defaultChecked, onCheckedChange, size: sizeProp, className, ...rest },
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
    <input
      ref={ref}
      type="checkbox"
      role="switch"
      id={controlId}
      // In the tab order explicitly, because WebKit's default one skips a
      // checkbox — see `Button`.
      tabIndex={0}
      data-size={resolved}
      checked={checked}
      defaultChecked={defaultChecked}
      onChange={(event) => onCheckedChange?.(event.currentTarget.checked)}
      aria-describedby={hasHint ? hintId : undefined}
      className={cx(
        'relative shrink-0 inline-block p-0 m-0 appearance-none cursor-pointer rounded-lg bg-surface-field-default',
        // An inset shadow, NOT a border: a real border is subtracted from the
        // interior, so the thumb would sit half a pixel off centre.
        'shadow-[inset_0_0_0_0.5px_var(--border-field-default)] transition-[background-color,box-shadow] duration-150',
        'checked:bg-surface-field-active checked:shadow-[inset_0_0_0_0.5px_var(--border-field-active)]',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'before:absolute before:rounded-full before:bg-glyph-field-default before:transition-[transform,background-color] before:duration-150',
        'checked:before:bg-glyph-field-active',
        geometry.track,
        geometry.thumb,
        toggleControlClass(field),
        className
      )}
      {...rest}
    />
  )
})
