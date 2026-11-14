import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode
} from 'react'
import {
  formatSliderValue,
  ratioOfValue,
  snapToStep,
  tickRatios,
  type SliderScale
} from '@/utils/slider-value'
import { beginControlDrag, endControlDrag } from '@/utils/control-drag'
import { controlClass, cx, Field, useField, whenFieldActive, type FieldSize } from './field'

// ---------------------------------------------------------------------------
// Slider — the third control archetype of the field family, composed INTO a
// <Field> exactly like Switch and Combobox (label and hint are the consumer's
// Field.Label / Field.Hint siblings, not props):
//
//   <Field size="sm">
//     <Field.Label>Opacity</Field.Label>
//     <Slider min={0} max={100} defaultValue={100} />
//     <Field.Hint>0–100</Field.Hint>
//   </Field>
//
// It brings no surface of its own: it renders the shared `field` frame and
// draws a ruler, a separator and the value inside it, so the fill, border,
// radius and the whole focus accent are the same ones the text input wears.
// The control is a native range input, hidden inside the drawn thumb: it holds
// the focus, the label and the value for assistive tech. The keys and the drag
// are this file's, so every route — key, press, drag, typing into the readout
// — snaps and commits through one place.
//
// Pass children to re-compose those parts (drop the value, reorder, insert
// your own); pass none and you get the drawn arrangement.
// ---------------------------------------------------------------------------

type SliderContextValue = {
  scale: SliderScale
  value: number
  /** 0–1 position of the current value, shared by the thumb and the readout. */
  ratio: number
  /** 0–1 position of every mark on the ruler. */
  ticks: number[]
  disabled: boolean
  size: FieldSize
  /** What an arrow key moves by; a Page key moves ten of them. */
  keyStep: number
  commit: (next: number) => void
}

const SliderContext = createContext<SliderContextValue | null>(null)

function useSlider(component: string): SliderContextValue {
  const ctx = useContext(SliderContext)
  if (!ctx) throw new Error(`${component} must be used within <Slider>.`)
  return ctx
}

export interface SliderProps {
  /** Controlled value. */
  value?: number
  /** Initial value when uncontrolled. Defaults to `min`. */
  defaultValue?: number
  /** Fired with the snapped value on every change (drag, key, or click). */
  onValueChange?: (value: number) => void
  min?: number
  max?: number
  /** Grid the value snaps to, anchored at `min`. */
  step?: number
  /**
   * Overrides the ruler with this many evenly spaced marks (11 at most). Left
   * off, the ruler comes from the scale: marks a whole number of steps apart,
   * as dense as a cap of 11 allows, each sitting on a value the slider holds.
   */
  ticks?: number
  disabled?: boolean
  /** Applied to the field frame. */
  className?: string
  /** Defaults to `<Slider.Track /><Slider.Separator /><Slider.Output />`. */
  children?: ReactNode
}

function SliderRoot({
  value: valueProp,
  defaultValue,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  ticks,
  disabled = false,
  className,
  children
}: SliderProps) {
  const { size } = useField('Slider')
  const scale: SliderScale = { min, max, step }

  const isControlled = valueProp !== undefined
  const [internal, setInternal] = useState(() => snapToStep(defaultValue ?? min, scale))
  // Snapping the incoming value too means a controlled consumer that echoes an
  // unsnapped number back cannot park the thumb between two stops.
  const value = snapToStep(isControlled ? valueProp : internal, scale)

  const commit = (next: number) => {
    // A disabled input still receives synthetic key events; nothing lands.
    if (disabled) return
    const snapped = snapToStep(next, scale)
    if (snapped === value) return
    if (!isControlled) setInternal(snapped)
    onValueChange?.(snapped)
  }

  // A continuous slider still needs a keyboard increment; 100 stops across
  // the range is the same granularity a native range input assumes. Page
  // keys jump ten of them.
  const keyStep = step > 0 ? step : (max - min) / 100

  const ctx: SliderContextValue = {
    scale,
    value,
    ratio: ratioOfValue(value, scale),
    ticks: tickRatios(scale, ticks),
    disabled,
    size,
    keyStep,
    commit
  }

  // The frame is the surface, shared with every other field control.
  return (
    <SliderContext.Provider value={ctx}>
      <Field.Frame className={className}>
        {children ?? (
          <>
            <SliderTrack />
            <SliderSeparator />
            <SliderOutput />
          </>
        )}
      </Field.Frame>
    </SliderContext.Provider>
  )
}

export type SliderTrackProps = Omit<
  HTMLAttributes<HTMLDivElement>,
  'children' | 'role' | 'tabIndex'
>

