import {
  createContext,
  forwardRef,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type LabelHTMLAttributes,
  type TextareaHTMLAttributes,
  type ReactNode
} from 'react'
import { Input } from '@base-ui/react/input'

/** Join class names, dropping the falsy ones. The one helper every input shares. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ')
}

export type FieldSize = 'sm' | 'md' | 'lg'

/**
 * The field text scale — the guardrailed set a part's `type` override may pick
 * from (a curated subset of the typography tokens; `title`/`quote`/`code` are
 * article styles and deliberately excluded). Set `type` to deviate a single
 * part from the field's size-derived default; reach for `className` only to go
 * outside the scale.
 */
export type FieldTextStyle =
  | 'fineprint'
  | 'caption'
  | 'sidenote'
  | 'bodySmall'
  | 'bodyLarge'
  | 'subheading'

const TEXT_STYLE: Record<FieldTextStyle, string> = {
  fineprint: 'text-style-fineprint',
  caption: 'text-style-caption',
  sidenote: 'text-style-sidenote',
  bodySmall: 'text-style-body-sm',
  bodyLarge: 'text-style-body-lg',
  subheading: 'text-style-subheading'
}

// ---------------------------------------------------------------------------
// The ACTIVE state is CSS-driven off the control's engagement rather than a
// prop: a text input's `:focus-visible` (which the spec makes always match on a
// keyboard-editable element, click or tab — Base UI's range input included), a
// focusable INSIDE a `data-control` box (the slider thumb, whose input is
// hidden in it), or an open trigger's `aria-expanded`. Tracked from the field
// ROOT with `:has`, so the label recolours even though it sits outside the
// frame. Every part that shifts on activation spells the same three variants.
// ---------------------------------------------------------------------------
const ACTIVE_VARIANTS = [
  'group-has-[[data-control]:focus-visible]/field:',
  'group-has-[[data-control]_:focus-visible]/field:',
  'group-has-[[data-control][aria-expanded=true]]/field:'
]

/** `cls` under every selector that means "this field is engaged". */
export function whenFieldActive(cls: string): string {
  return ACTIVE_VARIANTS.map((v) => v + cls).join(' ')
}

// Label, value, hint and frame height move together, so you get a "small
// field" rather than a mismatched label over a normal input. `md` is the
// design default; `lg` steps each part up one text style and the frame up 8px;
// `sm` steps every part down one into a 28px frame.
const SIZE = {
  sm: {
    label: 'text-style-sidenote',
    control: 'text-style-body-sm',
    hint: 'text-style-fineprint',
    frame: 'h-7 has-[textarea]:h-auto',
    toggle: 'gap-x-1'
  },
  md: {
    label: 'text-style-body-sm',
    control: 'text-style-body-lg',
    hint: 'text-style-sidenote',
    frame: 'h-10 has-[textarea]:h-auto',
    toggle: ''
  },
  lg: {
    label: 'text-style-body-lg',
    control: 'text-style-subheading',
    hint: 'text-style-body-sm',
    frame: 'h-12 has-[textarea]:h-auto',
    toggle: ''
  }
} as const

type FieldContextValue = {
  controlId: string
  labelId: string
  hintId: string
  size: FieldSize
  labelFirst: boolean
  hasLabel: boolean
  setHasLabel: (present: boolean) => void
  hasHint: boolean
  setHasHint: (present: boolean) => void
  /**
   * Whether the control is a toggle (Switch / Checkbox), which flips the root
   * from a vertical stack into the control ∣ label/hint grid. Registered by
   * the control, so no orientation prop is needed.
   */
  toggle: boolean
  setToggle: (present: boolean) => void
  registerControl: (node: HTMLElement | null) => void
  focusControl: () => void
}

const FieldContext = createContext<FieldContextValue | null>(null)

/** Read the enclosing field's context; throws if a part is used outside <Field>. */
export function useField(component: string): FieldContextValue {
  const ctx = useContext(FieldContext)
  if (!ctx) throw new Error(`${component} must be used within <Field>.`)
  return ctx
}

