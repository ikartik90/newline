import {
  Children,
  cloneElement,
  createContext,
  Fragment,
  isValidElement,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type ReactElement,
  type ReactNode
} from 'react'
import { Toggle } from '@base-ui/react/toggle'
import { getInputModality, getPointerPosition, useInputModality } from '@/hooks/use-input-modality'
import { useScrollHandoff } from '@/hooks/use-scroll-handoff'
import { filterOptions, type OptionItem } from '@/utils/option-filter'
import { scrollToCenter } from '@/utils/scroll-to-center'
import { cx, Field, useOptionalField, type FieldSearchProps } from './field'

// ---------------------------------------------------------------------------
// OptionList — the composable listbox behind a Combobox, and a stand-alone,
// always-open select on its own.
//
//   <OptionList value={value} onValueChange={setValue}>
//     <Field.Search placeholder="Search…" />          {/* optional filter row */}
//     <OptionList.Listbox>
//       {fruits.map((f) => (
//         <OptionList.Option key={f.value} value={f.value}>
//           {f.icon}
//           {f.label}
//         </OptionList.Option>
//       ))}
//     </OptionList.Listbox>
//   </OptionList>
//
// Options are AUTHORED as children — one `<OptionList.Option value=…>` each, so
// a row can compose an icon + label instead of squeezing into a data-shape
// prop. The root reads the tree to recover the ordered option DATA it needs for
// filtering, selection and the roving highlight, and hands each part what it
// needs through context. Every option button surfaces its state — aria-selected,
// data-active (the keyboard/hover highlight), :disabled — as attributes, so the
// look is fully re-skinnable off selectors.
//
// A dropped-in `Field.Search` (opt-in) filters the list. With focus in the
// search, ArrowUp/Down move the highlight (announced via aria-activedescendant,
// focus stays put) and Enter commits it — the combobox interaction. With focus
// in the list itself (no search), the same keys rove real button focus instead.
// ---------------------------------------------------------------------------

type Tone = 'default' | 'onBrand' | 'plain'
type Direction = 'block' | 'inline'
type Fit = 'scroll' | 'content'
type Size = 'md' | 'sm'

interface Variants {
  tone: Tone
  direction: Direction
  fit: Fit
  size: Size
}

// The same brand chip for a selected row and a pressed toggle, wearing the
// matching active edge on a pseudo so it composes with the focus ring.
const ON_STATE =
  'aria-selected:bg-field-active aria-selected:text-field-fg-active aria-pressed:bg-field-active aria-pressed:text-field-fg-active ' +
  'aria-selected:after:content-[""] aria-selected:after:absolute aria-selected:after:inset-0 aria-selected:after:rounded-[inherit] aria-selected:after:border-[0.5px] aria-selected:after:border-solid aria-selected:after:border-field-active aria-selected:after:pointer-events-none ' +
  'aria-pressed:after:content-[""] aria-pressed:after:absolute aria-pressed:after:inset-0 aria-pressed:after:rounded-[inherit] aria-pressed:after:border-[0.5px] aria-pressed:after:border-solid aria-pressed:after:border-field-active aria-pressed:after:pointer-events-none'

const ON_BRAND_STATE =
  'aria-selected:bg-field-selected aria-selected:text-field-fg aria-pressed:bg-field-selected aria-pressed:text-field-fg aria-selected:after:border-0 aria-pressed:after:border-0'

/**
 * The slot classes, resolved once in the root from its variants. Exported so
 * the Combobox's Base UI list wears exactly the rows this list draws.
 */
