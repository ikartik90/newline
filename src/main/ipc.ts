import { ipcMain, nativeTheme } from 'electron'
import * as authService from './services/auth'
import * as notesService from './services/notes'
import * as mediaService from './services/media'
import { pushNote, syncNow } from './services/sync'
import { getSyncStatus } from './services/sync-status'

export function registerIpcHandlers(): void {
  ipcMain.handle('notes:create', (_event, title?: string, body?: string) => {
    return notesService.createNote(title, body)
  })

  ipcMain.handle(
    'notes:update',
    (_event, id: string, fields: { title?: string; body?: string; tags?: string[] }) => {
      return notesService.updateNote(id, fields)
    }
  )

  ipcMain.handle('notes:delete', (_event, id: string) => {
    notesService.deleteNote(id)
  })

  ipcMain.handle('notes:get', (_event, id: string) => {
    return notesService.getNote(id)
  })

  ipcMain.handle('notes:list', () => {
    return notesService.listNotes()
  })

  ipcMain.handle('notes:search', (_event, query: string) => {
    return notesService.searchNotes(query)
  })

  ipcMain.handle('sync:now', () => {
    return syncNow()
  })

  ipcMain.handle('sync:pushNote', (_event, id: string) => {
    return pushNote(id)
  })

  ipcMain.handle('sync:status', () => {
    return getSyncStatus()
  })

  // The window's own materials — the frosted sidebar on macOS — follow the OS
  // appearance unless told otherwise; the renderer tells them its choice.
  ipcMain.handle('theme:setSource', (_event, source: string) => {
    if (source === 'light' || source === 'dark' || source === 'system') {
      nativeTheme.themeSource = source
    }
  })

  ipcMain.handle('meta:set', (_event, key: string, value: string) => {
    notesService.setAppMeta(key, value)
  })

  ipcMain.handle('meta:get', (_event, key: string) => {
    return notesService.getAppMeta(key)
  })

  ipcMain.handle('media:list', () => {
    return mediaService.listMedia()
  })

  ipcMain.handle('media:upload', (_event, input: mediaService.MediaUploadInput) => {
    return mediaService.saveMedia(input)
  })

  ipcMain.handle('media:updateAlt', (_event, key: string, alt: string) => {
    return mediaService.updateAlt(key, alt)
  })

  ipcMain.handle('media:rename', (_event, key: string, filename: string) => {
    return mediaService.rename(key, filename)
  })

  ipcMain.handle('media:delete', (_event, key: string) => {
    return mediaService.deleteMedia(key)
  })

  ipcMain.handle('media:uploadPoster', (_event, key: string, bytes: Uint8Array) => {
    return mediaService.uploadPoster(key, bytes)
  })

  ipcMain.handle('media:flushPending', () => {
    return mediaService.flushPending()
  })

  ipcMain.handle('auth:google', async () => {
    const result = await authService.signInWithGoogle()
    // A fresh session has a replica to catch up on; the renderer is not kept waiting for it.
    void syncNow()
    return result
  })

  ipcMain.handle('auth:cancel', () => {
    authService.cancelSignIn()
  })

  ipcMain.handle('auth:current', () => {
    return authService.currentUser()
  })

  ipcMain.handle('auth:signOut', () => {
    return authService.signOut()
  })
}
