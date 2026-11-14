import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import {
  createCommandPalette,
  paletteBounds,
  PALETTE_FULL_HEIGHT,
  paletteMaxHeight,
  PALETTE_WIDTH,
  paletteWindowOptions,
  type PaletteState
} from '../command-palette'

const state: PaletteState = { sidebarCollapsed: false, noteOpen: true, theme: 'dark' }

/** The parts of a BrowserWindow the palette drives, recorded. */
function fakeWindow(content = { x: 100, y: 50, width: 1200, height: 800 }) {
  // Mutable, as a window's bounds are.
  content = { ...content }
  const events = new EventEmitter()
  const pageEvents = new EventEmitter()
  let visible = false
  return {
    on: (event: string, listener: () => void) => events.on(event, listener),
    emit: (event: string) => events.emit(event),
    getContentBounds: () => content,
    getBounds: vi.fn(() => ({ x: 0, y: 0, width: 0, height: 0 })),
    setBounds: vi.fn(),
    show: vi.fn(() => {
      visible = true
    }),
    hide: vi.fn(() => {
      visible = false
    }),
    focus: vi.fn(),
    isVisible: () => visible,
    isDestroyed: () => false,
    webContents: {
      on: (event: string, listener: () => void) => pageEvents.on(event, listener),
      emit: (event: string) => pageEvents.emit(event),
      send: vi.fn(),
      focus: vi.fn()
    }
  }
}

describe('paletteBounds', () => {
  const roomy = { x: 100, y: 50, width: 1200, height: 800 }
  const short = { x: 0, y: 0, width: 1200, height: 400 }

  it('centres the palette in the window at its full height', () => {
    const bounds = paletteBounds(roomy, PALETTE_FULL_HEIGHT)
    expect(bounds.x - roomy.x + bounds.width / 2).toBe(roomy.width / 2)
    expect(bounds.y - roomy.y + bounds.height / 2).toBe(roomy.height / 2)
    expect(bounds).toMatchObject({ width: PALETTE_WIDTH, height: PALETTE_FULL_HEIGHT })
  })

  // Centred afresh as the list filters, the field would jump on every key.
  it('keeps its top as what it shows shrinks', () => {
    expect(paletteBounds(roomy, 200).y).toBe(paletteBounds(roomy, PALETTE_FULL_HEIGHT).y)
    expect(paletteBounds(roomy, 200).height).toBe(200)
  })

  it('keeps 24px of window on either side of a narrow window', () => {
    expect(paletteBounds({ x: 0, y: 0, width: 400, height: 800 }, 200)).toMatchObject({
      x: 24,
      width: 352
    })
  })

  it('stands at least 24px under the top bar and 40px above the bottom', () => {
    expect(paletteBounds(short, PALETTE_FULL_HEIGHT)).toMatchObject({
      y: 48 + 24,
      height: 400 - 72 - 40
    })
    expect(paletteMaxHeight(short)).toBe(400 - 72 - 40)
    expect(paletteMaxHeight(roomy)).toBeGreaterThanOrEqual(PALETTE_FULL_HEIGHT)
  })

  it('lands on whole points', () => {
    const bounds = paletteBounds({ x: 0, y: 0, width: 1001, height: 601 }, 240.6)
    for (const value of Object.values(bounds)) expect(Number.isInteger(value)).toBe(true)
  })
})

describe('paletteWindowOptions', () => {
  // Its menu stands straight on the window's glass, with no sheet to cast one.
  it('casts no shadow', () => {
    expect(paletteWindowOptions('/preload.js').hasShadow).toBe(false)
  })

  // A frameless window is titled underneath, and macOS rims and rounds a
  // titled window: borderless, nothing is drawn around the menu.
  it('is borderless, so macOS draws nothing around the menu', () => {
    expect(paletteWindowOptions('/preload.js').roundedCorners).toBe(false)
  })
})

