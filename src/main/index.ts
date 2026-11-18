import { app, BrowserWindow, ipcMain, shell, protocol, net, dialog, nativeTheme } from 'electron'
import { join } from 'path'
import { release } from 'os'
import { autoUpdater } from 'electron-updater'
import { initDatabase, closeDatabase } from './db/database'
import { registerIpcHandlers } from './ipc'
import { getMediaPath } from './services/media'
import { onSyncChanged, startSyncScheduler, stopSyncScheduler } from './services/sync'
import { pathToFileURL } from 'url'
import {
  FROSTED_WINDOW_ARG,
  glassWindowOptions,
  isFrostedWindow,
  loadSidebarGlass,
  requireSidebarGlass
} from './sidebar-glass'
import {
  createCommandPalette,
  GLASS_PALETTE_ARG,
  paletteWindowOptions,
  type CommandPalette,
  type PaletteState
} from './command-palette'
import {
  createGlassMenu,
  GLASS_MENU_RADIUS,
  glassMenuWindowOptions,
  type GlassMenu,
  type GlassMenuRequest
} from './glass-menu'
import { createWindowGlass, type WindowGlass } from './window-glass'

let mainWindow: BrowserWindow | null = null
// The note window's glass command palette, where AppKit has the glass.
let commandPalette: CommandPalette | null = null
// Its menus on AppKit's glass, the account menu's.
let glassMenu: GlassMenu | null = null

// AppKit's sidebar glass, laid under the page's sidebar; null where there is none.
const sidebarGlass = loadSidebarGlass(process.platform, requireSidebarGlass)

// The About panel reads the RUNNING bundle's strings, which from source are
// Electron's own; `productName` in package.json only reaches `app.name`.
app.setAboutPanelOptions({ applicationName: 'Newline', applicationVersion: app.getVersion() })

function setupAutoUpdater(): void {
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-downloaded', (info) => {
    dialog
      .showMessageBox({
        type: 'info',
        title: 'Update ready',
        message: `Version ${info.version} has been downloaded. Restart to apply?`,
        buttons: ['Restart now', 'Later']
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall()
        }
      })
  })

  autoUpdater.checkForUpdatesAndNotify()
}

