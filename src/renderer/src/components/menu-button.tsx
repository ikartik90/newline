import { useEffect, useState, type ComponentType, type SVGProps } from 'react'
import { Menu as BaseMenu } from '@base-ui/react/menu'
import MenuIcon from '@/assets/icons/menu.svg'
import { useHasCursor } from '@/hooks/use-has-cursor'
import { useShortcutLabel } from '@/hooks/use-shortcut-label'
import { hasShortcutModifier, shortcutLabel } from '@/utils/keyboard-shortcut'
import { Button } from './ui/button'
import { Tooltip } from './ui/tooltip'

// ---------------------------------------------------------------------------
// MenuButton — the one control a surface opens with: an icon chip that drops a
// menu of the surface's commands, each with its own shortcut chip.
//
// It brings no box of its own: where it SITS differs by surface, and a
// component that positioned itself could only ever be right on one of them.
//
// The shortcut and the tooltip are the same button's label wearing two faces,
// and they are never both up. At rest the chip says how to reach the menu
// without the mouse; the moment a cursor arrives, the tooltip beside it says
// what the menu IS, and the chip that was answering the other question steps
// out of the way. `visibility` rather than `display` so the button never moves.
//
// Keyed off the TOOLTIP being up (`data-tooltip-visible`), not off `:hover`:
// the tooltip is React state set from pointer enter/leave, where `:hover` is
// the browser's own — recomputed on its own schedule, and sticky when the DOM
// changes under a pointer that has not moved. One fact drives both faces.
//
// A HANDOVER, not a crossfade: the chip CUTS on the way out (`0s`, no delay) —
// gone on the frame the tooltip starts arriving — and waits a full fade before
// coming back. CSS takes a transition's duration and delay from the state
// being moved TO, so each direction reads its own. The delay is the tooltip's
// own fade-out duration; if that changes, this moves with it. `visibility`
// holds the chip unpainted for the whole of the tooltip's exit.
//
// Both faces are cursor-first: the `(hover) and (pointer: fine)` query
// withholds the chip from a device with no key to press, exactly as hover
// withholds the tooltip from a device with no pointer. A touch visitor gets the
// icon and its accessible name, which is all that is true for them.
// ---------------------------------------------------------------------------

type Icon = ComponentType<SVGProps<SVGSVGElement>>

export interface MenuButtonItem {
  label: string
  icon?: Icon
  /** The bare key, written for the platform beside the label — `N` ⇒ `⌘N`. */
  shortcut?: string
  onSelect: () => void
  disabled?: boolean
}

export interface MenuButtonProps {
  items: MenuButtonItem[]
  /** The button's accessible name and tooltip. Default `Menu`. */
  label?: string
  /** The bare key that opens the menu with the platform modifier. Default `K`. */
  shortcut?: string
  icon?: Icon
  className?: string
}

// Measured from the chip's BOX, which the icon button already pads by 4px
// around its 20px glyph — so the gap the eye reads is this plus that.
const rowStyle = 'flex items-center gap-0.5'

// The `hotkey` recipe on the page surface: the tooltip's box, same fill, so it
// reads as a single box changing what it says rather than two chips trading
// places. Then the handover described above.
const shortcutStyle =
  'hidden [@media(hover:hover)_and_(pointer:fine)]:flex items-center shrink-0 h-5 px-1 rounded-sm border-[0.5px] border-divider bg-neutral-200 dark:bg-neutral-800 text-fg-body text-style-caption whitespace-nowrap transition-[opacity,visibility] duration-150 delay-150 ease-out [button[data-tooltip-visible]~&]:opacity-0 [button[data-tooltip-visible]~&]:invisible [button[data-tooltip-visible]~&]:duration-0 [button[data-tooltip-visible]~&]:delay-0'

// The `menuPopover` recipe, expanded: a 200px column on the surface.
const popupStyle =
  'flex flex-col w-[200px] py-2 px-1 gap-0.5 bg-surface [--color-field:var(--color-field-on-surface)] rounded-md overflow-hidden outline-none shadow-[0_4px_16px_color-mix(in_srgb,var(--color-neutral-900)_12%,transparent)] transition-[opacity,transform] duration-150 ease-out data-[starting-style]:opacity-0 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:scale-95'

// The `menuItem` recipe: a 32px row on an 8px inset, washed when highlighted.
const itemStyle =
  'flex items-center w-full gap-2 h-8 px-2 rounded-sm cursor-default text-style-body-sm text-fg-body outline-none data-[highlighted]:bg-field-hover data-[disabled]:opacity-50'
const itemIconStyle = 'shrink-0 size-5'

// The `hotkey` recipe inside a menu: the wash a hovered row wears, held against
// the far end of the row.
const itemShortcutStyle =
  'ml-auto flex items-center shrink-0 h-5 px-1 rounded-sm border-[0.5px] border-divider bg-field-hover text-fg-body text-style-caption whitespace-nowrap'

export function MenuButton({
  items,
  label = 'Menu',
  shortcut = 'K',
  icon: Glyph = MenuIcon,
  className
}: MenuButtonProps) {
  const [open, setOpen] = useState(false)
  // The chip names the key this visitor's keyboard actually has — ⌘K on Apple
  // hardware, Ctrl K on a PC — which is the same shortcut the listener below
  // answers to on each.
  const shortcutText = useShortcutLabel(shortcut)
  const hasCursor = useHasCursor()

  useEffect(() => {
    function handleKeyDown(e: globalThis.KeyboardEvent) {
      if (!hasShortcutModifier(e) || e.altKey || e.shiftKey) return
      if (e.key.toLowerCase() !== shortcut.toLowerCase()) return
      e.preventDefault()
      setOpen((current) => !current)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [shortcut])

  return (
    <div className={className ? `${rowStyle} ${className}` : rowStyle}>
      <BaseMenu.Root open={open} onOpenChange={setOpen} modal={false}>
        <BaseMenu.Trigger
          render={
            <Button variant="icon" aria-label={label}>
              <Glyph />
              <Button.Tooltip>
                <Tooltip.Text>{label}</Tooltip.Text>
              </Button.Tooltip>
            </Button>
          }
        />
        <BaseMenu.Portal>
          <BaseMenu.Positioner side="bottom" align="start" sideOffset={4} className="z-50">
            <BaseMenu.Popup className={popupStyle}>
              {items.map((item) => {
                const ItemGlyph = item.icon
                return (
                  <BaseMenu.Item
                    key={item.label}
                    disabled={item.disabled}
                    className={itemStyle}
                    onClick={item.onSelect}
                  >
                    {ItemGlyph && <ItemGlyph className={itemIconStyle} aria-hidden />}
                    {item.label}
                    {item.shortcut && hasCursor && (
                      <kbd aria-hidden className={itemShortcutStyle}>
                        {shortcutLabel(item.shortcut)}
                      </kbd>
                    )}
                  </BaseMenu.Item>
                )
              })}
            </BaseMenu.Popup>
          </BaseMenu.Positioner>
        </BaseMenu.Portal>
      </BaseMenu.Root>
      <kbd className={shortcutStyle} data-site-menu-shortcut>
        {shortcutText}
      </kbd>
    </div>
  )
}
