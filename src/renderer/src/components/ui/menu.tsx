import {
  cloneElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type PointerEvent,
  type ReactElement,
  type ReactNode,
  type Ref
} from 'react'
import { createPortal } from 'react-dom'
import { useDismiss } from '@/hooks/use-dismiss'
import { useAnchoredPlacement, type PopoverAlign, type PopoverSide } from './popover'

// ---------------------------------------------------------------------------
// Menu — a trigger that drops a list of commands.
//
// The platform supplies the layer and the placement: a `popover="manual"` in
// the top layer, shown with the trigger as its `source`, so `[data-popover]` in
// main.css stands it on the trigger. Everything a menu is beyond that is ours:
// the roles and the trigger's `aria-expanded`, roving focus over the rows
// (arrows wrapping, Home/End, type-ahead, each passing over a disabled row),
// the lit row marked `data-highlighted` so it stays lit while another window
// has the keys, a row run by click, Enter or Space,
// Escape back onto the trigger (`useDismiss`, so it closes one layer at a time
// with every other surface), Tab closing it on the way past, and a press
// outside closing it where the press lands.
//
// It stays mounted, hidden while closed, so it fades out as it fades in.
// ---------------------------------------------------------------------------

export type OpenFocus = 'menu' | 'first' | 'last'

export interface MenuContextValue {
  /** Closes, handing the focus back to the trigger if the menu held it. */
  close: () => void
  /** The id of the lit row, if any. */
  highlighted: string | null
  /** Lights a row and focuses it; `null` rests the focus on the menu itself. */
  highlight: (row: HTMLElement | null) => void
}

export const MenuContext = createContext<MenuContextValue | null>(null)

export type TriggerProps = HTMLAttributes<HTMLElement> & {
  ref?: Ref<HTMLElement>
  'data-popup-open'?: string
}

export interface MenuProps {
  /** The button that opens it, given the menu's aria and handlers. */
  trigger: ReactElement<TriggerProps>
  /** Controlled when given — for an owner that opens it another way, a shortcut. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Which side of the trigger it opens on; flips when there is no room. Default `bottom`. */
  side?: PopoverSide
  /** Default `start`: its left edge on the trigger's. */
  align?: PopoverAlign
  className?: string
  children: ReactNode
}

const ROW = '[role=menuitem]'
const TYPEAHEAD_MS = 500

/** The rows the keys reach: every one but a disabled one. */
function rowsOf(menu: HTMLElement): HTMLElement[] {
  return Array.from(menu.querySelectorAll<HTMLElement>(`${ROW}:not([aria-disabled="true"])`))
}

export function setRef<T>(ref: Ref<T> | undefined, node: T | null): void {
  if (typeof ref === 'function') ref(node)
  else if (ref) ref.current = node
}

/** The row a menu opens onto: its first or last, or none, resting on the menu. */
export function rowFor(menu: HTMLElement, focus: OpenFocus): HTMLElement | null {
  const rows = rowsOf(menu)
  return (focus === 'first' ? rows[0] : focus === 'last' ? rows.at(-1) : null) ?? null
}

export interface MenuRows {
  /** For `MenuContext`, which the rows read. */
  context: MenuContextValue
  /** Lights a row and focuses it; `null` rests the focus on the menu itself. */
  highlight: (row: HTMLElement | null) => void
  /** Lights none, as the menu hides. */
  unlight: () => void
  /** The menu's own keys: arrows, Home/End, type-ahead, and Tab closing it. */
  onKeyDown: (e: KeyboardEvent<HTMLElement>) => void
}

/**
 * The rows' keyboard model, apart from the layer the menu stands in: an
 * in-page popover (`Menu`) or a window of its own on the glass.
 */