/**
 * The pointers this track is dragging with, and the promise that every one of
 * them hands the page's selection back. Four routes end a drag — the finger
 * lifts, the gesture is cancelled, capture is lost, the panel closes under it
 * — and `endControlDrag` is idempotent precisely so all four can call it
 * without knowing about each other.
 */
function useDragPointers() {
  const held = useRef(new Set<number>())
  useEffect(() => {
    const pointers = held.current
    return () => {
      pointers.forEach(endControlDrag)
      pointers.clear()
    }
  }, [])
  return {
    take: (id: number) => {
      held.current.add(id)
      beginControlDrag(id)
    },
    release: (id: number) => {
      held.current.delete(id)
      endControlDrag(id)
    }
  }
}

/** Where each key the slider claims takes the value, given the scale and its key step. */
function keyTarget(key: string, value: number, { min, max }: SliderScale, keyStep: number) {
  switch (key) {
    case 'ArrowRight':
    case 'ArrowUp':
      return value + keyStep
    case 'ArrowLeft':
    case 'ArrowDown':
      return value - keyStep
    case 'PageUp':
      return value + keyStep * 10
    case 'PageDown':
      return value - keyStep * 10
    case 'Home':
      return min
    case 'End':
      return max
    default:
      return null
  }
}

/**
 * The ruler and the thumb. The strip spans the frame's full height so all of
 * it is the drag target; the thumb holds the focusable range input — the
 * field's labelable control, carrying the label/hint association and the
 * `data-control` hook the frame keys its focus state off.
 */
function SliderTrack({
  className,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onLostPointerCapture,
  ...rest
}: SliderTrackProps) {
  const { labelId, hasLabel, hintId, hasHint, registerControl } = useField('Slider.Track')
  const { scale, value, ratio, ticks, disabled, keyStep, commit } = useSlider('Slider.Track')
  const inputRef = useRef<HTMLInputElement | null>(null)
  const drag = useDragPointers()

  // The value under the pointer, mapped across the whole strip.
  const commitAt = (event: PointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (rect.width <= 0) return
    const along = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width))
    commit(scale.min + along * (scale.max - scale.min))
  }

  return (
    <div
      data-slider-track
      data-orientation="horizontal"
      data-disabled={disabled ? '' : undefined}
      className={cx(
        'relative flex-1 min-w-0 self-stretch cursor-pointer touch-none',
        'data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50',
        className
      )}
      onPointerDown={(e: PointerEvent<HTMLDivElement>) => {
        onPointerDown?.(e)
        if (e.defaultPrevented || disabled || e.button !== 0) return
        // The page's selection is taken outright for as long as the drag runs:
        // a drag goes wherever the hand takes it, and the field's own
        // `user-select: none` cannot cover where it goes. The pointer is
        // captured on this strip, so the release routes below all reach it.
        drag.take(e.pointerId)
        e.currentTarget.setPointerCapture(e.pointerId)
        // Kept from the default, which would focus nothing and select text.
        e.preventDefault()
        inputRef.current?.focus({ preventScroll: true })
        commitAt(e)
      }}
      onPointerMove={(e: PointerEvent<HTMLDivElement>) => {
        onPointerMove?.(e)
        // Only a press in progress drags; a hover moves nothing.
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
        commitAt(e)
      }}
      onPointerUp={(e: PointerEvent<HTMLDivElement>) => {
        onPointerUp?.(e)
        e.currentTarget.releasePointerCapture(e.pointerId)
        drag.release(e.pointerId)
      }}
      onPointerCancel={(e: PointerEvent<HTMLDivElement>) => {
        onPointerCancel?.(e)
        drag.release(e.pointerId)
      }}
      onLostPointerCapture={(e: PointerEvent<HTMLDivElement>) => {
        onLostPointerCapture?.(e)
        drag.release(e.pointerId)
      }}
      {...rest}
    >
      {/* Ticks and thumb are both centred on the strip's midline and on their
          own value. The hairlines follow the frame's border into the accent. */}
      {ticks.map((tick, i) => (
        <span
          key={i}
          aria-hidden
          data-slider-tick
          className={cx(
            'absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-px h-1 rounded-full bg-border-field-default pointer-events-none transition-colors duration-150',
            whenFieldActive('bg-border-field-active')
          )}
          style={{ left: `${tick * 100}%` }}
        />
      ))}
      <div className="relative h-full">
        <div
          data-slider-thumb
          data-control
          // The 4×20 pill, painted in `currentColor` so the frame's resting →
          // active colour shift carries it, exactly as it carries an icon.
          className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-5 rounded-full bg-current pointer-events-none"
          style={{ insetInlineStart: `${ratio * 100}%` }}
        >
          <input
            ref={(node) => {
              inputRef.current = node
              registerControl(node)
            }}
            type="range"
            className="sr-only"
            min={scale.min}
            max={scale.max}
            step={keyStep}
            value={value}
            disabled={disabled}
            tabIndex={disabled ? -1 : 0}
            aria-orientation="horizontal"
            aria-valuenow={value}
            aria-valuetext={formatSliderValue(value, scale.step)}
            aria-labelledby={hasLabel ? labelId : undefined}
            aria-describedby={hasHint ? hintId : undefined}
            // Assistive tech sets the value straight on the input.
            onChange={(e) => commit(Number(e.currentTarget.value))}
            onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
              const next = keyTarget(e.key, value, scale, keyStep)
              if (next === null) return
              // Claimed, so the page cannot scroll under the field, and the
              // browser's own step (a tenth of the range on Page keys) never runs.
              e.preventDefault()
              commit(next)
            }}
          />
        </div>
      </div>
    </div>
  )
}

