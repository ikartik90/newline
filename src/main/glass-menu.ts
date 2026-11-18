import type { BrowserWindowConstructorOptions, Rectangle } from 'electron'

// ---------------------------------------------------------------------------
// A menu on AppKit's glass (macOS 27 and later). A menu in the page could not
// be glass: the window's glass lies under the page, so the rows under the menu
// would show through it. So it is a window of its own over the note window,
// Liquid Glass cornered at 12pt (native/sidebar-glass.mm's panelGlass), stood
// on its trigger as the in-page menu is, or over it, as a macOS pop-up stands
// over its button. The note window hands it what to
// show; its page draws that and says how tall it stands, which is when main
// shows it and gives it the keys. A pick is named back to the note window,
// which does it. It closes as a menu does when the keys go elsewhere.
// ---------------------------------------------------------------------------

export interface GlassMenuItem {
  id: string
  label: string
  disabled?: boolean
}

/** What the note window asks the glass menu to show, and where. */
export interface GlassMenuRequest {
  /** The trigger, in the page's CSS pixels. */
  anchor: { x: number; y: number; width: number; height: number }
  /** Above or below the trigger, or over it: its first row where the trigger was. */
  side: 'top' | 'bottom' | 'over'
  align: 'start' | 'end'
  /** What the keys land on: the menu itself, or its first or last row. */
  focus: 'menu' | 'first' | 'last'
  theme: 'light' | 'dark'
  /** Who the menu is about, over its rows: the account's picture, name and address. */
  identity?: { name: string; email: string; picture?: string }
  items: GlassMenuItem[]
}

/** The in-page menu's width (menu-button's `menuPopupStyle`). */
export const GLASS_MENU_WIDTH = 200
/** The menu's padding: over its trigger, its first row stands this far in. */
export const GLASS_MENU_INSET = 4
/** The glass's corner, in points. */
export const GLASS_MENU_RADIUS = 12

// As `[data-popover]` stands a menu: 4px off its trigger, 5px in from the window.
const OFFSET = 4
const EDGE = 5

/** Where the menu stands over the note window's content, `height` tall. */
export function glassMenuBounds(
  content: Rectangle,
  request: Pick<GlassMenuRequest, 'anchor' | 'side' | 'align'>,
  height: number
): Rectangle {
  const { anchor } = request
  if (request.side === 'over') {
    const width = Math.max(GLASS_MENU_WIDTH, anchor.width + 2 * GLASS_MENU_INSET)
    const left = Math.max(0, Math.min(anchor.x - GLASS_MENU_INSET, content.width - width))
    const top = Math.max(
      EDGE,
      Math.min(anchor.y - GLASS_MENU_INSET, content.height - EDGE - height)
    )
    return {
      x: Math.round(content.x + left),
      y: Math.round(content.y + top),
      width: Math.round(width),
      height: Math.round(height)
    }
  }
  const above = anchor.y - OFFSET - height
  const below = anchor.y + anchor.height + OFFSET
  // On the side asked for, unless only the other has room.
  const top =
    request.side === 'top'
      ? above < EDGE && below + height <= content.height - EDGE
        ? below
        : above
      : below + height > content.height - EDGE && above >= EDGE
        ? above
        : below
  const start = request.align === 'start' ? anchor.x : anchor.x + anchor.width - GLASS_MENU_WIDTH
  const left = Math.max(EDGE, Math.min(start, content.width - EDGE - GLASS_MENU_WIDTH))
  return {
    x: Math.round(content.x + left),
    y: Math.round(content.y + top),
    width: GLASS_MENU_WIDTH,
    height: Math.round(height)
  }
}

/** The menu's window: a clear, frameless panel, shadowed as a menu is. */
export function glassMenuWindowOptions(preload: string): BrowserWindowConstructorOptions {
  return {
    show: false,
    type: 'panel',
    frame: false,
    // Borderless: the glass's own corner shapes it.
    roundedCorners: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: true,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    width: GLASS_MENU_WIDTH,
    height: 64,
    webPreferences: {
      preload,
      sandbox: false,
      // Hidden between showings, it still answers a show at once.
      backgroundThrottling: false
    }
  }
}

/** The parts of a BrowserWindow the glass menu drives. */
export interface GlassMenuWindow {
  on(event: 'blur', listener: () => void): unknown
  getContentBounds(): Rectangle
  setBounds(bounds: Partial<Rectangle>): void
  show(): void
  hide(): void
  focus(): void
  isVisible(): boolean
  isDestroyed(): boolean
  webContents: {
    send(channel: string, ...args: unknown[]): void
    focus(): void
  }
}

export interface GlassMenu {
  /** Fills the menu for `request`; it shows once its page has drawn that. */
  open(request: GlassMenuRequest): void
  /** The page's height: the menu fits it, and shows if it was being opened. */
  setHeight(height: number): void
  pick(id: string): void
  /** Closes it, handing the keys back to the note window. */
  close(): void
  /** Closes it, leaving the keys wherever they went: another app. */
  dismiss(): void
}

export function createGlassMenu(parent: GlassMenuWindow, panel: GlassMenuWindow): GlassMenu {
  let request: GlassMenuRequest | null = null
  let opening = false
  let shown = false

  /** Hides it and tells the note window, which marks its trigger closed. */
  const hide = () => {
    opening = false
    if (!panel.isDestroyed() && panel.isVisible()) panel.hide()
    if (!shown) return
    shown = false
    if (!parent.isDestroyed()) parent.webContents.send('glassMenu:closed')
  }
  const back = () => {
    const wasShown = shown
    hide()
    if (wasShown && !parent.isDestroyed()) parent.focus()
  }
  // A press elsewhere, in the note window or another app, closes it there.
  panel.on('blur', hide)

  return {
    open(next) {
      if (panel.isDestroyed()) return
      request = next
      opening = true
      panel.webContents.send('glassMenu:show', next)
    },
    setHeight(height) {
      if (!request || panel.isDestroyed() || !Number.isFinite(height) || height <= 0) return
      panel.setBounds(glassMenuBounds(parent.getContentBounds(), request, height))
      if (!opening) return
      opening = false
      shown = true
      panel.show()
      panel.focus()
      panel.webContents.focus()
    },
    pick(id) {
      back()
      if (!parent.isDestroyed()) parent.webContents.send('glassMenu:picked', id)
    },
    close: back,
    dismiss: hide
  }
}
