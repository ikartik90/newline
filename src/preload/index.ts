import { contextBridge, ipcRenderer } from 'electron'

/** What the renderer hands main to store a file — mirrors `MediaUploadInput` in env.d.ts. */
interface MediaUploadInput {
  filename: string
  contentType: string
  bytes: Uint8Array
  width?: number
  height?: number
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
  media: {
    list: () => ipcRenderer.invoke('media:list'),
    upload: (input: MediaUploadInput) => ipcRenderer.invoke('media:upload', input),
    updateAlt: (key: string, alt: string) => ipcRenderer.invoke('media:updateAlt', key, alt),
    rename: (key: string, filename: string) => ipcRenderer.invoke('media:rename', key, filename),
    delete: (key: string) => ipcRenderer.invoke('media:delete', key),
    uploadPoster: (key: string, bytes: Uint8Array) =>
      ipcRenderer.invoke('media:uploadPoster', key, bytes),
    flushPending: () => ipcRenderer.invoke('media:flushPending')
  },
  auth: {
    googleSignIn: () => ipcRenderer.invoke('auth:google'),
    cancelSignIn: () => ipcRenderer.invoke('auth:cancel'),
    current: () => ipcRenderer.invoke('auth:current'),
    signOut: () => ipcRenderer.invoke('auth:signOut')
  }
})