export function optionListClasses({ tone, direction, fit, size }: Variants) {
  const brand = tone === 'onBrand'
  const hoverTint = brand ? 'bg-field-hover-brand' : 'bg-field-hover'
  return {
    root: cx(
      'flex flex-col w-(--size-option-list-width) rounded-sm overflow-hidden',
      tone === 'default' && 'bg-field shadow-[inset_0_0_0_0.5px_var(--field-border)]',
      brand && 'w-full',
      // A menu whose popover already owns the surface, or an inline row that
      // sits in the consumer's frame: the root collapses.
      (tone === 'plain' || direction === 'inline') && 'contents'
    ),
    search: cx(
      'shrink-0 w-full px-2 py-0 border-0 border-b-[0.5px] border-solid bg-transparent appearance-none',
      'caret-field-fg-active [&::-webkit-search-cancel-button]:hidden',
      brand
        ? 'text-field-fg-active border-b-field-active placeholder:text-field-fg-active-muted'
        : 'text-field-fg border-b-field placeholder:text-field-fg-placeholder',
      size === 'sm' ? 'h-7 text-style-body-sm' : 'h-10 text-style-body-lg'
    ),
    // The two layouts are written as alternatives rather than as a base with
    // overrides: same-property utilities resolve by stylesheet order, not by
    // position in the class list, so an inline row's `p-0` would lose to the
    // column's `p-1` and keep its inset.
    list:
      direction === 'inline'
        ? 'flex flex-row items-center gap-0.5 p-0 w-max max-h-none overflow-visible'
        : cx(
            'flex flex-col overflow-x-hidden overflow-y-auto',
            // 7 full rows + a half-row peek that says there is more to scroll;
            // the dense list fits 9 shorter rows in the same idea.
            size === 'sm'
              ? 'gap-0.5 px-1 py-1 max-h-[calc(9*var(--size-option-row-sm)+8*2px+2*4px+12px)]'
              : 'gap-0 p-1 max-h-[calc(7*var(--size-option-row)+2*4px+12px)]',
            fit === 'content' && 'max-h-[calc(100dvh-80px)]'
          ),
    option: cx(
      // One width or the other, never both: same-property utilities resolve
      // by stylesheet order, so `w-full` from the block layout beat the
      // inline row's `w-auto` and every toolbar chip stretched to the rail.
      direction === 'inline' ? 'w-auto' : 'w-full',
      'flex items-center gap-2 shrink-0 rounded-sm relative border-none bg-transparent appearance-none',
      'text-left text-style-body-sm cursor-pointer select-none whitespace-nowrap overflow-hidden text-ellipsis',
      'transition-[background-color,color,box-shadow] duration-150',
      '[&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:block',
      brand ? 'text-field-fg-active' : 'text-field-fg',
      // `data-active` is the roving/keyboard highlight; the `not-` guards keep
      // the neutral tint off the selected row, which is the default roving
      // target and so carries both attributes.
      `data-[active]:not-aria-selected:not-aria-pressed:${hoverTint}`,
      brand ? ON_BRAND_STATE : ON_STATE,
      'disabled:text-field-fg-muted disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:data-[active]:bg-transparent',
      '[html[data-keyboard-focus]_&]:focus-visible:shadow-[inset_0_0_0_1.5px_var(--border-focus-ring)]',
      size === 'sm' ? 'px-1 py-0' : 'p-1'
    ),
    // The bare :hover tint, gated on the live input modality for a LISTBOX
    // row: a cursor parked over a menu opened with `/` would otherwise paint a
    // second lit row beside the one the keyboard is driving. A TOOLBAR has no
    // roving highlight, so hover always tints there.
    listboxHover: `[html:not([data-input-modality=keyboard])_&]:hover:not-aria-selected:${hoverTint}`,
    toolbarHover: `hover:not-aria-pressed:${hoverTint}`,
    // Base UI's own roving highlight (the Combobox item), the same tint.
    highlighted: `data-[highlighted]:not-aria-selected:${hoverTint}`,
    empty: cx(
      'flex items-center px-1 text-style-body-sm select-none',
      brand ? 'text-field-fg-active-muted' : 'text-field-fg-muted',
      size === 'sm' ? 'h-(--size-option-row-sm)' : 'h-(--size-option-row)'
    ),
    divider: cx(
      'shrink-0 bg-divider',
      direction === 'inline' ? 'w-px h-auto self-stretch' : 'w-full h-px'
    )
  }
}

type OptionListStyles = ReturnType<typeof optionListClasses>

