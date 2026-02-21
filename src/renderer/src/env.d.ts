/// <reference types="vite/client" />

interface Note {
  id: string
  title: string
  body: string
  tags: string[]
  createdAt: number
  updatedAt: number
  lastSyncedAt: number | null
  isDeleted: boolean
}

interface SyncStatus {
  pendingCount: number
  failedCount: number
  lastSyncedAt: number | null
}

declare global {
  interface Window {
    api: {
      platform: NodeJS.Platform
      notes: {
        create: (title?: string, body?: string) => Promise<Note>
        update: (
          id: string,
          fields: { title?: string; body?: string; tags?: string[] }
        ) => Promise<Note | null>
        delete: (id: string) => Promise<void>
        get: (id: string) => Promise<Note | null>
        list: () => Promise<Note[]>
        search: (query: string) => Promise<Note[]>
        upsertFromRemote: (
          id: string,
          fields: {
            title: string
            body: string
            tags: string[]
            createdAt: number
            isDeleted: boolean
          }
        ) => Promise<void>
        markSynced: (id: string) => Promise<void>
        dirty: () => Promise<Note[]>
      }
      sync: {
        status: () => Promise<SyncStatus>
      }
      meta: {
        set: (key: string, value: string) => Promise<void>
        get: (key: string) => Promise<string | null>
      }
      images: {
        save: (base64Data: string, ext: string, noteId: string) => Promise<string>
      }
      auth: {
        googleSignIn: (clientId: string, authDomain: string) => Promise<string>
      }
    }
  }
}

export {}