/**
 * Like {@link useField} but returns null outside a <Field> instead of throwing.
 * For a control that composes INTO a Field when there's a label/hint to wire
 * (the Combobox's OptionList), yet also stands alone with nothing to label (a
 * toolbar, the slash menu). OptionList reads the field ONLY for the aria-*
 * wiring, so when there's no Field it simply emits no aria-labelledby/-describedby.
 */
export function useOptionalField(): FieldContextValue | null {
  return useContext(FieldContext)
}

/** The class a toggle control (Switch / Checkbox) wears to sit in the field grid. */
export function toggleControlClass({ size, labelFirst }: FieldContextValue): string {
  return cx(
    'row-start-1',
    labelFirst ? 'col-start-2' : 'col-start-1',
    // The control sits on the label's FIRST LINE, not on the middle of the
    // label: the row aligns to the top and the control is nudged back down by
    // half the difference between one line box and its own height. It holds
    // no text of its own, so the label's text style is what `1lh` reads.
    'translate-y-[calc((1lh-100%)/2)]',
    SIZE[size].label
  )
}

export interface FieldProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Scales the field as a set — label/hint typography (and, for text inputs, the
   * frame; for switches, the track geometry via the control). `md` is the
   * default; `sm` and `lg` step the whole set down / up together.
   */
  size?: FieldSize
  /**
   * Put the label BEFORE the control, and let it take the slack so the control
   * sits on the field's far edge — a settings row, rather than a switch with a
   * caption. Toggle controls only (`role="switch"` / `role="checkbox"`); a
   * stacked text field already has its label first.
   */
  labelFirst?: boolean
  children: ReactNode
}

/**
 * The field root — pure layout plus the context that wires the compound parts
 * together: it mints the control/hint ids (so Label ↔ Control and the
 * aria-describedby link resolve automatically) and holds the control ref used
 * to forward focus from the frame's dead space.
 */
function FieldRoot({ children, className, size = 'md', labelFirst = false, ...rest }: FieldProps) {
  const uid = useId()
  const controlRef = useRef<HTMLElement | null>(null)
  const [hasLabel, setHasLabel] = useState(false)
  const [hasHint, setHasHint] = useState(false)
  const [toggle, setToggle] = useState(false)

  const ctx: FieldContextValue = {
    controlId: `${uid}-control`,
    labelId: `${uid}-label`,
    hintId: `${uid}-hint`,
    size,
    labelFirst,
    hasLabel,
    setHasLabel,
    hasHint,
    setHasHint,
    toggle,
    setToggle,
    registerControl: (node) => {
      controlRef.current = node
    },
    focusControl: () => controlRef.current?.focus()
  }

  return (
    <FieldContext.Provider value={ctx}>
      <div
        data-field
        data-size={size}
        data-toggle={toggle ? '' : undefined}
        className={cx(
          'group/field flex flex-col items-stretch w-full',
          // The toggle archetype: control ∣ label/hint, aligned to the top,
          // hugging its parts unless a `labelFirst` row is stretched.
          toggle &&
            cx(
              'grid items-start gap-y-0.5 gap-x-2 w-fit',
              labelFirst ? 'grid-cols-[1fr_auto]' : 'grid-cols-[auto_1fr]',
              SIZE[size].toggle
            ),
          className
        )}
        {...rest}
      >
        {children}
      </div>
    </FieldContext.Provider>
  )
}

export interface FieldLabelProps extends LabelHTMLAttributes<HTMLLabelElement> {
  /**
   * Override this label's typography, independent of the field `size`. Unset →
   * inherits the field's size-derived default; set → deviates just this label,
   * bounded to {@link FieldTextStyle}.
   */
  type?: FieldTextStyle
  children: ReactNode
}

function FieldLabel({ children, type, className, ...rest }: FieldLabelProps) {
  const { controlId, labelId, setHasLabel, size, toggle, labelFirst } = useField('Field.Label')
  // Register presence + expose an id so a compound control that can't be a
  // single `htmlFor` target (the slider track, a listbox) can `aria-labelledby` it.
  useEffect(() => {
    setHasLabel(true)
    return () => setHasLabel(false)
  }, [setHasLabel])
  return (
    <label
      id={labelId}
      htmlFor={controlId}
      data-size={size}
      className={cx(
        'w-full break-words cursor-default text-field-fg-muted transition-colors duration-150',
        whenFieldActive('text-field-fg-active'),
        // Toggle archetype: the label is a full statement beside the control,
        // so it reads as resting field text rather than a muted label, and
        // clicking it toggles.
        toggle &&
          cx(
            'row-start-1 w-auto text-field-fg cursor-pointer',
            labelFirst ? 'col-start-1' : 'col-start-2'
          ),
        type ? TEXT_STYLE[type] : SIZE[size].label,
        className
      )}
      {...rest}
    >
      {children}
    </label>
  )
}