export function useMenuRows(menuRef: { current: HTMLElement | null }, close: () => void): MenuRows {
  const typed = useRef({ text: '', timer: 0 })
  const [highlighted, setHighlighted] = useState<string | null>(null)

  const highlight = useCallback(
    (row: HTMLElement | null) => {
      setHighlighted(row?.id ?? null)
      ;(row ?? menuRef.current)?.focus({ preventScroll: true })
    },
    [menuRef]
  )
  const unlight = useCallback(() => setHighlighted(null), [])

  useEffect(() => () => window.clearTimeout(typed.current.timer), [])

  /** The row a typed letter leads to: the next starting with what was typed. */
  function typeahead(key: string, rows: HTMLElement[], at: number): HTMLElement | undefined {
    const state = typed.current
    window.clearTimeout(state.timer)
    state.text += key.toLowerCase()
    state.timer = window.setTimeout(() => (state.text = ''), TYPEAHEAD_MS)
    // One letter pressed again and again steps through the rows it starts.
    const repeated = [...state.text].every((c) => c === state.text[0])
    const query = repeated ? state.text[0] : state.text
    const from = repeated ? at + 1 : Math.max(at, 0)
    for (let i = 0; i < rows.length; i++) {
      const row = rows[(from + i) % rows.length]
      if ((row.textContent ?? '').trim().toLowerCase().startsWith(query)) return row
    }
    return undefined
  }

  function onKeyDown(e: KeyboardEvent<HTMLElement>) {
    if (e.defaultPrevented) return
    const rows = rowsOf(e.currentTarget)
    if (rows.length === 0) return
    const at = rows.indexOf(document.activeElement as HTMLElement)
    let next: HTMLElement | undefined
    switch (e.key) {
      case 'ArrowDown':
        next = rows[(at + 1) % rows.length]
        break
      case 'ArrowUp':
        next = rows[at <= 0 ? rows.length - 1 : at - 1]
        break
      case 'Home':
        next = rows[0]
        break
      case 'End':
        next = rows.at(-1)
        break
      case 'Tab':
        // Not cancelled: back on the trigger, the browser's Tab moves on from there.
        close()
        return
      default:
        if (e.key.length !== 1 || e.key === ' ' || e.ctrlKey || e.metaKey || e.altKey) return
        next = typeahead(e.key, rows, at)
    }
    e.preventDefault()
    if (next) highlight(next)
  }

  const context = useMemo(
    () => ({ close, highlighted, highlight }),
    [close, highlighted, highlight]
  )
  return { context, highlight, unlight, onKeyDown }
}