/** `local://<file>` — the media library's own files, and the old image paste's. */
function registerLocalProtocol(): void {
  protocol.handle('local', (request) => {
    const filename = decodeURIComponent(
      request.url.slice('local://'.length).split(/[?#]/)[0].replace(/\/$/, '')
    )
    const filePath = getMediaPath(filename)

    if (filePath) {
      return net.fetch(pathToFileURL(filePath).href)
    }
    return new Response('Not found', { status: 404 })
  })
}

/** A pull that changed notes: the renderer reloads its list. */
function notifyRendererOfSyncChange(): void {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('sync:changed')
}

/** A page of the renderer's: the dev server's in development, the build's otherwise. */
function loadPage(window: BrowserWindow, page: string): Promise<void> {
  const devServer = process.env['ELECTRON_RENDERER_URL']
  return devServer
    ? window.loadURL(`${devServer}/${page}`)
    : window.loadFile(join(__dirname, `../renderer/${page}`))
}

/** The page's fade of its note as the palette comes and goes (App.tsx's shell). */
const NOTE_FADE_MS = 150

/** Each window's glass over the whole of it, where AppKit has the glass. */
const windowGlasses = new WeakMap<BrowserWindow, WindowGlass>()

function windowGlassOf(window: BrowserWindow): WindowGlass | null {
  if (!sidebarGlass) return null
  const glass = sidebarGlass
  let held = windowGlasses.get(window)
  if (!held) {
    held = createWindowGlass((on) => {
      if (!window.isDestroyed()) glass.windowGlass(window.getNativeWindowHandle(), on)
    }, NOTE_FADE_MS + 100)
    windowGlasses.set(window, held)
  }
  return held
}

/** The glass palette over `parent`, made hidden so ⌘K finds it drawn. */
function createCommandPaletteFor(parent: BrowserWindow): CommandPalette | null {
  if (!sidebarGlass) return null
  const panel = new BrowserWindow({
    ...paletteWindowOptions(join(__dirname, '../preload/index.js')),
    parent
  })
  sidebarGlass.floatPanel(panel.getNativeWindowHandle())
  // The window is all glass while the palette shows.
  const glass = windowGlassOf(parent)
  void loadPage(panel, 'command-palette.html')
  return createCommandPalette(parent, panel, (on) => glass?.hold('palette', on))
}

/** A menu on the glass over `parent`, made hidden so a menu finds it drawn. */
function createGlassMenuFor(parent: BrowserWindow): GlassMenu | null {
  if (!sidebarGlass) return null
  const panel = new BrowserWindow({
    ...glassMenuWindowOptions(join(__dirname, '../preload/index.js')),
    parent
  })
  // Bare Liquid Glass, as AppKit's own menus are.
  sidebarGlass.panelGlass(panel.getNativeWindowHandle(), GLASS_MENU_RADIUS, 0)
  void loadPage(panel, 'glass-menu.html')
  return createGlassMenu(parent, panel)
}

function registerGlassMenuIpc(): void {
  ipcMain.on('glassMenu:open', (_event, request: GlassMenuRequest) => glassMenu?.open(request))
  ipcMain.on('glassMenu:height', (_event, height: number) => glassMenu?.setHeight(height))
  ipcMain.on('glassMenu:pick', (_event, id: string) => glassMenu?.pick(id))
  ipcMain.on('glassMenu:close', () => glassMenu?.close())
}

/** The palette's messages, each answered by the palette of the window it is about. */
function registerCommandPaletteIpc(): void {
  ipcMain.on('palette:open', (_event, state: PaletteState) => commandPalette?.open(state))
  ipcMain.on('palette:height', (_event, height: number) => commandPalette?.setHeight(height))
  ipcMain.on('palette:run', (_event, id: string) => commandPalette?.run(id))
  ipcMain.on('palette:pickNote', (_event, note: unknown) => commandPalette?.openNote(note))
  ipcMain.on('palette:close', () => commandPalette?.close())
  // A dialog in the page stands on the same glass while it is open.
  ipcMain.on('window:glass', (event, on: boolean) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) windowGlassOf(window)?.hold('page', on === true)
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 680,
    minHeight: 400,
    show: false,
    ...glassWindowOptions(
      process.platform,
      sidebarGlass,
      nativeTheme.shouldUseDarkColors,
      release()
    ),
    // The OS's own close/minimise/zoom buttons, drawn over the content and
    // centred in the renderer's 48px top bar: 14px tall from y 17, a centre of 24,
    // level with the sidebar toggle that sits past them.
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 16, y: 17 } } : {}),
    // The click that brings the window forward also reaches the page, so the
    // toggle under a sidebar peeked at from another app pins it at once.
    acceptFirstMouse: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      // Where AppKit has the glass, the command menu is the glass palette;
      // where the window is any blur of the OS's, the page is clear over it.
      additionalArguments: [
        ...(sidebarGlass ? [GLASS_PALETTE_ARG] : []),
        ...(isFrostedWindow(process.platform, release()) ? [FROSTED_WINDOW_ARG] : [])
      ]
    }
  })
  commandPalette = createCommandPaletteFor(mainWindow)
  glassMenu = createGlassMenuFor(mainWindow)
  mainWindow.on('closed', () => {
    commandPalette = null
    glassMenu = null
    mainWindow = null
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // macOS hides the window's buttons in full screen; the renderer moves the
  // sidebar toggle into their place.
  const sendFullScreen = (fullScreen: boolean): void =>
    mainWindow?.webContents.send('window:fullScreen', fullScreen)
  mainWindow.on('enter-full-screen', () => sendFullScreen(true))
  mainWindow.on('leave-full-screen', () => sendFullScreen(false))

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  void loadPage(mainWindow, 'index.html')
}

app.whenReady().then(() => {
  registerLocalProtocol()
  initDatabase()
  registerIpcHandlers(sidebarGlass)
  registerCommandPaletteIpc()
  registerGlassMenuIpc()
  // A menu goes as the app goes to the back, as AppKit's own do.
  app.on('did-resign-active', () => glassMenu?.dismiss())

  createWindow()
  // The first cycle pushes whatever was saved while the app was closed and
  // pulls what other devices did; the renderer asks for one itself once it
  // is up, and shares this one when it is still running.
  onSyncChanged(notifyRendererOfSyncChange)
  startSyncScheduler()

  if (app.isPackaged) {
    setupAutoUpdater()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => {
  stopSyncScheduler()
  closeDatabase()
})
