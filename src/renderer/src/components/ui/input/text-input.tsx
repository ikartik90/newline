import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react'
import { Field, type FieldProps } from './field'

export interface TextInputProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'children' | 'size'
> {
  /** Scales label, value, hint and frame as a set — see {@link FieldProps.size}. */
  size?: FieldProps['size']
  /** Label rendered above the input and associated with it. */
  label?: ReactNode
  /** Helper text below the input, linked to the control via aria-describedby. */
  hint?: ReactNode
  /**
   * Leading icon inside the input shell — a bare `<Icon/>`, sized and tinted by
   * the frame. Mark it `aria-hidden` when it's purely decorative.
   */
  iconBefore?: ReactNode
  /** Applied to the field root — use it to size or place the whole field. */
  className?: string
}

/**
 * Flat-prop text input assembled from the {@link Field} primitives. Compound
 * underneath, ergonomic on top: the shared frame + label + hint are wired here,
 * leaving only the value control local to the text case.
 */
export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { label, hint, iconBefore, className, size, ...inputProps },
  ref
) {
  return (
    <Field className={className} size={size}>
      {label != null && <Field.Label>{label}</Field.Label>}
      <Field.Frame>
        {iconBefore}
        <Field.Control ref={ref} {...inputProps} />
      </Field.Frame>
      {hint != null && <Field.Hint>{hint}</Field.Hint>}
    </Field>
  )
})
