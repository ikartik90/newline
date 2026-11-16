import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
  type RefObject
} from 'react'
import { createPortal } from 'react-dom'
import { useDismiss } from '@/hooks/use-dismiss'
import { filterOptions, type OptionItem } from '@/utils/option-filter'
import { useTopLayerPopover } from '../popover'
import { controlClass, cx, Field, useField } from './field'
import { collectOptions, OptionList } from './option-list'
import ChevronDownIcon from '@/assets/icons/chevron-down.svg'
import ChevronUpIcon from '@/assets/icons/chevron-up.svg'

// ---------------------------------------------------------------------------
// Combobox — the Select field's control. Composed INTO a <Field> (label + hint
// are the consumer's Field.Label/Field.Hint siblings, not props):
//
//   <Field>
//     <Field.Label>Fruit</Field.Label>
//     <Combobox value={value} onValueChange={setValue}>
//       {fruits.map((f) => (
//         <Combobox.Option key={f.value} value={f.value}>{f.label}</Combobox.Option>
//       ))}
//     </Combobox>
//     <Field.Hint>Pick one</Field.Hint>
//   </Field>
//
// Options are authored as `Combobox.Option` children (the same leaf as
// `OptionList.Option`) — so the trigger can read their DATA to show the
// selected label even while the popup is closed, and the same children feed
// the open list.
//
// Collapsed, it renders the shared `field` frame (a `role="combobox"` button
// showing the selected label + a chevron); the whole frame is the open target.
// Activated, the chevron flips up and a manual popover in the top layer,
// anchored to the trigger (`[data-popover]` in main.css), stands on the sheet as
// every popover does and holds an `OptionList` with a `Field.Search` filter on top. The focus goes into
// the search as it opens and back to the trigger as it closes; Escape is
// `useDismiss`'s, so it closes one layer at a time, and a press outside or a
// Tab past either end closes it too.
//
// `search={false}` drops the filter box for a list too short to filter; focus
// then lands on the highlighted row and the arrows walk the list.
// ---------------------------------------------------------------------------

export interface ComboboxProps {
  /** Controlled selection (an option `value`). */
  value?: string | null
  /** Initial selection when uncontrolled. */
  defaultValue?: string | null
  /** Fired with the picked option's `value`. */
  onValueChange?: (value: string) => void
  /** Shown in the trigger when nothing is selected. */
  placeholder?: string
  /** Placeholder for the popup's filter search. */
  searchPlaceholder?: string
  /**
   * Whether the popup carries a filter box. On by default — the Select's whole
   * point is a list too long to scan. Turn it off for a menu with so few
   * options that a type-ahead over them is furniture rather than help.
   */
  search?: boolean
  /**
   * Whether the popup renders in a `document.body` portal. On by default, so it
   * escapes an ancestor that clips or contains it. Turn it off inside a surface
   * that must keep the menu in its own stacking context.
   */
  portal?: boolean
  /**
   * How the search narrows the options. Defaults to a case-insensitive label
   * substring match ({@link filterOptions}).
   */
  filter?: (options: OptionItem[], query: string) => OptionItem[]
  /** Row shown when the filter leaves nothing. */
  emptyLabel?: string
  /** The `Combobox.Option`s. */
  children: ReactNode
}

/**
 * The Select control. Reads the field wiring (controlId to be the labelable
 * control, registerControl for the frame's focus-forward) — so it must live
 * inside a `<Field>`, like Slider.
 */
