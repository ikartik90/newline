import { contextBridge, ipcRenderer } from 'electron'

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
  },
  sync: {
    status: () => ipcRenderer.invoke('sync:status')
  }
})
