import type { BrowserWindowConstructorOptions, Rectangle } from 'electron'

// ---------------------------------------------------------------------------
// The glass command palette. On macOS 27 and later the command menu is a
// clear window of its own over the note window, which turns all to glass
// under it (native/sidebar-glass.mm's windowGlass) as its page fades what it
// holds: the menu stands straight on that glass. It is made hidden with the note window and only shown and hidden, so
// ⌘K finds it drawn. Its page names what was picked; main closes it, hands
// the focus back and tells the note window, which does it. As a dialog would,
// it stays open while another window or app has the keys, and over a window
// being resized; a press on the window's dim closes it.
// ---------------------------------------------------------------------------

/** What the menu offers depends on: what the note window holds. */
export interface PaletteState {
  sidebarCollapsed: boolean
  noteOpen: boolean
  theme: 'light' | 'dark'
}

/** `--size-dialog-sm`, the in-page menu's width. */
export const PALETTE_WIDTH = 480
/** The flag main hands a window whose command menu is this palette. */
export const GLASS_PALETTE_ARG = '--glass-command-palette'

/** The menu at its fullest: the 40px field over the list's most, 384px. */
export const PALETTE_FULL_HEIGHT = 424

// The least window it keeps: 24px on either side, 24px under the 48px top
// bar and 40px above the bottom. With room to spare it stands centred at its
// full height, and a shorter list hangs from that top, so the field never
// moves as the list filters.
const INLINE_MARGIN = 24
const TOP = 48 + 24
const BOTTOM = 40

const topIn = (content: Rectangle) => Math.max(TOP, (content.height - PALETTE_FULL_HEIGHT) / 2)

/** The most the palette may stand over `content`; its list scrolls past it. */
export function paletteMaxHeight(content: Rectangle): number {
  return Math.floor(content.height - topIn(content) - BOTTOM)
}

/** Where the palette stands over the note window's content, `height` tall. */
export function paletteBounds(content: Rectangle, height: number): Rectangle {
  const width = Math.min(PALETTE_WIDTH, content.width - INLINE_MARGIN * 2)
  return {
    x: Math.round(content.x + (content.width - width) / 2),
    y: Math.round(content.y + topIn(content)),
    width: Math.round(width),
    height: Math.round(Math.min(height, paletteMaxHeight(content)))
  }
}

/** The palette's window: a clear, frameless panel that floats over the note window. */
export function paletteWindowOptions(preload: string): BrowserWindowConstructorOptions {
  return {
    show: false,
    type: 'panel',
    frame: false,
    // Borderless: macOS would rim and round a titled window around the menu.
    roundedCorners: false,
    transparent: true,
    backgroundColor: '#00000000',
    // The menu stands on the note window's glass, with no sheet to cast one.
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    width: PALETTE_WIDTH,
    height: 96,
    webPreferences: {
      preload,
      sandbox: false,
      // Hidden between showings, it still answers a show at once.
      backgroundThrottling: false
    }
  }
}

/** The parts of a BrowserWindow the palette drives. */
export interface PaletteWindow {
  on(event: 'resize' | 'focus', listener: () => void): unknown
  getContentBounds(): Rectangle
  getBounds(): Rectangle
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

export interface CommandPalette {
  /** Fills the palette for `state`; it shows once its page has drawn that. */
  open(state: PaletteState): void
  /** The page's height: the palette fits it, and shows if it was being opened. */
  setHeight(height: number): void
  run(id: string): void
  openNote(note: unknown): void
  close(): void
}

export function createCommandPalette(
  parent: PaletteWindow,
  panel: PaletteWindow,
  /** Turns the window under it to glass, or back, as it shows and goes. */
  windowGlass?: (on: boolean) => void
): CommandPalette {
  // Shown only once the page has drawn the new showing, so a reopened
  // palette never flashes what it last held.
  let opening = false
  // The note window dims under it while it shows.
  let shown = false
  const tell = (visible: boolean) => {
    shown = visible
    if (parent.isDestroyed()) return
    windowGlass?.(visible)
    parent.webContents.send('palette:visible', visible)
  }
  const place = (height: number) =>
    panel.setBounds(paletteBounds(parent.getContentBounds(), height))
  const hide = () => {
    opening = false
    if (!panel.isDestroyed() && panel.isVisible()) panel.hide()
    if (shown) tell(false)
  }
  const back = () => {
    hide()
    if (!parent.isDestroyed()) parent.focus()
  }
  const takeKeys = () => {
    panel.focus()
    panel.webContents.focus()
  }
  // Under the dim the window's page would take keys meant for the palette:
  // the note behind it, edited unseen.
  parent.on('focus', () => {
    if (shown && !panel.isDestroyed()) takeKeys()
  })
  // Laid afresh over the window as it is, told the most it may now stand.
  parent.on('resize', () => {
    if ((!shown && !opening) || panel.isDestroyed() || parent.isDestroyed()) return
    place(panel.getBounds().height)
    panel.webContents.send('palette:fit', paletteMaxHeight(parent.getContentBounds()))
  })

  return {
    open(state) {
      if (panel.isDestroyed()) return
      opening = true
      place(panel.getBounds().height)
      panel.webContents.send('palette:show', state, paletteMaxHeight(parent.getContentBounds()))
    },
    setHeight(height) {
      if (panel.isDestroyed() || !Number.isFinite(height) || height <= 0) return
      place(height)
      if (!opening) return
      opening = false
      panel.show()
      takeKeys()
      tell(true)
    },
    run(id) {
      back()
      parent.webContents.send('palette:command', id)
    },
    openNote(note) {
      back()
      parent.webContents.send('palette:openNote', note)
    },
    close: back
  }
}
