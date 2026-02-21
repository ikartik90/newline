import { app, BrowserWindow, shell, protocol, net, dialog, ipcMain } from 'electron'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { autoUpdater } from 'electron-updater'
import { initDatabase, closeDatabase } from './db/database'
import { registerIpcHandlers } from './ipc'
import { getImagePath } from './services/images'
import { pathToFileURL } from 'url'

let mainWindow: BrowserWindow | null = null

function registerAuthHandlers(): void {
  ipcMain.handle(
    'auth:google',
    (_event, clientId: string, authDomain: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        const nonce = randomUUID()
        const redirectUri = `https://${authDomain}/__/auth/handler`

        const authUrl =
          'https://accounts.google.com/o/oauth2/v2/auth?' +
          new URLSearchParams({
            client_id: clientId,
            redirect_uri: redirectUri,
            response_type: 'id_token',
            scope: 'openid email profile',
            nonce,
            prompt: 'select_account'
          }).toString()

        const authWindow = new BrowserWindow({
          width: 500,
          height: 700,
          parent: mainWindow ?? undefined,
          modal: true,
          show: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
          }
        })

        authWindow.webContents.on('will-redirect', (_e, url) => {
          extractToken(url)
        })

        authWindow.webContents.on('will-navigate', (_e, url) => {
          extractToken(url)
        })

        function extractToken(url: string): void {
          try {
            const parsed = new URL(url)
            const fragment = parsed.hash.substring(1)
            const params = new URLSearchParams(fragment)
            const idToken = params.get('id_token')
            if (idToken) {
              resolve(idToken)
              authWindow.close()
            }
          } catch {
            // Not the redirect we're looking for
          }
        }

        authWindow.on('closed', () => {
          reject(new Error('Auth window was closed'))
        })

        authWindow.loadURL(authUrl)
      })
    }
  )
}

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

function registerLocalProtocol(): void {
  protocol.handle('local', (request) => {
    const filename = request.url.replace('local://', '')
    const filePath = getImagePath(filename)

    if (filePath) {
      return net.fetch(pathToFileURL(filePath).href)
    }
    return new Response('Not found', { status: 404 })
  })
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
  registerAuthHandlers()

  createWindow()

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