describe('createCommandPalette', () => {
  it('opens over the window with what the window holds once its page has drawn it, and takes the keys', () => {
    const parent = fakeWindow()
    const panel = fakeWindow()
    panel.getBounds.mockReturnValue({ x: 0, y: 0, width: PALETTE_WIDTH, height: 320 })
    const palette = createCommandPalette(parent, panel)

    palette.open(state)
    // With the most it may stand, so its list scrolls past that.
    expect(panel.webContents.send).toHaveBeenCalledWith(
      'palette:show',
      state,
      paletteMaxHeight(parent.getContentBounds())
    )
    expect(panel.setBounds).toHaveBeenCalledWith(paletteBounds(parent.getContentBounds(), 320))
    // Not before the page answers, or it would flash what it last held.
    expect(panel.show).not.toHaveBeenCalled()

    palette.setHeight(280)
    expect(panel.setBounds).toHaveBeenLastCalledWith(paletteBounds(parent.getContentBounds(), 280))
    expect(panel.show).toHaveBeenCalled()
    expect(panel.focus).toHaveBeenCalled()
    expect(panel.webContents.focus).toHaveBeenCalled()
  })

  it('shows only for an opening, not for every change of height', () => {
    const panel = fakeWindow()
    const palette = createCommandPalette(fakeWindow(), panel)
    palette.setHeight(200)
    expect(panel.show).not.toHaveBeenCalled()
  })

  it('grows and shrinks with what it shows, where it stands', () => {
    const parent = fakeWindow()
    const panel = fakeWindow()
    const palette = createCommandPalette(parent, panel)
    palette.open(state)
    palette.setHeight(300)
    palette.setHeight(212)
    expect(panel.setBounds).toHaveBeenLastCalledWith(paletteBounds(parent.getContentBounds(), 212))
  })

  it('hands a picked command to the window, closed first and the window focused', () => {
    const parent = fakeWindow()
    const panel = fakeWindow()
    const palette = createCommandPalette(parent, panel)
    palette.open(state)
    palette.setHeight(300)

    palette.run('new-note')

    expect(panel.hide).toHaveBeenCalled()
    expect(parent.focus).toHaveBeenCalled()
    expect(parent.webContents.send).toHaveBeenCalledWith('palette:command', 'new-note')
    const sent = parent.webContents.send.mock.calls.findIndex(
      ([channel]) => channel === 'palette:command'
    )
    expect(panel.hide.mock.invocationCallOrder[0]).toBeLessThan(
      parent.webContents.send.mock.invocationCallOrder[sent]
    )
  })

  it('hands a picked note to the window', () => {
    const parent = fakeWindow()
    const panel = fakeWindow()
    const palette = createCommandPalette(parent, panel)
    palette.open(state)
    palette.setHeight(300)
    const note = { id: 'n1' }

    palette.openNote(note)

    expect(panel.hide).toHaveBeenCalled()
    expect(parent.webContents.send).toHaveBeenCalledWith('palette:openNote', note)
  })

  it('closes back to the window on Escape', () => {
    const parent = fakeWindow()
    const panel = fakeWindow()
    const palette = createCommandPalette(parent, panel)
    palette.open(state)
    palette.setHeight(300)

    palette.close()

    expect(panel.hide).toHaveBeenCalled()
    expect(parent.focus).toHaveBeenCalled()
  })

  // Another window or app taking the keys leaves it open, as a dialog stays;
  // only a press on the dim, a pick, Escape or ⌘K closes it.
  it('stays open when the keys go elsewhere', () => {
    const parent = fakeWindow()
    const panel = fakeWindow()
    const palette = createCommandPalette(parent, panel)
    palette.open(state)
    palette.setHeight(300)

    panel.webContents.emit('blur')

    expect(panel.hide).not.toHaveBeenCalled()
    expect(parent.webContents.send).not.toHaveBeenCalledWith('palette:visible', false)
  })

  // Under the dim the window's page must not take keys, or they would edit
  // the note behind it.
  it('takes the keys back when the window under it takes them', () => {
    const parent = fakeWindow()
    const panel = fakeWindow()
    const palette = createCommandPalette(parent, panel)
    parent.emit('focus')
    expect(panel.focus).not.toHaveBeenCalled()

    palette.open(state)
    palette.setHeight(300)
    panel.focus.mockClear()
    panel.webContents.focus.mockClear()
    parent.emit('focus')
    expect(panel.focus).toHaveBeenCalled()
    expect(panel.webContents.focus).toHaveBeenCalled()

    palette.close()
    panel.focus.mockClear()
    parent.emit('focus')
    expect(panel.focus).not.toHaveBeenCalled()
  })

  it('tells the window when it shows and when it goes, so the window dims under it', () => {
    const parent = fakeWindow()
    const panel = fakeWindow()
    const palette = createCommandPalette(parent, panel)
    palette.open(state)
    expect(parent.webContents.send).not.toHaveBeenCalledWith('palette:visible', true)

    palette.setHeight(300)
    expect(parent.webContents.send).toHaveBeenLastCalledWith('palette:visible', true)

    palette.close()
    expect(parent.webContents.send).toHaveBeenLastCalledWith('palette:visible', false)
  })

  // The window under it turns to glass while it shows, its note cleared.
  it('turns the window under it to glass while it shows', () => {
    const windowGlass = vi.fn()
    const palette = createCommandPalette(fakeWindow(), fakeWindow(), windowGlass)
    palette.open(state)
    expect(windowGlass).not.toHaveBeenCalled()

    palette.setHeight(300)
    expect(windowGlass).toHaveBeenLastCalledWith(true)

    palette.close()
    expect(windowGlass).toHaveBeenLastCalledWith(false)
  })

  it('says it went only once, and only if it had shown', () => {
    const parent = fakeWindow()
    const panel = fakeWindow()
    const palette = createCommandPalette(parent, panel)
    palette.close()
    expect(parent.webContents.send).not.toHaveBeenCalledWith('palette:visible', false)

    palette.open(state)
    palette.setHeight(300)
    palette.run('new-note')
    palette.close()
    const gone = parent.webContents.send.mock.calls.filter(
      ([channel, visible]) => channel === 'palette:visible' && visible === false
    )
    expect(gone).toHaveLength(1)
  })

  // Resized under it, it stays open, placed afresh and told the most it may
  // now stand, so its list scrolls in a shorter window.
  it('follows the window it stands over as it is resized', () => {
    const parent = fakeWindow()
    const panel = fakeWindow()
    panel.getBounds.mockReturnValue({ x: 0, y: 0, width: PALETTE_WIDTH, height: 300 })
    const palette = createCommandPalette(parent, panel)
    palette.open(state)
    palette.setHeight(300)

    const content = parent.getContentBounds()
    Object.assign(content, { width: 700, height: 420 })
    parent.emit('resize')

    expect(panel.hide).not.toHaveBeenCalled()
    expect(panel.setBounds).toHaveBeenLastCalledWith(paletteBounds(content, 300))
    expect(panel.webContents.send).toHaveBeenLastCalledWith(
      'palette:fit',
      paletteMaxHeight(content)
    )
  })

  it('leaves a closed palette alone as the window is resized', () => {
    const parent = fakeWindow()
    const panel = fakeWindow()
    createCommandPalette(parent, panel)
    parent.emit('resize')
    expect(panel.setBounds).not.toHaveBeenCalled()
    expect(panel.webContents.send).not.toHaveBeenCalled()
  })
})