/**
 * Whatever picked an option: a click on the row, Enter from the search or the
 * list, or the document-level keydown `externalKeys` captures. The union exists
 * so `shiftKey`/`metaKey`/`ctrlKey` are readable on EVERY path.
 */
export type OptionSelectEvent = ReactMouseEvent | KeyboardEvent<Element> | globalThis.KeyboardEvent

type OptionListContextValue = {
  styles: OptionListStyles
  size: Size
  /** Values that pass the current filter — what `Listbox` renders. */
  filteredValues: Set<string>
  selected: string | null
  /** Presentational multi-selection; when present it decides which rows paint as picked. */
  selectedSet: ReadonlySet<string> | null
  /** The single highlighted option (query/hover/arrow ▸ selected ▸ first). */
  activeValue: string | null
  select: (value: string, event?: OptionSelectEvent) => void
  /** Move the highlight by ±1 enabled option; `focus` roves real button focus. */
  moveActive: (delta: 1 | -1, focus: boolean, loop?: boolean) => void
  /** The layout axis, and therefore the key pair that walks the options. */
  direction: Direction
  /** Park the highlight on a specific value — pointer-preselect on open. */
  setActiveValue: (value: string | null) => void
  /** Release the highlight as the pointer leaves `value`'s row (no-op unless it owns it). */
  clearActive: (value: string) => void
  /** How the highlight last moved: `key` persists and scrolls into view, `pointer` never scrolls. */
  activeSource: 'pointer' | 'key' | null
  optionId: (value: string) => string
  listboxId: string
  labelId: string
  hasLabel: boolean
  hintId: string
  hasHint: boolean
  emptyLabel: string
}

const OptionListContext = createContext<OptionListContextValue | null>(null)

function useOptionList(component: string): OptionListContextValue {
  const ctx = useContext(OptionListContext)
  if (!ctx) throw new Error(`${component} must be used within <OptionList>.`)
  return ctx
}

// Which behavior container an OptionList.Option sits in — set by Listbox vs
// Toolbar, read by the shared Option leaf to pick its semantics.
type ContainerMode = 'listbox' | 'toolbar'
const OptionListContainerContext = createContext<ContainerMode>('listbox')
const useContainerMode = () => useContext(OptionListContainerContext)

// --- Reading the option DATA back out of the authored children ------------

function isOption(node: ReactNode): node is ReactElement<OptionListOptionProps> {
  return isValidElement(node) && node.type === OptionListOption
}

/**
 * The searchable + trigger-display text for an option. An explicit `label` prop
 * wins; otherwise a plain-string child IS the label; for richer children (icon
 * + text) the string parts are joined, falling back to the value.
 */
function optionLabel(props: OptionListOptionProps): string {
  if (typeof props.label === 'string') return props.label
  if (typeof props.children === 'string' || typeof props.children === 'number') {
    return String(props.children)
  }
  const text = Children.toArray(props.children)
    .filter(
      (child): child is string | number => typeof child === 'string' || typeof child === 'number'
    )
    .join('')
  return text.trim() || props.value || ''
}

/**
 * Recover the ordered option data from the tree — drilling through the
 * `OptionList.Listbox` wrapper and any fragments a `.map()` produces. Runs
 * during render (no mount/registration race). Later duplicate values are
 * ignored so `getElementById(optionId)` stays unambiguous.
 */
export function collectOptions(children: ReactNode): OptionItem[] {
  const out: OptionItem[] = []
  const seen = new Set<string>()
  const visit = (nodes: ReactNode) => {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child)) return
      if (child.type === OptionListOption) {
        const props = child.props as OptionListOptionProps
        // A valueless Option is a toolbar action button, not a selectable row.
        if (props.value == null || seen.has(props.value)) return
        seen.add(props.value)
        out.push({ value: props.value, label: optionLabel(props), disabled: !!props.disabled })
      } else if (child.type === OptionListListbox || child.type === Fragment) {
        visit((child.props as { children?: ReactNode }).children)
      }
    })
  }
  visit(children)
  return out
}

