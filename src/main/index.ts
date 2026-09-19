import { app, BrowserWindow, shell, protocol, net, dialog, nativeTheme } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import { initDatabase, closeDatabase } from './db/database'
import { registerIpcHandlers } from './ipc'
import { getMediaPath } from './services/media'
import { onSyncChanged, startSyncScheduler, stopSyncScheduler } from './services/sync'
import { pathToFileURL } from 'url'

let mainWindow: BrowserWindow | null = null

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

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 680,
    minHeight: 400,
    show: false,
    // Electron's default is white, which flashes on launch and shows through
    // while resizing in dark mode. These are the two `--bg-canvas` values.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1f2123' : '#eef2f6',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 16, y: 16 } } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  registerLocalProtocol()
  initDatabase()
  registerIpcHandlers()

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