function ComboboxRoot({
  value,
  defaultValue,
  onValueChange,
  placeholder = 'Select an option',
  searchPlaceholder = 'Search…',
  search = true,
  portal = true,
  filter = filterOptions,
  emptyLabel = 'No results',
  children
}: ComboboxProps) {
  const { controlId, size, registerControl } = useField('Combobox')
  const [open, setOpen] = useState(false)
  const popupId = `combobox-${useId().replace(/[^\w-]/g, '')}`
  const triggerRef = useRef<HTMLButtonElement | null>(null)

  const isControlled = value !== undefined
  const [internal, setInternal] = useState<string | null>(defaultValue ?? null)
  const selected = isControlled ? (value ?? null) : internal

  // The option DATA, read from the authored children — available even while
  // the popup (and its list) is closed and unmounted.
  const options = useMemo(() => collectOptions(children), [children])

  // A stale value with no matching option reads as empty, so the placeholder
  // shows rather than a blank frame.
  const display = options.find((o) => o.value === selected)?.label ?? ''

  /** Closes, handing the focus back to the trigger first if the popup held it. */
  const close = useCallback((restore: boolean) => {
    if (restore) triggerRef.current?.focus({ preventScroll: true })
    setOpen(false)
  }, [])

  const pick = (next: string) => {
    if (!isControlled) setInternal(next)
    onValueChange?.(next)
    close(true)
  }

  // The list is scaled by the FIELD, like every other part of it: the list
  // draws two sizes to the field's three, so `lg` reads as the base.
  const listSize = size === 'sm' ? 'sm' : 'md'

  const popup = open && (
    <ComboboxPopup
      id={popupId}
      anchor={triggerRef}
      ignoreSelector={`[data-combobox-frame="${popupId}"]`}
      search={search}
      onClose={close}
    >
      <OptionList
        tone="plain"
        fit="scroll"
        size={listSize}
        value={selected}
        onValueChange={pick}
        filter={filter}
        emptyLabel={emptyLabel}
      >
        {search && <Field.Search placeholder={searchPlaceholder} />}
        <OptionList.Status />
        {/* The search-less list takes the focus itself, onto its highlight. */}
        <OptionList.Listbox autoFocus={!search} emptyRow={false}>
          {children}
        </OptionList.Listbox>
      </OptionList>
    </ComboboxPopup>
  )

  return (
    <>
      <Field.Frame
        data-combobox-frame={popupId}
        className="cursor-pointer"
        // The whole frame is the open target — the decorative chevron and the
        // frame's dead padding are non-interactive, so without this only a
        // direct hit on the value text would open it. The trigger toggles on
        // its own click and must not be opened twice.
        onClick={(e) => {
          if ((e.target as Element).closest('[data-control]')) return
          setOpen(true)
        }}
      >
        <button
          ref={(node) => {
            triggerRef.current = node
            registerControl(node)
          }}
          type="button"
          role="combobox"
          id={controlId}
          data-control
          data-placeholder={display ? undefined : ''}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? popupId : undefined}
          // In the tab order explicitly, because WebKit's default one skips a
          // bare <button> — see `Button`.
          tabIndex={0}
          className={cx(controlClass(size), 'text-left cursor-pointer')}
          onClick={() => (open ? close(false) : setOpen(true))}
          onKeyDown={(e) => {
            if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
            e.preventDefault()
            setOpen(true)
          }}
        >
          {display || placeholder}
        </button>
        {open ? <ChevronUpIcon aria-hidden /> : <ChevronDownIcon aria-hidden />}
      </Field.Frame>

      {popup && (portal ? createPortal(popup, document.body) : popup)}
    </>
  )
}

interface ComboboxPopupProps {
  id: string
  anchor: RefObject<HTMLElement | null>
  ignoreSelector: string
  search: boolean
  onClose: (restore: boolean) => void
  children: ReactNode
}

/** The open popup, mounted only while open: shown in the top layer as it mounts. */
function ComboboxPopup({
  id,
  anchor,
  ignoreSelector,
  search,
  onClose,
  children
}: ComboboxPopupProps) {
  const ref = useRef<HTMLDivElement>(null)
  useTopLayerPopover(ref, () => anchor.current)

  const dismiss = useCallback(() => onClose(true), [onClose])
  useDismiss({ ref, onDismiss: dismiss, dismissOnOutsidePointer: false })

  // A press outside closes it and leaves the focus to wherever the press lands.
  // The frame is not outside: its own click toggles.
  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      const target = e.target as Element
      if (ref.current?.contains(target) || target.closest?.(ignoreSelector)) return
      onClose(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [ignoreSelector, onClose])

  // Into the search once the popup is shown (an `autoFocus` would run before it
  // is, on an element not yet displayed).
  useEffect(() => {
    if (search) ref.current?.querySelector('input')?.focus({ preventScroll: true })
  }, [search])

  // Tab moves between the search and the list; past either end it leaves by
  // way of the trigger — forward, the browser's Tab carries on from there.
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return
    const stops = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('input, [tabindex="0"]'))
    const at = stops.indexOf(document.activeElement as HTMLElement)
    if (e.shiftKey ? at > 0 : at < stops.length - 1 && at !== -1) return
    if (e.shiftKey) e.preventDefault()
    onClose(true)
  }

  return (
    <div
      ref={ref}
      id={id}
      role="dialog"
      aria-label="Choose an option"
      popover="manual"
      data-popover=""
      data-side="bottom"
      data-align="start"
      className={cx(
        'flex flex-col mt-0.5 [--popover-edge:5px] w-[anchor-size(width)] min-w-(--size-option-list-width) rounded-lg overflow-hidden outline-none',
        'bg-bg-sheet bg-level-1 shadow-[0_4px_16px_var(--shadow-sheet)]'
      )}
      onKeyDown={handleKeyDown}
    >
      {children}
    </div>
  )
}

/**
 * Compound select. `Combobox` is the trigger + popup assembly; `Combobox.Option`
 * (the shared `OptionList.Option` leaf) authors each row — so the same children
 * feed both the closed trigger's label and the open list.
 */
export const Combobox = Object.assign(ComboboxRoot, {
  Option: OptionList.Option
})