export interface OptionListProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'defaultValue' | 'onChange'
> {
  /** Controlled selection (an option `value`). */
  value?: string | null
  /** Initial selection when uncontrolled. */
  defaultValue?: string | null
  /**
   * Every value to paint as selected — the multi-selection form. Presentational
   * only: the POLICY (toggle, replace, cap) stays with the consumer, which
   * reads the modifier keys off the event `onValueChange` hands it. With this
   * set, `value` degrades from "the selection" to "the ANCHOR" the keyboard
   * highlight resolves to.
   */
  selectedValues?: ReadonlyArray<string> | ReadonlySet<string>
  /** Fired with the picked option's `value`, plus the click/keypress that picked it. */
  onValueChange?: (value: string, event?: OptionSelectEvent) => void
  /**
   * How a dropped-in `Field.Search`'s query narrows the options. Defaults to a
   * case-insensitive label substring match ({@link filterOptions}).
   */
  filter?: (options: OptionItem[], query: string) => OptionItem[]
  /** Row shown when the filter leaves nothing. */
  emptyLabel?: string
  /**
   * Retint for the surface it sits on. `default` = standalone self-framed
   * surface; `onBrand` = the Combobox popover's brand-tinted surface (palette
   * inverts); `plain` = a menu whose popover owns the surface (the slash menu).
   */
  tone?: Tone
  /**
   * Layout axis. `block` (default) is the vertical list. `inline` is a
   * horizontal row — a toolbar or a segmented single-select; the root collapses
   * so its behavior container sits in the consumer's frame.
   */
  direction?: Direction
  /**
   * How tall the list may grow. `scroll` (default) caps it at 7 rows and a
   * half-row peek. `content` lets it hug its rows, bounded only by the viewport.
   */
  fit?: Fit
  /** Row pitch. `md` (default) is the 32px row; `sm` is the dense 24px list. */
  size?: Size
  /** A behavior container (`OptionList.Listbox` / `OptionList.Toolbar`) and an optional Field.Search. */
  children: ReactNode
}