export interface FieldFrameProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode
}

/**
 * The presentational input shell — border, fill, and the leading/control/
 * trailing layout. It owns no value or keyboard behavior; its one job beyond
 * looks is to forward a click on its dead padding to the control so the field
 * doesn't feel broken near the edges. Icons compose straight in as bare
 * `<Icon aria-hidden />` children; the frame sizes and tints them.
 */
function FieldFrame({ children, className, onMouseDown, ...rest }: FieldFrameProps) {
  const { focusControl, size } = useField('Field.Frame')
  return (
    <div
      data-size={size}
      className={cx(
        'flex items-center gap-2 w-full px-2 rounded-sm border-[0.5px] border-solid overflow-hidden cursor-text',
        'bg-field border-field-border text-field-fg transition-[background-color,border-color,color] duration-150',
        // A multi-line control grows instead of holding the fixed height, and
        // the padding turns vertical because the frame no longer centres it.
        'has-[textarea]:items-start has-[textarea]:py-1',
        SIZE[size].frame,
        whenFieldActive('bg-field-active'),
        whenFieldActive('border-field-border-active'),
        whenFieldActive('text-field-fg-active'),
        // The keyboard ring goes on the shell so it hugs the whole field, icon
        // included; inset, so `overflow: hidden` cannot clip it.
        '[html[data-keyboard-focus]_[data-field]:has([data-control]:focus-visible)_&]:shadow-[inset_0_0_0_1.5px_var(--border-focus-ring)]',
        '[&>svg]:size-5 [&>svg]:shrink-0 [&>svg]:block [&>svg]:pointer-events-none [&>svg]:transition-colors',
        className
      )}
      onMouseDown={(e) => {
        onMouseDown?.(e)
        if (e.defaultPrevented) return
        // Interactive descendants (the control, or a trailing action button)
        // handle their own focus — only the frame's padding and the decorative
        // leading icon forward focus to the control.
        if (
          (e.target as HTMLElement).closest('input, textarea, select, button, a, [data-control]')
        ) {
          return
        }
        e.preventDefault() // keep selection; focus lands without a blur flash
        focusControl()
      }}
      {...rest}
    >
      {children}
    </div>
  )
}

/**
 * The reset every value slot wears — an input that is only its text. `fill`
 * (the default) lets it take the frame's slack; a box of its own width (the
 * slider's readout) passes false and sizes itself.
 */
export function controlClass(size: FieldSize, fill = true): string {
  return cx(
    fill && 'flex-1 w-full',
    'min-w-0 m-0 p-0 border-none bg-transparent appearance-none text-inherit',
    'caret-field-fg-active transition-colors duration-150',
    'placeholder:text-field-fg-placeholder data-[placeholder]:text-field-fg-placeholder',
    whenFieldActive('placeholder:text-field-fg-active-muted'),
    whenFieldActive('data-[placeholder]:text-field-fg-active-muted'),
    // The app-wide keyboard ring targets the raw <input>, which the frame's
    // overflow:hidden clips into an awkward inner rectangle. The frame carries
    // the ring instead.
    '[html[data-keyboard-focus]_&]:focus-visible:shadow-none',
    SIZE[size].control
  )
}

export type FieldControlProps = InputHTMLAttributes<HTMLInputElement>

/** The value slot for a text field — Base UI's Input carrying `data-control`. */
const FieldControl = forwardRef<HTMLInputElement, FieldControlProps>(function FieldControl(
  { className, ...rest },
  forwardedRef
) {
  const { controlId, hintId, hasHint, registerControl, size } = useField('Field.Control')
  return (
    <Input
      ref={(node: HTMLInputElement | null) => {
        registerControl(node)
        if (typeof forwardedRef === 'function') forwardedRef(node)
        else if (forwardedRef) forwardedRef.current = node
      }}
      id={controlId}
      data-control
      data-size={size}
      aria-describedby={hasHint ? hintId : undefined}
      className={cx(controlClass(size), className)}
      {...rest}
    />
  )
})

