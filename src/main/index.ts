import { app, BrowserWindow, shell, protocol, net, dialog } from 'electron'
import { join } from 'path'
import { autoUpdater } from 'electron-updater'
import { initDatabase, closeDatabase } from './db/database'
import { registerIpcHandlers } from './ipc'
import { flushPending, getMediaPath } from './services/media'
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

/** Whatever was saved while offline goes up once now; the renderer asks again when it is online. */
function flushPendingMedia(): void {
  flushPending().catch((error) => console.warn('[media] flush failed:', error))
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 680,
    minHeight: 400,
    show: false,
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
  flushPendingMedia()

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
  closeDatabase()
})
