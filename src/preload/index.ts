import { contextBridge, ipcRenderer } from 'electron'

export interface NoteApi {
  platform: NodeJS.Platform
  notes: {
    create: (title?: string, body?: string) => Promise<import('../main/services/notes').Note>
    update: (
      id: string,
      fields: { title?: string; body?: string; tags?: string[] }
    ) => Promise<import('../main/services/notes').Note | null>
    delete: (id: string) => Promise<void>
    get: (id: string) => Promise<import('../main/services/notes').Note | null>
    list: () => Promise<import('../main/services/notes').Note[]>
    search: (query: string) => Promise<import('../main/services/notes').Note[]>
  }
}

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,
  notes: {
    create: (title?: string, body?: string) => ipcRenderer.invoke('notes:create', title, body),
    update: (id: string, fields: { title?: string; body?: string; tags?: string[] }) =>
      ipcRenderer.invoke('notes:update', id, fields),
    delete: (id: string) => ipcRenderer.invoke('notes:delete', id),
    get: (id: string) => ipcRenderer.invoke('notes:get', id),
    list: () => ipcRenderer.invoke('notes:list'),
    search: (query: string) => ipcRenderer.invoke('notes:search', query)
  }
} satisfies NoteApi)