export type FieldTextAreaProps = TextareaHTMLAttributes<HTMLTextAreaElement>

/**
 * The value slot for a MULTI-LINE field — the same reset on a native textarea,
 * carrying the same `data-control` so the frame forwards focus to it exactly as
 * it does to an input. A part of its own rather than a `multiline` flag,
 * because the two do not share an element type. `resize` is off: the frame
 * clips its overflow, so the native grip would be drawn into a corner it
 * cannot escape. Size the box with `rows`.
 */
const FieldTextArea = forwardRef<HTMLTextAreaElement, FieldTextAreaProps>(function FieldTextArea(
  { className, ...rest },
  forwardedRef
) {
  const { controlId, hintId, hasHint, registerControl, size } = useField('Field.TextArea')
  return (
    <textarea
      ref={(node) => {
        registerControl(node)
        if (typeof forwardedRef === 'function') forwardedRef(node)
        else if (forwardedRef) forwardedRef.current = node
      }}
      id={controlId}
      data-control
      data-size={size}
      aria-describedby={hasHint ? hintId : undefined}
      className={cx(controlClass(size), 'resize-none block overflow-y-auto', className)}
      {...rest}
    />
  )
})

export interface FieldHintProps extends HTMLAttributes<HTMLParagraphElement> {
  /** Override this hint's typography, independent of the field `size`. */
  type?: FieldTextStyle
  children: ReactNode
}

function FieldHint({ children, type, className, ...rest }: FieldHintProps) {
  const { hintId, setHasHint, size, toggle, labelFirst } = useField('Field.Hint')
  // Register presence so the control only advertises aria-describedby when a
  // hint is actually mounted (no dangling id reference otherwise).
  useEffect(() => {
    setHasHint(true)
    return () => setHasHint(false)
  }, [setHasHint])
  return (
    <p
      id={hintId}
      data-size={size}
      className={cx(
        'w-full break-words mt-1 text-field-fg-muted',
        // Toggle archetype: the hint drops under the label, aligned to it.
        toggle && cx('row-start-2 w-auto mt-0', labelFirst ? 'col-start-1' : 'col-start-2'),
        type ? TEXT_STYLE[type] : SIZE[size].hint,
        className
      )}
      {...rest}
    >
      {children}
    </p>
  )
}

export interface FieldSearchProps extends Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'onChange'
> {
  /** Controlled query. */
  value?: string
  /** Initial query when uncontrolled. */
  defaultValue?: string
  /** Fired with the raw query string on every keystroke. */
  onValueChange?: (value: string) => void
}

/**
 * A bare, borderless search input — the type-ahead slot atop the option-list
 * popover. Deliberately DUMB: it emits nothing but the raw query string.
 * Interpreting that query belongs to the container it's dropped into
 * (OptionList's `filter`), the only node that holds what the query is matched
 * against.
 */
const FieldSearch = forwardRef<HTMLInputElement, FieldSearchProps>(function FieldSearch(
  { className, value, defaultValue, onValueChange, onInput, ...rest },
  ref
) {
  return (
    <input
      ref={ref}
      type="search"
      value={value}
      defaultValue={defaultValue}
      className={className}
      onInput={(e) => {
        onInput?.(e)
        onValueChange?.(e.currentTarget.value)
      }}
      {...rest}
    />
  )
})

/**
 * Compound field primitives. Presentation (root/label/frame/hint) is shared and
 * dumb; behavior lives in the control slot, which the assemblies (TextInput,
 * Combobox, Slider) fill. The Switch and Checkbox plug into the same context as
 * alternative controls, reusing Label + Hint.
 */
export const Field = Object.assign(FieldRoot, {
  Label: FieldLabel,
  Frame: FieldFrame,
  Control: FieldControl,
  TextArea: FieldTextArea,
  Hint: FieldHint,
  Search: FieldSearch
})
