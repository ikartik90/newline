import { ipcMain } from 'electron'
import * as notesService from './services/notes'
import * as mediaService from './services/media'
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

  ipcMain.handle(
    'notes:upsertFromRemote',
    (
      _event,
      id: string,
      fields: { title: string; body: string; tags: string[]; createdAt: number; isDeleted: boolean }
    ) => {
      notesService.upsertFromRemote(id, fields)
    }
  )

  ipcMain.handle('notes:markSynced', (_event, id: string) => {
    notesService.markSynced(id)
  })

  ipcMain.handle('notes:dirty', () => {
    return notesService.getDirtyNotes()
  })

  ipcMain.handle('sync:status', () => {
    return getSyncStatus()
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
}