function OptionListRoot({
  value,
  defaultValue,
  selectedValues,
  onValueChange,
  filter = filterOptions,
  emptyLabel = 'No results',
  direction = 'block',
  tone = 'default',
  fit = 'scroll',
  size = 'md',
  className,
  children,
  ...rest
}: OptionListProps) {
  // Composed INTO a <Field> (the Combobox) it borrows the label/hint ids to
  // associate as a group; standing alone there's nothing to label and the
  // aria-* simply drop.
  const field = useOptionalField()
  const labelId = field?.labelId ?? ''
  const hasLabel = field?.hasLabel ?? false
  const hintId = field?.hintId ?? ''
  const hasHint = field?.hasHint ?? false
  const styles = useMemo(
    () => optionListClasses({ tone, direction, fit, size }),
    [tone, direction, fit, size]
  )
  const uid = useId()

  const isControlled = value !== undefined
  const [internal, setInternal] = useState<string | null>(defaultValue ?? null)
  const selected = isControlled ? (value ?? null) : internal

  const selectedSet = useMemo(() => {
    if (!selectedValues) return null
    return selectedValues instanceof Set
      ? (selectedValues as ReadonlySet<string>)
      : new Set(selectedValues as ReadonlyArray<string>)
  }, [selectedValues])

  const [query, setQuery] = useState('')
  // What the last arrow/hover moved to — outranks the selection as the
  // highlight, but only while it survives the filter.
  const [active, setActive] = useState<string | null>(null)

  const options = useMemo(() => collectOptions(children), [children])
  const filtered = useMemo(() => filter(options, query), [filter, options, query])
  const filteredValues = useMemo(() => new Set(filtered.map((o) => o.value)), [filtered])
  const enabled = useMemo(() => filtered.filter((o) => !o.disabled), [filtered])

  const isEnabled = (v: string | null) => v != null && enabled.some((o) => o.value === v)
  // Highlight precedence — a live arrow/hover, then the selection, then the
  // first selectable row — always resolving to an ENABLED option (or nothing).
  const activeValue = isEnabled(active)
    ? active
    : isEnabled(selected)
      ? selected
      : (enabled[0]?.value ?? null)

  const optionId = (v: string) => `${uid}-opt-${v.replace(/[^\w-]/g, '_')}`

  const select = (v: string, event?: OptionSelectEvent) => {
    const option = filtered.find((o) => o.value === v)
    if (!option || option.disabled) return
    if (!isControlled) setInternal(v)
    onValueChange?.(v, event)
  }

  // Pointer highlights are transient (released on leave); keyboard ones stick.
  const [activeSource, setActiveSource] = useState<'pointer' | 'key' | null>(null)

  const setActiveFromPointer = (v: string | null) => {
    // Whoever the user last actually used owns the highlight. A pointer event
    // fired while the keyboard is live did not come from the user reaching for
    // the mouse — the engine synthesises enter/leave whenever the list scrolls
    // under a stationary cursor — so it must not move the keyboard's cursor.
    if (getInputModality() !== 'pointer') return
    setActiveSource(v == null ? null : 'pointer')
    setActive(v)
  }

  const clearActive = (v: string) => {
    if (getInputModality() !== 'pointer') return
    // Only the row that currently shows the highlight may release it.
    if (activeValue !== v) return
    setActiveSource(null)
    setActive(null)
  }

  const moveActive = (delta: 1 | -1, focus: boolean, loop = false) => {
    if (enabled.length === 0) return
    setActiveSource('key')
    const from = enabled.findIndex((o) => o.value === activeValue)
    const raw = from + delta
    const next = loop
      ? (raw + enabled.length) % enabled.length
      : Math.min(Math.max(raw, 0), enabled.length - 1)
    const v = enabled[next].value
    setActive(v)
    // Rove real focus onto the newly-active option by its stable id — it is
    // already in the DOM, so this needs no ref and stays render-safe.
    if (focus) document.getElementById(optionId(v))?.focus()
  }

  const ctx: OptionListContextValue = {
    styles,
    size,
    filteredValues,
    selected,
    selectedSet,
    activeValue,
    select,
    moveActive,
    direction,
    setActiveValue: setActiveFromPointer,
    clearActive,
    activeSource,
    optionId,
    listboxId: `${uid}-listbox`,
    labelId,
    hasLabel,
    hintId,
    hasHint,
    emptyLabel
  }

  // Enter commits the current highlight; arrows move it. The search KEEPS
  // focus (the highlight is virtual, carried by aria-activedescendant).
  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      moveActive(1, false)
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      moveActive(-1, false)
    } else if (event.key === 'Enter' && activeValue) {
      event.preventDefault()
      select(activeValue, event)
    }
  }

  // Dress a Field.Search dropped directly under <OptionList>: give it the
  // search slot, turn it into the listbox's combobox input, and route its raw
  // query into the filter. A fresh query resets the arrow highlight.
  const dressed = Children.map(children, (child) => {
    if (isValidElement(child) && child.type === Field.Search) {
      const el = child as ReactElement<FieldSearchProps>
      return cloneElement(el, {
        className: cx(styles.search, el.props.className),
        role: 'combobox',
        'data-size': size,
        'aria-controls': ctx.listboxId,
        'aria-expanded': true,
        'aria-autocomplete': 'list',
        'aria-activedescendant': activeValue ? optionId(activeValue) : undefined,
        autoComplete: 'off',
        onValueChange: (raw: string) => {
          el.props.onValueChange?.(raw)
          setQuery(raw)
          setActive(null)
        },
        onKeyDown: (event: KeyboardEvent<HTMLInputElement>) => {
          el.props.onKeyDown?.(event)
          if (event.defaultPrevented) return
          onSearchKeyDown(event)
        }
      } as Partial<FieldSearchProps>)
    }
    return child
  })

  return (
    <OptionListContext.Provider value={ctx}>
      <div className={cx(styles.root, className)} {...rest}>
        {dressed}
      </div>
    </OptionListContext.Provider>
  )
}

