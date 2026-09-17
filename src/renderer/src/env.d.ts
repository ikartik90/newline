/// <reference types="vite/client" />

import type { AuthUser } from '@shared/domain/auth'
import type { MediaAsset } from '@shared/domain/media'

declare global {
  /**
   * A note as the renderer sees it. `body` is the JSON-serialised Document
   * (see `@shared/domain/document`); parse it with `parseDocument`. The main
   * process derives `plainText` from the body for search and previews.
   */
  interface Note {
    id: string
    title: string
    body: string
    plainText: string
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

  /** What the renderer hands main to store a file the author picked or pasted. */
  interface MediaUploadInput {
    filename: string
    contentType: string
    bytes: Uint8Array
    width?: number
    height?: number
  }

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
      /**
       * The media library. Every file is saved on this machine first, under
       * `userData/media/`, and served back as `local://<file>`. When the app
       * is signed in and the machine is online the same call uploads it to
       * the Worker and returns the public URL instead; otherwise the upload
       * is queued and the sync service rewrites `local://` sources in notes
       * once it lands.
       */
      media: {
        list: () => Promise<MediaAsset[]>
        upload: (input: MediaUploadInput) => Promise<MediaAsset>
        updateAlt: (key: string, alt: string) => Promise<MediaAsset>
        rename: (key: string, filename: string) => Promise<MediaAsset>
        delete: (key: string) => Promise<void>
        /** Store a clip's still beside it; resolves to the poster URL. */
        uploadPoster: (key: string, bytes: Uint8Array) => Promise<string | null>
        /** Upload anything still local-only. Resolves to how many landed. */
        flushPending: () => Promise<number>
      }
      /**
       * Sign-in lives in the main process: it runs Google's consent window,
       * trades the ID token for a Worker session and keeps that session.
       * The ID token comes back too, for the renderer's Firebase sign-in.
       */
      auth: {
        googleSignIn: (
          clientId: string,
          authDomain: string
        ) => Promise<{ idToken: string; user: AuthUser }>
        current: () => Promise<AuthUser | null>
        signOut: () => Promise<void>
      }
    }
  }
}

export {}
