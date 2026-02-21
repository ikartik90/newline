import { ipcMain } from 'electron'
import * as notesService from './services/notes'

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
}