export function Menu({
  trigger,
  open: controlled,
  onOpenChange,
  side = 'bottom',
  align = 'start',
  className,
  children
}: MenuProps) {
  const [uncontrolled, setUncontrolled] = useState(false)
  const open = controlled ?? uncontrolled
  const id = `menu-${useId().replace(/[^\w-]/g, '')}`
  const triggerId = trigger.props.id ?? `${id}-trigger`
  const triggerRef = useRef<HTMLElement | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  // An owner's own open (a shortcut) comes from the keyboard: onto the first row.
  const openFocus = useRef<OpenFocus>('first')

  const isControlled = controlled !== undefined
  const setOpen = useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolled(next)
      onOpenChange?.(next)
    },
    [isControlled, onOpenChange]
  )

  const openOnto = (focus: OpenFocus) => {
    openFocus.current = focus
    setOpen(true)
  }

  // The focus leaves before the menu hides, so the browser's own return of it
  // (to whatever held it as the menu opened) never runs over a row's.
  const close = useCallback(() => {
    if (menuRef.current?.contains(document.activeElement)) {
      triggerRef.current?.focus({ preventScroll: true })
    }
    setOpen(false)
  }, [setOpen])

  const rows = useMenuRows(menuRef, close)
  const { highlight, unlight } = rows

  const shown = useRef(false)
  const place = useAnchoredPlacement(menuRef, () => triggerRef.current, open)
  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu) return
    if (open && !shown.current) {
      menu.showPopover({ source: triggerRef.current ?? undefined })
      place()
      shown.current = true
      highlight(rowFor(menu, openFocus.current))
      openFocus.current = 'first'
    } else if (!open && shown.current) {
      menu.hidePopover()
      shown.current = false
      unlight()
    }
  }, [open, highlight, unlight, place])

  useDismiss({ ref: menuRef, onDismiss: close, dismissOnOutsidePointer: false, enabled: open })

  // A press outside closes it and leaves the focus to wherever the press lands.
  useEffect(() => {
    if (!open) return
    function handlePointerDown(e: globalThis.PointerEvent) {
      const target = e.target as Node
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return
      if (menuRef.current?.contains(document.activeElement)) {
        ;(document.activeElement as HTMLElement).blur()
      }
      setOpen(false)
    }
    document.addEventListener('pointerdown', handlePointerDown)
    return () => document.removeEventListener('pointerdown', handlePointerDown)
  }, [open, setOpen])

  const { ref: ownRef, onClick, onKeyDown } = trigger.props
  const triggerProps: TriggerProps = {
    id: triggerId,
    ref: (node: HTMLElement | null) => {
      triggerRef.current = node
      setRef(ownRef, node)
    },
    'aria-haspopup': 'menu',
    'aria-expanded': open,
    'aria-controls': open ? id : undefined,
    'data-popup-open': open ? '' : undefined,
    onClick: (e) => {
      onClick?.(e)
      if (e.defaultPrevented) return
      if (open) close()
      // Enter and Space click with no pointer behind them: those land on a row.
      else openOnto(e.detail === 0 ? 'first' : 'menu')
    },
    onKeyDown: (e) => {
      onKeyDown?.(e)
      if (e.defaultPrevented || (e.key !== 'ArrowDown' && e.key !== 'ArrowUp')) return
      e.preventDefault()
      const onto = e.key === 'ArrowDown' ? 'first' : 'last'
      if (!open) return openOnto(onto)
      const rows = menuRef.current ? rowsOf(menuRef.current) : []
      const row = onto === 'first' ? rows[0] : rows.at(-1)
      if (row) highlight(row)
    }
  }

  return (
    <>
      {cloneElement(trigger, triggerProps)}
      {createPortal(
        <MenuContext value={rows.context}>
          <div
            ref={menuRef}
            id={id}
            role="menu"
            aria-labelledby={triggerId}
            aria-orientation="vertical"
            tabIndex={-1}
            popover="manual"
            data-popover=""
            data-side={side}
            data-align={align}
            className={className}
            onKeyDown={rows.onKeyDown}
          >
            {children}
          </div>
        </MenuContext>,
        document.body
      )}
    </>
  )
}

export interface MenuItemProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> {
  onSelect: () => void
  /** Passed over by the keys, never lit, and refuses to run. */
  disabled?: boolean
}

/** A row of the menu: run by a click, Enter or Space, which close the menu first. */
export function MenuItem({
  id: ownId,
  onSelect,
  disabled = false,
  onClick,
  onKeyDown,
  onPointerMove,
  onPointerLeave,
  children,
  ...rest
}: MenuItemProps) {
  const menu = useContext(MenuContext)
  const autoId = `menu-item-${useId().replace(/[^\w-]/g, '')}`
  if (!menu) throw new Error('MenuItem must be used within <Menu>')
  const id = ownId ?? autoId
  const lit = menu.highlighted === id

  // Closed first, so the focus is the trigger's again before the row runs —
  // and a row that moves the focus (into the editor, say) keeps it there.
  const run = () => {
    if (disabled) return
    menu.close()
    onSelect()
  }

  return (
    <div
      role="menuitem"
      id={id}
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      data-highlighted={lit ? '' : undefined}
      {...rest}
      onClick={(e) => {
        onClick?.(e)
        if (!e.defaultPrevented) run()
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e)
        if (e.defaultPrevented || (e.key !== 'Enter' && e.key !== ' ')) return
        e.preventDefault()
        run()
      }}
      // The pointer lights a row as the keys do, focus and all, so one row is lit.
      onPointerMove={(e: PointerEvent<HTMLDivElement>) => {
        onPointerMove?.(e)
        if (e.pointerType === 'touch') return
        if (disabled) menu.highlight(null)
        else if (!lit || document.activeElement !== e.currentTarget) menu.highlight(e.currentTarget)
      }}
      onPointerLeave={(e: PointerEvent<HTMLDivElement>) => {
        onPointerLeave?.(e)
        if (lit) menu.highlight(null)
      }}
    >
      {children}
    </div>
  )
}