export type SliderSeparatorProps = Omit<HTMLAttributes<HTMLSpanElement>, 'children'>

/** The hairline rule between the ruler and the readout. */
function SliderSeparator({ className, ...rest }: SliderSeparatorProps) {
  useSlider('Slider.Separator')
  return (
    <span
      aria-hidden
      className={cx(
        'self-stretch shrink-0 w-[0.5px] bg-border-field-default transition-colors duration-150',
        whenFieldActive('bg-border-field-active'),
        className
      )}
      {...rest}
    />
  )
}

export type SliderOutputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'children' | 'type' | 'value' | 'defaultValue'
> & {
  /**
   * How the committed value is written, for a scale counted in something —
   * `1.5x`, `60%`, `24px`. Replaces the default entirely, which fixes the
   * decimals to the step so a column of values lines up. It never applies to
   * what is being TYPED: the draft is shown back exactly as entered.
   */
  format?: (value: number) => string
}

/** A finished number — "0." and "-" are on the way to one, and 0 is not. */
const NUMERIC = /^-?(\d+(\.\d+)?|\.\d+)$/

/**
 * The value — readout AND second way to set it, because a number is often
 * easier to type than to hit. A plain <input> wearing the field's own control
 * reset, carrying `data-control` so the frame lights up while it holds focus.
 * Typing runs through the SAME `commit` the drag and the arrow keys use; what
 * is typed is held as a draft meanwhile, so the box never rewrites itself
 * under the caret. The draft goes on blur, and the committed value paints.
 */
function SliderOutput({ className, onChange, onBlur, format, ...rest }: SliderOutputProps) {
  const { scale, value, disabled, size, commit } = useSlider('Slider.Output')
  const { hasLabel, labelId } = useField('Slider.Output')
  const [draft, setDraft] = useState<string | null>(null)
  const text = draft ?? (format ? format(value) : formatSliderValue(value, scale.step))

  return (
    <input
      type="text"
      data-control
      // Named by the field's label rather than by an invented one: this box and
      // the track are two ways to set the SAME thing.
      aria-labelledby={hasLabel ? labelId : undefined}
      aria-label={hasLabel ? undefined : 'Value'}
      value={text}
      disabled={disabled}
      inputMode="decimal"
      spellCheck={false}
      autoComplete="off"
      className={cx(
        controlClass(size, false),
        // The readout box: a fixed-width, right-aligned column whose digits
        // never shuffle, sitting flush on the frame's inset padding.
        'flex-none w-(--size-field-value) self-stretch text-right tabular-nums',
        'not-first:-ml-2 not-first:pl-2 last:-mr-2 last:pr-2 disabled:opacity-50',
        className
      )}
      onChange={(e) => {
        onChange?.(e)
        // Digits, a sign and a point.
        const next = e.currentTarget.value.replace(/[^0-9.-]/g, '')
        setDraft(next)
        if (NUMERIC.test(next)) commit(Number(next))
      }}
      onBlur={(e) => {
        onBlur?.(e)
        setDraft(null)
      }}
      {...rest}
    />
  )
}

/**
 * Compound slider. `Slider` is the control (state, keyboard, drag) and renders
 * the shared field frame; the parts inside it are composable — pass children
 * to rearrange or drop one, pass none for the drawn arrangement.
 *
 * @example
 * <Field size="sm">
 *   <Field.Label>Break duration</Field.Label>
 *   <Slider max={60} step={5} defaultValue={30} />
 * </Field>
 */
export const Slider = Object.assign(SliderRoot, {
  Track: SliderTrack,
  Separator: SliderSeparator,
  Output: SliderOutput
})
