import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import {
  createGlassMenu,
  glassMenuBounds,
  GLASS_MENU_INSET,
  GLASS_MENU_WIDTH,
  glassMenuWindowOptions,
  type GlassMenuRequest
} from '../glass-menu'

// ---------------------------------------------------------------------------
// A menu on AppKit's glass: a window of its own over the note window, stood
// on its trigger as the in-page menu is, showing once its page has drawn.
// ---------------------------------------------------------------------------

const request: GlassMenuRequest = {
  anchor: { x: 12, y: 740, width: 120, height: 32 },
  side: 'top',
  align: 'start',
  focus: 'menu',
  theme: 'dark',
  identity: { name: 'Kartik', email: 'k@example.com' },
  items: [{ id: 'sign-out', label: 'Sign out' }]
}

function fakeWindow(content = { x: 100, y: 50, width: 1200, height: 800 }) {
  const events = new EventEmitter()
  let visible = false
  return {
    on: (event: string, listener: () => void) => events.on(event, listener),
    emit: (event: string) => events.emit(event),
    getContentBounds: () => content,
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
    webContents: { send: vi.fn(), focus: vi.fn() }
  }
}

describe('glassMenuBounds', () => {
  const content = { x: 100, y: 50, width: 1200, height: 800 }

  it('stands over its trigger, 4px off it, its start on the trigger’s', () => {
    expect(glassMenuBounds(content, request, 60)).toEqual({
      x: 100 + 12,
      y: 50 + 740 - 4 - 60,
      width: GLASS_MENU_WIDTH,
      height: 60
    })
  })

  it('opens below instead when there is no room above', () => {
    const near = { ...request, anchor: { ...request.anchor, y: 20 } }
    expect(glassMenuBounds(content, near, 60).y).toBe(50 + 20 + 32 + 4)
  })

  it('opens above instead when there is no room below', () => {
    const below = { ...request, side: 'bottom' as const }
    expect(glassMenuBounds(content, below, 60).y).toBe(50 + 740 - 4 - 60)
  })

  it('ends on the trigger’s end when aligned so, and keeps 5px in from the window', () => {
    const end = { ...request, align: 'end' as const, anchor: { ...request.anchor, x: 900 } }
    expect(glassMenuBounds(content, end, 60).x).toBe(100 + 900 + 120 - GLASS_MENU_WIDTH)
    const off = { ...request, anchor: { ...request.anchor, x: 1150 } }
    expect(glassMenuBounds(content, off, 60).x).toBe(100 + 1200 - 5 - GLASS_MENU_WIDTH)
  })
})

describe('glassMenuBounds over its trigger', () => {
  const content = { x: 100, y: 50, width: 1200, height: 800 }
  const over = {
    ...request,
    side: 'over' as const,
    anchor: { x: 12, y: 300, width: 120, height: 32 }
  }

  it('stands on its trigger, its first row where the trigger was', () => {
    expect(glassMenuBounds(content, over, 100)).toEqual({
      x: 100 + 12 - GLASS_MENU_INSET,
      y: 50 + 300 - GLASS_MENU_INSET,
      width: GLASS_MENU_WIDTH,
      height: 100
    })
  })

  it('rises only as far as it must to stay 5px above the window’s foot', () => {
    const low = { ...over, anchor: { ...over.anchor, y: 760 } }
    expect(glassMenuBounds(content, low, 100).y).toBe(50 + 800 - 5 - 100)
  })

  it('is as wide as its trigger where that is wider than a menu', () => {
    const wide = { ...over, anchor: { ...over.anchor, width: 260 } }
    expect(glassMenuBounds(content, wide, 100).width).toBe(260 + 2 * GLASS_MENU_INSET)
  })
})

describe('glassMenuWindowOptions', () => {
  it('is a clear, frameless panel the menu’s width, shadowed as a menu is', () => {
    const options = glassMenuWindowOptions('/preload.js')
    expect(options).toMatchObject({
      show: false,
      type: 'panel',
      frame: false,
      transparent: true,
      hasShadow: true,
      resizable: false,
      width: GLASS_MENU_WIDTH
    })
    expect(options.webPreferences?.preload).toBe('/preload.js')
  })
})

describe('createGlassMenu', () => {
  it('hands its page the menu, and shows only once the page says how tall it is', () => {
    const parent = fakeWindow()
    const panel = fakeWindow()
    const menu = createGlassMenu(parent, panel)
    menu.open(request)
    expect(panel.webContents.send).toHaveBeenCalledWith('glassMenu:show', request)
    expect(panel.show).not.toHaveBeenCalled()

    menu.setHeight(60)
    expect(panel.setBounds).toHaveBeenCalledWith(
      glassMenuBounds(parent.getContentBounds(), request, 60)
    )
    expect(panel.show).toHaveBeenCalledTimes(1)
    expect(panel.focus).toHaveBeenCalled()
    expect(panel.webContents.focus).toHaveBeenCalled()

    menu.setHeight(64)
    expect(panel.show).toHaveBeenCalledTimes(1)
  })

  it('names a pick to the note window, closing first and handing the keys back', () => {
    const parent = fakeWindow()
    const panel = fakeWindow()
    const menu = createGlassMenu(parent, panel)
    menu.open(request)
    menu.setHeight(60)
    menu.pick('sign-out')
    expect(panel.hide).toHaveBeenCalled()
    expect(parent.focus).toHaveBeenCalled()
    expect(parent.webContents.send).toHaveBeenCalledWith('glassMenu:closed')
    expect(parent.webContents.send).toHaveBeenLastCalledWith('glassMenu:picked', 'sign-out')
  })

  it('closes when asked, handing the keys back', () => {
    const parent = fakeWindow()
    const panel = fakeWindow()
    const menu = createGlassMenu(parent, panel)
    menu.open(request)
    menu.setHeight(60)
    menu.close()
    expect(panel.hide).toHaveBeenCalled()
    expect(parent.focus).toHaveBeenCalled()
    expect(parent.webContents.send).toHaveBeenCalledWith('glassMenu:closed')
  })

  it('closes when the keys go elsewhere, leaving them there', () => {
    const parent = fakeWindow()
    const panel = fakeWindow()
    const menu = createGlassMenu(parent, panel)
    menu.open(request)
    menu.setHeight(60)
    panel.emit('blur')
    expect(panel.hide).toHaveBeenCalled()
    expect(parent.focus).not.toHaveBeenCalled()
    expect(parent.webContents.send).toHaveBeenCalledWith('glassMenu:closed')
  })

  it('is dismissed, leaving the keys where they went, when the app goes to the back', () => {
    const parent = fakeWindow()
    const panel = fakeWindow()
    const menu = createGlassMenu(parent, panel)
    menu.open(request)
    menu.setHeight(60)
    menu.dismiss()
    expect(panel.hide).toHaveBeenCalled()
    expect(parent.focus).not.toHaveBeenCalled()
    expect(parent.webContents.send).toHaveBeenCalledWith('glassMenu:closed')
  })

  it('says nothing when it was not showing', () => {
    const parent = fakeWindow()
    const panel = fakeWindow()
    createGlassMenu(parent, panel).close()
    panel.emit('blur')
    expect(parent.webContents.send).not.toHaveBeenCalled()
  })
})
