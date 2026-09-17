import {
  Children,
  isValidElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode
} from 'react'
import { Combobox as BaseCombobox } from '@base-ui/react/combobox'
import { filterOptions, type OptionItem } from '@/utils/option-filter'
import { controlClass, cx, Field, useField } from './field'
import {
  collectOptions,
  OptionList,
  optionListClasses,
  type OptionListOptionProps
} from './option-list'
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
// Collapsed, it renders the shared `field` frame (Base UI's Combobox.Trigger
// showing the selected label + a chevron); the whole frame is the open target.
// Activated, the chevron flips up and a Base UI popup anchored to the frame
// holds the list in the brand tone with a filter search on top. Base UI owns
// the anchoring, the focus handoff (into the search on open, back to the
// trigger on close) and the outside-press / Escape dismissal.
//
// `search={false}` drops the filter box for a list too short to filter; focus
// then lands on the LIST and the arrows walk it.
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

/** Each authored option's rendered content, by value — an icon beside a label survives. */
function collectContent(children: ReactNode): Map<string, ReactNode> {
  const out = new Map<string, ReactNode>()
  const visit = (nodes: ReactNode) => {
    Children.forEach(nodes, (child) => {
      if (!isValidElement(child)) return
      if (child.type === OptionList.Option) {
        const props = (child as ReactElement<OptionListOptionProps>).props
        if (props.value != null && !out.has(props.value)) {
          out.set(props.value, props.children ?? props.label ?? props.value)
        }
      } else {
        visit((child.props as { children?: ReactNode }).children)
      }
    })
  }
  visit(children)
  return out
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
  const listRef = useRef<HTMLDivElement>(null)

  const isControlled = value !== undefined
  const [internal, setInternal] = useState<string | null>(defaultValue ?? null)
  const selected = isControlled ? (value ?? null) : internal

  // The option DATA, read from the authored children — available even while
  // the popup (and its list) is closed and unmounted.
  const options = useMemo(() => collectOptions(children), [children])
  const content = useMemo(() => collectContent(children), [children])
  const items = useMemo(() => options.map((o) => o.value), [options])

  // The consumer's filter answers for the whole LIST at once; Base UI asks per
  // item. Bridge the two by running the list filter once per query and
  // answering membership — inside Base UI's own pipeline, so its typing
  // highlight and empty state keep working.
  const survivors = useRef<{ query: string; values: Set<string> } | null>(null)
  const matches = useCallback(
    (item: string, query: string) => {
      if (survivors.current?.query !== query) {
        survivors.current = { query, values: new Set(filter(options, query).map((o) => o.value)) }
      }
      return survivors.current.values.has(item)
    },
    [filter, options]
  )
  useEffect(() => {
    survivors.current = null
  }, [matches])

  const labelOf = (v: string | null) => options.find((o) => o.value === v)?.label ?? ''
  const disabledOf = (v: string) => options.find((o) => o.value === v)?.disabled ?? false

  // A stale value with no matching option reads as empty, so the placeholder
  // shows rather than a blank frame.
  const display = labelOf(selected)

  // The list is scaled by the FIELD, like every other part of it: the list
  // draws two sizes to the field's three, so `lg` reads as the base.
  const listSize = size === 'sm' ? 'sm' : 'md'
  const styles = optionListClasses({
    tone: 'onBrand',
    direction: 'block',
    fit: 'scroll',
    size: listSize
  })

  const popup = (
    <BaseCombobox.Positioner sideOffset={2} align="start" className="z-50 outline-none">
      <BaseCombobox.Popup
        aria-label="Choose an option"
        // The search-less list takes focus itself, so the arrows have a
        // place to land; with a search the input holds focus and drives the
        // highlight, which is Base UI's default.
        initialFocus={search ? undefined : listRef}
        className={cx(
          'flex flex-col w-(--anchor-width) min-w-(--size-option-list-width) rounded-sm overflow-hidden outline-none',
          'bg-field-popover shadow-[0_4px_16px_color-mix(in_srgb,var(--color-neutral-900)_12%,transparent)]'
        )}
      >
        {search && (
          <BaseCombobox.Input
            placeholder={searchPlaceholder}
            data-size={listSize}
            className={styles.search}
          />
        )}
        <BaseCombobox.Empty className={styles.empty}>{emptyLabel}</BaseCombobox.Empty>
        <BaseCombobox.List ref={listRef} data-size={listSize} className={styles.list}>
          {(item: string) => (
            <BaseCombobox.Item
              key={item}
              value={item}
              disabled={disabledOf(item)}
              data-size={listSize}
              className={cx(styles.option, styles.highlighted)}
            >
              {content.get(item)}
            </BaseCombobox.Item>
          )}
        </BaseCombobox.List>
      </BaseCombobox.Popup>
    </BaseCombobox.Positioner>
  )

  return (
    <BaseCombobox.Root
      items={items}
      filter={matches}
      itemToStringLabel={labelOf}
      value={selected}
      onValueChange={(next) => {
        if (next == null) return
        if (!isControlled) setInternal(next)
        onValueChange?.(next)
      }}
      open={open}
      onOpenChange={setOpen}
      // Typing highlights the first match, so Enter commits it without an
      // arrow press first.
      autoHighlight
    >
      <Field.Frame
        className="cursor-pointer"
        // The whole frame is the open target — the decorative chevron and the
        // frame's dead padding are non-interactive, so without this only a
        // direct hit on the value text would open it. The trigger itself
        // toggles through Base UI and must not be opened twice.
        onClick={(e) => {
          if ((e.target as Element).closest('[data-control]')) return
          setOpen(true)
        }}
      >
        <BaseCombobox.Trigger
          ref={registerControl}
          id={controlId}
          data-control
          data-placeholder={display ? undefined : ''}
          // In the tab order explicitly, because WebKit's default one skips a
          // bare <button> — see `Button`.
          tabIndex={0}
          className={cx(controlClass(size), 'text-left cursor-pointer')}
        >
          {display || placeholder}
        </BaseCombobox.Trigger>
        {open ? <ChevronUpIcon aria-hidden /> : <ChevronDownIcon aria-hidden />}
      </Field.Frame>

      {portal ? <BaseCombobox.Portal>{popup}</BaseCombobox.Portal> : popup}
    </BaseCombobox.Root>
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