export interface OptionListListboxProps extends HTMLAttributes<HTMLDivElement> {
  /**
   * Drive the highlight from a document-level captured keydown while focus
   * stays OUTSIDE the list — for a menu floating over a still-focused editor
   * (the slash menu). Off (default) is the in-list model: roving real button
   * focus, or the combobox search driving aria-activedescendant.
   */
  externalKeys?: boolean
  /** Wrap the highlight around the ends when navigating. */
  loop?: boolean
  /**
   * Put real focus on the highlighted row as soon as the list mounts — the
   * search-less select's answer to "where does the keyboard land?".
   */
  autoFocus?: boolean
}

/**
 * The scrollable `role="listbox"` — renders just the `OptionList.Option`s that
 * pass the current filter (in authored order), or the empty row when none do.
 */
function OptionListListbox({
  className,
  children,
  onKeyDown,
  externalKeys = false,
  loop = false,
  autoFocus = false,
  ...rest
}: OptionListListboxProps) {
  const {
    styles,
    size,
    filteredValues,
    moveActive,
    direction,
    activeValue,
    select,
    selectedSet,
    setActiveValue,
    activeSource,
    listboxId,
    hasLabel,
    labelId,
    hasHint,
    hintId,
    emptyLabel
  } = useOptionList('OptionList.Listbox')
  const listRef = useRef<HTMLDivElement>(null)

  // A list that has run out is not the end of scrolling: the wheel carries on
  // to whatever this list sits in rather than dying against the last row.
  useScrollHandoff(listRef)

  // Keep the highlighted row in view AS IT MOVES — but scroll only THIS list's
  // own scroll box, never an ancestor (`scrollIntoView` would yank the page).
  useEffect(() => {
    // Only the keyboard cursor scrolls itself into view; a pointer highlight is
    // already under the cursor.
    if (!activeValue || activeSource !== 'key') return
    const list = listRef.current
    const el = list?.querySelector<HTMLElement>('[data-active]')
    if (!list || !el) return
    const listBox = list.getBoundingClientRect()
    const elBox = el.getBoundingClientRect()
    if (elBox.top < listBox.top) {
      list.scrollTop -= listBox.top - elBox.top
    } else if (elBox.bottom > listBox.bottom) {
      list.scrollTop += elBox.bottom - listBox.bottom
    }
  }, [activeValue, activeSource])

  // A list longer than its box OPENS on its selection, centred. Once, at
  // mount, before any input has happened; refs, not deps, so a later
  // re-render can never snap the box back under a user who has scrolled it.
  const openOnRef = useRef(activeValue)
  useEffect(() => {
    const list = listRef.current
    const el = list?.querySelector<HTMLElement>('[data-active]')
    if (!list || !el || !openOnRef.current) return
    list.scrollTop = scrollToCenter({
      rowTop: el.offsetTop - list.offsetTop,
      rowHeight: el.offsetHeight,
      boxHeight: list.clientHeight,
      contentHeight: list.scrollHeight
    })
  }, [])

  // The search-less list takes focus itself. Once, on mount.
  useEffect(() => {
    if (!autoFocus) return
    listRef.current?.querySelector<HTMLElement>('[role="option"][tabindex="0"]')?.focus()
  }, [autoFocus])

  // externalKeys: arrow/enter arrive at the document (focus is in the editor).
  // Capture them so they drive the highlight and commit before the editor
  // reacts. Escape is owned by the Popover shell, so it isn't handled here.
  useEffect(() => {
    if (!externalKeys) return
    function handle(event: globalThis.KeyboardEvent) {
      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault()
          moveActive(1, false, loop)
          break
        case 'ArrowUp':
          event.preventDefault()
          moveActive(-1, false, loop)
          break
        case 'Enter':
          if (activeValue) {
            event.preventDefault()
            event.stopPropagation()
            select(activeValue, event)
          }
          break
      }
    }
    document.addEventListener('keydown', handle, { capture: true })
    return () => document.removeEventListener('keydown', handle, { capture: true })
  }, [externalKeys, loop, moveActive, activeValue, select])

  // The context is rebuilt every render, so `setActiveValue` cannot be a
  // dependency below — depending on it re-ran the preselect on EVERY render,
  // which made an arrow key move the highlight and then snap it back.
  const setActiveValueRef = useRef(setActiveValue)
  useEffect(() => {
    setActiveValueRef.current = setActiveValue
  })

  // externalKeys: park the highlight on the option under the pointer — but
  // only while the POINTER is the live input modality. A menu opened by typing
  // `/` belongs to the keyboard.
  const modality = useInputModality()
  useEffect(() => {
    if (!externalKeys || modality !== 'pointer') return
    if (typeof document.elementFromPoint !== 'function') return
    const pointer = getPointerPosition()
    if (!pointer) return
    const raf = requestAnimationFrame(() => {
      const v = document
        .elementFromPoint(pointer.x, pointer.y)
        ?.closest<HTMLElement>('[data-value]')
        ?.getAttribute('data-value')
      if (v) setActiveValueRef.current(v)
    })
    return () => cancelAnimationFrame(raf)
  }, [externalKeys, modality])

  // The arrows that point ALONG the list — Up/Down down a column, Left/Right
  // across a row. Only the pair matching the axis is claimed.
  const [prevKey, nextKey] =
    direction === 'inline' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown']

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event)
    if (event.defaultPrevented) return
    if (event.key === nextKey) {
      event.preventDefault()
      moveActive(1, true, loop)
    } else if (event.key === prevKey) {
      event.preventDefault()
      moveActive(-1, true, loop)
    }
  }

  // Render the authored options that survive the filter, in order.
  const visible = Children.toArray(children).filter(
    (child) =>
      !isOption(child) || (child.props.value != null && filteredValues.has(child.props.value))
  )
  const hasOptions = visible.some(isOption)

  return (
    <div
      ref={listRef}
      role="listbox"
      id={listboxId}
      data-size={size}
      // Only claimed when the consumer actually runs a multi-selection.
      aria-multiselectable={selectedSet ? true : undefined}
      // Vertical is the default for a listbox, so only a row has to say so.
      aria-orientation={direction === 'inline' ? 'horizontal' : undefined}
      aria-labelledby={hasLabel ? labelId : undefined}
      aria-describedby={hasHint ? hintId : undefined}
      className={cx(styles.list, className)}
      onKeyDown={handleKeyDown}
      {...rest}
    >
      {hasOptions ? visible : <div className={styles.empty}>{emptyLabel}</div>}
    </div>
  )
}

