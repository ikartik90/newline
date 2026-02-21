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
    search: (query: string) => ipcRenderer.invoke('notes:search', query),
    upsertFromRemote: (
      id: string,
      fields: { title: string; body: string; tags: string[]; createdAt: number; isDeleted: boolean }
    ) => ipcRenderer.invoke('notes:upsertFromRemote', id, fields),
    markSynced: (id: string) => ipcRenderer.invoke('notes:markSynced', id),
    dirty: () => ipcRenderer.invoke('notes:dirty')
  },
  sync: {
    status: () => ipcRenderer.invoke('sync:status')
  },
  meta: {
    set: (key: string, value: string) => ipcRenderer.invoke('meta:set', key, value),
    get: (key: string) => ipcRenderer.invoke('meta:get', key)
  },
  images: {
    save: (base64Data: string, ext: string, noteId: string) =>
      ipcRenderer.invoke('images:save', base64Data, ext, noteId)
  },
  auth: {
    googleSignIn: (clientId: string, authDomain: string) =>
      ipcRenderer.invoke('auth:google', clientId, authDomain)
  }
})
