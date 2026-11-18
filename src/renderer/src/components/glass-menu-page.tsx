import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { menuItemStyle } from '@/components/menu-button'
import { MenuIdentity, menuRuleStyle } from '@/components/menu-identity'
import { MenuContext, MenuItem, rowFor, useMenuRows } from '@/components/ui/menu'

// ---------------------------------------------------------------------------
// The glass menu's page: a menu in a clear window of its own on AppKit's
// Liquid Glass (main/glass-menu.ts), asked for by a `GlassMenu` trigger in the
// note window. It draws the rows it is handed in that window's theme, says how
// tall it stands, which is when main shows it, and names back what is picked.
// The rows are `Menu`'s, keys and all; it stands on the glass as the sidebar
// does (`data-on-glass` on a level-1 sheet), so a lit row is the glass a shade
// deeper. Its padding is `GLASS_MENU_INSET` (main/glass-menu.ts), so a menu
// standing over its trigger puts its first row on the trigger's box.
// ---------------------------------------------------------------------------

const menuStyle = 'flex flex-col w-full p-1 gap-0.5 bg-level-1 text-ink-body outline-none'

export function GlassMenuPage() {
  // Each showing is its own mount, so no row stays lit from the last.
  const [showing, setShowing] = useState<{ request: GlassMenuRequest; key: number } | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const api = window.api.glassMenu

  useEffect(
    () =>
      api?.onShow((request) =>
        setShowing((current) => ({ request, key: (current?.key ?? 0) + 1 }))
      ),
    [api]
  )

  useLayoutEffect(() => {
    if (showing) {
      document.documentElement.classList.toggle('dark', showing.request.theme === 'dark')
    }
  }, [showing])

  // Main fits the window to the menu, and shows it on the first answer.
  useLayoutEffect(() => {
    const menu = menuRef.current
    if (!menu || !api) return
    const report = () => api.setHeight(Math.ceil(menu.getBoundingClientRect().height))
    report()
    const observer = new ResizeObserver(report)
    observer.observe(menu)
    return () => observer.disconnect()
  }, [showing, api])

  if (!showing || !api) return null
  return <GlassMenuRows key={showing.key} request={showing.request} menuRef={menuRef} />
}

function GlassMenuRows({
  request,
  menuRef
}: {
  request: GlassMenuRequest
  menuRef: React.RefObject<HTMLDivElement | null>
}) {
  const api = window.api.glassMenu!
  const rows = useMenuRows(menuRef, api.close)
  const { highlight } = rows

  useLayoutEffect(() => {
    const menu = menuRef.current
    if (menu) highlight(rowFor(menu, request.focus))
  }, [request, menuRef, highlight])

  return (
    <MenuContext value={rows.context}>
      <div
        ref={menuRef}
        role="menu"
        aria-orientation="vertical"
        tabIndex={-1}
        data-on-glass=""
        className={menuStyle}
        onKeyDown={(e) => {
          rows.onKeyDown(e)
          if (e.defaultPrevented || e.key !== 'Escape') return
          e.preventDefault()
          api.close()
        }}
      >
        {request.identity && (
          <>
            <MenuIdentity identity={request.identity} />
            <div role="separator" className={menuRuleStyle} />
          </>
        )}
        {request.items.map((item) => (
          <MenuItem
            key={item.id}
            className={menuItemStyle}
            disabled={item.disabled}
            onSelect={() => api.pick(item.id)}
          >
            {item.label}
          </MenuItem>
        ))}
      </div>
    </MenuContext>
  )
}