export interface OptionListOptionProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  'value'
> {
  /** Stable identity — what a Listbox reports. Optional for a Toolbar action button. */
  value?: string
  /**
   * The searchable + trigger-display text (Listbox). Optional when the children
   * are a plain string; set it for rich children (icon + text).
   */
  label?: string
  /** Toolbar only: toggle state → `aria-pressed`. Omit for a plain action button. */
  pressed?: boolean
  children?: ReactNode
}

/**
 * One item — a real `<button>`. Its SEMANTICS follow the container it sits in:
 *   • Listbox → `role="option"`, `aria-selected`, `data-active` (the roving
 *     cursor), and a click selects its `value`.
 *   • Toolbar → a Base UI Toggle when `pressed` is passed, else a plain action
 *     button; mousedown is prevented so the press can't collapse the editor's
 *     text selection, and the consumer's `onClick` runs.
 */
function OptionListOption({
  value,
  label,
  pressed,
  className,
  children,
  onClick,
  onMouseDown,
  onPointerEnter,
  onPointerLeave,
  ...rest
}: OptionListOptionProps) {
  const {
    styles,
    size,
    selected,
    selectedSet,
    activeValue,
    select,
    setActiveValue,
    clearActive,
    optionId
  } = useOptionList('OptionList.Option')
  const mode = useContainerMode()
  const content = children ?? label ?? value

  if (mode === 'toolbar') {
    const shared = {
      ...rest,
      'data-value': value,
      'data-size': size,
      className: cx(styles.option, styles.toolbarHover, className),
      // Keep the editor's selection/caret alive through the press — the
      // toolbar acts ON that selection, so it must not steal it.
      onMouseDown: (event: ReactMouseEvent<HTMLButtonElement>) => {
        onMouseDown?.(event)
        if (!event.defaultPrevented) event.preventDefault()
      },
      onClick
    }
    // A toggle's pressed state stays controlled by the consumer, per option;
    // the Toggle only announces it.
    if (pressed !== undefined) {
      return (
        <Toggle {...shared} pressed={pressed} onPressedChange={() => {}}>
          {content}
        </Toggle>
      )
    }
    return (
      <button {...shared} type="button">
        {content}
      </button>
    )
  }

  // In multi-selection the set is the authority and `selected` is only the
  // anchor, which may well not be a member.
  const isSelected = value != null && selectedSet ? selectedSet.has(value) : value === selected
  const isActive = value === activeValue
  return (
    <button
      {...rest}
      type="button"
      role="option"
      id={value != null ? optionId(value) : undefined}
      aria-selected={isSelected}
      data-active={isActive ? '' : undefined}
      data-value={value}
      data-size={size}
      tabIndex={isActive ? 0 : -1}
      className={cx(styles.option, styles.listboxHover, className)}
      onMouseDown={onMouseDown}
      // Hover moves the highlight (the roving cursor). A disabled row can't take it.
      onPointerEnter={(event) => {
        onPointerEnter?.(event)
        if (value != null && !rest.disabled) setActiveValue(value)
      }}
      // Release the highlight on the way out — unless the pointer went straight
      // onto a sibling option in THIS list, whose own pointerenter takes over.
      onPointerLeave={(event) => {
        onPointerLeave?.(event)
        if (value == null) return
        const next = event.relatedTarget
        const list = event.currentTarget.closest('[role="listbox"],[role="toolbar"]')
        if (next instanceof Element && list?.contains(next) && next.closest('[data-value]')) {
          return
        }
        clearActive(value)
      }}
      // The consumer's own handler runs FIRST and unconditionally, then the
      // click commits, carrying the event so a policy can read its modifiers.
      onClick={(event) => {
        onClick?.(event)
        if (value != null) select(value, event)
      }}
    >
      {content}
    </button>
  )
}

// --- Toolbar (multi-toggle behavior container) -----------------------------

export interface OptionListToolbarProps extends HTMLAttributes<HTMLDivElement> {
  /** Names the toolbar for assistive tech — there's no visible label. */
  'aria-label': string
}

/**
 * A row of independent action / toggle buttons — the editor's selection, link,
 * bullet and numbering bars. Owns SEMANTICS, not layout or state. No keyboard
 * cursor — arrows would collide with the editor caret over the live selection.
 * Pair with `direction="inline"` on the root for the row layout.
 */
function OptionListToolbar({ className, children, ...rest }: OptionListToolbarProps) {
  const { styles, size } = useOptionList('OptionList.Toolbar')
  return (
    <OptionListContainerContext.Provider value="toolbar">
      <div role="toolbar" data-size={size} className={cx(styles.list, className)} {...rest}>
        {children}
      </div>
    </OptionListContainerContext.Provider>
  )
}

/** A hairline between groups — vertical in a Toolbar, horizontal in a block list. */
function OptionListDivider({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  const { styles } = useOptionList('OptionList.Divider')
  return <span aria-hidden className={cx(styles.divider, className)} {...rest} />
}

/**
 * Compound option list. `OptionList` is the root/context (layout, filtering,
 * skin); the behavior containers own the interaction — `OptionList.Listbox`
 * (single-select listbox) or `OptionList.Toolbar` (multi-toggle). `Option` is
 * the shared item leaf that reads its container to know which. `Field.Search`
 * composes in as the filter row.
 */
export const OptionList = Object.assign(OptionListRoot, {
  Listbox: OptionListListbox,
  Option: OptionListOption,
  Toolbar: OptionListToolbar,
  Divider: OptionListDivider
})

export type { OptionItem }
